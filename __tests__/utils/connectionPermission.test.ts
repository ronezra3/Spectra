import { hasConnectionPermission } from '@/chains/connectionPermission';

const evmGrant = {
  origin: 'https://dapp.example',
  account: { ecosystem: 'evm', address: '0xAbC' },
  capability: 'connect',
};
const solanaGrant = {
  origin: 'https://dapp.example',
  account: { ecosystem: 'solana', address: 'AbCd' },
  capability: 'connect',
};

describe('connection permission isolation', () => {
  test('requires a separate grant even when address text is identical', () => {
    const sameTextEvm = {
      ...evmGrant,
      account: { ...evmGrant.account, address: 'AbCd' },
    };
    expect(hasConnectionPermission([sameTextEvm], solanaGrant)).toBe(false);
    expect(hasConnectionPermission([solanaGrant], sameTextEvm)).toBe(false);
    expect(
      hasConnectionPermission([sameTextEvm, solanaGrant], solanaGrant)
    ).toBe(true);
  });

  test('does not share a connection between sites or accounts', () => {
    expect(
      hasConnectionPermission([solanaGrant], {
        ...solanaGrant,
        origin: 'https://other.example',
      })
    ).toBe(false);
    expect(
      hasConnectionPermission([solanaGrant], {
        ...solanaGrant,
        account: { ...solanaGrant.account, address: 'Another' },
      })
    ).toBe(false);
  });

  test('uses the appropriate case rule for each ecosystem', () => {
    expect(
      hasConnectionPermission([evmGrant], {
        ...evmGrant,
        account: { ...evmGrant.account, address: '0xaBc' },
      })
    ).toBe(true);
    expect(
      hasConnectionPermission([solanaGrant], {
        ...solanaGrant,
        account: { ...solanaGrant.account, address: 'aBCd' },
      })
    ).toBe(false);
  });

  test('connection grants do not authorize signing', () => {
    expect(
      hasConnectionPermission([solanaGrant], {
        ...solanaGrant,
        capability: 'signTransaction',
      })
    ).toBe(false);
    expect(
      hasConnectionPermission([solanaGrant], {
        ...solanaGrant,
        capability: 'signMessage',
      })
    ).toBe(false);
  });

  test.each([
    'null',
    'file://',
    'https://dapp.example/path',
    'https://user@dapp.example',
  ])('rejects non-canonical origin %s', (origin) => {
    expect(
      hasConnectionPermission([solanaGrant], { ...solanaGrant, origin })
    ).toBe(false);
  });

  test('fails closed for malformed requests, grants and unsupported ecosystems', () => {
    expect(hasConnectionPermission(null, solanaGrant)).toBe(false);
    expect(hasConnectionPermission([null, {}], solanaGrant)).toBe(false);
    expect(hasConnectionPermission([solanaGrant], null)).toBe(false);
    expect(
      hasConnectionPermission([solanaGrant], {
        ...solanaGrant,
        account: { ecosystem: 'unknown', address: 'AbCd' },
      })
    ).toBe(false);
    expect(
      hasConnectionPermission([solanaGrant], {
        ...solanaGrant,
        account: { ecosystem: 'solana', address: '' },
      })
    ).toBe(false);
  });
});
