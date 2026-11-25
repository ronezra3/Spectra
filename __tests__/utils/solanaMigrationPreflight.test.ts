/** @jest-environment node */
import { assessSolanaMigration } from '@/chains/solana/migrationPreflight';
const first = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const second = '2KW2XRd9kwqet15Aha2oK3tYvd3nWbTFH1MBiRAv1BE1';
const base = {
  walletUnlocked: true,
  sourceExists: true,
  sourceUnlocked: true,
  sourceAccounts: [first],
  targetAccounts: [] as string[],
  targetHasSolanaKeyring: false,
};

test('requires both wallets unlocked and a non-empty source', () => {
  expect(assessSolanaMigration({ ...base, walletUnlocked: false })).toEqual({
    state: 'wallet-locked',
  });
  expect(assessSolanaMigration({ ...base, sourceExists: false })).toEqual({
    state: 'source-unavailable',
  });
  expect(assessSolanaMigration({ ...base, sourceUnlocked: false })).toEqual({
    state: 'source-locked',
  });
  expect(assessSolanaMigration({ ...base, sourceAccounts: [] })).toEqual({
    state: 'source-empty',
  });
  expect(assessSolanaMigration(base)).toEqual({
    state: 'ready',
    sourceCount: 1,
  });
});

test('blocks ambiguous or invalid account snapshots without inferring ownership', () => {
  expect(assessSolanaMigration({ ...base, targetAccounts: [first] })).toEqual({
    state: 'overlap-detected',
    sourceCount: 1,
    overlapCount: 1,
  });
  expect(
    assessSolanaMigration({ ...base, sourceAccounts: [first, first] })
  ).toEqual({ state: 'invalid-accounts' });
  expect(
    assessSolanaMigration({ ...base, targetAccounts: [second, second] })
  ).toEqual({ state: 'invalid-accounts' });
  expect(
    assessSolanaMigration({ ...base, sourceAccounts: ['invalid address'] })
  ).toEqual({ state: 'invalid-accounts' });
  expect(assessSolanaMigration({ ...base, targetAccounts: [second] })).toEqual({
    state: 'target-present',
  });
  expect(
    assessSolanaMigration({ ...base, targetHasSolanaKeyring: true })
  ).toEqual({ state: 'target-present' });
});
