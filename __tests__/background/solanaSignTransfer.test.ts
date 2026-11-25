/** @jest-environment node */
import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex } from '@noble/hashes/utils';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { SolanaApprovalSession } from '@/chains/solana/approvalSession';
import { SolanaConnectionSession } from '@/chains/solana/connectionSession';
import { inspectSolanaTransfer } from '@/chains/solana/inspectTransfer';
import { SolanaSignTransferController } from 'background/controller/solanaSignTransfer';

// Disposable test seeds only. No real funds.
const secret = new Uint8Array(32).fill(7);
const sender = Keypair.fromSeed(secret).publicKey;
const recipient = Keypair.fromSeed(new Uint8Array(32).fill(8)).publicKey;
const blockhash = Keypair.fromSeed(
  new Uint8Array(32).fill(9)
).publicKey.toBase58();
const address = sender.toBase58();
const origin = 'https://example.org';
const account = { address, cluster: 'solana:devnet' as const };

function createTransfer() {
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
  return bytesToHex(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false })
  );
}

function setup() {
  const permissions = new SolanaConnectionSession();
  const context = {
    origin,
    account: address,
    cluster: 'solana:devnet' as const,
    kind: 'connect' as const,
  };
  permissions.begin('connect', context);
  permissions.approve('connect', context);
  const approvals = new SolanaApprovalSession();
  permissions.subscribe(() => approvals.invalidate());
  return {
    isUnlocked: jest.fn(() => true),
    getSelectedAccount: jest.fn(() => account),
    permissions,
    approvals,
    newId: jest.fn(() => 'sign-transfer'),
    requestApproval: jest.fn(async () => true),
    sign: jest.fn(async (_address: string, bytes: Uint8Array) =>
      ed25519.sign(bytes, secret)
    ),
  };
}

test('inspects and signs a single test SOL transfer without changing its message', async () => {
  const input = createTransfer();
  const inspected = inspectSolanaTransfer(input, address);
  expect(inspected.to).toBe(recipient.toBase58());
  expect(inspected.lamports).toBe('123');
  const controller = new SolanaSignTransferController(setup());
  const output = await controller.sign(origin, address, input);
  const signed = Transaction.from(Buffer.from(output, 'hex'));
  expect(signed.verifySignatures()).toBe(true);
  expect(bytesToHex(signed.serializeMessage())).toBe(inspected.messageHex);
});

test('rejects a different signer or unsupported multiple instructions', () => {
  expect(() =>
    inspectSolanaTransfer(createTransfer(), recipient.toBase58())
  ).toThrow();
  const tx = new Transaction({
    feePayer: sender,
    recentBlockhash: blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: recipient,
      lamports: 1n,
    }),
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: recipient,
      lamports: 2n,
    })
  );
  const input = bytesToHex(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false })
  );
  expect(() => inspectSolanaTransfer(input, address)).toThrow();
});

test('does not sign after permissions are revoked during approval', async () => {
  const deps = setup();
  let resolve!: (approved: boolean) => void;
  deps.requestApproval.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const controller = new SolanaSignTransferController(deps);
  const pending = controller.sign(origin, address, createTransfer());
  deps.permissions.invalidate();
  resolve(true);
  await expect(pending).rejects.toThrow('expired');
  expect(deps.sign).not.toHaveBeenCalled();
});
