import { CHAINS, Chain } from '@debank/common';

/** A presentation scope, never an EVM provider chain or a permission. */
export type WalletView = 'evm' | 'solana' | `evm:${number}`;

export const EVM_DASHBOARD_NETWORKS: readonly Chain[] = Object.values(CHAINS)
  .filter(
    (chain) =>
      !chain.isTestnet &&
      Number.isSafeInteger(chain.id) &&
      !!chain.serverId &&
      !!chain.nativeTokenAddress
  )
  .filter(
    (chain, index, chains) =>
      chains.findIndex((item) => item.id === chain.id) === index
  )
  .sort((a, b) => a.name.localeCompare(b.name));

export function getDashboardNetwork(view: string): Chain | null {
  if (!/^evm:(0|[1-9]\d*)$/.test(view)) return null;
  const id = Number(view.slice(4));
  return EVM_DASHBOARD_NETWORKS.find((chain) => chain.id === id) || null;
}

export function isWalletView(value: string): value is WalletView {
  return value === 'evm' || value === 'solana' || !!getDashboardNetwork(value);
}
