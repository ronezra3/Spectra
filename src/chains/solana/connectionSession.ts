import {
  SolanaApprovalContext,
  SolanaApprovalSession,
} from './approvalSession';

const NO_PAYLOAD = new Uint8Array();

/**
 * Ephemeral Solana connection permissions. This lives in the background and
 * must only receive origin/account/cluster from trusted extension state.
 * Approval settlement and session invalidation are the caller's responsibility.
 */
export class SolanaConnectionSession {
  private readonly approvals = new SolanaApprovalSession();
  private readonly grants = new Set<string>();
  private readonly listeners = new Set<(origin: string | null) => void>();

  subscribe(listener: (origin: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(origin: string | null): void {
    this.listeners.forEach((listener) => {
      try {
        listener(origin);
      } catch {
        /* An unavailable page cannot block revocation. */
      }
    });
  }

  private key(context: SolanaApprovalContext): string {
    return JSON.stringify([context.origin, context.account, context.cluster]);
  }

  begin(id: string, context: SolanaApprovalContext): void {
    if (context.kind !== 'connect') throw new Error('Invalid approval kind');
    this.approvals.begin(id, context, NO_PAYLOAD);
  }

  cancel(id: string): void {
    this.approvals.cancel(id);
  }

  /** Invoke only after the matching extension approval has been accepted. */
  approve(id: string, context: SolanaApprovalContext): boolean {
    if (context.kind !== 'connect') {
      this.approvals.consume(id, context, NO_PAYLOAD);
      return false;
    }
    if (!this.approvals.consume(id, context, NO_PAYLOAD)) return false;
    this.grants.add(this.key(context));
    return true;
  }

  has(context: SolanaApprovalContext): boolean {
    return context.kind === 'connect' && this.grants.has(this.key(context));
  }

  disconnect(context: SolanaApprovalContext): void {
    if (context.kind === 'connect') {
      this.grants.delete(this.key(context));
      this.notify(context.origin);
    }
  }

  invalidate(): void {
    this.approvals.invalidate();
    this.grants.clear();
    this.notify(null);
  }
}
