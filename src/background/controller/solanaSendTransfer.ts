import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { base58 } from '@scure/base';
import { Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { SolanaApprovalSession } from '@/chains/solana/approvalSession';
import { SolanaConnectionSession } from '@/chains/solana/connectionSession';
import { SOLANA_DEVNET_RPC } from '@/chains/solana/devnetBalance';
import { SolanaSelectedAccount } from './solanaConnect';
import { SolanaSignTransferController } from './solanaSignTransfer';

type Dependencies = {
  isUnlocked: () => boolean;
  getSelectedAccount: () => SolanaSelectedAccount | null;
  permissions: SolanaConnectionSession;
  approvals: SolanaApprovalSession;
  signer: SolanaSignTransferController;
};

/** Sign and submit only a user-approved, supported Devnet transfer. */
export class SolanaSendTransferController {
  constructor(private readonly deps: Dependencies) {}

  async send(
    origin: string,
    account: string,
    transactionHex: string
  ): Promise<string> {
    const generation = this.deps.approvals.currentGeneration();
    const currentSelection = this.deps.getSelectedAccount();
    if (
      !this.deps.isUnlocked() ||
      !currentSelection ||
      currentSelection.address !== account
    )
      throw new Error('Solana account unavailable');
    const selected = { ...currentSelection };
    const connection = {
      origin,
      account,
      cluster: selected.cluster,
      kind: 'connect' as const,
    };
    if (!this.deps.permissions.has(connection))
      throw new Error('Solana connection required');
    const signedHex = await this.deps.signer.sign(
      origin,
      account,
      transactionHex,
      true
    );
    const signedBytes = hexToBytes(signedHex);
    const transaction = Transaction.from(signedBytes);
    const signature = transaction.signature;
    if (
      !signature ||
      signature.length !== 64 ||
      !transaction.verifySignatures()
    )
      throw new Error('Invalid signed transfer');
    const expectedSignature = base58.encode(signature);
    const abort = new AbortController();
    const unsubscribe = this.deps.permissions.subscribe(() => abort.abort());
    const timeout = setTimeout(() => abort.abort(), 20000);
    let submitted = false;
    try {
      const current = this.deps.getSelectedAccount();
      if (
        generation !== this.deps.approvals.currentGeneration() ||
        !this.deps.isUnlocked() ||
        !current ||
        current.address !== account ||
        current.cluster !== selected.cluster ||
        !this.deps.permissions.has(connection)
      )
        throw new Error('Solana send expired');
      // Once the request leaves the extension, aborting cannot undo network submission.
      submitted = true;
      const response = await fetch(SOLANA_DEVNET_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        signal: abort.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendTransaction',
          params: [
            Buffer.from(signedBytes).toString('base64'),
            { encoding: 'base64', preflightCommitment: 'confirmed' },
          ],
        }),
      });
      if (!response.ok) throw new Error('RPC failed');
      const result = await response.json();
      const after = this.deps.getSelectedAccount();
      if (
        abort.signal.aborted ||
        generation !== this.deps.approvals.currentGeneration() ||
        !this.deps.isUnlocked() ||
        !after ||
        after.address !== account ||
        after.cluster !== selected.cluster ||
        !this.deps.permissions.has(connection) ||
        result?.jsonrpc !== '2.0' ||
        result?.id !== 1 ||
        result?.error != null ||
        result?.result !== expectedSignature
      )
        throw new Error('Invalid or expired RPC response');
      return bytesToHex(signature);
    } catch (error) {
      if (submitted)
        throw new Error(
          'Devnet submission failed or expired; the transaction may have been submitted.'
        );
      throw error;
    } finally {
      clearTimeout(timeout);
      unsubscribe();
      signedBytes.fill(0);
    }
  }
}
