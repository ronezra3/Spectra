import {
  formatLamports,
  getDevnetBalance,
  SOLANA_DEVNET_RPC,
} from '@/chains/solana/devnetBalance';

const address = '11111111111111111111111111111111';
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

test('requests a confirmed balance from devnet without credentials', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        result: { value: 1234567890 },
      }),
    });
  global.fetch = fetchMock;
  expect(await getDevnetBalance(address)).toBe(1234567890);
  expect(fetchMock).toHaveBeenCalledWith(
    SOLANA_DEVNET_RPC,
    expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address, { commitment: 'confirmed' }],
      }),
    })
  );
});

test.each([
  { jsonrpc: '2.0', id: 1, result: { value: -1 } },
  { jsonrpc: '2.0', id: 1, result: { value: Number.MAX_SAFE_INTEGER + 1 } },
  { jsonrpc: '2.0', id: 2, result: { value: 1 } },
  { jsonrpc: '2.0', id: 1, error: {}, result: { value: 1 } },
])('rejects malformed or unsafe responses', async (body) => {
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => body });
  await expect(getDevnetBalance(address)).rejects.toThrow();
});

test('rejects invalid input without contacting RPC', async () => {
  global.fetch = jest.fn();
  await expect(getDevnetBalance('invalid')).rejects.toThrow();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('formats SOL without rounding lamports', () => {
  expect(formatLamports(1)).toBe('0.000000001');
  expect(formatLamports(1234567890)).toBe('1.23456789');
  expect(formatLamports(1000000000)).toBe('1');
  expect(() => formatLamports(Number.MAX_SAFE_INTEGER + 1)).toThrow();
});
