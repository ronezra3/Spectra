import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { SOLANA_KEYRING_TYPE } from './solanaKeyringType';
import { deriveSolanaAccountSecret } from './solanaDerivation';

/** Sensitive serialized data: pass only to the encrypted keyring vault. */
export type SerializedSolanaKeyring = Readonly<{
  version: 1;
  secretKeys: readonly string[];
}>;

/**
 * Background-only primitive. It is deliberately not registered with the
 * keyring service or exposed to a dapp until isolation and approval flows are
 * complete. Keys may be derived from a supplied mnemonic, but there is no
 * mnemonic storage, recovery UI, or registered vault integration yet.
 */
export class SolanaKeyring {
  static readonly type = SOLANA_KEYRING_TYPE;
  readonly type = SOLANA_KEYRING_TYPE;
  private secrets: Uint8Array[] = [];
  private closed = false;

  private assertOpen(): void {
    if (this.closed) throw new Error('Solana keyring is locked');
  }

  async addAccounts(count = 1): Promise<string[]> {
    this.assertOpen();
    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > 20 ||
      this.secrets.length + count > 1000
    ) {
      throw new Error('Invalid Solana account count');
    }
    const created: Uint8Array[] = [];
    try {
      for (let i = 0; i < count; i += 1) {
        created.push(ed25519.utils.randomSecretKey());
      }
      const addresses = created.map((secret) =>
        base58.encode(ed25519.getPublicKey(secret))
      );
      this.secrets.push(...created);
      return addresses;
    } catch (error) {
      created.forEach((secret) => secret.fill(0));
      throw error;
    }
  }

  /** Derive from a BIP-39 test mnemonic; never send it to the page provider. */
  async addAccountFromMnemonic(
    mnemonic: string,
    accountIndex: number,
    passphrase = ''
  ): Promise<string> {
    this.assertOpen();
    if (this.secrets.length >= 1000)
      throw new Error('Solana account limit reached');
    const secret = deriveSolanaAccountSecret(
      mnemonic,
      accountIndex,
      passphrase
    );
    try {
      const address = base58.encode(ed25519.getPublicKey(secret));
      if (
        this.secrets.some(
          (existing) =>
            base58.encode(ed25519.getPublicKey(existing)) === address
        )
      ) {
        throw new Error('Solana account already exists');
      }
      this.secrets.push(secret);
      return address;
    } catch (error) {
      secret.fill(0);
      throw error;
    }
  }

  /** Low-level signing primitive; callers must enforce an exact approval. */
  async signMessage(address: string, message: Uint8Array): Promise<Uint8Array> {
    this.assertOpen();
    if (!(message instanceof Uint8Array) || message.byteLength > 1024) {
      throw new Error('Invalid Solana signing payload');
    }
    const secret = this.secrets.find(
      (entry) => base58.encode(ed25519.getPublicKey(entry)) === address
    );
    if (!secret) throw new Error('Solana account unavailable');
    return ed25519.sign(message, secret);
  }

  async getAccounts(): Promise<string[]> {
    this.assertOpen();
    return this.secrets.map((secret) =>
      base58.encode(ed25519.getPublicKey(secret))
    );
  }

  async serialize(): Promise<SerializedSolanaKeyring> {
    this.assertOpen();
    return { version: 1, secretKeys: this.secrets.map(bytesToHex) };
  }

  async deserialize(input: unknown): Promise<void> {
    this.assertOpen();
    if (!input || typeof input !== 'object') throw new Error('Invalid vault');
    const data = input as Partial<SerializedSolanaKeyring>;
    if (
      data.version !== 1 ||
      !Array.isArray(data.secretKeys) ||
      data.secretKeys.length > 1000
    ) {
      throw new Error('Invalid vault');
    }
    const restored: Uint8Array[] = [];
    try {
      const seen = new Set<string>();
      for (const value of data.secretKeys) {
        if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
          throw new Error('Invalid vault');
        }
        const secret = hexToBytes(value);
        restored.push(secret);
        const address = base58.encode(ed25519.getPublicKey(secret));
        if (seen.has(address)) throw new Error('Invalid vault');
        seen.add(address);
      }
    } catch {
      restored.forEach((secret) => secret.fill(0));
      throw new Error('Invalid vault');
    }
    this.secrets.forEach((secret) => secret.fill(0));
    this.secrets = restored;
  }

  cleanUp(): void {
    this.secrets.forEach((secret) => secret.fill(0));
    this.secrets = [];
    this.closed = true;
  }
}
