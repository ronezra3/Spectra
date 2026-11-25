import { areAddressIdentitiesEqual } from './addressIdentity';
import type { WalletNetwork } from './network';

/**
 * A public account reference, not proof of ownership, an authorization, or a
 * grouping of accounts from a shared recovery phrase. No secret material or
 * network-specific transaction state belongs here.
 */
export type EvmWalletAccount = Readonly<{
  ecosystem: 'evm';
  address: string;
  source: Readonly<{ keyringType: string; brandName: string }>;
}>;

/** The current Solana source is the separate, experimental software vault. */
export type SolanaWalletAccount = Readonly<{
  ecosystem: 'solana';
  address: string;
  source: Readonly<{
    kind: 'experimental-solana-vault' | 'shared-solana-keyring';
  }>;
}>;

export type WalletAccount = EvmWalletAccount | SolanaWalletAccount;

/** Adapt a trusted EVM account without normalizing or mutating its address. */
export function walletAccountFromEvm(account: {
  address: string;
  type: string;
  brandName: string;
}): EvmWalletAccount {
  return Object.freeze({
    ecosystem: 'evm',
    address: account.address,
    source: Object.freeze({
      keyringType: account.type,
      brandName: account.brandName,
    }),
  });
}

/** Adapt an account already selected by the experimental Solana vault. */
export function walletAccountFromSolana(
  address: string,
  kind: SolanaWalletAccount['source']['kind'] = 'experimental-solana-vault'
): SolanaWalletAccount {
  return Object.freeze({
    ecosystem: 'solana',
    address,
    source: Object.freeze({ kind }),
  });
}

/** Compare references only; this neither validates addresses nor grants access. */
export function areWalletAccountsEqual(
  a: WalletAccount,
  b: WalletAccount
): boolean {
  if (!areAddressIdentitiesEqual(a, b)) return false;
  if (a.ecosystem === 'evm' && b.ecosystem === 'evm') {
    return (
      a.source.keyringType === b.source.keyringType &&
      a.source.brandName === b.source.brandName
    );
  }
  return (
    a.ecosystem === 'solana' &&
    b.ecosystem === 'solana' &&
    a.source.kind === b.source.kind
  );
}

/** Family compatibility alone does not prove an account is usable or connected. */
export function isAccountCompatibleWithNetwork(
  account: WalletAccount,
  network: WalletNetwork
): boolean {
  return account.ecosystem === network.family;
}
