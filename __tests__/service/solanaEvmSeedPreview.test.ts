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
import { SOLANA_KEYRING_TYPE } from 'background/service/keyring/solanaKeyringType';
import * as passwordUtils from 'background/utils/password';

const phrase =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
Object.defineProperty(globalThis, 'crypto', {
  value: ((nodeCrypto as unknown) as { webcrypto: Crypto }).webcrypto,
  configurable: true,
});

test('previews and explicitly creates a linked Solana account from an EVM HD seed', async () => {
  const cryptoKey = await ((nodeCrypto as unknown) as {
    webcrypto: Crypto;
  }).webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  Object.defineProperty(globalThis, 'CryptoKey', {
    value: cryptoKey.constructor,
    configurable: true,
  });
  const target = new KeyringService();
  target.loadStore({});
  target.setPersistenceFlusher(async () => undefined);
  await target.boot('test-password');
  const hd = await target.addNewKeyring('HD Key Tree', { mnemonic: phrase });
  const [evmAddress] = await hd.addAccounts(1);
  const before = target.store.getState().vault;
  expect(await target.previewSolanaTestAddressFromEvmSeed(evmAddress, 0)).toBe(
    'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk'
  );
  expect(target.getKeyringsByType(SOLANA_KEYRING_TYPE)).toHaveLength(0);
  expect(target.store.getState().vault).toBe(before);
  const linked = await target.createNativeSolanaTestAccountFromEvmSeed(
    evmAddress,
    0,
    () => undefined
  );
  expect(linked).toBe('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');
  const [solana] = target.getKeyringsByType(SOLANA_KEYRING_TYPE);
  expect(solana.getEvmAssociations()).toEqual([
    { evmAddress, solanaAddress: linked, accountIndex: 0 },
  ]);
  expect(
    JSON.stringify(target.store.getState().unencryptedKeyringData)
  ).not.toContain(linked);
  await expect(
    target.previewSolanaTestAddressFromEvmSeed(
      '0x0000000000000000000000000000000000000001',
      0
    )
  ).rejects.toThrow('unavailable or ambiguous');
  hd.needPassphrase = true;
  await expect(
    target.previewSolanaTestAddressFromEvmSeed(evmAddress, 0)
  ).rejects.toThrow('not supported');
  hd.needPassphrase = false;
  const getAccounts = hd.getAccounts.bind(hd);
  let calls = 0;
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  jest.spyOn(hd, 'getAccounts').mockImplementation(async () => {
    calls += 1;
    const accounts = await getAccounts();
    if (calls === 2) {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return accounts;
  });
  const pending = target.previewSolanaTestAddressFromEvmSeed(evmAddress, 0);
  const rejection = expect(pending).rejects.toThrow();
  await started;
  await target.setLocked();
  release();
  await rejection;
  await expect(
    target.previewSolanaTestAddressFromEvmSeed(evmAddress, 0)
  ).rejects.toThrow('locked');
  await target.submitPassword('test-password');
  const [reopened] = target.getKeyringsByType(SOLANA_KEYRING_TYPE);
  expect(reopened.getEvmAssociations()).toEqual([
    { evmAddress, solanaAddress: linked, accountIndex: 0 },
  ]);
  await target.setLocked();
}, 30000);

test('rejects a linked account if the EVM source is removed during encryption', async () => {
  const target = new KeyringService();
  target.loadStore({});
  target.setPersistenceFlusher(async () => undefined);
  await target.boot('test-password');
  const hd = await target.addNewKeyring('HD Key Tree', { mnemonic: phrase });
  const [evmAddress] = await hd.addAccounts(1);
  const before = target.store.getState().vault;
  const encrypt = passwordUtils.passwordEncrypt;
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  jest
    .spyOn(passwordUtils, 'passwordEncrypt')
    .mockImplementation(async (input) => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return encrypt(input);
    });
  try {
    const pending = target.createNativeSolanaTestAccountFromEvmSeed(
      evmAddress,
      0,
      () => undefined
    );
    const rejection = expect(pending).rejects.toThrow('changed');
    await started;
    hd.removeAccount(evmAddress);
    release();
    await rejection;
    expect(target.store.getState().vault).toBe(before);
    expect(target.getKeyringsByType(SOLANA_KEYRING_TYPE)).toHaveLength(0);
  } finally {
    jest.restoreAllMocks();
    await target.setLocked();
  }
}, 30000);
