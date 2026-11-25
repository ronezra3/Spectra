import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { base58 } from '@scure/base';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { v4 as uuid } from 'uuid';
import { SOLANA_DEVNET_RPC } from '@/chains/solana/devnetBalance';
import { SolanaConnectionSession } from '@/chains/solana/connectionSession';
import { SolanaSignTransferController } from '../controller/solanaSignTransfer';
import { SolanaSendTransferController } from '../controller/solanaSendTransfer';
import { requestSolanaTransferApproval } from '../controller/solanaConnectApproval';
import {
  solanaConnectionSession,
  solanaSigningSession,
} from './solanaConnection';
import { solanaWalletService } from './solanaWallet';

// This origin is used only inside an isolated in-memory permission session.
const INTERNAL_ORIGIN = 'https://wallet.omniwallet.invalid';
let busy = false;

/** Extension-owned simple transfer; all signing still requires the exact approval. */
export async function sendSolanaFromWallet(
  account: string,
  recipient: string,
  lamports: string
): Promise<string> {
  if (busy) throw new Error('A Solana transfer is already in progress');
  if (
    typeof lamports !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(lamports) ||
    BigInt(lamports) > 18446744073709551615n
  )
    throw new Error('Invalid amount');
  const from = new PublicKey(account);
  const to = new PublicKey(recipient);
  if (from.toBase58() !== account || to.toBase58() !== recipient)
    throw new Error('Invalid address');
  const selected = solanaWalletService.getSelectedAccount();
  if (
    !selected ||
    selected.address !== account ||
    !solanaWalletService.isUnlocked()
  )
    throw new Error('Solana account unavailable');
  busy = true;
  const permissions = new SolanaConnectionSession();
  const unsubscribe = solanaConnectionSession.subscribe(() =>
    permissions.invalidate()
  );
  const context = {
    origin: INTERNAL_ORIGIN,
    account,
    cluster: selected.cluster,
    kind: 'connect' as const,
  };
  const generation = solanaSigningSession.currentGeneration();
  try {
    const id = uuid();
    permissions.begin(id, context);
    if (!permissions.approve(id, context))
      throw new Error('Solana session expired');
    const connection = new Connection(SOLANA_DEVNET_RPC, 'confirmed');
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const current = solanaWalletService.getSelectedAccount();
    if (
      generation !== solanaSigningSession.currentGeneration() ||
      !current ||
      current.address !== account ||
      !solanaWalletService.isUnlocked() ||
      !permissions.has(context)
    )
      throw new Error('Solana session expired');
    const transaction = new Transaction({
      feePayer: from,
      recentBlockhash: blockhash,
    }).add(
      SystemProgram.transfer({
        fromPubkey: from,
        toPubkey: to,
        lamports: BigInt(lamports),
      })
    );
    const transactionHex = bytesToHex(
      transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      })
    );
    const signing = new SolanaSignTransferController({
      isUnlocked: () => solanaWalletService.isUnlocked(),
      getSelectedAccount: () => solanaWalletService.getSelectedAccount(),
      permissions,
      approvals: solanaSigningSession,
      newId: uuid,
      requestApproval: (approval, transfer) =>
        requestSolanaTransferApproval(approval, transfer, 'wallet'),
      sign: (address, message) =>
        solanaWalletService.signMessage(address, message),
    });
    const sending = new SolanaSendTransferController({
      isUnlocked: () => solanaWalletService.isUnlocked(),
      getSelectedAccount: () => solanaWalletService.getSelectedAccount(),
      permissions,
      approvals: solanaSigningSession,
      signer: signing,
    });
    return base58.encode(
      hexToBytes(await sending.send(INTERNAL_ORIGIN, account, transactionHex))
    );
  } finally {
    unsubscribe();
    permissions.invalidate();
    busy = false;
  }
}
