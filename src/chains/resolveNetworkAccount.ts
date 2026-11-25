import type { WalletNetwork } from './network';
import type {
  EvmWalletAccount,
  SolanaWalletAccount,
  WalletAccount,
} from './walletAccount';

type AccountSources = {
  evm: () => EvmWalletAccount | null;
  solana: () => SolanaWalletAccount | null;
};

/**
 * Resolve the separately selected account for one network family. This does not
 * associate the accounts, select a network, validate an address, or authorize
 * the caller to sign. Sources must enforce their own lock and access rules.
 */
export function resolveNetworkAccount(
  network: WalletNetwork,
  sources: AccountSources
): WalletAccount | null {
  if (!network || typeof network !== 'object') return null;
  switch (network.family) {
    case 'evm':
      if (
        !Number.isSafeInteger(network.chainId) ||
        network.chainId < 0 ||
        network.id !== `evm:${network.chainId}`
      )
        return null;
      return sources.evm();
    case 'solana':
      if (network.id !== 'solana:devnet' || network.cluster !== 'devnet')
        return null;
      return sources.solana();
    default:
      return null;
  }
}
