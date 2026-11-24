import { SolanaConnectionSession } from '@/chains/solana/connectionSession';
import { SolanaApprovalContext } from '@/chains/solana/approvalSession';

const context: SolanaApprovalContext = {
  origin: 'https://example.org',
  account: '11111111111111111111111111111111',
  cluster: 'solana:devnet',
  kind: 'connect',
};

test('a connection is scoped to the approved origin, account and cluster', () => {
  const session = new SolanaConnectionSession();
  expect(session.has(context)).toBe(false);
  session.begin('1', context);
  expect(session.approve('1', context)).toBe(true);
  expect(session.has(context)).toBe(true);
  expect(session.has({ ...context, origin: 'https://other.example' })).toBe(
    false
  );
  expect(session.has({ ...context, cluster: 'solana:testnet' })).toBe(false);
  expect(session.has({ ...context, kind: 'sign-message' })).toBe(false);
  session.disconnect(context);
  expect(session.has(context)).toBe(false);
});

test('lock or account changes invalidate pending and granted connections', () => {
  const session = new SolanaConnectionSession();
  session.begin('1', context);
  session.approve('1', context);
  session.begin('2', context);
  session.invalidate();
  expect(session.has(context)).toBe(false);
  expect(session.approve('2', context)).toBe(false);
});

test('mismatched approval cannot be replayed with the original context', () => {
  const session = new SolanaConnectionSession();
  session.begin('1', context);
  expect(
    session.approve('1', { ...context, origin: 'https://other.example' })
  ).toBe(false);
  expect(session.approve('1', context)).toBe(false);
});

test('an approval cannot be repurposed for signing or replayed', () => {
  const session = new SolanaConnectionSession();
  session.begin('1', context);
  expect(session.approve('1', { ...context, kind: 'sign-message' })).toBe(
    false
  );
  expect(session.approve('1', context)).toBe(false);
});
