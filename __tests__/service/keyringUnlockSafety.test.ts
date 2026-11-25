// These tests use isolated keyring services and disposable inputs.
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

test('a newly booted wallet without a vault can still be unlocked', async () => {
  const service = new KeyringService();
  service.loadStore({ booted: 'booted', unencryptedKeyringData: [] });
  jest.spyOn(service, 'verifyPassword').mockResolvedValue(undefined);
  const restore = jest.spyOn(service, 'unlockKeyrings');
  await service.submitPassword('test-password');
  expect(service.isUnlocked()).toBe(true);
  expect(restore).not.toHaveBeenCalled();
  await service.setLocked();
});

test('a failed vault restore must not unlock the wallet', async () => {
  const service = new KeyringService();
  service.loadStore({
    vault: 'damaged-vault',
    booted: 'booted',
    unencryptedKeyringData: [],
  });
  jest.spyOn(service, 'verifyPassword').mockResolvedValue(undefined);
  jest
    .spyOn(service, 'unlockKeyrings')
    .mockRejectedValue(new Error('restore failed'));
  await expect(service.submitPassword('test-password')).rejects.toThrow();
  expect(service.isUnlocked()).toBe(false);
  expect(service.keyrings).toEqual([]);
});

test('a lock while unlock is pending must prevent a later unlock', async () => {
  const service = new KeyringService();
  service.loadStore({
    vault: 'test-vault',
    booted: 'booted',
    unencryptedKeyringData: [],
  });
  jest.spyOn(service, 'verifyPassword').mockResolvedValue(undefined);
  let release!: (value: any[]) => void;
  jest.spyOn(service, 'unlockKeyrings').mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const opening = service.submitPassword('test-password');
  await Promise.resolve();
  await service.setLocked();
  release([]);
  await expect(opening).rejects.toThrow();
  expect(service.isUnlocked()).toBe(false);
  expect(service.keyrings).toEqual([]);
});

test('a partial restore waits for other restorations before cleaning up', async () => {
  const service = new KeyringService();
  service.loadStore({ vault: 'test-vault' });
  jest.spyOn(passwordUtils, 'passwordDecrypt').mockResolvedValue([{}, {}]);
  let release!: () => void;
  const cleanup = jest.fn();
  jest
    .spyOn(service, '_restoreKeyring')
    .mockRejectedValueOnce(new Error('bad keyring'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            const late = {
              type: 'OmniWallet Solana Keyring',
              cleanUp: cleanup,
            };
            service.keyrings.push(late);
            resolve(late);
          };
        })
    );
  const opening = service.unlockKeyrings('test-password');
  await Promise.resolve();
  await Promise.resolve();
  await expect(service.unlockKeyrings('test-password')).rejects.toThrow(
    'already pending'
  );
  release();
  await expect(opening).rejects.toThrow('bad keyring');
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(service.keyrings).toEqual([]);
  jest.restoreAllMocks();
});
