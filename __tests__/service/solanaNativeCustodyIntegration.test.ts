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
jest.mock('@/background/controller/solanaConnectApproval', () => ({
  rejectSolanaApproval: jest.fn().mockResolvedValue(undefined),
}));
let mockSource: string | null = null;
jest.mock('@/background/service/solanaVaultStorage', () => ({
  SolanaIndexedDbStorage: class {
    async read() {
      return mockSource;
    }
    async compareAndWrite(expected: string | null, next: string) {
      if (expected !== mockSource) return false;
      mockSource = next;
      return true;
    }
  },
}));

import * as nodeCrypto from 'crypto';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import keyringService from '@/background/service/keyring';
import { solanaWalletService } from '@/background/service/solanaWallet';
import { normalizeAddress } from '@/background/utils';

const phrase =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
Object.defineProperty(globalThis, 'crypto', {
  value: ((nodeCrypto as unknown) as { webcrypto: Crypto }).webcrypto,
  configurable: true,
});

test('creates, adds, signs and reopens native Solana test accounts alongside EVM', async () => {
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
  mockSource = null;
  keyringService.loadStore({});
  keyringService.setPersistenceFlusher(async () => undefined);
  await keyringService.boot('main-test-password');
  const evm = await keyringService.addNewKeyring('Simple Key Pair', [
    'c87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3',
  ]);
  const evmAddresses = (await evm.getAccounts()).map(normalizeAddress);
  const first = await solanaWalletService.createNativeTestMnemonic(
    'main-test-password',
    phrase,
    0
  );
  expect(mockSource).toBeNull();
  const second = await solanaWalletService.addSharedTestMnemonic(
    'main-test-password',
    phrase,
    1
  );
  expect(second).not.toBe(first);
  expect((await solanaWalletService.status()).accounts).toEqual([
    first,
    second,
  ]);
  const message = new Uint8Array([1, 2, 3]);
  const signature = await solanaWalletService.signMessage(second, message);
  expect(ed25519.verify(signature, message, base58.decode(second))).toBe(true);
  expect(await keyringService.getAccounts()).toEqual(evmAddresses);
  await keyringService.setLocked();
  solanaWalletService.lockForWalletBoundary();
  await keyringService.submitPassword('main-test-password');
  solanaWalletService.lockForWalletBoundary();
  expect((await solanaWalletService.status()).accounts).toEqual([
    first,
    second,
  ]);
  expect(await keyringService.getAccounts()).toEqual(evmAddresses);
  mockSource = 'unexpected encrypted legacy source';
  await expect(solanaWalletService.status()).rejects.toThrow('reconciliation');
  expect(solanaWalletService.getSelectedAccount()).toBeNull();
  mockSource = null;
  expect((await solanaWalletService.status()).accounts).toEqual([first, second]);
  await keyringService.setLocked();
  solanaWalletService.lockForWalletBoundary();
}, 30000);
