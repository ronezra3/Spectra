import whitelistService from '@/background/service/whitelist';
import { patchPersistStore } from 'background/utils';

jest.mock('background/utils', () => ({
  createPersistStore: jest.fn(),
  isSameAddress: jest.requireActual('@/chains/evm/address')
    .areEvmAddressesEqual,
  patchPersistStore: jest.fn((store, partials) => {
    Object.assign(store, partials);
  }),
}));

describe('whitelist service patches', () => {
  beforeEach(() => {
    whitelistService.store = {
      enabled: true,
      whitelists: ['0xaaa', '0xbbb'],
    };
    (patchPersistStore as jest.Mock).mockClear();
  });

  test('accepts only a normalized reorder through the generic patch API', () => {
    whitelistService.patchStore({ whitelists: ['0xBBB', '0xAAA'] });

    expect(patchPersistStore).toHaveBeenCalledWith(whitelistService.store, {
      whitelists: ['0xbbb', '0xaaa'],
    });
  });

  test('rejects membership changes through the generic patch API', () => {
    expect(() =>
      whitelistService.patchStore({ whitelists: ['0xbbb', '0xccc'] })
    ).toThrow('Invalid whitelist order');
    expect(patchPersistStore).not.toHaveBeenCalled();
  });

  test('keeps password-protected fields out of the generic patch API', () => {
    expect(() => whitelistService.patchStore({ enabled: false })).toThrow(
      'Only whitelist order can be updated without password'
    );
    expect(patchPersistStore).not.toHaveBeenCalled();
  });

  test('exposes the effective whitelist setting in snapshots', () => {
    whitelistService.store.enabled = false;

    expect(whitelistService.getStore().enabled).toBe(true);
  });

  test('matches an existing address regardless of case without duplicating it', () => {
    expect(whitelistService.isInWhiteList('0xAAA')).toBe(true);
    expect(whitelistService.isInWhiteList('0xccc')).toBe(false);

    whitelistService.addWhitelist('0xAAA');
    expect(patchPersistStore).not.toHaveBeenCalled();
  });

  test('stores new addresses in lowercase and removes existing case variants', () => {
    whitelistService.addWhitelist('0xCcC');
    expect(whitelistService.getWhitelist()).toEqual([
      '0xaaa',
      '0xbbb',
      '0xccc',
    ]);

    whitelistService.removeWhitelist('0xBbB');
    expect(whitelistService.getWhitelist()).toEqual(['0xaaa', '0xccc']);
  });
});
