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

import * as nodeCrypto from 'crypto';
import { KeyringService } from 'background/service/keyring';
import { normalizeAddress } from '@/background/utils';
import { SOLANA_KEYRING_TYPE } from 'background/service/keyring/solanaKeyringType';

import { SolanaKeyring } from 'background/service/keyring/solanaKeyring';

Object.defineProperty(globalThis, 'crypto', {
  value: ((nodeCrypto as unknown) as { webcrypto: Crypto }).webcrypto,
  configurable: true,
});
beforeAll(async () => {
  const key = await ((nodeCrypto as unknown) as {
    webcrypto: Crypto;
  }).webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  Object.defineProperty(globalThis, 'CryptoKey', {
    value: key.constructor,
    configurable: true,
  });
});

test('an isolated Rabby vault round-trips EVM and Solana without a plaintext mirror', async () => {
  const service = new KeyringService();
  service.loadStore({});
  // Register only in this isolated service, never in the production registry.
  service.keyringTypes.push(SolanaKeyring);
  await service.boot('disposable-test-password');
  const evm = await service.addNewKeyring('Simple Key Pair', [
    'c87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3',
  ]);
  const evmAccounts = await evm.getAccounts();
  const solana = new SolanaKeyring();
  const solanaAccounts = await solana.addAccounts();
  const serialized = await solana.serialize();
  service.keyrings.push(solana);
  await service.persistAllKeyrings();
  const stored = service.store.getState();
  expect(stored.vault).toEqual(expect.any(String));
  expect(JSON.stringify(stored)).not.toContain(serialized.secretKeys[0]);
  expect(JSON.stringify(stored.unencryptedKeyringData)).not.toContain(
    SOLANA_KEYRING_TYPE
  );
  await service.setLocked();
  expect(await service.getSolanaAccounts()).toEqual([]);
  await expect(service.submitPassword('wrong-test-password')).rejects.toThrow();
  expect(service.isUnlocked()).toBe(false);
  expect(await service.getSolanaAccounts()).toEqual([]);
  await service.submitPassword('disposable-test-password');
  expect(await service.getAccounts()).toEqual(
    evmAccounts.map(normalizeAddress)
  );
  expect(await service.getSolanaAccounts()).toEqual(solanaAccounts);
  expect(await service.getKeyringForAccount(evmAccounts[0])).toBeDefined();
  await service.setLocked();
});
