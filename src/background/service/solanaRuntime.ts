/** Loaded only in opt-in development builds; never silently activate custody. */
let loaded: typeof import('./solanaWallet')['solanaWalletService'] | undefined;

export function getExperimentalSolanaWallet() {
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.OMNI_SOLANA_READONLY === '1'
  ) {
    if (!loaded) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      loaded = (require('./solanaWallet') as typeof import('./solanaWallet'))
        .solanaWalletService;
    }
    return loaded;
  }
  throw new Error('Experimental Solana wallet is unavailable');
}

export function lockExperimentalSolanaWallet(): void {
  loaded?.lock();
}
