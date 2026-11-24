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
      'No ownership, balance, connection or signing'
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
