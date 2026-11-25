import keyringService from './keyring';
import { SOLANA_DEVNET_NETWORK } from '@/chains/network';
import {
  SolanaWalletAccount,
  walletAccountFromSolana,
} from '@/chains/walletAccount';
import { solanaConnectionSession } from './solanaConnection';
import { rejectSolanaApproval } from '../controller/solanaConnectApproval';
import { SolanaVault } from './solanaVault';
import { SolanaIndexedDbStorage } from './solanaVaultStorage';
import type { SolanaSelectedAccount } from '../controller/solanaConnect';

/** Experimental Solana state is deliberately independent of EVM accounts. */
class SolanaWalletService {
  private readonly storage = new SolanaIndexedDbStorage();
  private readonly vault = new SolanaVault(this.storage);
  private selected: string | null = null;

  private requireWalletUnlocked(): void {
    if (!keyringService.isUnlocked()) throw new Error('Wallet is locked');
  }

  private invalidateConnections(): void {
    solanaConnectionSession.invalidate();
    void rejectSolanaApproval().catch(() => undefined);
  }

  lock(): void {
    this.selected = null;
    this.vault.lock();
    this.invalidateConnections();
  }

  isUnlocked(): boolean {
    return keyringService.isUnlocked() && this.vault.isUnlocked();
  }

  /** Public account identity; does not expose keys or grant permissions. */
  getSelectedWalletAccount(): SolanaWalletAccount | null {
    return this.isUnlocked() && this.selected
      ? walletAccountFromSolana(this.selected)
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
    const signature = await this.vault.signMessage(address, message);
    if (!this.isUnlocked() || this.selected !== address) {
      signature.fill(0);
      throw new Error('Solana account unavailable');
    }
    return signature;
  }

  async status() {
    const exists = (await this.storage.read()) !== null;
    const accounts = this.isUnlocked() ? await this.vault.getAccounts() : [];
    return {
      exists,
      unlocked: this.isUnlocked(),
      accounts: this.isUnlocked() ? accounts : [],
      selected: this.getSelectedAccount(),
    };
  }

  async create(password: string): Promise<void> {
    this.requireWalletUnlocked();
    await this.vault.create(password);
    if (!keyringService.isUnlocked()) {
      this.lock();
      throw new Error('Wallet is locked');
    }
  }

  async unlock(password: string): Promise<void> {
    this.requireWalletUnlocked();
    await this.vault.unlock(password);
    if (!keyringService.isUnlocked()) {
      this.lock();
      throw new Error('Wallet is locked');
    }
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

  async selectAccount(address: string): Promise<void> {
    this.requireWalletUnlocked();
    if (this.selected !== address) this.invalidateConnections();
    const accounts = await this.vault.getAccounts();
    if (!this.isUnlocked() || !accounts.includes(address)) {
      throw new Error('Solana account is unavailable');
    }
    if (this.selected !== address) {
      this.selected = address;
      this.invalidateConnections();
    }
  }
}

export const solanaWalletService = new SolanaWalletService();
