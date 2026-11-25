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

import {
  SolanaVault,
  SolanaVaultStorage,
} from 'background/service/solanaVault';
import * as passwordUtils from 'background/utils/password';
import eventBus from '@/eventBus';
import { OrderedStateWriter } from '@/background/service/keyring/orderedStateWriter';
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
async function setup(withFlusher = true) {
  const target = new KeyringService();
  target.loadStore({});
  if (withFlusher) target.setPersistenceFlusher(async () => undefined);
  await target.boot('target-test-password');
  const evm = await target.addNewKeyring('Simple Key Pair', [
    'c87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3',
  ]);
  const evmAddresses = await evm.getAccounts();
  const storage = new MemoryStorage();
  const source = new SolanaVault(storage);
  await source.create('source-test-password');
  const solanaAddress = await source.importTestMnemonic(
    'source-test-password',
    phrase,
    0
  );
  return { target, source, storage, evmAddresses, solanaAddress };
}
afterEach(() => jest.restoreAllMocks());

test('copies into an encrypted target, preserves EVM and retains the source', async () => {
  const {
    target,
    source,
    storage,
    evmAddresses,
    solanaAddress,
  } = await setup();
  const originalSource = storage.value;
  expect(target.hasAcknowledgedSolanaMigration()).toBe(false);
  await source.withAuthenticatedMigrationSnapshot(
    'source-test-password',
    async (snapshot, assertCurrent) => {
      expect(
        await target.importSolanaMigrationSnapshot(snapshot, assertCurrent)
      ).toEqual([solanaAddress]);
    }
  );
  expect(storage.value).toBe(originalSource);
  expect(target.hasAcknowledgedSolanaMigration()).toBe(true);
  expect(JSON.stringify(target.store.getState())).not.toContain(
    'legacy-devnet-v1'
  );
  expect(await target.getSolanaAccounts()).toEqual([solanaAddress]);
  expect(await target.getAccounts()).toEqual(
    evmAddresses.map(normalizeAddress)
  );
  expect(
    JSON.stringify(target.store.getState().unencryptedKeyringData)
  ).not.toContain(SOLANA_KEYRING_TYPE);
  const persistedState = target.store.getState();
  await target.setLocked();
  expect(target.hasAcknowledgedSolanaMigration()).toBe(false);
  const restarted = new KeyringService();
  restarted.loadStore(persistedState);
  await restarted.submitPassword('target-test-password');
  expect(restarted.hasAcknowledgedSolanaMigration()).toBe(true);
  expect(await restarted.getSolanaAccounts()).toEqual([solanaAddress]);
  expect(await restarted.getAccounts()).toEqual(
    evmAddresses.map(normalizeAddress)
  );
  await restarted.setLocked();
  source.lock();
}, 30000);

test('source lock during encryption fails before target commit and keeps the source', async () => {
  const { target, source, storage } = await setup();
  const originalSource = storage.value;
  const originalTarget = target.store.getState().vault;
  const originalEncrypt = passwordUtils.passwordEncrypt;
  let release!: () => void;
  let entered!: () => void;
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
      return originalEncrypt(input);
    });
  const pending = source.withAuthenticatedMigrationSnapshot(
    'source-test-password',
    (snapshot, assertCurrent) =>
      target
        .importSolanaMigrationSnapshot(snapshot, assertCurrent)
        .then(() => undefined)
  );
  const rejected = expect(pending).rejects.toThrow();
  await started;
  source.lock();
  release();
  await rejected;
  expect(target.store.getState().vault).toBe(originalTarget);
  expect(await target.getSolanaAccounts()).toEqual([]);
  expect(storage.value).toBe(originalSource);
  await target.setLocked();
}, 30000);

test('does not overwrite an existing Solana destination', async () => {
  const { target, source, solanaAddress } = await setup();
  const migrate = () =>
    source.withAuthenticatedMigrationSnapshot(
      'source-test-password',
      (snapshot, check) =>
        target
          .importSolanaMigrationSnapshot(snapshot, check)
          .then(() => undefined)
    );
  await migrate();
  const ciphertext = target.store.getState().vault;
  await expect(migrate()).rejects.toThrow('destination already exists');
  expect(target.store.getState().vault).toBe(ciphertext);
  expect(await target.getSolanaAccounts()).toEqual([solanaAddress]);
  await target.setLocked();
  source.lock();
}, 30000);

test('retains the candidate when notification fails after the target update', async () => {
  const { target, source, storage, solanaAddress } = await setup();
  const originalSource = storage.value;
  const oldTarget = target.store.getState().vault;
  jest.spyOn(eventBus, 'emit').mockImplementation(() => {
    throw new Error('notification failed');
  });
  await expect(
    source.withAuthenticatedMigrationSnapshot(
      'source-test-password',
      (snapshot, check) =>
        target
          .importSolanaMigrationSnapshot(snapshot, check)
          .then(() => undefined)
    )
  ).rejects.toThrow('notification failed');
  expect(target.store.getState().vault).not.toBe(oldTarget);
  expect(await target.getSolanaAccounts()).toEqual([solanaAddress]);
  expect(storage.value).toBe(originalSource);
  jest.restoreAllMocks();
  await target.setLocked();
  source.lock();
}, 30000);

test('requires a storage acknowledger before modifying the target', async () => {
  const { target, source, storage } = await setup(false);
  const oldTarget = target.store.getState().vault;
  const oldSource = storage.value;
  await expect(
    source.withAuthenticatedMigrationSnapshot(
      'source-test-password',
      (snapshot, check) =>
        target
          .importSolanaMigrationSnapshot(snapshot, check)
          .then(() => undefined)
    )
  ).rejects.toThrow('acknowledgement unavailable');
  expect(target.store.getState().vault).toBe(oldTarget);
  expect(storage.value).toBe(oldSource);
  expect(await target.getSolanaAccounts()).toEqual([]);
  await target.setLocked();
  source.lock();
}, 30000);

test('waits for storage acknowledgement before reporting success', async () => {
  const { target, source, solanaAddress } = await setup();
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  target.setPersistenceFlusher(async () => {
    entered();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  let completed = false;
  const pending = source.withAuthenticatedMigrationSnapshot(
    'source-test-password',
    (snapshot, check) =>
      target.importSolanaMigrationSnapshot(snapshot, check).then(() => {
        completed = true;
      })
  );
  await started;
  expect(completed).toBe(false);
  release();
  await pending;
  expect(completed).toBe(true);
  expect(await target.getSolanaAccounts()).toEqual([solanaAddress]);
  await target.setLocked();
  source.lock();
}, 30000);

test('failed storage acknowledgement retains source and reports an uncertain outcome', async () => {
  const { target, source, storage, solanaAddress } = await setup();
  const oldSource = storage.value;
  target.setPersistenceFlusher(async () => {
    throw new Error('storage failed');
  });
  await expect(
    source.withAuthenticatedMigrationSnapshot(
      'source-test-password',
      (snapshot, check) =>
        target
          .importSolanaMigrationSnapshot(snapshot, check)
          .then(() => undefined)
    )
  ).rejects.toThrow('storage failed');
  expect(storage.value).toBe(oldSource);
  expect(await target.getSolanaAccounts()).toEqual([solanaAddress]);
  expect(target.hasAcknowledgedSolanaMigration()).toBe(false);
  await target.setLocked();
  source.lock();
}, 30000);

test('waits for the subscribed ordered storage writer with the updated encrypted state', async () => {
  const { target, source } = await setup(false);
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let written: any;
  const writer = new OrderedStateWriter<any>(async (state) => {
    entered();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    written = state;
  });
  target.store.subscribe((value) => {
    void writer.enqueue(value).catch(() => undefined);
  });
  target.setPersistenceFlusher(() => writer.flush());
  let completed = false;
  const pending = source.withAuthenticatedMigrationSnapshot(
    'source-test-password',
    (snapshot, check) =>
      target.importSolanaMigrationSnapshot(snapshot, check).then(() => {
        completed = true;
      })
  );
  await started;
  expect(completed).toBe(false);
  release();
  await pending;
  expect(written.vault).toBe(target.store.getState().vault);
  expect(JSON.stringify(written.unencryptedKeyringData)).not.toContain(
    SOLANA_KEYRING_TYPE
  );
  await target.setLocked();
  source.lock();
}, 30000);
