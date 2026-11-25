/** @jest-environment node */
import { CHAINS, CHAINS_ENUM } from '@debank/common';
import { SOLANA_DEVNET_NETWORK, evmNetworkFromChain } from '@/chains/network';
import {
  areWalletAccountsEqual,
  isAccountCompatibleWithNetwork,
  walletAccountFromEvm,
  walletAccountFromSolana,
} from '@/chains/walletAccount';

const address = '0xAbC0123456789012345678901234567890123456';
const solanaAddress = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';

test('adapts the legacy EVM account without mutation and preserves account source', () => {
  const input = {
    address,
    type: 'HD Key Tree',
    brandName: 'Rabby',
    alianName: 'Test',
  };
  const result = walletAccountFromEvm(input);
  expect(result).toEqual({
    ecosystem: 'evm',
    address,
    source: { keyringType: 'HD Key Tree', brandName: 'Rabby' },
  });
  expect(input).toEqual({
    address,
    type: 'HD Key Tree',
    brandName: 'Rabby',
    alianName: 'Test',
  });
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.source)).toBe(true);
  expect(
    areWalletAccountsEqual(
      result,
      walletAccountFromEvm({ ...input, address: address.toLowerCase() })
    )
  ).toBe(true);
  expect(
    areWalletAccountsEqual(
      result,
      walletAccountFromEvm({ ...input, type: 'Simple Key Pair' })
    )
  ).toBe(false);
  expect(
    areWalletAccountsEqual(
      result,
      walletAccountFromEvm({ ...input, brandName: 'Other' })
    )
  ).toBe(false);
});

test('preserves Solana case and never equates accounts across ecosystems', () => {
  const solana = walletAccountFromSolana(solanaAddress);
  expect(solana.address).toBe(solanaAddress);
  expect(
    areWalletAccountsEqual(solana, walletAccountFromSolana(solanaAddress))
  ).toBe(true);
  expect(
    areWalletAccountsEqual(
      solana,
      walletAccountFromSolana(solanaAddress.toLowerCase())
    )
  ).toBe(false);
  const evm = walletAccountFromEvm({
    address: solanaAddress,
    type: 'test',
    brandName: 'test',
  });
  expect(areWalletAccountsEqual(solana, evm)).toBe(false);
  expect(areWalletAccountsEqual(evm, solana)).toBe(false);
});

test('checks network family without implying account authorization or a shared wallet', () => {
  const evm = walletAccountFromEvm({
    address,
    type: 'HD Key Tree',
    brandName: 'Rabby',
  });
  const solana = walletAccountFromSolana(solanaAddress);
  const eth = evmNetworkFromChain(CHAINS[CHAINS_ENUM.ETH]);
  const polygon = evmNetworkFromChain(CHAINS[CHAINS_ENUM.POLYGON]);
  expect(isAccountCompatibleWithNetwork(evm, eth)).toBe(true);
  expect(isAccountCompatibleWithNetwork(evm, polygon)).toBe(true);
  expect(isAccountCompatibleWithNetwork(evm, SOLANA_DEVNET_NETWORK)).toBe(
    false
  );
  expect(isAccountCompatibleWithNetwork(solana, eth)).toBe(false);
  expect(isAccountCompatibleWithNetwork(solana, SOLANA_DEVNET_NETWORK)).toBe(
    true
  );
});
