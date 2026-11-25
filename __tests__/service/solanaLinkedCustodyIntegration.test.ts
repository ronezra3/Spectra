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
let mockCurrentAccount: {
  address: string;
  type: string;
  brandName: string;
} | null = null;
jest.mock('@/background/service/preference', () => ({
  __esModule: true,
  default: {
    getCurrentAccount: () => mockCurrentAccount,
    getHiddenAddresses: () => [],
  },
}));
jest.mock('@/background/service/solanaVaultStorage', () => ({
  SolanaIndexedDbStorage: class {
    async read() {
      return null;
    }
  },
}));

import * as nodeCrypto from 'crypto';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import keyringService from '@/background/service/keyring';
import { solanaWalletService } from '@/background/service/solanaWallet';
import { SOLANA_KEYRING_TYPE } from '@/background/service/keyring/solanaKeyringType';

Object.defineProperty(globalThis, 'crypto', {
  value: ((nodeCrypto as unknown) as { webcrypto: Crypto }).webcrypto,
  configurable: true,
});

test('derives and signs with a linked test account, then restores the association', async () => {
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
  keyringService.loadStore({});
  keyringService.setPersistenceFlusher(async () => undefined);
  await keyringService.boot('test-password');
  const mnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const hd = await keyringService.addNewKeyring('HD Key Tree', { mnemonic });
  const [address] = await hd.addAccounts(1);
  mockCurrentAccount = {
    address,
    type: 'HD Key Tree',
    brandName: 'HD Key Tree',
  };
  const solanaAddress = await solanaWalletService.createNativeTestFromCurrentEvm(
    'test-password',
    0
  );
  expect(solanaAddress).toBe('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');
  const message = new Uint8Array([1, 2, 3]);
  const signature = await solanaWalletService.signMessage(
    solanaAddress,
    message
  );
  expect(ed25519.verify(signature, message, base58.decode(solanaAddress))).toBe(
    true
  );
  await keyringService.setLocked();
  solanaWalletService.lockForWalletBoundary();
  await keyringService.submitPassword('test-password');
  solanaWalletService.lockForWalletBoundary();
  expect((await solanaWalletService.status()).accounts).toEqual([
    solanaAddress,
  ]);
  const [solana] = keyringService.getKeyringsByType(SOLANA_KEYRING_TYPE);
  expect(solana.getEvmAssociations()).toEqual([
    { evmAddress: address, solanaAddress, accountIndex: 0 },
  ]);
  await keyringService.setLocked();
  solanaWalletService.lockForWalletBoundary();
}, 30000);
