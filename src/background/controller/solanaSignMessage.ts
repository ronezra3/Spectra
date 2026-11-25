import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import {
  SolanaApprovalContext,
  SolanaApprovalSession,
} from '@/chains/solana/approvalSession';
import { SolanaConnectionSession } from '@/chains/solana/connectionSession';
import { SolanaSelectedAccount } from './solanaConnect';

type Dependencies = {
  isUnlocked: () => boolean;
  getSelectedAccount: () => SolanaSelectedAccount | null;
  permissions: SolanaConnectionSession;
  approvals: SolanaApprovalSession;
  newId: () => string;
  requestApproval: (
    context: SolanaApprovalContext,
    hex: string
  ) => Promise<boolean>;
  sign: (address: string, message: Uint8Array) => Promise<Uint8Array>;
};

/** Background-only signing; origin is obtained from the browser's sender. */
export class SolanaSignMessageController {
  constructor(private readonly deps: Dependencies) {}

  async sign(
    trustedOrigin: string,
    account: string,
    messageHex: string
  ): Promise<string> {
    if (!this.deps.isUnlocked()) throw new Error('Wallet is locked');
    const current = this.deps.getSelectedAccount();
    if (!current || current.address !== account)
      throw new Error('Solana account unavailable');
    const selected = { ...current };
    const connectContext: SolanaApprovalContext = {
      origin: trustedOrigin,
      account,
      cluster: selected.cluster,
      kind: 'connect',
    };
    if (!this.deps.permissions.has(connectContext))
      throw new Error('Solana connection required');
    if (
      typeof messageHex !== 'string' ||
      messageHex.length > 2048 ||
      !/^(?:[0-9a-f]{2})*$/.test(messageHex)
    ) {
      throw new Error('Invalid Solana message');
    }
    const message = hexToBytes(messageHex);
    const context: SolanaApprovalContext = {
      ...connectContext,
      kind: 'sign-message',
    };
    const id = this.deps.newId();
    const generation = this.deps.approvals.currentGeneration();
    this.deps.approvals.begin(id, context, message);
    try {
      const approved = await this.deps.requestApproval(context, messageHex);
      const afterApproval = this.deps.getSelectedAccount();
      if (
        approved !== true ||
        !this.deps.isUnlocked() ||
        !afterApproval ||
        afterApproval.address !== selected.address ||
        afterApproval.cluster !== selected.cluster ||
        !this.deps.permissions.has(connectContext) ||
        !this.deps.approvals.consume(id, context, message)
      )
        throw new Error('Solana signing rejected or expired');
      const signature = await this.deps.sign(account, message);
      const afterSign = this.deps.getSelectedAccount();
      if (
        generation !== this.deps.approvals.currentGeneration() ||
        !this.deps.isUnlocked() ||
        !afterSign ||
        afterSign.address !== selected.address ||
        afterSign.cluster !== selected.cluster ||
        !this.deps.permissions.has(connectContext) ||
        !(signature instanceof Uint8Array) ||
        signature.length !== 64 ||
        !ed25519.verify(signature, message, base58.decode(account), {
          zip215: false,
        })
      )
        throw new Error('Solana signing expired');
      return bytesToHex(signature);
    } finally {
      this.deps.approvals.cancel(id);
      message.fill(0);
    }
  }
}
