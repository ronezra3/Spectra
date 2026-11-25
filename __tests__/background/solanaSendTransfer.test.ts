/** @jest-environment node */
import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex } from '@noble/hashes/utils';
import { base58 } from '@scure/base';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import {
  SolanaApprovalContext,
  SolanaApprovalSession,
} from '@/chains/solana/approvalSession';
import { InspectedSolanaTransfer } from '@/chains/solana/inspectTransfer';
import { SolanaConnectionSession } from '@/chains/solana/connectionSession';
import { SolanaSignTransferController } from 'background/controller/solanaSignTransfer';
import { SolanaSendTransferController } from 'background/controller/solanaSendTransfer';

const secret = new Uint8Array(32).fill(7);
const sender = Keypair.fromSeed(secret).publicKey;
const recipient = Keypair.fromSeed(new Uint8Array(32).fill(8)).publicKey;
const blockhash = Keypair.fromSeed(
  new Uint8Array(32).fill(9)
).publicKey.toBase58();
const address = sender.toBase58();
const origin = 'https://example.org';
const selected = { address, cluster: 'solana:devnet' as const };
const previousFetch = global.fetch;
afterEach(() => {
  global.fetch = previousFetch;
});

function setup() {
  const permissions = new SolanaConnectionSession();
  const connection = {
    origin,
    account: address,
    cluster: 'solana:devnet' as const,
    kind: 'connect' as const,
  };
  permissions.begin('connect', connection);
  permissions.approve('connect', connection);
  const approvals = new SolanaApprovalSession();
  permissions.subscribe(() => approvals.invalidate());
  const common = {
    isUnlocked: jest.fn(() => true),
    getSelectedAccount: jest.fn(() => selected),
    permissions,
    approvals,
  };
  const requestApproval = jest.fn(
    async (
      _context: SolanaApprovalContext,
      _transfer: InspectedSolanaTransfer
    ) => true
  );
  const signer = new SolanaSignTransferController({
    ...common,
    newId: () => 'transfer',
    requestApproval,
    sign: async (_address, message) => ed25519.sign(message, secret),
  });
  const controller = new SolanaSendTransferController({ ...common, signer });
  const tx = new Transaction({
    feePayer: sender,
    recentBlockhash: blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: recipient,
      lamports: 123n,
    })
  );
  const input = bytesToHex(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false })
  );
  return { controller, requestApproval, permissions, input };
}

test('submits only a signed test transfer and verifies the returned signature', async () => {
  const { controller, requestApproval, input } = setup();
  global.fetch = jest.fn(async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    const transaction = Transaction.from(
      Buffer.from(payload.params[0], 'base64')
    );
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
  const output = await controller.send(origin, address, input);
  expect(output).toMatch(/^[0-9a-f]{128}$/);
  expect(requestApproval.mock.calls[0][0].kind).toBe(
    'sign-and-send-transaction'
  );
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('does not submit a rejected transfer', async () => {
  const { controller, requestApproval, input } = setup();
  requestApproval.mockResolvedValue(false);
  global.fetch = jest.fn();
  await expect(controller.send(origin, address, input)).rejects.toThrow();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('does not broadcast if the session changes while signing', async () => {
  const { permissions, input } = setup();
  const approvals = new SolanaApprovalSession();
  permissions.subscribe(() => approvals.invalidate());
  let resolve!: (signed: string) => void;
  const signer = ({
    sign: jest.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        })
    ),
  } as unknown) as SolanaSignTransferController;
  const controller = new SolanaSendTransferController({
    isUnlocked: () => true,
    getSelectedAccount: () => selected,
    permissions,
    approvals,
    signer,
  });
  const tx = Transaction.from(Buffer.from(input, 'hex'));
  tx.sign(Keypair.fromSeed(secret));
  global.fetch = jest.fn();
  const pending = controller.send(origin, address, input);
  permissions.invalidate();
  resolve(bytesToHex(tx.serialize()));
  await expect(pending).rejects.toThrow('expired');
  expect(global.fetch).not.toHaveBeenCalled();
});
