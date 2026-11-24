import {
  SolanaApprovalContext,
  SolanaApprovalSession,
} from '@/chains/solana/approvalSession';

const context: SolanaApprovalContext = {
  origin: 'https://example.org',
  account: '11111111111111111111111111111111',
  cluster: 'solana:devnet',
  kind: 'sign-message',
};
const payload = new Uint8Array([1, 2, 3]);

test('consumes a matching approval exactly once', () => {
  const session = new SolanaApprovalSession();
  session.begin('a', context, payload);
  expect(session.consume('a', context, payload)).toBe(true);
  expect(session.consume('a', context, payload)).toBe(false);
  expect(() => session.begin('a', context, payload)).toThrow();
});

test.each([
  { ...context, origin: 'https://other.example' },
  { ...context, account: '11111111111111111111111111111112' },
  { ...context, cluster: 'solana:testnet' as const },
  { ...context, kind: 'sign-transaction' as const },
])('rejects changed request context and consumes the approval', (changed) => {
  const session = new SolanaApprovalSession();
  session.begin('a', context, payload);
  expect(session.consume('a', changed, payload)).toBe(false);
  expect(session.consume('a', context, payload)).toBe(false);
});

test('rejects altered bytes and approvals from a prior session', () => {
  const session = new SolanaApprovalSession();
  session.begin('a', context, payload);
  expect(session.consume('a', context, new Uint8Array([1, 2, 4]))).toBe(false);
  session.begin('b', context, payload);
  session.invalidate();
  expect(session.consume('b', context, payload)).toBe(false);
});

test('rejects ambiguous origins and duplicate pending identifiers', () => {
  const session = new SolanaApprovalSession();
  expect(() =>
    session.begin(
      'a',
      { ...context, origin: 'https://example.org/path' },
      payload
    )
  ).toThrow();
  session.begin('a', context, payload);
  expect(() => session.begin('a', context, payload)).toThrow();
});
