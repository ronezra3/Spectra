/** @jest-environment node */
import { solanaWalletService } from '@/background/service/solanaWallet';
const mockAddress = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
let mockUnlocked = false;
let mockTargetAccounts: string[] = [];
const mockImportSnapshot = jest.fn(async () => [mockAddress]);
jest.mock('@/background/service/keyring', () => ({
  __esModule: true,
  default: {
    isUnlocked: () => true,
    getSolanaAccounts: async () => mockTargetAccounts,
    getKeyringsByType: () => [],
    importSolanaMigrationSnapshot: () => mockImportSnapshot(),
  },
}));
jest.mock('@/background/service/solanaVaultStorage', () => ({
  SolanaIndexedDbStorage: class {
    async read() {
      return 'encrypted';
    }
  },
}));
jest.mock('@/background/service/solanaVault', () => ({
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
      use: (snapshot: unknown, assertCurrent: () => void) => Promise<void>
    ) {
      if (password !== 'test-password') throw new Error('decryption failed');
      await use({}, () => undefined);
    }
    lock() {
      mockUnlocked = false;
    }
  },
}));
jest.mock('@/background/service/solanaConnection', () => ({
  solanaConnectionSession: { invalidate: jest.fn() },
}));
jest.mock('@/background/controller/solanaConnectApproval', () => ({
  rejectSolanaApproval: jest.fn().mockResolvedValue(undefined),
}));

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
