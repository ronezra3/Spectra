/**
 * Network identity only. It does not describe endpoints, capabilities,
 * account selection or permissions; those remain owned by each chain family.
 * An EVM chain ID identifies a protocol chain, not a particular custom RPC.
 */
export type EvmNetwork = Readonly<{
  family: 'evm';
  id: `evm:${number}`;
  chainId: number;
}>;

/** Only Devnet is exposed by the current experimental Solana wallet. */
export type SolanaDevnetNetwork = Readonly<{
  family: 'solana';
  id: 'solana:devnet';
  cluster: 'devnet';
}>;

export type WalletNetwork = EvmNetwork | SolanaDevnetNetwork;

/** Adapt a chain already established by an EVM-only source. */
export function evmNetworkFromChain(chain: { id: number }): EvmNetwork {
  if (!Number.isSafeInteger(chain.id) || chain.id < 0) {
    throw new Error('Invalid EVM chain ID');
  }
  return Object.freeze({
    family: 'evm',
    id: `evm:${chain.id}` as const,
    chainId: chain.id,
  });
}

export const SOLANA_DEVNET_NETWORK: SolanaDevnetNetwork = Object.freeze({
  family: 'solana',
  id: 'solana:devnet',
  cluster: 'devnet',
});

/** Compare protocol identities, never RPC endpoints or user permissions. */
export function areNetworksEqual(a: WalletNetwork, b: WalletNetwork): boolean {
  if (a.family !== b.family) return false;
  switch (a.family) {
    case 'evm':
      return b.family === 'evm' && a.chainId === b.chainId;
    case 'solana':
      return b.family === 'solana' && a.cluster === b.cluster;
    default:
      return false;
  }
}
