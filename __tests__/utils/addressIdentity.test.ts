import {
  AddressIdentity,
  areAddressIdentitiesEqual,
  evmAddressIdentity,
} from '@/chains/addressIdentity';

describe('ecosystem-scoped address comparison', () => {
  test('adapts EVM strings and retains case-insensitive comparison', () => {
    expect(evmAddressIdentity('0xAbC')).toEqual({
      ecosystem: 'evm',
      address: '0xAbC',
    });
    expect(
      areAddressIdentitiesEqual(
        evmAddressIdentity('0xAbC'),
        evmAddressIdentity('0xaBc')
      )
    ).toBe(true);
    expect(
      areAddressIdentitiesEqual(
        evmAddressIdentity('0xAbC'),
        evmAddressIdentity('0xAbD')
      )
    ).toBe(false);
  });

  test('compares Solana address strings with case preserved', () => {
    const first: AddressIdentity = { ecosystem: 'solana', address: 'AbCd' };
    expect(areAddressIdentitiesEqual(first, { ...first })).toBe(true);
    expect(
      areAddressIdentitiesEqual(first, {
        ecosystem: 'solana',
        address: 'aBCd',
      })
    ).toBe(false);
  });

  test('never equates identical text from different ecosystems', () => {
    expect(
      areAddressIdentitiesEqual(evmAddressIdentity('AbCd'), {
        ecosystem: 'solana',
        address: 'AbCd',
      })
    ).toBe(false);
  });

  test('fails closed for an unsupported ecosystem at runtime', () => {
    const unknown = { ecosystem: 'unknown', address: 'abc' } as any;
    expect(areAddressIdentitiesEqual(unknown, unknown)).toBe(false);
  });
});
