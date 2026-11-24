import evmProvider from './provider';
import type { ProviderRequest } from './provider/type';

/**
 * Routes an in-process request using an ecosystem chosen by trusted extension
 * code, never a value taken from the page's request payload.
 */
export const routeProviderRequest = <T = void>(
  ecosystem: unknown,
  request: ProviderRequest
): Promise<T> => {
  switch (ecosystem) {
    case 'evm':
      return evmProvider<T>(request);
    default:
      return Promise.reject(new Error('Unsupported provider ecosystem'));
  }
};
