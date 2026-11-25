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

import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';

test('signs only an exact Solana account without changing the EVM account list', async () => {
  const service = new KeyringService();
  service.loadStore({});
  await service.boot('test-password');
  const evm = await service.addNewKeyring('Simple Key Pair', [
    'c87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3',
  ]);
  const evmAddresses = await evm.getAccounts();
  const solana = new SolanaKeyring();
  const [address] = await solana.addAccounts();
  service.keyrings.push(solana);
  const payload = new Uint8Array([1, 2, 3]);
  const signature = await service.signSharedSolanaMessage(address, payload);
  expect(ed25519.verify(signature, payload, base58.decode(address))).toBe(true);
  expect([...payload]).toEqual([1, 2, 3]);
  expect(await service.getAccounts()).toEqual(
    evmAddresses.map(normalizeAddress)
  );
  await expect(
    service.signSharedSolanaMessage(address.toLowerCase(), payload)
  ).rejects.toThrow('unavailable');
  await service.setLocked();
  await expect(
    service.signSharedSolanaMessage(address, payload)
  ).rejects.toThrow('locked');
}, 30000);

test('rejects and wipes a signature returned after lock', async () => {
  const service = new KeyringService();
  service.loadStore({});
  service.memStore.updateState({ isUnlocked: true });
  const solana = new SolanaKeyring();
  const [address] = await solana.addAccounts();
  service.keyrings.push(solana);
  let release!: (value: Uint8Array) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  jest.spyOn(solana, 'signMessage').mockImplementation(async () => {
    entered();
    return new Promise<Uint8Array>((resolve) => {
      release = resolve;
    });
  });
  const signature = new Uint8Array(64).fill(7);
  const pending = service.signSharedSolanaMessage(address, new Uint8Array([1]));
  const rejected = expect(pending).rejects.toThrow('expired');
  await started;
  await service.setLocked();
  release(signature);
  await rejected;
  expect(signature.every((value) => value === 0)).toBe(true);
});

test('rejects ambiguous duplicate account references', async () => {
  const service = new KeyringService();
  service.loadStore({});
  service.memStore.updateState({ isUnlocked: true });
  const first = new SolanaKeyring();
  const [address] = await first.addAccounts();
  const second = new SolanaKeyring();
  await second.deserialize(await first.serialize());
  service.keyrings.push(first, second);
  await expect(
    service.signSharedSolanaMessage(address, new Uint8Array([1]))
  ).rejects.toThrow('unavailable');
  await service.setLocked();
});

test('an unrelated Solana keyring is not considered a migrated vault', async () => {
  const service = new KeyringService();
  service.loadStore({});
  service.memStore.updateState({ isUnlocked: true });
  const keyring = new SolanaKeyring();
  await keyring.addAccounts();
  service.keyrings.push(keyring);
  expect(service.hasAcknowledgedSolanaMigration()).toBe(false);
  await service.setLocked();
});
