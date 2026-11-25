import { isWalletView, WalletView } from './dashboardNetworks';

const KEY = 'omniwallet.dashboard-view';

/** Presentation preference only; never used for account or dapp authorization. */
export function readWalletView(): WalletView {
  try {
    const value = localStorage.getItem(KEY);
    return value && isWalletView(value) ? value : 'evm';
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
