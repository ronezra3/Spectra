/** @jest-environment node */
import {
  getDevnetActivity,
  getDevnetTransaction,
} from '@/chains/solana/devnetActivity';
const address = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const signature =
  '64PYbjQYYsaZ19Q48xPa4W5qVt8QGe71SLQXv3Bhm7wdPUfKiZLh9eFhd5tJzmCvsHwmZM86KLXXmL6DjNss42fv';
afterEach(() => jest.restoreAllMocks());
test('reports confirmed and failed records without treating submission as confirmation', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: 1,
      result: [
        { signature, err: null, blockTime: 123 },
        { signature, err: { InstructionError: [] }, blockTime: null },
      ],
    }),
  } as Response);
  await expect(getDevnetActivity(address)).resolves.toEqual([
    { signature, status: 'success', blockTime: 123 },
    { signature, status: 'failed', blockTime: null },
  ]);
});
test('rejects malformed or spoofed RPC data', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: 1,
      result: [{ signature: 'invalid', err: null, blockTime: 123 }],
    }),
  } as Response);
  await expect(getDevnetActivity(address)).rejects.toThrow(
    'Invalid transaction'
  );
});

test('shows only parsed simple transfers and calls out other instructions', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: 1,
      result: {
        meta: { fee: 5000, err: null },
        transaction: {
          signatures: [signature],
          message: {
            instructions: [
              {
                programId: '11111111111111111111111111111111',
                parsed: {
                  type: 'transfer',
                  info: {
                    source: address,
                    destination: address,
                    lamports: 1,
                  },
                },
              },
              { programId: address },
            ],
          },
        },
      },
    }),
  } as Response);
  await expect(getDevnetTransaction(signature)).resolves.toEqual({
    fee: 5000,
    status: 'success',
    transfers: [{ from: address, to: address, lamports: 1 }],
    otherInstructions: 1,
  });
});

test('rejects a transaction response for a different signature', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: 1,
      result: {
        meta: { fee: 5000, err: null },
        transaction: { signatures: ['wrong'], message: { instructions: [] } },
      },
    }),
  } as Response);
  await expect(getDevnetTransaction(signature)).rejects.toThrow(
    'Invalid transaction response'
  );
});
