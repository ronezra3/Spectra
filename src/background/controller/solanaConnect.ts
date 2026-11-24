import { SolanaConnectionSession } from '@/chains/solana/connectionSession';
import { SolanaApprovalContext } from '@/chains/solana/approvalSession';

export type SolanaSelectedAccount = Readonly<{
  address: string;
  cluster: 'solana:devnet';
}>;

type Dependencies = {
  isUnlocked: () => boolean;
  getSelectedAccount: () => SolanaSelectedAccount | null;
  /** Must validate and settle the matching extension-owned approval. */
  requestApproval: (
    context: SolanaApprovalContext,
    id: string
  ) => Promise<boolean>;
  newId: () => string;
  permissions: SolanaConnectionSession;
};

/**
 * Background-only connect orchestration. Origin must come from the browser's
 * sender metadata, not the dapp payload. No signing permission is granted.
 * Not wired to a provider until account custody and approval UI are complete.
 */
export class SolanaConnectController {
  constructor(private readonly deps: Dependencies) {}

  async connect(
    trustedOrigin: string,
    silent = false
  ): Promise<SolanaSelectedAccount> {
    if (!this.deps.isUnlocked()) throw new Error('Wallet is locked');
    const selectedAccount = this.deps.getSelectedAccount();
    if (!selectedAccount) throw new Error('No Solana account selected');
    const selected = { ...selectedAccount };
    const context: SolanaApprovalContext = {
      origin: trustedOrigin,
      account: selected.address,
      cluster: selected.cluster,
      kind: 'connect',
    };
    if (this.deps.permissions.has(context)) return { ...selected };
    if (silent) throw new Error('Solana connection requires approval');

    const id = this.deps.newId();
    this.deps.permissions.begin(id, context);
    try {
      const approved = await this.deps.requestApproval(context, id);
      const current = this.deps.getSelectedAccount();
      if (
        approved !== true ||
        !this.deps.isUnlocked() ||
        !current ||
        current.address !== selected.address ||
        current.cluster !== selected.cluster ||
        !this.deps.permissions.approve(id, context)
      ) {
        throw new Error('Solana connection rejected or expired');
      }
      return { ...selected };
    } finally {
      this.deps.permissions.cancel(id);
    }
  }

  disconnect(trustedOrigin: string): void {
    const selected = this.deps.getSelectedAccount();
    if (!selected) return;
    this.deps.permissions.disconnect({
      origin: trustedOrigin,
      account: selected.address,
      cluster: selected.cluster,
      kind: 'connect',
    });
  }
}
