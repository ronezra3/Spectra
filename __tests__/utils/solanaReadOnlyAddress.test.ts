import { base58 } from '@scure/base';
import { parseSolanaReadOnlyAddress } from '@/chains/solana/readOnlyAddress';

describe('read-only Solana address parsing', () => {
  const address = base58.encode(Uint8Array.from({ length: 32 }, (_, i) => i));

  test('accepts canonical Base58 of exactly 32 bytes without changing case', () => {
    expect(parseSolanaReadOnlyAddress(`  ${address}  `)).toEqual({
      ecosystem: 'solana',
      address,
      access: 'read-only',
    });
  });

  test('preserves leading zero bytes in a canonical address', () => {
    const zeroAddress = '11111111111111111111111111111111';
    expect(parseSolanaReadOnlyAddress(zeroAddress)?.address).toBe(zeroAddress);
  });

  test.each([
    '',
    '0'.repeat(32),
    'I'.repeat(32),
    'l'.repeat(32),
    'O'.repeat(32),
    '1'.repeat(31),
    '1'.repeat(33),
    '1'.repeat(45),
    'one two three four five six seven eight nine ten eleven twelve',
  ])('rejects malformed or wrong-length value %p', (value) => {
    expect(parseSolanaReadOnlyAddress(value)).toBeNull();
  });
});
