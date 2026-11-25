/** @jest-environment node */
import { solanaWalletService } from '@/background/service/solanaWallet';
const mockAddress = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
let mockUnlocked = false;
let mockTargetAccounts: string[] = [];
let mockFingerprint: string | null = null;
let mockCiphertext: string | null = 'encrypted';
let mockNativeCustody = false;
const mockImportSnapshot = jest.fn(async (fingerprint: string) => {
  mockFingerprint = fingerprint;
  mockTargetAccounts = [mockAddress];
  return [mockAddress];
});
const mockSharedSign = jest.fn(async () => new Uint8Array(64).fill(1));
const mockAddedAddress = 'added-test-account';
const mockAddShared = jest.fn(async (_mnemonic, _index, check) => {
  check();
  mockTargetAccounts.push(mockAddedAddress);
  return mockAddedAddress;
});
jest.mock('@/background/service/keyring', () => ({
  __esModule: true,
  default: {
    isUnlocked: () => true,
    getSolanaAccounts: async () => mockTargetAccounts,
    getKeyringsByType: () => [],
    getSolanaMigrationSourceFingerprint: () => mockFingerprint,
    hasAcknowledgedNativeSolanaCustody: () => mockNativeCustody,
    verifyPassword: async (password: string) => {
      if (password !== 'test-password') throw new Error('wrong password');
    },
    signSharedSolanaMessage: () => mockSharedSign(),
    addSharedSolanaTestAccount: (
      mnemonic: string,
      index: number,
      check: () => void
    ) => mockAddShared(mnemonic, index, check),
    importSolanaMigrationSnapshot: (
      _snapshot: unknown,
      _check: unknown,
      fingerprint: string
    ) => mockImportSnapshot(fingerprint),
  },
}));
jest.mock('@/background/service/solanaVaultStorage', () => ({
  SolanaIndexedDbStorage: class {
    async read() {
      return mockCiphertext;
    }
  },
}));
jest.mock('@/background/service/solanaVault', () => ({
  fingerprintSolanaVault: (ciphertext: string) =>
    jest
      .requireActual('@/background/service/solanaVault')
      .fingerprintSolanaVault(ciphertext),
  SolanaVault: class {
    isUnlocked() {
      return mockUnlocked;
    }
    async unlock() {
      mockUnlocked = true;
    }
    async getAccounts() {
      return [mockAddress];
    }
    async withAuthenticatedMigrationSnapshot(
      password: string,
      use: (
        snapshot: unknown,
        assertCurrent: () => void,
        sourceFingerprint: string
      ) => Promise<void>
    ) {
      if (password !== 'test-password') throw new Error('decryption failed');
      await use(
        {},
        () => undefined,
        jest
          .requireActual('@/background/service/solanaVault')
          .fingerprintSolanaVault(mockCiphertext)
      );
    }
    lock() {
      mockUnlocked = false;
    }
  },
}));
jest.mock('@/background/service/solanaConnection', () => ({
  solanaConnectionSession: { invalidate: jest.fn() },
  solanaSigningSession: { currentGeneration: () => 0 },
}));
jest.mock('@/background/controller/solanaConnectApproval', () => ({
  rejectSolanaApproval: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  mockFingerprint = null;
  mockNativeCustody = false;
  mockCiphertext = 'encrypted';
  mockTargetAccounts = [];
  mockImportSnapshot.mockClear();
  mockSharedSign.mockClear();
  mockAddShared.mockClear();
  solanaWalletService.lockForWalletBoundary();
});

test('uses native shared custody only when no legacy source exists', async () => {
  mockNativeCustody = true;
  mockCiphertext = null;
  mockTargetAccounts = [mockAddress];
  expect(await solanaWalletService.status()).toMatchObject({
    custody: 'shared',
    unlocked: true,
    accounts: [mockAddress],
  });
  expect(solanaWalletService.getSelectedWalletAccount()?.source.kind).toBe(
    'shared-solana-keyring'
  );
  await solanaWalletService.signMessage(mockAddress, new Uint8Array([1]));
  expect(mockSharedSign).toHaveBeenCalledTimes(1);
  mockCiphertext = 'unexpected legacy source';
  await expect(solanaWalletService.status()).rejects.toThrow('reconciliation');
  expect(solanaWalletService.getSelectedAccount()).toBeNull();
});

test('authenticates before adding and selecting a shared test account', async () => {
  mockFingerprint = jest
    .requireActual('@/background/service/solanaVault')
    .fingerprintSolanaVault(mockCiphertext);
  mockTargetAccounts = [mockAddress];
  await solanaWalletService.status();
  await expect(
    solanaWalletService.addSharedTestMnemonic('wrong', 'test phrase', 1)
  ).rejects.toThrow('wrong password');
  expect(mockAddShared).not.toHaveBeenCalled();
  await expect(
    solanaWalletService.addSharedTestMnemonic('test-password', 'test phrase', 1)
  ).resolves.toBe(mockAddedAddress);
  expect(solanaWalletService.getSelectedAccount()?.address).toBe(
    mockAddedAddress
  );
});

test('does not add when the retained encrypted source has changed', async () => {
  mockFingerprint = jest
    .requireActual('@/background/service/solanaVault')
    .fingerprintSolanaVault(mockCiphertext);
  mockTargetAccounts = [mockAddress];
  await solanaWalletService.status();
  mockCiphertext = 'different source';
  await expect(
    solanaWalletService.addSharedTestMnemonic('test-password', 'test phrase', 1)
  ).rejects.toThrow('unavailable');
  expect(mockAddShared).not.toHaveBeenCalled();
});

test('exposes a public selected account only while unlocked and preserves the existing controller contract', async () => {
  expect(solanaWalletService.getSelectedWalletAccount()).toBeNull();
  await solanaWalletService.unlock('test-password');
  expect(solanaWalletService.getSelectedWalletAccount()).toEqual({
    ecosystem: 'solana',
    address: mockAddress,
    source: { kind: 'experimental-solana-vault' },
  });
  expect(solanaWalletService.getSelectedAccount()).toEqual({
    address: mockAddress,
    cluster: 'solana:devnet',
  });
  solanaWalletService.lock();
  expect(solanaWalletService.getSelectedWalletAccount()).toBeNull();
  expect(solanaWalletService.getSelectedAccount()).toBeNull();
});

test('preflight inspects public accounts without moving or deleting them', async () => {
  expect(await solanaWalletService.migrationPreflight()).toEqual({
    state: 'source-locked',
  });
  await solanaWalletService.unlock('test-password');
  expect(await solanaWalletService.migrationPreflight()).toEqual({
    state: 'ready',
    sourceCount: 1,
  });
  mockTargetAccounts = [mockAddress];
  expect(await solanaWalletService.migrationPreflight()).toEqual({
    state: 'overlap-detected',
    sourceCount: 1,
    overlapCount: 1,
  });
  solanaWalletService.lock();
  mockTargetAccounts = [];
});

test('migration is explicit, requires a ready source, and retains it', async () => {
  await expect(
    solanaWalletService.migrateTestVault('test-password')
  ).rejects.toThrow('source-locked');
  await solanaWalletService.unlock('test-password');
  await expect(solanaWalletService.migrateTestVault('wrong')).rejects.toThrow(
    'decryption failed'
  );
  expect(mockImportSnapshot).not.toHaveBeenCalled();
  await expect(
    solanaWalletService.migrateTestVault('test-password')
  ).resolves.toEqual([mockAddress]);
  expect(mockImportSnapshot).toHaveBeenCalledTimes(1);
  expect((await solanaWalletService.status()).accounts).toEqual([mockAddress]);
  solanaWalletService.lock();
});

test('a verified shared account opens with the main wallet and manual lock requires its password', async () => {
  mockFingerprint = jest
    .requireActual('@/background/service/solanaVault')
    .fingerprintSolanaVault(mockCiphertext);
  mockTargetAccounts = [mockAddress];
  expect(mockUnlocked).toBe(false);
  expect(await solanaWalletService.status()).toMatchObject({
    unlocked: true,
    accounts: [mockAddress],
    selected: { address: mockAddress },
  });
  expect(solanaWalletService.getSelectedWalletAccount()?.source.kind).toBe(
    'shared-solana-keyring'
  );
  solanaWalletService.lock();
  expect(await solanaWalletService.status()).toMatchObject({
    unlocked: false,
    accounts: [],
  });
  await expect(solanaWalletService.unlock('wrong')).rejects.toThrow(
    'wrong password'
  );
  expect(solanaWalletService.isUnlocked()).toBe(false);
  await solanaWalletService.unlock('test-password');
  expect(solanaWalletService.isUnlocked()).toBe(true);
  solanaWalletService.lockForWalletBoundary();
  expect(await solanaWalletService.status()).toMatchObject({
    unlocked: true,
    accounts: [mockAddress],
  });
});

test('changed source blocks shared signing and invalidates the selected account', async () => {
  mockFingerprint = jest
    .requireActual('@/background/service/solanaVault')
    .fingerprintSolanaVault(mockCiphertext);
  mockTargetAccounts = [mockAddress];
  await solanaWalletService.status();
  mockCiphertext = 'changed-encrypted-source';
  await expect(
    solanaWalletService.signMessage(mockAddress, new Uint8Array([1]))
  ).rejects.toThrow('reconciliation');
  expect(mockSharedSign).not.toHaveBeenCalled();
  expect(solanaWalletService.getSelectedAccount()).toBeNull();
  await expect(solanaWalletService.status()).rejects.toThrow('reconciliation');
});

test('routes a verified shared account to the shared signer', async () => {
  mockFingerprint = jest
    .requireActual('@/background/service/solanaVault')
    .fingerprintSolanaVault(mockCiphertext);
  mockTargetAccounts = [mockAddress];
  await solanaWalletService.status();
  const signature = await solanaWalletService.signMessage(
    mockAddress,
    new Uint8Array([1])
  );
  expect(signature).toHaveLength(64);
  expect(mockSharedSign).toHaveBeenCalledTimes(1);
});

test('wipes a shared signature if the source changes while signing', async () => {
  mockFingerprint = jest
    .requireActual('@/background/service/solanaVault')
    .fingerprintSolanaVault(mockCiphertext);
  mockTargetAccounts = [mockAddress];
  await solanaWalletService.status();
  let release!: (signature: Uint8Array) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  mockSharedSign.mockImplementationOnce(async () => {
    entered();
    return new Promise<Uint8Array>((resolve) => {
      release = resolve;
    });
  });
  const signature = new Uint8Array(64).fill(9);
  const pending = solanaWalletService.signMessage(
    mockAddress,
    new Uint8Array([1])
  );
  const rejected = expect(pending).rejects.toThrow();
  await started;
  mockCiphertext = 'changed-during-signing';
  release(signature);
  await rejected;
  expect(signature.every((value) => value === 0)).toBe(true);
  expect(solanaWalletService.getSelectedAccount()).toBeNull();
});
