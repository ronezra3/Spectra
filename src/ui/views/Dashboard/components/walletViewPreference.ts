import type { WalletView } from './WalletViewSelector';

const KEY = 'omniwallet.dashboard-view';

/** Presentation preference only; never used for account or dapp authorization. */
export function readWalletView(): WalletView {
  try {
    return localStorage.getItem(KEY) === 'solana' ? 'solana' : 'evm';
  } catch {
    return 'evm';
  }
}

export function writeWalletView(view: WalletView): void {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    // A blocked storage API must not block switching the current view.
  }
}
