import { areEvmAddressesEqual } from '@/chains/evm/address';

describe('EVM address equality', () => {
  test('treats case variants of the same address as equal', () => {
    expect(
      areEvmAddressesEqual(
        '0xAbCd000000000000000000000000000000000001',
        '0xaBcD000000000000000000000000000000000001'
      )
    ).toBe(true);
  });

  test('does not equate different addresses', () => {
    expect(
      areEvmAddressesEqual(
        '0xabcD000000000000000000000000000000000001',
        '0xabcD000000000000000000000000000000000002'
      )
    ).toBe(false);
  });

  test('preserves legacy string comparison without address validation', () => {
    expect(areEvmAddressesEqual('ABC', 'abc')).toBe(true);
    expect(areEvmAddressesEqual('', '')).toBe(true);
    expect(areEvmAddressesEqual('0xabc', 'abc')).toBe(false);
  });
});
