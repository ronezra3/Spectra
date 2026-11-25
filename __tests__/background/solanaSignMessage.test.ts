/** @jest-environment node */
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { SolanaApprovalSession } from '@/chains/solana/approvalSession';
import { SolanaConnectionSession } from '@/chains/solana/connectionSession';
import { SolanaSignMessageController } from 'background/controller/solanaSignMessage';

// RFC 8032 public test key. Never use this key with funds.
const secret = Uint8Array.from(
  Buffer.from(
    '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
    'hex'
  )
);
const address = base58.encode(ed25519.getPublicKey(secret));
const origin = 'https://example.org';
const account = { address, cluster: 'solana:devnet' as const };

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
    newId: jest.fn(() => 'sign'),
    requestApproval: jest.fn(async () => true),
    sign: jest.fn(async (_address: string, bytes: Uint8Array) =>
      ed25519.sign(bytes, secret)
    ),
  };
}

test('signs only the approved exact message for a connected origin', async () => {
  const deps = setup();
  const controller = new SolanaSignMessageController(deps);
  const signature = await controller.sign(origin, address, '010203');
  expect(
    ed25519.verify(
      Buffer.from(signature, 'hex'),
      Uint8Array.from([1, 2, 3]),
      ed25519.getPublicKey(secret)
    )
  ).toBe(true);
  expect(deps.requestApproval).toHaveBeenCalledTimes(1);
});

test('does not sign if the connection is revoked while approval is open', async () => {
  const deps = setup();
  let resolve!: (approved: boolean) => void;
  deps.requestApproval.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const controller = new SolanaSignMessageController(deps);
  const pending = controller.sign(origin, address, '010203');
  deps.permissions.invalidate();
  resolve(true);
  await expect(pending).rejects.toThrow('expired');
  expect(deps.sign).not.toHaveBeenCalled();
});

test('rejects messages from unconnected origins and invalid bytes', async () => {
  const deps = setup();
  const controller = new SolanaSignMessageController(deps);
  await expect(
    controller.sign('https://other.example', address, '01')
  ).rejects.toThrow('connection');
  await expect(controller.sign(origin, address, 'z1')).rejects.toThrow(
    'Invalid'
  );
  expect(deps.sign).not.toHaveBeenCalled();
});
