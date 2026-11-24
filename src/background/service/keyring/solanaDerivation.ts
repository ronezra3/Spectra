import { HDKey } from 'micro-key-producer/slip10.js';
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

/**
 * Derive one Solana Ed25519 seed using the standard hardened account path.
 * Background-only: the caller owns the returned secret and must wipe it.
 * This function is not exposed through the UI or provider.
 */
export function deriveSolanaAccountSecret(
  mnemonic: string,
  accountIndex: number,
  passphrase = ''
): Uint8Array {
  if (!validateMnemonic(mnemonic, wordlist))
    throw new Error('Invalid mnemonic');
  if (
    !Number.isSafeInteger(accountIndex) ||
    accountIndex < 0 ||
    accountIndex >= 0x80000000
  ) {
    throw new Error('Invalid Solana account index');
  }

  const seed = mnemonicToSeedSync(mnemonic, passphrase);
  let root: HDKey | undefined;
  let child: HDKey | undefined;
  try {
    root = HDKey.fromMasterSeed(seed);
    child = root.derive(`m/44'/501'/${accountIndex}'/0'`);
    return new Uint8Array(child.privateKey);
  } finally {
    seed.fill(0);
    root?.privateKey.fill(0);
    root?.chainCode.fill(0);
    child?.privateKey.fill(0);
    child?.chainCode.fill(0);
  }
}
