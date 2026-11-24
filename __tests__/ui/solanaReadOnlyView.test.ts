import { act, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import ExperimentalSolanaReadOnly from '@/ui/views/ExperimentalSolanaReadOnly';

describe('experimental Solana read-only view', () => {
  let container: HTMLDivElement;
  let root: Root;
  const previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(createElement(ExperimentalSolanaReadOnly)));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  afterAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  const submit = (value: string) => {
    const input = container.querySelector('input')!;
    act(() => {
      input.value = value;
      Simulate.change(input);
    });
    act(() => Simulate.submit(container.querySelector('form')!));
  };

  test('shows a valid public address with read-only limitations', () => {
    const address = '11111111111111111111111111111111';
    submit(address);
    expect(
      container.querySelector('[aria-label="Read-only address"]')?.textContent
    ).toContain(address);
    expect(container.textContent).toContain(
      'No ownership, connection or signing'
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  test('shows an error and removes a previous result for an invalid address', () => {
    submit('11111111111111111111111111111111');
    submit('invalid');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'valid 32-byte'
    );
    expect(
      container.querySelector('[aria-label="Read-only address"]')
    ).toBeNull();
  });
});

test('only queries devnet after an explicit click and ignores stale responses', async () => {
  const originalFetch = global.fetch;
  let resolveResponse!: (response: any) => void;
  const fetchMock = jest.fn().mockReturnValue(
    new Promise((resolve) => {
      resolveResponse = resolve;
    })
  );
  global.fetch = fetchMock;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    act(() => root.render(createElement(ExperimentalSolanaReadOnly)));
    const input = container.querySelector('input')!;
    act(() => {
      input.value = '11111111111111111111111111111111';
      Simulate.change(input);
    });
    act(() => Simulate.submit(container.querySelector('form')!));
    expect(fetchMock).not.toHaveBeenCalled();
    const button = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent === 'Check devnet balance'
    )!;
    act(() => Simulate.click(button));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => {
      input.value = 'invalid';
      Simulate.change(input);
    });
    await act(async () => {
      resolveResponse({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { value: 1000000000 },
        }),
      });
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain('Devnet balance:');
  } finally {
    act(() => root.unmount());
    container.remove();
    global.fetch = originalFetch;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
