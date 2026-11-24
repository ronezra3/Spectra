import type { ProviderRequest } from '@/background/controller/provider/type';

const mockEvmProvider = jest.fn();

jest.mock('@/background/controller/provider', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockEvmProvider(...args),
}));

import { routeProviderRequest } from '@/background/controller/providerRouter';

describe('dapp provider routing', () => {
  const request: ProviderRequest = {
    data: { method: 'eth_chainId', params: [] },
    origin: 'https://example.test',
  };

  beforeEach(() => mockEvmProvider.mockReset());

  test('passes the original request to EVM and returns its result', async () => {
    mockEvmProvider.mockResolvedValue('0x1');

    await expect(routeProviderRequest('evm', request)).resolves.toBe('0x1');
    expect(mockEvmProvider).toHaveBeenCalledTimes(1);
    expect(mockEvmProvider.mock.calls[0][0]).toBe(request);
  });

  test('propagates the original EVM rejection', async () => {
    const error = new Error('Request rejected');
    mockEvmProvider.mockRejectedValue(error);

    await expect(routeProviderRequest('evm', request)).rejects.toBe(error);
  });

  test.each(['solana', 'unknown', '__proto__', '', null, undefined])(
    'rejects unsupported ecosystem %p without reaching the EVM handler',
    async (ecosystem) => {
      await expect(routeProviderRequest(ecosystem, request)).rejects.toThrow(
        'Unsupported provider ecosystem'
      );
      expect(mockEvmProvider).not.toHaveBeenCalled();
    }
  );

  test('does not choose a route from an ecosystem field in page data', async () => {
    const untrustedRequest = {
      data: { method: 'eth_chainId', ecosystem: 'solana' },
      origin: 'https://example.test',
    };
    mockEvmProvider.mockResolvedValue('0x1');

    await expect(routeProviderRequest('evm', untrustedRequest)).resolves.toBe(
      '0x1'
    );
    expect(mockEvmProvider.mock.calls[0][0]).toBe(untrustedRequest);
  });
});
