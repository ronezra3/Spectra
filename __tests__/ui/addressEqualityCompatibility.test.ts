// Avoid mounting UI contexts and styles when testing the actual utility.
jest.mock('@/ui/utils/WalletContext', () => ({}));
jest.mock('@/ui/utils/WindowContext', () => ({}));
jest.mock('@/ui/utils/hooks', () => ({}));
jest.mock('@/ui/utils/webapi', () => ({}));
jest.mock('@/ui/utils/imKey', () => ({}));

import { isSameAddress } from '@/ui/utils';

describe('UI address comparison compatibility', () => {
  test('compares non-empty address strings without regard to case', () => {
    expect(isSameAddress('0xAbC', '0xaBc')).toBe(true);
    expect(isSameAddress('0xAbC', '0xabd')).toBe(false);
  });

  test('does not treat missing addresses as equal', () => {
    expect(isSameAddress('', '')).toBe(false);
    expect(isSameAddress('0xabc', '')).toBe(false);
    expect(isSameAddress('', '0xabc')).toBe(false);
  });
});
