import {
  readWalletView,
  writeWalletView,
} from '@/ui/views/Dashboard/components/walletViewPreference';

test('remembers the dashboard view and ignores invalid stored values', () => {
  localStorage.clear();
  expect(readWalletView()).toBe('evm');
  writeWalletView('solana');
  expect(readWalletView()).toBe('solana');
  writeWalletView('evm');
  expect(readWalletView()).toBe('evm');
  localStorage.setItem('omniwallet.dashboard-view', 'unexpected');
  expect(readWalletView()).toBe('evm');
  localStorage.clear();
});

test('falls back safely when storage is unavailable', () => {
  const read = jest
    .spyOn(Storage.prototype, 'getItem')
    .mockImplementation(() => {
      throw new Error('unavailable');
    });
  const write = jest
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('unavailable');
    });
  try {
    expect(readWalletView()).toBe('evm');
    expect(() => writeWalletView('solana')).not.toThrow();
  } finally {
    read.mockRestore();
    write.mockRestore();
  }
});
