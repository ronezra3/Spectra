import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { SOLANA_KEYRING_TYPE } from './solanaKeyringType';
import { deriveSolanaAccountSecret } from './solanaDerivation';

/** Public identities; only an authenticated caller may establish the link. */
export type SolanaEvmAssociation = Readonly<{
  evmAddress: string;
  solanaAddress: string;
  accountIndex: number;
}>;

/** Sensitive serialized data: pass only to the encrypted keyring vault. */
export type SerializedSolanaKeyring = Readonly<{
  version: 1;
  secretKeys: readonly string[];
  migration?:
    | 'legacy-devnet-v1'
    | Readonly<{ kind: 'legacy-devnet-v2'; sourceFingerprint: string }>;
  custody?: 'native-devnet-v1';
  associations?: readonly SolanaEvmAssociation[];
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
  private migration: SerializedSolanaKeyring['migration'];
  private custody: SerializedSolanaKeyring['custody'];
  private associations: SolanaEvmAssociation[] = [];

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
    return {
      version: 1,
      secretKeys: this.secrets.map(bytesToHex),
      ...(this.migration ? { migration: this.migration } : {}),
      ...(this.custody ? { custody: this.custody } : {}),
      ...(this.associations.length
        ? {
            associations: this.associations.map((association) => ({
              ...association,
            })),
          }
        : {}),
    };
  }

  /** Background-only metadata; caller must prove common derivation and consent. */
  async associateEvmAccount(association: SolanaEvmAssociation): Promise<void> {
    this.assertOpen();
    const accounts = await this.getAccounts();
    this.assertOpen();
    if (
      !/^0x[0-9a-f]{40}$/i.test(association.evmAddress) ||
      !Number.isSafeInteger(association.accountIndex) ||
      association.accountIndex < 0 ||
      association.accountIndex >= 0x80000000 ||
      !accounts.includes(association.solanaAddress) ||
      this.associations.some(
        (entry) => entry.solanaAddress === association.solanaAddress
      )
    )
      throw new Error('Invalid Solana account association');
    this.associations.push(
      Object.freeze({
        evmAddress: association.evmAddress,
        solanaAddress: association.solanaAddress,
        accountIndex: association.accountIndex,
      })
    );
  }

  getEvmAssociations(): readonly SolanaEvmAssociation[] {
    this.assertOpen();
    return this.associations.map((association) =>
      Object.freeze({ ...association })
    );
  }

  /** Background-only metadata, persisted inside the encrypted keyring data. */
  markMigratedFromLegacyDevnet(sourceFingerprint: string): void {
    this.assertOpen();
    if (this.custody) throw new Error('Invalid Solana custody');
    if (!/^[0-9a-f]{64}$/.test(sourceFingerprint))
      throw new Error('Invalid source fingerprint');
    this.migration = Object.freeze({
      kind: 'legacy-devnet-v2',
      sourceFingerprint,
    });
  }

  /** Marker only; creating or activating native custody requires separate guards. */
  markNativeDevnetCustody(): void {
    this.assertOpen();
    if (this.migration) throw new Error('Invalid Solana custody');
    this.custody = 'native-devnet-v1';
  }

  isNativeDevnetCustody(): boolean {
    this.assertOpen();
    return this.custody === 'native-devnet-v1';
  }

  isMigratedFromLegacyDevnet(): boolean {
    this.assertOpen();
    return typeof this.migration === 'object';
  }

  getMigrationSourceFingerprint(): string | null {
    this.assertOpen();
    return typeof this.migration === 'object'
      ? this.migration.sourceFingerprint
      : null;
  }

  async deserialize(input: unknown): Promise<void> {
    this.assertOpen();
    if (!input || typeof input !== 'object') throw new Error('Invalid vault');
    const data = input as Partial<SerializedSolanaKeyring>;
    if (
      data.version !== 1 ||
      !Array.isArray(data.secretKeys) ||
      data.secretKeys.length > 1000 ||
      (data.associations !== undefined &&
        (!Array.isArray(data.associations) ||
          data.associations.length > 1000)) ||
      (data.custody !== undefined && data.custody !== 'native-devnet-v1') ||
      (data.custody !== undefined && data.migration !== undefined) ||
      (data.migration !== undefined &&
        data.migration !== 'legacy-devnet-v1' &&
        (typeof data.migration !== 'object' ||
          data.migration === null ||
          data.migration.kind !== 'legacy-devnet-v2' ||
          typeof data.migration.sourceFingerprint !== 'string' ||
          !/^[0-9a-f]{64}$/.test(data.migration.sourceFingerprint)))
    ) {
      throw new Error('Invalid vault');
    }
    const restored: Uint8Array[] = [];
    const associations: SolanaEvmAssociation[] = [];
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
      const associated = new Set<string>();
      for (const value of data.associations ?? []) {
        if (
          !value ||
          typeof value !== 'object' ||
          typeof value.evmAddress !== 'string' ||
          !/^0x[0-9a-f]{40}$/i.test(value.evmAddress) ||
          typeof value.solanaAddress !== 'string' ||
          !seen.has(value.solanaAddress) ||
          associated.has(value.solanaAddress) ||
          !Number.isSafeInteger(value.accountIndex) ||
          value.accountIndex < 0 ||
          value.accountIndex >= 0x80000000
        )
          throw new Error('Invalid vault');
        associated.add(value.solanaAddress);
        associations.push(
          Object.freeze({
            evmAddress: value.evmAddress,
            solanaAddress: value.solanaAddress,
            accountIndex: value.accountIndex,
          })
        );
      }
    } catch {
      restored.forEach((secret) => secret.fill(0));
      throw new Error('Invalid vault');
    }
    this.secrets.forEach((secret) => secret.fill(0));
    this.secrets = restored;
    this.migration =
      typeof data.migration === 'object'
        ? Object.freeze({ ...data.migration })
        : data.migration;
    this.custody = data.custody;
    this.associations = associations;
  }

  cleanUp(): void {
    this.secrets.forEach((secret) => secret.fill(0));
    this.secrets = [];
    this.migration = undefined;
    this.custody = undefined;
    this.associations = [];
    this.closed = true;
  }
}
