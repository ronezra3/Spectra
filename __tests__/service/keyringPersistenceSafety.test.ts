// Disposable in-memory services; no real keys or persisted wallet data.
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
import * as passwordUtils from 'background/utils/password';

afterEach(() => jest.restoreAllMocks());

test('does not commit an encrypted snapshot if the wallet locks while encryption is pending', async () => {
  const service = new KeyringService();
  service.loadStore({ vault: 'original' });
  service.memStore.updateState({ isUnlocked: true });
  service.keyrings = [
    { type: 'Simple Key Pair', serialize: async () => ['test-only'] },
  ];
  let resolveEncryption!: (value: string) => void;
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  jest.spyOn(passwordUtils, 'passwordClearKey').mockResolvedValue(undefined);
  jest.spyOn(passwordUtils, 'passwordEncrypt').mockImplementation(async () => {
    signalStarted();
    return new Promise<string>((resolve) => {
      resolveEncryption = resolve;
    });
  });
  const pending = service.persistAllKeyrings();
  await started;
  await service.setLocked();
  resolveEncryption('stale-ciphertext');
  await expect(pending).rejects.toThrow('Wallet is locked');
  expect(service.store.getState().vault).toBe('original');
  expect(service.isUnlocked()).toBe(false);
  expect(passwordUtils.passwordClearKey).toHaveBeenCalledWith('keyring');
});

test('serializes overlapping persistence and allows a later write after failure', async () => {
  const service = new KeyringService();
  service.loadStore({ vault: 'original' });
  service.memStore.updateState({ isUnlocked: true });
  service.keyrings = [
    { type: 'Simple Key Pair', serialize: async () => ['test-only'] },
  ];
  let release!: () => void;
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const encrypt = jest.spyOn(passwordUtils, 'passwordEncrypt');
  encrypt.mockImplementationOnce(async () => {
    signalStarted();
    return new Promise<string>((_, reject) => {
      release = () => reject(new Error('test write failed'));
    });
  });
  encrypt.mockResolvedValueOnce('latest-ciphertext');
  const first = service.persistAllKeyrings();
  // Attach the rejection handler before deliberately failing the first write.
  const rejected = expect(first).rejects.toThrow('test write failed');
  await started;
  const second = service.persistAllKeyrings();
  expect(encrypt).toHaveBeenCalledTimes(1);
  release();
  await rejected;
  await expect(second).resolves.toBe(true);
  expect(encrypt).toHaveBeenCalledTimes(2);
  expect(service.store.getState().vault).toBe('latest-ciphertext');
});

test('a stalled previous session does not block a new session or overwrite it', async () => {
  const service = new KeyringService();
  service.loadStore({ vault: 'original' });
  service.memStore.updateState({ isUnlocked: true });
  const keyring = {
    type: 'Simple Key Pair',
    serialize: async () => ['test-only'],
  };
  service.keyrings = [keyring];
  let release!: (value: string) => void;
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  jest.spyOn(passwordUtils, 'passwordClearKey').mockResolvedValue(undefined);
  const encrypt = jest.spyOn(passwordUtils, 'passwordEncrypt');
  encrypt.mockImplementationOnce(async () => {
    signalStarted();
    return new Promise<string>((resolve) => {
      release = resolve;
    });
  });
  encrypt.mockResolvedValueOnce('new-session-ciphertext');
  const oldWrite = service.persistAllKeyrings();
  const oldRejected = expect(oldWrite).rejects.toThrow('Wallet is locked');
  await started;
  await service.setLocked();
  service.memStore.updateState({ isUnlocked: true });
  service.keyrings = [keyring];
  await expect(service.persistAllKeyrings()).resolves.toBe(true);
  release('old-session-ciphertext');
  await oldRejected;
  expect(service.store.getState().vault).toBe('new-session-ciphertext');
});
