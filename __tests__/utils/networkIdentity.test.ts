/** @jest-environment node */
import { CHAINS, CHAINS_ENUM } from '@debank/common';
import {
  SOLANA_DEVNET_NETWORK,
  areNetworksEqual,
  evmNetworkFromChain,
} from '@/chains/network';

test('adapts Rabby EVM chains without modifying the source', () => {
  const ethereum = CHAINS[CHAINS_ENUM.ETH];
  const original = { ...ethereum };
  const network = evmNetworkFromChain(ethereum);
  expect(network).toEqual({ family: 'evm', id: 'evm:1', chainId: 1 });
  expect(ethereum).toEqual(original);
  expect(Object.isFrozen(network)).toBe(true);
  expect(areNetworksEqual(network, evmNetworkFromChain(ethereum))).toBe(true);
});

test('separates EVM chains from each other and from Solana Devnet', () => {
  const ethereum = evmNetworkFromChain(CHAINS[CHAINS_ENUM.ETH]);
  const polygon = evmNetworkFromChain(CHAINS[CHAINS_ENUM.POLYGON]);
  expect(areNetworksEqual(ethereum, polygon)).toBe(false);
  expect(areNetworksEqual(ethereum, SOLANA_DEVNET_NETWORK)).toBe(false);
  expect(areNetworksEqual(SOLANA_DEVNET_NETWORK, ethereum)).toBe(false);
  expect(areNetworksEqual(SOLANA_DEVNET_NETWORK, SOLANA_DEVNET_NETWORK)).toBe(
    true
  );
  expect(SOLANA_DEVNET_NETWORK.id).toBe('solana:devnet');
  expect(Object.isFrozen(SOLANA_DEVNET_NETWORK)).toBe(true);
});

test.each([
  -1,
  0.5,
  NaN,
  Infinity,
  Number.MAX_SAFE_INTEGER + 1,
])('rejects an invalid EVM chain ID: %s', (id) =>
  expect(() => evmNetworkFromChain({ id })).toThrow('Invalid EVM chain ID')
);
