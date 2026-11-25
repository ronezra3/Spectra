/* eslint-disable @typescript-eslint/no-var-requires */
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { SolanaOnboarding } from '@/ui/views/ExperimentalSolanaWallet/SolanaOnboarding';

const mockWallet = {
  generateMnemonic: jest.fn(),
  experimentalSolanaStatus: jest.fn(),
  experimentalSolanaCreate: jest.fn(),
  experimentalSolanaUnlock: jest.fn(),
  experimentalSolanaImport: jest.fn(),
  experimentalSolanaAddShared: jest.fn(),
  experimentalSolanaCreateNative: jest.fn(),
  experimentalSolanaCreateLinked: jest.fn(),
  getCurrentAccount: jest.fn(),
};
jest.mock('ui/utils', () => ({ useWallet: () => mockWallet }));
jest.mock('antd', () => ({
  Button: ({ children, onClick, disabled, htmlType }: any) =>
    require('react').createElement(
      'button',
      { onClick, disabled, type: htmlType },
      children
    ),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockWallet.generateMnemonic.mockResolvedValue(
    'disposable test recovery phrase'
  );
  mockWallet.experimentalSolanaStatus.mockResolvedValue({
    exists: false,
    unlocked: false,
  });
  mockWallet.experimentalSolanaCreate.mockResolvedValue(undefined);
  mockWallet.experimentalSolanaImport.mockResolvedValue('address');
  mockWallet.experimentalSolanaAddShared.mockResolvedValue('shared-address');
  mockWallet.experimentalSolanaCreateNative.mockResolvedValue('native-address');
  mockWallet.experimentalSolanaCreateLinked.mockResolvedValue('linked-address');
  mockWallet.getCurrentAccount.mockResolvedValue({
    address: '0x0000000000000000000000000000000000000001',
    type: 'HD Key Tree',
  });
});

test('offers an explicitly identified EVM seed for the first Solana test account', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const done = jest.fn().mockResolvedValue(undefined);
  try {
    await act(async () =>
      root.render(
        createElement(SolanaOnboarding, {
          initialStatus: { exists: false, unlocked: false },
          onDone: done,
        })
      )
    );
    const choose = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Use current wallet account'
    )!;
    await act(async () => Simulate.click(choose));
    expect(container.textContent).toContain(
      '0x0000000000000000000000000000000000000001'
    );
    expect(container.querySelector('textarea')).toBeNull();
    act(() =>
      Simulate.change(container.querySelector('input[type="password"]')!, {
        target: { value: 'test-password' },
      } as any)
    );
    await act(async () => Simulate.submit(container.querySelector('form')!));
    expect(mockWallet.experimentalSolanaCreateLinked).toHaveBeenCalledWith(
      'test-password',
      0,
      '0x0000000000000000000000000000000000000001'
    );
    expect(mockWallet.experimentalSolanaCreateNative).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test('adds a restored test account to the shared vault with the main password', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const done = jest.fn().mockResolvedValue(undefined);
  const pending = jest.fn();
  const status = { exists: true, unlocked: true, custody: 'shared' as const };
  mockWallet.experimentalSolanaStatus.mockResolvedValue(status);
  try {
    await act(async () =>
      root.render(
        createElement(SolanaOnboarding, {
          initialStatus: status,
          onDone: done,
          onPendingChange: pending,
        })
      )
    );
    const restore = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Restore a test account'
    )!;
    act(() => Simulate.click(restore));
    act(() => {
      Simulate.change(container.querySelector('textarea')!, {
        target: { value: 'disposable test phrase' },
      } as any);
      Simulate.change(container.querySelector('input[type="number"]')!, {
        target: { value: '2' },
      } as any);
      Simulate.change(container.querySelector('input[type="password"]')!, {
        target: { value: 'test-password' },
      } as any);
    });
    await act(async () => Simulate.submit(container.querySelector('form')!));
    expect(mockWallet.experimentalSolanaAddShared).toHaveBeenCalledWith(
      'test-password',
      'disposable test phrase',
      2
    );
    expect(mockWallet.experimentalSolanaImport).not.toHaveBeenCalled();
    expect(pending.mock.calls).toEqual([[true], [false]]);
    expect(done).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test('starts with a choice, then creates and imports only after backup acknowledgement', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const done = jest.fn().mockResolvedValue(undefined);
  try {
    await act(async () =>
      root.render(
        createElement(SolanaOnboarding, {
          initialStatus: { exists: false, unlocked: false },
          onDone: done,
        })
      )
    );
    expect(container.querySelector('input[type="password"]')).toBeNull();
    const choice = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Create a test account'
    )!;
    await act(async () => Simulate.click(choice));
    expect(container.textContent).toContain('disposable test recovery phrase');
    const submit = container.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const pass = container.querySelector('input[type="password"]')!;
    act(() =>
      Simulate.change(pass, { target: { value: 'test-password' } } as any)
    );
    expect(submit.disabled).toBe(true);
    const confirm = container.querySelector('input[type="checkbox"]')!;
    act(() => Simulate.change(confirm, { target: { checked: true } } as any));
    await act(async () => Simulate.submit(container.querySelector('form')!));
    expect(mockWallet.experimentalSolanaCreateNative).toHaveBeenCalledWith(
      'test-password',
      'disposable test recovery phrase',
      0
    );
    expect(mockWallet.experimentalSolanaCreate).not.toHaveBeenCalled();
    expect(mockWallet.experimentalSolanaImport).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test('existing locked vault offers unlock without exposing password as first screen', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(SolanaOnboarding, {
          initialStatus: { exists: true, unlocked: false },
          onDone: jest.fn(),
        })
      )
    );
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.textContent).toContain('Unlock existing Solana wallet');
    expect(container.textContent).toContain('Restore a test account');
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test('restores a test account after unlocking the existing vault', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const done = jest.fn().mockResolvedValue(undefined);
  mockWallet.experimentalSolanaStatus.mockResolvedValue({
    exists: true,
    unlocked: false,
  });
  mockWallet.experimentalSolanaUnlock.mockResolvedValue(undefined);
  try {
    await act(async () =>
      root.render(
        createElement(SolanaOnboarding, {
          initialStatus: { exists: true, unlocked: false },
          onDone: done,
        })
      )
    );
    const choice = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Restore a test account'
    )!;
    act(() => Simulate.click(choice));
    act(() => {
      Simulate.change(container.querySelector('textarea')!, {
        target: { value: 'disposable test phrase' },
      } as any);
      Simulate.change(container.querySelector('input[type="number"]')!, {
        target: { value: '2' },
      } as any);
      Simulate.change(container.querySelector('input[type="password"]')!, {
        target: { value: 'test-password' },
      } as any);
    });
    await act(async () => Simulate.submit(container.querySelector('form')!));
    expect(mockWallet.experimentalSolanaUnlock).toHaveBeenCalledWith(
      'test-password'
    );
    expect(mockWallet.experimentalSolanaImport).toHaveBeenCalledWith(
      'test-password',
      'disposable test phrase',
      2
    );
    expect(done).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test('a manually locked shared account asks for the main wallet password', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(SolanaOnboarding, {
          initialStatus: { exists: true, unlocked: false, custody: 'shared' },
          onDone: jest.fn(),
        })
      )
    );
    expect(container.textContent).not.toContain('Create a test account');
    expect(container.textContent).not.toContain('Restore a test account');
    const unlock = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Unlock existing Solana wallet'
    )!;
    act(() => Simulate.click(unlock));
    expect(container.textContent).toContain('Wallet password');
    expect(container.textContent).not.toContain(
      'independent of the Ethereum wallet password'
    );
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
