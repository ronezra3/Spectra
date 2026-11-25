import keyringService from './keyring';
import preferenceService from './preference';
import { KEYRING_TYPE } from '@/constant';
import { SOLANA_DEVNET_NETWORK } from '@/chains/network';
import { assessSolanaMigration } from '@/chains/solana/migrationPreflight';
import { SOLANA_KEYRING_TYPE } from './keyring/solanaKeyringType';
import {
  SolanaWalletAccount,
  walletAccountFromSolana,
} from '@/chains/walletAccount';
import {
  solanaConnectionSession,
  solanaSigningSession,
} from './solanaConnection';
import { rejectSolanaApproval } from '../controller/solanaConnectApproval';
import { fingerprintSolanaVault, SolanaVault } from './solanaVault';
import { SolanaIndexedDbStorage } from './solanaVaultStorage';
import type { SolanaSelectedAccount } from '../controller/solanaConnect';

/** Experimental Solana state is deliberately independent of EVM accounts. */
class SolanaWalletService {
  private readonly storage = new SolanaIndexedDbStorage();
  private readonly vault = new SolanaVault(this.storage);
  private selected: string | null = null;
  private verifiedSharedFingerprint: string | null = null;
  private sharedManuallyLocked = false;
  private custodyCreationPending = false;

  private sharedIdentity(): string | null {
    return keyringService.hasAcknowledgedNativeSolanaCustody()
      ? 'native-devnet-v1'
      : keyringService.getSolanaMigrationSourceFingerprint();
  }

  private requireWalletUnlocked(): void {
    if (!keyringService.isUnlocked()) throw new Error('Wallet is locked');
  }

  private invalidateConnections(): void {
    solanaConnectionSession.invalidate();
    void rejectSolanaApproval().catch(() => undefined);
  }

  lock(): void {
    this.sharedManuallyLocked = true;
    this.clearSession();
  }

  /** Called when the main wallet locks or re-authenticates. */
  lockForWalletBoundary(): void {
    this.sharedManuallyLocked = false;
    this.clearSession();
  }

  private clearSession(): void {
    this.selected = null;
    this.verifiedSharedFingerprint = null;
    this.vault.lock();
    this.invalidateConnections();
  }

  isUnlocked(): boolean {
    if (!keyringService.isUnlocked()) return false;
    const expected = this.sharedIdentity();
    return expected
      ? !this.sharedManuallyLocked &&
          this.verifiedSharedFingerprint === expected
      : this.vault.isUnlocked();
  }

  private async verifySharedCustody(): Promise<boolean> {
    const expected = this.sharedIdentity();
    if (!expected || this.sharedManuallyLocked) return false;
    let valid = false;
    try {
      const ciphertext = await this.storage.read();
      valid =
        (expected === 'native-devnet-v1'
          ? ciphertext === null
          : !!ciphertext && fingerprintSolanaVault(ciphertext) === expected) &&
        keyringService.isUnlocked() &&
        !this.sharedManuallyLocked &&
        this.sharedIdentity() === expected;
    } catch {
      valid = false;
    }
    if (!valid) {
      this.verifiedSharedFingerprint = null;
      this.selected = null;
      this.invalidateConnections();
      return false;
    }
    this.verifiedSharedFingerprint = expected;
    return true;
  }

  /** Public account identity; does not expose keys or grant permissions. */
  getSelectedWalletAccount(): SolanaWalletAccount | null {
    return this.isUnlocked() && this.selected
      ? walletAccountFromSolana(
          this.selected,
          this.verifiedSharedFingerprint
            ? 'shared-solana-keyring'
            : 'experimental-solana-vault'
        )
      : null;
  }

  getSelectedAccount(): SolanaSelectedAccount | null {
    const account = this.getSelectedWalletAccount();
    return account
      ? { address: account.address, cluster: SOLANA_DEVNET_NETWORK.id }
      : null;
  }

  /** Never expose this method to an untrusted page or generic UI RPC. */
  async signMessage(address: string, message: Uint8Array): Promise<Uint8Array> {
    this.requireWalletUnlocked();
    if (!this.isUnlocked() || this.selected !== address)
      throw new Error('Solana account unavailable');
    const shared = !!this.sharedIdentity();
    if (shared && !(await this.verifySharedCustody()))
      throw new Error('Solana migration requires reconciliation');
    let signature: Uint8Array | undefined;
    let accepted = false;
    try {
      signature = shared
        ? await keyringService.signSharedSolanaMessage(address, message)
        : await this.vault.signMessage(address, message);
      if (shared && !(await this.verifySharedCustody()))
        throw new Error('Solana account unavailable');
      if (
        !this.isUnlocked() ||
        this.selected !== address ||
        shared !== !!this.sharedIdentity()
      )
        throw new Error('Solana account unavailable');
      accepted = true;
      return signature;
    } finally {
      if (!accepted) signature?.fill(0);
    }
  }

  async status() {
    if (this.sharedIdentity()) {
      if (this.sharedManuallyLocked)
        return {
          exists: true,
          unlocked: false,
          accounts: [],
          selected: null,
          custody: 'shared' as const,
        };
      if (!(await this.verifySharedCustody()))
        throw new Error('Solana migration requires reconciliation');
      const accounts = await keyringService.getSolanaAccounts();
      if (!this.isUnlocked()) throw new Error('Wallet is locked');
      if (!this.selected || !accounts.includes(this.selected)) {
        this.selected = accounts[0] || null;
        this.invalidateConnections();
      }
      return {
        exists: true,
        unlocked: true,
        accounts,
        selected: this.getSelectedAccount(),
        custody: 'shared' as const,
      };
    }
    const exists = (await this.storage.read()) !== null;
    const accounts = this.isUnlocked() ? await this.vault.getAccounts() : [];
    return {
      exists,
      unlocked: this.isUnlocked(),
      accounts: this.isUnlocked() ? accounts : [],
      selected: this.getSelectedAccount(),
      custody: 'separate' as const,
    };
  }

  /** Advisory snapshot only: migration must revalidate before any write. */
  async migrationPreflight() {
    if (!keyringService.isUnlocked())
      return { state: 'wallet-locked' } as const;
    const before = await this.status();
    const targetAccounts = await keyringService.getSolanaAccounts();
    const after = await this.status();
    if (!keyringService.isUnlocked())
      return { state: 'wallet-locked' } as const;
    if (
      before.exists !== after.exists ||
      before.unlocked !== after.unlocked ||
      before.accounts.length !== after.accounts.length ||
      before.accounts.some(
        (address, index) => address !== after.accounts[index]
      )
    )
      return { state: 'snapshot-changed' } as const;
    return assessSolanaMigration({
      walletUnlocked: true,
      sourceExists: after.exists,
      sourceUnlocked: after.unlocked,
      sourceAccounts: after.accounts,
      targetAccounts,
      targetHasSolanaKeyring:
        keyringService.getKeyringsByType(SOLANA_KEYRING_TYPE).length > 0,
    });
  }

  /** Background-only: source is retained even after successful copying. */
  async migrateTestVault(password: string): Promise<string[]> {
    this.requireWalletUnlocked();
    const preflight = await this.migrationPreflight();
    if (preflight.state !== 'ready')
      throw new Error(`Solana migration unavailable: ${preflight.state}`);
    this.invalidateConnections();
    let copied: string[] = [];
    await this.vault.withAuthenticatedMigrationSnapshot(
      password,
      async (snapshot, assertCurrent, sourceFingerprint) => {
        copied = await keyringService.importSolanaMigrationSnapshot(
          snapshot,
          assertCurrent,
          sourceFingerprint
        );
      }
    );
    if (!(await this.verifySharedCustody()))
      throw new Error('Solana migration requires reconciliation');
    this.vault.lock();
    this.invalidateConnections();
    return copied;
  }

  async create(password: string): Promise<void> {
    this.requireWalletUnlocked();
    if (this.custodyCreationPending) throw new Error('Solana setup is pending');
    if (this.sharedIdentity())
      throw new Error('Shared Solana account management is unavailable');
    this.custodyCreationPending = true;
    try {
      await this.vault.create(password);
      if (!keyringService.isUnlocked()) {
        this.lock();
        throw new Error('Wallet is locked');
      }
    } finally {
      this.custodyCreationPending = false;
    }
  }

  /** Background-only first-time setup; never overwrite a legacy test vault. */
  async createNativeTestMnemonic(
    password: string,
    mnemonic: string,
    index: number
  ): Promise<string> {
    this.requireWalletUnlocked();
    if (this.custodyCreationPending) throw new Error('Solana setup is pending');
    this.custodyCreationPending = true;
    try {
      const authGeneration = solanaSigningSession.currentGeneration();
      if ((await this.storage.read()) !== null || this.sharedIdentity())
        throw new Error('Solana custody already exists');
      await keyringService.verifyPassword(password);
      if (
        !keyringService.isUnlocked() ||
        authGeneration !== solanaSigningSession.currentGeneration() ||
        (await this.storage.read()) !== null ||
        this.sharedIdentity()
      )
        throw new Error('Solana setup expired');
      this.invalidateConnections();
      this.sharedManuallyLocked = false;
      const generation = solanaSigningSession.currentGeneration();
      const assertCurrent = () => {
        if (
          !this.custodyCreationPending ||
          !keyringService.isUnlocked() ||
          generation !== solanaSigningSession.currentGeneration()
        )
          throw new Error('Solana setup expired');
      };
      const address = await keyringService.createNativeSolanaTestAccount(
        mnemonic,
        index,
        assertCurrent
      );
      assertCurrent();
      if (!(await this.verifySharedCustody()))
        throw new Error('Solana migration requires reconciliation');
      assertCurrent();
      this.selected = address;
      this.invalidateConnections();
      return address;
    } finally {
      this.custodyCreationPending = false;
    }
  }

  /** Background-only: derive from the currently selected EVM HD account. */
  async createNativeTestFromCurrentEvm(
    password: string,
    index: number,
    expectedAddress: string
  ): Promise<string> {
    this.requireWalletUnlocked();
    if (this.custodyCreationPending) throw new Error('Solana setup is pending');
    const source = preferenceService.getCurrentAccount();
    if (
      !source ||
      source.type !== KEYRING_TYPE.HdKeyring ||
      typeof expectedAddress !== 'string' ||
      source.address.toLowerCase() !== expectedAddress.toLowerCase()
    )
      throw new Error('Selected EVM account has no supported seed');
    this.custodyCreationPending = true;
    try {
      const authGeneration = solanaSigningSession.currentGeneration();
      if ((await this.storage.read()) !== null || this.sharedIdentity())
        throw new Error('Solana custody already exists');
      await keyringService.verifyPassword(password);
      const sourceAfterAuth = await this.storage.read();
      const selected = preferenceService.getCurrentAccount();
      if (
        !keyringService.isUnlocked() ||
        authGeneration !== solanaSigningSession.currentGeneration() ||
        !selected ||
        selected.type !== source.type ||
        selected.brandName !== source.brandName ||
        selected.address.toLowerCase() !== source.address.toLowerCase() ||
        sourceAfterAuth !== null ||
        this.sharedIdentity()
      )
        throw new Error('Solana setup expired');
      this.invalidateConnections();
      this.sharedManuallyLocked = false;
      const generation = solanaSigningSession.currentGeneration();
      const assertCurrent = () => {
        const current = preferenceService.getCurrentAccount();
        if (
          !this.custodyCreationPending ||
          !keyringService.isUnlocked() ||
          generation !== solanaSigningSession.currentGeneration() ||
          !current ||
          current.type !== source.type ||
          current.brandName !== source.brandName ||
          current.address.toLowerCase() !== source.address.toLowerCase()
        )
          throw new Error('Solana setup expired');
      };
      const address = await keyringService.createNativeSolanaTestAccountFromEvmSeed(
        source.address,
        index,
        assertCurrent
      );
      assertCurrent();
      if (!(await this.verifySharedCustody()))
        throw new Error('Solana migration requires reconciliation');
      assertCurrent();
      this.selected = address;
      this.invalidateConnections();
      return address;
    } finally {
      this.custodyCreationPending = false;
    }
  }

  async unlock(password: string): Promise<void> {
    this.requireWalletUnlocked();
    if (this.sharedIdentity()) {
      const generation = solanaSigningSession.currentGeneration();
      await keyringService.verifyPassword(password);
      if (
        !keyringService.isUnlocked() ||
        generation !== solanaSigningSession.currentGeneration()
      )
        throw new Error('Wallet is locked');
      this.sharedManuallyLocked = false;
      if (!(await this.verifySharedCustody()))
        throw new Error('Solana migration requires reconciliation');
      await this.status();
      if (!this.isUnlocked()) throw new Error('Wallet is locked');
      this.invalidateConnections();
      return;
    }
    await this.vault.unlock(password);
    if (!keyringService.isUnlocked()) {
      this.lock();
      throw new Error('Wallet is locked');
    }
    this.sharedManuallyLocked = false;
    const [first] = await this.vault.getAccounts();
    if (!this.isUnlocked()) throw new Error('Wallet is locked');
    this.selected = first || null;
    this.invalidateConnections();
  }

  async importTestMnemonic(
    password: string,
    mnemonic: string,
    index: number
  ): Promise<string> {
    this.requireWalletUnlocked();
    if (this.sharedIdentity())
      throw new Error('Shared Solana account management is unavailable');
    // Revoke outstanding consent before a pending account switch starts.
    this.invalidateConnections();
    const address = await this.vault.importTestMnemonic(
      password,
      mnemonic,
      index
    );
    if (!this.isUnlocked()) throw new Error('Wallet is locked');
    this.selected = address;
    this.invalidateConnections();
    return address;
  }

  /** Background-only until the shared account onboarding flow is ready. */
  async addSharedTestMnemonic(
    password: string,
    mnemonic: string,
    index: number
  ): Promise<string> {
    this.requireWalletUnlocked();
    const fingerprint = this.sharedIdentity();
    if (!fingerprint || !(await this.verifySharedCustody()))
      throw new Error('Shared Solana account unavailable');
    const beforeAuthentication = solanaSigningSession.currentGeneration();
    await keyringService.verifyPassword(password);
    if (
      !keyringService.isUnlocked() ||
      this.sharedManuallyLocked ||
      beforeAuthentication !== solanaSigningSession.currentGeneration() ||
      this.verifiedSharedFingerprint !== fingerprint
    )
      throw new Error('Wallet is locked');
    this.invalidateConnections();
    const generation = solanaSigningSession.currentGeneration();
    const assertCurrent = () => {
      if (
        !keyringService.isUnlocked() ||
        this.sharedManuallyLocked ||
        generation !== solanaSigningSession.currentGeneration() ||
        this.verifiedSharedFingerprint !== fingerprint
      )
        throw new Error('Solana session expired');
    };
    const address = await keyringService.addSharedSolanaTestAccount(
      mnemonic,
      index,
      assertCurrent
    );
    assertCurrent();
    if (!(await this.verifySharedCustody()))
      throw new Error('Solana migration requires reconciliation');
    assertCurrent();
    this.selected = address;
    this.invalidateConnections();
    return address;
  }

  async selectAccount(address: string): Promise<void> {
    this.requireWalletUnlocked();
    if (this.selected !== address) this.invalidateConnections();
    const shared = !!this.sharedIdentity();
    if (shared && !(await this.verifySharedCustody()))
      throw new Error('Solana migration requires reconciliation');
    const accounts = shared
      ? await keyringService.getSolanaAccounts()
      : await this.vault.getAccounts();
    if (
      !this.isUnlocked() ||
      shared !== !!this.sharedIdentity() ||
      !accounts.includes(address)
    ) {
      throw new Error('Solana account is unavailable');
    }
    if (this.selected !== address) {
      this.selected = address;
      this.invalidateConnections();
    }
  }
}

export const solanaWalletService = new SolanaWalletService();
