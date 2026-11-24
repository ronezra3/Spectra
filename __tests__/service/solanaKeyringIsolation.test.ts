// Ledger's ESM-only transport cannot load under this Jest CJS environment.
// The boundary under test uses synthetic keyrings, not the hardware transport.
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));
jest.mock('multiformats', () => ({ CID: { parse: jest.fn() } }), {
  virtual: true,
});
jest.mock('background/service/keyring/bridge', () => ({
  hasBridge: async () => false,
  getKeyringBridge: async () => undefined,
}));
jest.mock('background/service/keyring/eth-ledger-keyring', () => ({
  __esModule: true,
  default: class MockLedgerKeyring {
    static type = 'mock-ledger';
  },
}));

import { KeyringService } from 'background/service/keyring';
import { normalizeAddress } from '@/background/utils';
import { SOLANA_KEYRING_TYPE } from 'background/service/keyring/solanaKeyringType';

test('keeps Solana accounts out of EVM lists and lookups', async () => {
  const service = new KeyringService();
  const evmAddress = '0x627306090abab3a6e1400e9345bc60c78b8bef57';
  const solanaAddress = 'FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z';
  const evm = {
    type: 'EVM test',
    getAccounts: jest.fn().mockResolvedValue([evmAddress]),
  };
  const solana = {
    type: SOLANA_KEYRING_TYPE,
    getAccounts: jest.fn().mockResolvedValue([solanaAddress]),
    cleanUp: jest.fn(),
  };
  service.keyrings = [evm, solana];
  service.memStore.updateState({ isUnlocked: true });
  expect(await service.getAccounts()).toEqual([normalizeAddress(evmAddress)]);
  expect(await service.getSolanaAccounts()).toEqual([solanaAddress]);
  expect(await service.getKeyringForAccount(evmAddress)).toBe(evm);
  await expect(
    service.getKeyringForAccount(solanaAddress, solana.type)
  ).rejects.toThrow('Solana-specific');
  await service.clearKeyrings();
  expect(solana.cleanUp).toHaveBeenCalledTimes(1);
});
