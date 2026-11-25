/** @jest-environment node */
import * as nodeCrypto from 'crypto';
import {
  SolanaVault,
  SolanaVaultStorage,
} from 'background/service/solanaVault';
Object.defineProperty(globalThis, 'crypto', {
  value: ((nodeCrypto as unknown) as { webcrypto: Crypto }).webcrypto,
  configurable: true,
});
class MemoryStorage implements SolanaVaultStorage {
  value: string | null = null;
  async read() {
    return this.value;
  }
  async compareAndWrite(expected: string | null, next: string) {
    if (this.value !== expected) return false;
    this.value = next;
    return true;
  }
}
const phrase =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
async function setup() {
  const storage = new MemoryStorage();
  const vault = new SolanaVault(storage);
  await vault.create('test-password');
  const address = await vault.importTestMnemonic('test-password', phrase, 0);
  return { vault, storage, address };
}

test('requires the password and cleans the temporary keyring after use', async () => {
  const { vault, address } = await setup();
  const callback = jest.fn();
  await expect(
    vault.withAuthenticatedMigrationSnapshot('wrong', callback)
  ).rejects.toThrow('decryption failed');
  expect(callback).not.toHaveBeenCalled();
  let retained: any;
  await vault.withAuthenticatedMigrationSnapshot(
    'test-password',
    async (snapshot, assertCurrent) => {
      retained = snapshot;
      assertCurrent();
      expect(await snapshot.getAccounts()).toEqual([address]);
    }
  );
  await expect(retained.getAccounts()).rejects.toThrow('locked');
  expect(await vault.getAccounts()).toEqual([address]);
  vault.lock();
}, 30000);

test('locking during the callback immediately invalidates the temporary snapshot', async () => {
  const { vault } = await setup();
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let retained: any;
  const pending = vault.withAuthenticatedMigrationSnapshot(
    'test-password',
    async (snapshot, assertCurrent) => {
      retained = snapshot;
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      assertCurrent();
    }
  );
  const rejected = expect(pending).rejects.toThrow('locked');
  await started;
  vault.lock();
  await expect(retained.getAccounts()).rejects.toThrow('locked');
  release();
  await rejected;
}, 30000);

test('detects an external source change without altering that source', async () => {
  const { vault, storage } = await setup();
  await expect(
    vault.withAuthenticatedMigrationSnapshot('test-password', async () => {
      storage.value = 'externally-changed';
    })
  ).rejects.toThrow('vault changed');
  expect(storage.value).toBe('externally-changed');
  vault.lock();
}, 30000);
