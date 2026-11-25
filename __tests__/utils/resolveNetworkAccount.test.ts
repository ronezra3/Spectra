/** @jest-environment node */
import { resolveNetworkAccount } from '@/chains/resolveNetworkAccount';
import { evmNetworkFromChain, SOLANA_DEVNET_NETWORK } from '@/chains/network';
import {
  walletAccountFromEvm,
  walletAccountFromSolana,
} from '@/chains/walletAccount';

const evm = walletAccountFromEvm({
  address: '0xAbC',
  type: 'HD Key Tree',
  brandName: 'Rabby',
});
const solana = walletAccountFromSolana(
  'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk'
);
const eth = evmNetworkFromChain({ id: 1 });

test('queries only the selected family and preserves the source account', () => {
  const sources = { evm: jest.fn(() => evm), solana: jest.fn(() => solana) };
  expect(resolveNetworkAccount(eth, sources)).toEqual(evm);
  expect(sources.evm).toHaveBeenCalledTimes(1);
  expect(sources.solana).not.toHaveBeenCalled();
  expect(resolveNetworkAccount(SOLANA_DEVNET_NETWORK, sources)).toEqual(solana);
  expect(sources.evm).toHaveBeenCalledTimes(1);
  expect(sources.solana).toHaveBeenCalledTimes(1);
});

test('missing family account never falls back to the other family', () => {
  const sources = { evm: jest.fn(() => evm), solana: jest.fn(() => null) };
  expect(resolveNetworkAccount(SOLANA_DEVNET_NETWORK, sources)).toBeNull();
  expect(sources.evm).not.toHaveBeenCalled();
});

test('rejects malformed and unsupported identities without touching sources', () => {
  const sources = { evm: jest.fn(() => evm), solana: jest.fn(() => solana) };
  for (const value of [
    null,
    {},
    { family: 'evm', chainId: 1, id: 'evm:2' },
    { family: 'evm', chainId: -1, id: 'evm:-1' },
    { family: 'solana', id: 'solana:mainnet', cluster: 'mainnet' },
  ]) {
    expect(resolveNetworkAccount(value as any, sources)).toBeNull();
  }
  expect(sources.evm).not.toHaveBeenCalled();
  expect(sources.solana).not.toHaveBeenCalled();
});
