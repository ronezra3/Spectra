import { decrypt, encrypt } from '@metamask/browser-passworder';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { SolanaKeyring } from './keyring/solanaKeyring';

/** Fingerprint encrypted source bytes, never plaintext key material. */
export const fingerprintSolanaVault = (ciphertext: string): string =>
  bytesToHex(sha256(utf8ToBytes(ciphertext)));

/** Separate from the EVM vault and its cached encryption key. */
export interface SolanaVaultStorage {
  read(): Promise<string | null>;
  /** Must atomically compare and write against every possible vault writer. */
  compareAndWrite(
    expected: string | null,
    ciphertext: string
  ): Promise<boolean>;
}

/**
 * Background-only experimental custody. A storage adapter, lock lifecycle,
 * recovery UI and independent security review are required before exposure.
 * Never pass its password, mnemonic or serialized data to a page provider.
 */
export class SolanaVault {
  private keyring: SolanaKeyring | null = null;
  private migrationSnapshot: SolanaKeyring | null = null;
  private generation = 0;
  private busy = false;

  constructor(private readonly storage: SolanaVaultStorage) {}

  lock(): void {
    this.generation += 1;
    this.migrationSnapshot?.cleanUp();
    this.migrationSnapshot = null;
    this.keyring?.cleanUp();
    this.keyring = null;
  }

  isUnlocked(): boolean {
    return this.keyring !== null;
  }

  private enter(): number {
    if (this.busy) throw new Error('Solana vault is busy');
    this.busy = true;
    return this.generation;
  }

  private check(generation: number): void {
    if (generation !== this.generation)
      throw new Error('Solana vault is locked');
  }

  private checkPassword(password: string): void {
    if (typeof password !== 'string' || !password)
      throw new Error('Invalid password');
  }

  async create(password: string): Promise<void> {
    this.checkPassword(password);
    const generation = this.enter();
    const keyring = new SolanaKeyring();
    let adopted = false;
    try {
      if (this.keyring) throw new Error('Solana vault is already unlocked');
      if (await this.storage.read())
        throw new Error('Solana vault already exists');
      this.check(generation);
      const ciphertext = await encrypt(password, await keyring.serialize());
      this.check(generation);
      if (!(await this.storage.compareAndWrite(null, ciphertext))) {
        throw new Error('Solana vault changed');
      }
      this.check(generation);
      this.keyring = keyring;
      adopted = true;
    } finally {
      if (!adopted) keyring.cleanUp();
      this.busy = false;
    }
  }

  async unlock(password: string): Promise<void> {
    this.checkPassword(password);
    const generation = this.enter();
    const keyring = new SolanaKeyring();
    let adopted = false;
    try {
      if (this.keyring) throw new Error('Solana vault is already unlocked');
      const ciphertext = await this.storage.read();
      this.check(generation);
      if (!ciphertext) throw new Error('Solana vault does not exist');
      let serialized: unknown;
      try {
        serialized = await decrypt(password, ciphertext);
      } catch {
        throw new Error('Solana vault decryption failed');
      }
      this.check(generation);
      await keyring.deserialize(serialized);
      this.check(generation);
      this.keyring = keyring;
      adopted = true;
    } finally {
      if (!adopted) keyring.cleanUp();
      this.busy = false;
    }
  }

  async getAccounts(): Promise<string[]> {
    const generation = this.generation;
    const keyring = this.keyring;
    if (!keyring) return [];
    const addresses = await keyring.getAccounts();
    return generation === this.generation && keyring === this.keyring
      ? addresses
      : [];
  }

  /** Only an approval-bound background controller may call this primitive. */
  async signMessage(address: string, message: Uint8Array): Promise<Uint8Array> {
    const generation = this.generation;
    const keyring = this.keyring;
    if (!keyring) throw new Error('Solana vault is locked');
    const signature = await keyring.signMessage(address, message);
    if (generation !== this.generation || keyring !== this.keyring) {
      signature.fill(0);
      throw new Error('Solana vault is locked');
    }
    return signature;
  }

  /** Verify the vault password again before creating a disposable test account. */
  async addTestAccount(password: string): Promise<string> {
    return this.mutate(
      password,
      async (keyring) => (await keyring.addAccounts())[0]
    );
  }

  async importTestMnemonic(
    password: string,
    mnemonic: string,
    accountIndex: number
  ): Promise<string> {
    return this.mutate(password, (keyring) =>
      keyring.addAccountFromMnemonic(mnemonic, accountIndex)
    );
  }

  /**
   * Background-only authenticated snapshot for a future migration. The caller
   * must not expose the keyring to UI or providers. This is not a cross-store
   * transaction; a completed destination write cannot be undone here.
   */
  async withAuthenticatedMigrationSnapshot(
    password: string,
    use: (
      snapshot: SolanaKeyring,
      assertCurrent: () => void,
      sourceFingerprint: string
    ) => Promise<void>
  ): Promise<void> {
    this.checkPassword(password);
    const generation = this.enter();
    const candidate = new SolanaKeyring();
    try {
      const active = this.keyring;
      if (!active) throw new Error('Solana vault is locked');
      const ciphertext = await this.storage.read();
      this.check(generation);
      if (!ciphertext) throw new Error('Solana vault does not exist');
      let serialized: unknown;
      try {
        serialized = await decrypt(password, ciphertext);
      } catch {
        throw new Error('Solana vault decryption failed');
      }
      this.check(generation);
      await candidate.deserialize(serialized);
      const assertCurrent = () => {
        this.check(generation);
        if (active !== this.keyring || this.migrationSnapshot !== candidate)
          throw new Error('Solana vault is locked');
      };
      this.migrationSnapshot = candidate;
      assertCurrent();
      const sourceFingerprint = fingerprintSolanaVault(ciphertext);
      await use(candidate, assertCurrent, sourceFingerprint);
      assertCurrent();
      const currentCiphertext = await this.storage.read();
      assertCurrent();
      if (currentCiphertext !== ciphertext)
        throw new Error('Solana vault changed');
    } finally {
      if (this.migrationSnapshot === candidate) this.migrationSnapshot = null;
      candidate.cleanUp();
      this.busy = false;
    }
  }

  private async mutate(
    password: string,
    update: (candidate: SolanaKeyring) => Promise<string>
  ): Promise<string> {
    this.checkPassword(password);
    const generation = this.enter();
    const candidate = new SolanaKeyring();
    try {
      const active = this.keyring;
      if (!active) throw new Error('Solana vault is locked');
      const ciphertext = await this.storage.read();
      this.check(generation);
      if (!ciphertext) throw new Error('Solana vault does not exist');
      let serialized: unknown;
      try {
        serialized = await decrypt(password, ciphertext);
      } catch {
        throw new Error('Solana vault decryption failed');
      }
      this.check(generation);
      // Restore from authenticated storage before constructing the next state.
      await candidate.deserialize(serialized);
      const address = await update(candidate);
      const next = await encrypt(password, await candidate.serialize());
      this.check(generation);
      if (active !== this.keyring) throw new Error('Solana vault is locked');
      if (!(await this.storage.compareAndWrite(ciphertext, next))) {
        throw new Error('Solana vault changed');
      }
      this.check(generation);
      if (active !== this.keyring) throw new Error('Solana vault is locked');
      this.keyring = candidate;
      active.cleanUp();
      return address;
    } finally {
      if (candidate !== this.keyring) candidate.cleanUp();
      this.busy = false;
    }
  }
}
