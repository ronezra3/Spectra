import notificationService, {
  ApprovalRef,
} from '@/background/service/notification';
import { SolanaApprovalContext } from '@/chains/solana/approvalSession';
import type { InspectedSolanaTransfer } from '@/chains/solana/inspectTransfer';

/** Extension-owned approval. The origin and account must already be trusted. */
export async function requestSolanaConnectApproval(
  context: SolanaApprovalContext
): Promise<boolean> {
  if (context.kind !== 'connect' || context.cluster !== 'solana:devnet') {
    throw new Error('Invalid Solana connection approval');
  }
  let current: ApprovalRef | undefined;
  const result = await notificationService.requestApproval(
    {
      approvalComponent: 'SolanaConnect',
      params: {
        origin: context.origin,
        account: context.account,
        cluster: context.cluster,
      },
      origin: context.origin,
    },
    { height: 600 },
    {
      onCurrent: (approval) => {
        if (approval.component === 'SolanaConnect') current = approval;
      },
    }
  );
  return !!current && result === true;
}

/** An independent approval for exact message bytes. */
export async function requestSolanaMessageApproval(
  context: SolanaApprovalContext,
  messageHex: string
): Promise<boolean> {
  if (
    context.kind !== 'sign-message' ||
    context.cluster !== 'solana:devnet' ||
    typeof messageHex !== 'string' ||
    messageHex.length > 2048 ||
    !/^(?:[0-9a-f]{2})*$/.test(messageHex)
  ) {
    throw new Error('Invalid Solana message approval');
  }
  let current: ApprovalRef | undefined;
  const result = await notificationService.requestApproval(
    {
      approvalComponent: 'SolanaSignMessage',
      params: {
        origin: context.origin,
        account: context.account,
        cluster: context.cluster,
        messageHex,
      },
      origin: context.origin,
    },
    { height: 600 },
    {
      onCurrent: (approval) => {
        if (approval.component === 'SolanaSignMessage') current = approval;
      },
    }
  );
  return !!current && result === true;
}

/** Independent approval for an inspected single SOL transfer. */
export async function requestSolanaTransferApproval(
  context: SolanaApprovalContext,
  transfer: InspectedSolanaTransfer
): Promise<boolean> {
  if (
    (context.kind !== 'sign-transaction' &&
      context.kind !== 'sign-and-send-transaction') ||
    context.cluster !== 'solana:devnet' ||
    transfer.from !== context.account
  ) {
    throw new Error('Invalid Solana transfer approval');
  }
  let current: ApprovalRef | undefined;
  const result = await notificationService.requestApproval(
    {
      approvalComponent: 'SolanaSignTransfer',
      params: {
        origin: context.origin,
        cluster: context.cluster,
        send: context.kind === 'sign-and-send-transaction',
        ...transfer,
      },
      origin: context.origin,
    },
    { height: 700 },
    {
      onCurrent: (approval) => {
        if (approval.component === 'SolanaSignTransfer') current = approval;
      },
    }
  );
  return !!current && result === true;
}

/** Reject only the exact active Solana prompt; never settle an EVM prompt. */
export async function rejectSolanaApproval(
  origin?: string | null
): Promise<void> {
  const approval = notificationService.getApproval();
  const component = approval?.data.approvalComponent;
  if (
    (component !== 'SolanaConnect' &&
      component !== 'SolanaSignMessage' &&
      component !== 'SolanaSignTransfer') ||
    (origin && approval?.data.origin !== origin)
  )
    return;
  await notificationService.rejectApprovalFor({
    approval: { id: approval!.id, component },
  });
}
