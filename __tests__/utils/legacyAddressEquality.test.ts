jest.mock('@/background/service/pageStateCache', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('@/background/utils/persistStore', () => ({}));

import { isSameAddress } from '@/background/utils';

describe('legacy background address comparison', () => {
  test('retains its case-insensitive comparison for existing callers', () => {
    expect(isSameAddress('0xABc', '0xaBC')).toBe(true);
    expect(isSameAddress('0xABc', '0xABD')).toBe(false);
    expect(isSameAddress('', '')).toBe(true);
    expect(isSameAddress('0xabc', 'abc')).toBe(false);
  });
});
