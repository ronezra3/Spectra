import {
  SolanaConnectController,
  SolanaSelectedAccount,
} from 'background/controller/solanaConnect';
import { SolanaConnectionSession } from '@/chains/solana/connectionSession';

const address = '11111111111111111111111111111111';
const origin = 'https://example.org';
const selected = (): SolanaSelectedAccount => ({
  address,
  cluster: 'solana:devnet',
});

function createDependencies() {
  return {
    isUnlocked: jest.fn(() => true),
    getSelectedAccount: jest.fn((): SolanaSelectedAccount | null => selected()),
    requestApproval: jest.fn(async () => true),
    newId: jest.fn(() => 'request-1'),
    permissions: new SolanaConnectionSession(),
  };
}

test('requires explicit approval and reuses only the matching session grant', async () => {
  const deps = createDependencies();
  const controller = new SolanaConnectController(deps);
  await expect(controller.connect(origin, true)).rejects.toThrow('approval');
  expect(deps.requestApproval).not.toHaveBeenCalled();
  expect(await controller.connect(origin)).toEqual(selected());
  expect(await controller.connect(origin, true)).toEqual(selected());
  expect(deps.requestApproval).toHaveBeenCalledTimes(1);
  controller.disconnect(origin);
  await expect(controller.connect(origin, true)).rejects.toThrow('approval');
});

test('rejects an approval received after lock or account change', async () => {
  const deps = createDependencies();
  let resolve!: (approved: boolean) => void;
  deps.requestApproval.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const controller = new SolanaConnectController(deps);
  const pending = controller.connect(origin);
  deps.isUnlocked.mockReturnValue(false);
  resolve(true);
  await expect(pending).rejects.toThrow('expired');
  deps.isUnlocked.mockReturnValue(true);
  await expect(controller.connect(origin, true)).rejects.toThrow('approval');
});

test('rejects invalid origins and does not prompt', async () => {
  const deps = createDependencies();
  const controller = new SolanaConnectController(deps);
  await expect(
    controller.connect('https://example.org/path')
  ).rejects.toThrow();
  expect(deps.requestApproval).not.toHaveBeenCalled();
});

test('does not trust a mutable selected account after the approval opens', async () => {
  const deps = createDependencies();
  const mutable = selected() as { address: string; cluster: 'solana:devnet' };
  deps.getSelectedAccount.mockImplementation(() => mutable);
  let resolve!: (approved: boolean) => void;
  deps.requestApproval.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const controller = new SolanaConnectController(deps);
  const pending = controller.connect(origin);
  mutable.address = 'FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z';
  resolve(true);
  await expect(pending).rejects.toThrow('expired');
});
