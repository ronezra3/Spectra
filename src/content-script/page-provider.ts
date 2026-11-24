import '@rabby-wallet/page-provider';
if (
  process.env.NODE_ENV === 'development' &&
  process.env.OMNI_SOLANA_DISCOVERY === '1'
) {
  // Keep the experimental dependency out of production's module graph.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const discovery = require('@/chains/solana/discovery');
  (discovery as typeof import('@/chains/solana/discovery')).registerExperimentalSolanaWallet();
}
