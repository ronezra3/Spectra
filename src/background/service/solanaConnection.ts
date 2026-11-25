import { SolanaConnectionSession } from '@/chains/solana/connectionSession';
import { SolanaApprovalSession } from '@/chains/solana/approvalSession';

/** Background-only session state; never shared with EVM permissions. */
export const solanaConnectionSession = new SolanaConnectionSession();
export const solanaSigningSession = new SolanaApprovalSession();
solanaConnectionSession.subscribe(() => solanaSigningSession.invalidate());
