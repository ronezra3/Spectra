/** @jest-environment node */
import { OrderedStateWriter } from '@/background/service/keyring/orderedStateWriter';

test('writes snapshots in order and does not observe later mutations', async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const written: number[] = [];
  const writer = new OrderedStateWriter<{ nested: { value: number } }>(
    async (state) => {
      if (state.nested.value === 1) {
        entered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      written.push(state.nested.value);
    }
  );
  const firstState = { nested: { value: 1 } };
  const first = writer.enqueue(firstState);
  await started;
  firstState.nested.value = 99;
  const second = writer.enqueue({ nested: { value: 2 } });
  expect(written).toEqual([]);
  release();
  await Promise.all([first, second, writer.flush()]);
  expect(written).toEqual([1, 2]);
});

test('reports a failed write but allows later full-state writes to recover', async () => {
  const write = jest
    .fn()
    .mockRejectedValueOnce(new Error('storage failed'))
    .mockResolvedValueOnce(undefined);
  const writer = new OrderedStateWriter(write);
  await expect(writer.enqueue({ version: 1 })).rejects.toThrow(
    'storage failed'
  );
  await expect(writer.flush()).rejects.toThrow('storage failed');
  await expect(writer.enqueue({ version: 2 })).resolves.toBeUndefined();
  await expect(writer.flush()).resolves.toBeUndefined();
  expect(write).toHaveBeenCalledTimes(2);
});
