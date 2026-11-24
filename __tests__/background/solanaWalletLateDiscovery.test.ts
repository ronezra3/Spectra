import { getWallets } from '@wallet-standard/app';
import { registerExperimentalSolanaWallet } from '@/chains/solana/discovery';

test('an app initialized after the wallet can discover it', () => {
  registerExperimentalSolanaWallet();
  const wallets = getWallets().get();

  expect(
    wallets.filter((wallet) => wallet.name === 'OmniWallet (experimental)')
  ).toHaveLength(1);
});
