/** @jest-environment node */
import { solanaWalletService } from '@/background/service/solanaWallet';
const mockAddress = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
let mockUnlocked = false;
jest.mock('@/background/service/keyring', () => ({
  __esModule: true,
  default: { isUnlocked: () => true },
}));
jest.mock('@/background/service/solanaVaultStorage', () => ({
  SolanaIndexedDbStorage: class {},
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
