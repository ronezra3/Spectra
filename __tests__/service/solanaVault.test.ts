import {
  SolanaVault,
  SolanaVaultStorage,
} from 'background/service/solanaVault';

// Fake cryptography verifies lifecycle only. Integration tests must verify the
// real browser-passworder encryption and never use real secrets.
jest.mock('@metamask/browser-passworder', () => ({
  encrypt: async (password: string, data: unknown) =>
    JSON.stringify({ password, data }),
  decrypt: async (password: string, value: string) => {
    const parsed = JSON.parse(value);
    if (password !== parsed.password) throw new Error('Invalid password');
    return parsed.data;
  },
}));

class MemoryStorage implements SolanaVaultStorage {
  value: string | null = null;
  async read() {
    return this.value;
  }
  async compareAndWrite(expected: string | null, value: string) {
    if (this.value !== expected) return false;
    this.value = value;
    return true;
  }
}

const mnemonic =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('creates an isolated vault, restores a test account and locks', async () => {
  const store = new MemoryStorage();
  const vault = new SolanaVault(store);
  await vault.create('test-password');
  const address = await vault.importTestMnemonic('test-password', mnemonic, 0);
  expect(address).toBe('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');
  vault.lock();
  expect(await vault.getAccounts()).toEqual([]);
  await expect(vault.unlock('wrong')).rejects.toThrow();
  await vault.unlock('test-password');
  expect(await vault.getAccounts()).toEqual([address]);
  vault.lock();
});

test('does not adopt stale changes when atomic storage rejects a write', async () => {
  const store = new MemoryStorage();
  const vault = new SolanaVault(store);
  await vault.create('test-password');
  jest.spyOn(store, 'compareAndWrite').mockResolvedValue(false);
  await expect(
    vault.importTestMnemonic('test-password', mnemonic, 0)
  ).rejects.toThrow('changed');
  expect(await vault.getAccounts()).toEqual([]);
  vault.lock();
});

test('does not unlock when a lock occurs while storage is loading', async () => {
  let resolve!: (value: string | null) => void;
  const store: SolanaVaultStorage = {
    read: () =>
      new Promise((done) => {
        resolve = done;
      }),
    compareAndWrite: async () => true,
  };
  const vault = new SolanaVault(store);
  const pending = vault.unlock('test-password');
  vault.lock();
  resolve(null);
  await expect(pending).rejects.toThrow('locked');
  expect(vault.isUnlocked()).toBe(false);
});

test('does not leave a vault unlocked when a lock races with a write', async () => {
  let finish!: (written: boolean) => void;
  let started!: () => void;
  const writeStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const store: SolanaVaultStorage = {
    read: async () => null,
    compareAndWrite: () => {
      started();
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const vault = new SolanaVault(store);
  const pending = vault.create('test-password');
  await writeStarted;
  vault.lock();
  finish(true);
  await expect(pending).rejects.toThrow('locked');
  expect(vault.isUnlocked()).toBe(false);
});
