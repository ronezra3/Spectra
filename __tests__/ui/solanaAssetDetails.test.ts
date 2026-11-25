/* eslint-disable @typescript-eslint/no-var-requires */
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { SolanaAssets } from '@/ui/views/ExperimentalSolanaWallet/SolanaAssets';
const mint = '2KW2XRd9kwqet15Aha2oK3tYvd3nWbTFH1MBiRAv1BE1';
jest.mock('antd', () => ({
  Button: ({ children, onClick }: any) =>
    require('react').createElement('button', { onClick }, children),
  Skeleton: { Input: () => null },
}));
jest.mock('@/ui/utils/clipboard', () => ({ copyAddress: jest.fn() }));
jest.mock('@/ui/assets/dashboard/panel', () => ({
  RcIconReceiveCC: () => null,
  RcIconSendCC: () => null,
  RcIconTransactionsCC: () => null,
  RcIconManageCC: () => null,
}));
jest.mock('@/chains/solana/devnetBalance', () => ({
  getDevnetBalance: async () => 1000000000,
  formatLamports: () => '1',
}));
jest.mock('@/chains/solana/devnetTokens', () => ({
  getDevnetTokens: async () => [{ mint, amount: '325', decimals: 2 }],
  formatTokenAmount: () => '3.25',
}));
test('unverified token opens a detail screen without implying verified metadata or transfer support', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const send = jest.fn();
  const receive = jest.fn();
  const activity = jest.fn();
  const accounts = jest.fn();
  try {
    await act(async () => {
      root.render(
        createElement(SolanaAssets, {
          address: mint,
          onReceive: receive,
          onSend: send,
          onActivity: activity,
          onAccounts: accounts,
        })
      );
    });
    for (const [label, callback] of [
      ['Send', send],
      ['Receive', receive],
      ['Transactions', activity],
      ['Accounts', accounts],
    ] as const) {
      const action = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === label
      );
      expect(action).toBeDefined();
      act(() => Simulate.click(action!));
      expect(callback).toHaveBeenCalledTimes(1);
    }
    const token = Array.from(
      container.querySelectorAll('button')
    ).find((button) => button.textContent?.includes('Unknown token'))!;
    act(() => Simulate.click(token));
    expect(container.textContent).toContain(mint);
    expect(container.textContent).toContain('3.25');
    expect(container.textContent).toContain('not verified');
    expect(container.textContent).toContain(
      'Token transfers are not available'
    );
  } finally {
    act(() => root.unmount());
    container.remove();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
