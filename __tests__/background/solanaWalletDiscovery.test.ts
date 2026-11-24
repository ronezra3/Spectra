import { getWallets } from '@wallet-standard/app';
import { registerExperimentalSolanaWallet } from '@/chains/solana/discovery';

describe('experimental Solana wallet discovery', () => {
  test('registers with the official app registry but cannot connect or sign', async () => {
    const registry = getWallets();
    const before = registry.get();

    registerExperimentalSolanaWallet();
    registerExperimentalSolanaWallet();

    const matches = registry
      .get()
      .filter((wallet) => wallet.name === 'OmniWallet (experimental)');
    expect(matches).toHaveLength(1);
    expect(registry.get()).toHaveLength(before.length + 1);

    const wallet = matches[0];
    expect(wallet.chains).toEqual(['solana:devnet']);
    expect(wallet.accounts).toEqual([]);
    expect(wallet.features['solana:signTransaction']).toBeUndefined();
    expect(wallet.features['solana:signMessage']).toBeUndefined();
    expect(wallet.features['solana:signAndSendTransaction']).toBeUndefined();
    const connect = wallet.features['standard:connect'] as {
      connect: (options?: { silent?: boolean }) => Promise<unknown>;
    };
    await expect(connect.connect()).rejects.toThrow('not yet available');
    await expect(connect.connect({ silent: true })).rejects.toThrow(
      'not yet available'
    );
    expect(wallet.accounts).toEqual([]);
  });
});
