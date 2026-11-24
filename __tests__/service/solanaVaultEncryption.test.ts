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

test('encrypts and restores only a public test account with the real passworder', async () => {
  const storage = new MemoryStorage();
  const vault = new SolanaVault(storage);
  const phrase =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const publicTestSeed =
    '37df573b3ac4ad5b522e064e25b63ea16bcbe79d449e81a0268d1047948bb445';
  await vault.create('disposable-test-password');
  const address = await vault.importTestMnemonic(
    'disposable-test-password',
    phrase,
    0
  );
  expect(storage.value).not.toContain(phrase);
  expect(storage.value).not.toContain(publicTestSeed);
  vault.lock();
  await expect(vault.unlock('wrong-test-password')).rejects.toThrow();
  await vault.unlock('disposable-test-password');
  expect(await vault.getAccounts()).toEqual([address]);
  vault.lock();
}, 30000);
