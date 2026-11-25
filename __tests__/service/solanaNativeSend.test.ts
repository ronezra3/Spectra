/** @jest-environment node */
import { ed25519 } from '@noble/curves/ed25519';
import { hexToBytes } from '@noble/hashes/utils';
import { base58 } from '@scure/base';
import { Transaction } from '@solana/web3.js';
import { sendSolanaFromWallet } from '@/background/service/solanaNativeSend';
import { solanaConnectionSession } from '@/background/service/solanaConnection';
import { requestSolanaTransferApproval } from '@/background/controller/solanaConnectApproval';

const account = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const recipient = '2KW2XRd9kwqet15Aha2oK3tYvd3nWbTFH1MBiRAv1BE1';
const blockhash = '11111111111111111111111111111111';
const testSecret = hexToBytes(
  '37df573b3ac4ad5b522e064e25b63ea16bcbe79d449e81a0268d1047948bb445'
);
let lookup: () => Promise<{ blockhash: string }> = async () => ({ blockhash });
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: class {
      getLatestBlockhash() {
        return lookup();
      }
    },
  };
});
jest.mock('@/background/service/solanaWallet', () => ({
  solanaWalletService: {
    isUnlocked: () => true,
    getSelectedAccount: () => ({ address: account, cluster: 'solana:devnet' }),
    signMessage: async (_address: string, message: Uint8Array) =>
      ed25519.sign(message, testSecret),
  },
}));
jest.mock('@/background/controller/solanaConnectApproval', () => ({
  requestSolanaTransferApproval: jest.fn(),
}));

afterEach(() => {
  solanaConnectionSession.invalidate();
  jest.restoreAllMocks();
  jest.clearAllMocks();
  lookup = async () => ({ blockhash });
});

test('native send requests wallet approval for the exact transfer and verifies the RPC signature', async () => {
  (requestSolanaTransferApproval as jest.Mock).mockResolvedValue(true);
  jest.spyOn(global, 'fetch').mockImplementation(async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    const transaction = Transaction.from(Buffer.from(body.params[0], 'base64'));
    expect(transaction.verifySignatures()).toBe(true);
    return {
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        result: base58.encode(transaction.signature!),
      }),
    } as Response;
  });
  const signature = await sendSolanaFromWallet(account, recipient, '1');
  expect(base58.decode(signature)).toHaveLength(64);
  expect(requestSolanaTransferApproval).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'sign-and-send-transaction', account }),
    expect.objectContaining({ from: account, to: recipient, lamports: '1' }),
    'wallet'
  );
});

test('a session boundary while the blockhash is loading prevents approval and signing', async () => {
  let resolve!: (value: { blockhash: string }) => void;
  lookup = () =>
    new Promise((done) => {
      resolve = done;
    });
  const pending = sendSolanaFromWallet(account, recipient, '1');
  solanaConnectionSession.invalidate();
  resolve({ blockhash });
  await expect(pending).rejects.toThrow('expired');
  expect(requestSolanaTransferApproval).not.toHaveBeenCalled();
});

test('rejecting the native transfer never broadcasts it', async () => {
  (requestSolanaTransferApproval as jest.Mock).mockResolvedValue(false);
  const fetchMock = jest.spyOn(global, 'fetch');
  await expect(sendSolanaFromWallet(account, recipient, '1')).rejects.toThrow(
    'rejected'
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
