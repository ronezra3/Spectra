import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { parseSolanaReadOnlyAddress } from './readOnlyAddress';

export type SolanaCluster =
  | 'solana:devnet'
  | 'solana:testnet'
  | 'solana:mainnet';
export type SolanaApprovalKind =
  | 'connect'
  | 'sign-message'
  | 'sign-transaction'
  | 'sign-and-send-transaction';

/** All values must originate from a trusted extension session, never the page. */
export type SolanaApprovalContext = Readonly<{
  origin: string;
  account: string;
  cluster: SolanaCluster;
  kind: SolanaApprovalKind;
}>;

type PendingApproval = Readonly<{
  generation: number;
  context: SolanaApprovalContext;
  payloadHash: string;
}>;

const MAX_APPROVAL_PAYLOAD_BYTES = 1024 * 1024;
const MAX_APPROVAL_ID_LENGTH = 128;
const MAX_APPROVALS_PER_INSTANCE = 10000;

const CLUSTERS = new Set<SolanaCluster>([
  'solana:devnet',
  'solana:testnet',
  'solana:mainnet',
]);
const KINDS = new Set<SolanaApprovalKind>([
  'connect',
  'sign-message',
  'sign-transaction',
  'sign-and-send-transaction',
]);

function validateContext(context: SolanaApprovalContext): void {
  let origin: URL;
  try {
    origin = new URL(context.origin);
  } catch {
    throw new Error('Invalid approval origin');
  }
  if (
    !['https:', 'http:'].includes(origin.protocol) ||
    origin.origin !== context.origin ||
    !parseSolanaReadOnlyAddress(context.account) ||
    context.account !== context.account.trim() ||
    !CLUSTERS.has(context.cluster) ||
    !KINDS.has(context.kind)
  ) {
    throw new Error('Invalid Solana approval context');
  }
}

/**
 * In-memory guard for one-shot approvals. This is not an approval UI or a
 * permission store: callers must invoke invalidate at every session boundary.
 */
export class SolanaApprovalSession {
  private generation = 0;
  private readonly pending = new Map<string, PendingApproval>();
  private readonly seenIds = new Set<string>();

  currentGeneration(): number {
    return this.generation;
  }

  invalidate(): void {
    this.generation += 1;
    this.pending.clear();
  }

  begin(id: string, context: SolanaApprovalContext, bytes: Uint8Array): void {
    if (
      typeof id !== 'string' ||
      !id ||
      id.length > MAX_APPROVAL_ID_LENGTH ||
      this.seenIds.has(id) ||
      this.seenIds.size >= MAX_APPROVALS_PER_INSTANCE
    ) {
      throw new Error('Invalid approval id');
    }
    validateContext(context);
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.byteLength > MAX_APPROVAL_PAYLOAD_BYTES
    ) {
      throw new Error('Invalid payload');
    }
    this.seenIds.add(id);
    this.pending.set(id, {
      generation: this.generation,
      context: { ...context },
      payloadHash: bytesToHex(sha256(bytes)),
    });
  }

  cancel(id: string): void {
    this.pending.delete(id);
  }

  /** Consume before use, even when the supplied context or payload is wrong. */
  consume(
    id: string,
    context: SolanaApprovalContext,
    bytes: Uint8Array
  ): boolean {
    const saved = this.pending.get(id);
    this.pending.delete(id);
    if (!saved || saved.generation !== this.generation) return false;
    try {
      validateContext(context);
      if (
        !(bytes instanceof Uint8Array) ||
        bytes.byteLength > MAX_APPROVAL_PAYLOAD_BYTES
      )
        return false;
      return (
        saved.context.origin === context.origin &&
        saved.context.account === context.account &&
        saved.context.cluster === context.cluster &&
        saved.context.kind === context.kind &&
        saved.payloadHash === bytesToHex(sha256(bytes))
      );
    } catch {
      return false;
    }
  }
}
