import { parseSolanaReadOnlyAddress } from './readOnlyAddress';

export type MigrationPreflight =
  | {
      state:
        | 'wallet-locked'
        | 'source-unavailable'
        | 'source-locked'
        | 'source-empty'
        | 'invalid-accounts'
        | 'snapshot-changed';
    }
  | { state: 'overlap-detected'; sourceCount: number; overlapCount: number }
  | { state: 'ready'; sourceCount: number };

/**
 * Advisory public-address check only. It never copies keys, associates wallets,
 * confirms custody or authorizes a migration. All state must be revalidated by
 * the eventual write operation; source data must not be deleted based on this.
 */
export function assessSolanaMigration(input: {
  walletUnlocked: boolean;
  sourceExists: boolean;
  sourceUnlocked: boolean;
  sourceAccounts: readonly string[];
  targetAccounts: readonly string[];
}): MigrationPreflight {
  if (!input.walletUnlocked) return { state: 'wallet-locked' };
  if (!input.sourceExists) return { state: 'source-unavailable' };
  if (!input.sourceUnlocked) return { state: 'source-locked' };
  if (
    !Array.isArray(input.sourceAccounts) ||
    !Array.isArray(input.targetAccounts)
  )
    return { state: 'invalid-accounts' };
  const valid = (address: unknown): address is string =>
    typeof address === 'string' &&
    parseSolanaReadOnlyAddress(address)?.address === address;
  if (
    !input.sourceAccounts.every(valid) ||
    !input.targetAccounts.every(valid) ||
    new Set(input.sourceAccounts).size !== input.sourceAccounts.length ||
    new Set(input.targetAccounts).size !== input.targetAccounts.length
  )
    return { state: 'invalid-accounts' };
  if (input.sourceAccounts.length === 0) return { state: 'source-empty' };
  const target = new Set(input.targetAccounts);
  const overlapCount = input.sourceAccounts.filter((address) =>
    target.has(address)
  ).length;
  if (overlapCount)
    return {
      state: 'overlap-detected',
      sourceCount: input.sourceAccounts.length,
      overlapCount,
    };
  return { state: 'ready', sourceCount: input.sourceAccounts.length };
}
