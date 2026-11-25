/** @jest-environment node */
import {
  formatTokenAmount,
  getDevnetTokens,
} from '@/chains/solana/devnetTokens';
const owner = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const mint = '2KW2XRd9kwqet15Aha2oK3tYvd3nWbTFH1MBiRAv1BE1';
afterEach(() => jest.restoreAllMocks());

test('formats token units without losing integer precision', () => {
  expect(formatTokenAmount('12345678901234567890', 9)).toBe(
    '12345678901.23456789'
  );
  expect(formatTokenAmount('1', 6)).toBe('0.000001');
  expect(() => formatTokenAmount('-1', 6)).toThrow();
});

test('aggregates accounts from both token programs and rejects foreign owners', async () => {
  const account = (ownerAddress: string, amount: string) => ({
    account: {
      data: {
        parsed: {
          info: {
            owner: ownerAddress,
            mint,
            tokenAmount: { amount, decimals: 6 },
          },
        },
      },
    },
  });
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockImplementation(async (_url, init) => {
      const id = JSON.parse(String(init?.body)).id;
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id,
          result: { value: [account(owner, id === 1 ? '2' : '3')] },
        }),
      } as Response;
    });
  await expect(getDevnetTokens(owner)).resolves.toEqual([
    { mint, amount: '5', decimals: 6 },
  ]);
  fetchMock.mockImplementation(
    async (_url, init) =>
      ({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: JSON.parse(String(init?.body)).id,
          result: { value: [account(mint, '1')] },
        }),
      } as Response)
  );
  await expect(getDevnetTokens(owner)).rejects.toThrow('Invalid token account');
});
