import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { deriveSolanaAccountSecret } from 'background/service/keyring/solanaDerivation';

// Public BIP-39 test vector: never use for a wallet holding funds.
const mnemonic =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('derives the public Solana account at the documented account path', () => {
  const secret = deriveSolanaAccountSecret(mnemonic, 0);
  try {
    expect(base58.encode(ed25519.getPublicKey(secret))).toBe(
      'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk'
    );
  } finally {
    secret.fill(0);
  }
});

test('rejects invalid mnemonic and indices', () => {
  expect(() => deriveSolanaAccountSecret('invalid', 0)).toThrow(
    'Invalid mnemonic'
  );
  expect(() => deriveSolanaAccountSecret(mnemonic, -1)).toThrow(
    'Invalid Solana account index'
  );
  expect(() => deriveSolanaAccountSecret(mnemonic, 0x80000000)).toThrow(
    'Invalid Solana account index'
  );
});
