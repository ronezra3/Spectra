import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { base58 } from '@scure/base';
import { PublicKey, Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import {
  SolanaApprovalContext,
  SolanaApprovalSession,
} from '@/chains/solana/approvalSession';
import { SolanaConnectionSession } from '@/chains/solana/connectionSession';
import {
  inspectSolanaTransfer,
  InspectedSolanaTransfer,
} from '@/chains/solana/inspectTransfer';
import { SolanaSelectedAccount } from './solanaConnect';

type Dependencies = {
  isUnlocked: () => boolean;
  getSelectedAccount: () => SolanaSelectedAccount | null;
  permissions: SolanaConnectionSession;
  approvals: SolanaApprovalSession;
  newId: () => string;
  requestApproval: (
    context: SolanaApprovalContext,
    transfer: InspectedSolanaTransfer
  ) => Promise<boolean>;
  sign: (address: string, message: Uint8Array) => Promise<Uint8Array>;
};

/** Approves exact transaction bytes; only supports simple Devnet SOL transfers. */
export class SolanaSignTransferController {
  constructor(private readonly deps: Dependencies) {}

  async sign(
    trustedOrigin: string,
    account: string,
    transactionHex: string,
    send = false
  ): Promise<string> {
    if (!this.deps.isUnlocked()) throw new Error('Wallet is locked');
    const current = this.deps.getSelectedAccount();
    if (!current || current.address !== account)
      throw new Error('Solana account unavailable');
    const selected = { ...current };
    const connection: SolanaApprovalContext = {
      origin: trustedOrigin,
      account,
      cluster: selected.cluster,
      kind: 'connect',
    };
    if (!this.deps.permissions.has(connection))
      throw new Error('Solana connection required');
    const inspected = inspectSolanaTransfer(transactionHex, account);
    const transactionBytes = hexToBytes(inspected.transactionHex);
    const message = hexToBytes(inspected.messageHex);
    const context: SolanaApprovalContext = {
      ...connection,
      kind: send ? 'sign-and-send-transaction' : 'sign-transaction',
    };
    const id = this.deps.newId();
    const generation = this.deps.approvals.currentGeneration();
    this.deps.approvals.begin(id, context, transactionBytes);
    try {
      const approved = await this.deps.requestApproval(context, inspected);
      const afterApproval = this.deps.getSelectedAccount();
      if (
        approved !== true ||
        !this.deps.isUnlocked() ||
        !afterApproval ||
        afterApproval.address !== selected.address ||
        afterApproval.cluster !== selected.cluster ||
        !this.deps.permissions.has(connection) ||
        !this.deps.approvals.consume(id, context, transactionBytes)
      )
        throw new Error('Solana transaction rejected or expired');
      const signature = await this.deps.sign(account, message);
      const afterSign = this.deps.getSelectedAccount();
      if (
        generation !== this.deps.approvals.currentGeneration() ||
        !this.deps.isUnlocked() ||
        !afterSign ||
        afterSign.address !== selected.address ||
        afterSign.cluster !== selected.cluster ||
        !this.deps.permissions.has(connection) ||
        !(signature instanceof Uint8Array) ||
        signature.length !== 64 ||
        !ed25519.verify(signature, message, base58.decode(account), {
          zip215: false,
        })
      )
        throw new Error('Solana transaction signing expired');
      const signed = Transaction.from(transactionBytes);
      if (bytesToHex(signed.serializeMessage()) !== inspected.messageHex)
        throw new Error('Transaction changed');
      signed.addSignature(new PublicKey(account), Buffer.from(signature));
      if (!signed.verifySignatures())
        throw new Error('Invalid Solana signature');
      return bytesToHex(signed.serialize());
    } finally {
      this.deps.approvals.cancel(id);
      transactionBytes.fill(0);
      message.fill(0);
    }
  }
}
