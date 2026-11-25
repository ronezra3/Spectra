/* eslint-disable @typescript-eslint/no-var-requires */
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import SolanaWallet from '@/ui/views/ExperimentalSolanaWallet';

jest.mock('@/ui/views/ExperimentalSolanaWallet/style.less', () => ({}));
jest.mock('react-router-dom', () => ({
  useHistory: () => ({ push: jest.fn() }),
}));
jest.mock('antd', () => ({
  Button: ({ children, onClick, disabled }: any) =>
    require('react').createElement('button', { onClick, disabled }, children),
}));
jest.mock('ui/utils', () => {
  const wallet = {
    experimentalSolanaStatus: async () => ({
      exists: true,
      unlocked: true,
      accounts: ['account'],
      selected: { address: 'account', cluster: 'solana:devnet' },
    }),
  };
  return { useWallet: () => wallet };
});
jest.mock('@/ui/views/ExperimentalSolanaWallet/SolanaAssets', () => ({
  SolanaAssets: () =>
    require('react').createElement(
      'div',
      { 'data-testid': 'assets' },
      'Assets'
    ),
}));
jest.mock('@/ui/views/ExperimentalSolanaWallet/SolanaActivity', () => ({
  SolanaActivity: () =>
    require('react').createElement(
      'div',
      { 'data-testid': 'activity' },
      'Activity'
    ),
}));
jest.mock('@/ui/views/ExperimentalSolanaWallet/SolanaSend', () => ({
  SolanaSend: ({ onSent }: any) =>
    require('react').createElement('button', { onClick: onSent }, 'Test send'),
}));

test('refreshing after a send renders each asset and activity panel exactly once', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(createElement(SolanaWallet));
    });
    expect(container.querySelectorAll('[data-testid="assets"]')).toHaveLength(
      1
    );
    const button = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent === 'Test send'
    )!;
    act(() => Simulate.click(button));
    expect(container.querySelectorAll('[data-testid="assets"]')).toHaveLength(
      1
    );
    expect(container.querySelectorAll('[data-testid="activity"]')).toHaveLength(
      1
    );
  } finally {
    act(() => root.unmount());
    container.remove();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
