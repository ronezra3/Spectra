import type { Wallet } from '@wallet-standard/base';
import { registerWallet } from '@wallet-standard/wallet';
import { EXPERIMENTAL_WALLET_ICON } from './experimentalIcon';

const unavailable = async (): Promise<never> => {
  throw new Error('Experimental Solana connection is not yet available');
};

// Discovery only: do not claim signing features or expose any accounts.
const experimentalWallet: Wallet = Object.freeze({
  version: '1.0.0',
  name: 'OmniWallet (experimental)',
  icon: EXPERIMENTAL_WALLET_ICON,
  chains: Object.freeze(['solana:devnet'] as const),
  accounts: Object.freeze([]),
  features: Object.freeze({
    'standard:connect': Object.freeze({
      version: '1.0.0',
      connect: unavailable,
    }),
    'standard:events': Object.freeze({
      version: '1.0.0',
      on: () => () => undefined,
    }),
  }),
});

let registered = false;

/** Called only from the opt-in development page-provider bundle. */
export const registerExperimentalSolanaWallet = (): void => {
  if (registered) return;
  registered = true;
  registerWallet(experimentalWallet);
};
