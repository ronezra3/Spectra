/* eslint-disable @typescript-eslint/no-var-requires */
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { SolanaMigration } from '@/ui/views/ExperimentalSolanaWallet/SolanaMigration';
const mockWallet = {
  experimentalSolanaMigrationPreflight: jest.fn(),
  experimentalSolanaMigrate: jest.fn(),
};
jest.mock('ui/utils', () => ({ useWallet: () => mockWallet }));
jest.mock('antd', () => ({
  Button: ({ children, disabled, htmlType }: any) =>
    require('react').createElement(
      'button',
      { disabled, type: htmlType },
      children
    ),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockWallet.experimentalSolanaMigrationPreflight.mockResolvedValue({
    state: 'ready',
    sourceCount: 1,
  });
});

test('requires explicit confirmation and a test password before migration', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const done = jest.fn().mockResolvedValue(undefined);
  const pending = jest.fn();
  mockWallet.experimentalSolanaMigrate.mockResolvedValue(['public-address']);
  try {
    await act(async () =>
      root.render(
        createElement(SolanaMigration, {
          onDone: done,
          onPendingChange: pending,
        })
      )
    );
    const form = container.querySelector('form')!;
    await act(async () => Simulate.submit(form));
    expect(mockWallet.experimentalSolanaMigrate).not.toHaveBeenCalled();
    act(() => {
      Simulate.change(container.querySelector('input[type="password"]')!, {
        target: { value: 'test-password' },
      } as any);
      Simulate.change(container.querySelector('input[type="checkbox"]')!, {
        target: { checked: true },
      } as any);
    });
    await act(async () => Simulate.submit(form));
    expect(mockWallet.experimentalSolanaMigrate).toHaveBeenCalledWith(
      'test-password'
    );
    expect(pending.mock.calls).toEqual([[true], [false]]);
    expect(done).toHaveBeenCalledTimes(1);
    expect(
      (container.querySelector('input[type="password"]') as HTMLInputElement)
        .value
    ).toBe('');
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test('uncertain outcomes retain the source message and disable retry', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  mockWallet.experimentalSolanaMigrate.mockRejectedValue(
    new Error('test storage error')
  );
  try {
    await act(async () =>
      root.render(
        createElement(SolanaMigration, {
          onDone: jest.fn(),
          onPendingChange: jest.fn(),
        })
      )
    );
    act(() => {
      Simulate.change(container.querySelector('input[type="password"]')!, {
        target: { value: 'test-password' },
      } as any);
      Simulate.change(container.querySelector('input[type="checkbox"]')!, {
        target: { checked: true },
      } as any);
    });
    await act(async () => Simulate.submit(container.querySelector('form')!));
    expect(container.textContent).toContain('may or may not have completed');
    expect(container.textContent).toContain('original test vault was retained');
    expect(
      (container.querySelector('button[type="submit"]') as HTMLButtonElement)
        .disabled
    ).toBe(true);
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
