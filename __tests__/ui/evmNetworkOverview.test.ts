/* eslint-disable @typescript-eslint/no-var-requires */
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { CHAINS, CHAINS_ENUM } from '@debank/common';
import { EvmNetworkOverview } from '@/ui/views/Dashboard/components/EvmNetworkOverview';

const mockPush = jest.fn();
const mockBalance = {
  balance: 120,
  balanceLoading: false,
  success: true,
  missingList: [] as string[],
  matteredChainBalances: [
    { id: 'eth', usd_value: 40 },
    { id: 'matic', usd_value: 80 },
  ],
};
jest.mock('react-router-dom', () => ({
  useHistory: () => ({ push: mockPush }),
}));
jest.mock('@/ui/hooks/useCurrentBalance', () => ({
  __esModule: true,
  default: () => mockBalance,
}));
jest.mock('@/ui/utils', () => ({
  formatUsdValue: (value: number) => `$${value.toFixed(2)}`,
}));
jest.mock('@/ui/assets/dashboard/panel', () => ({
  RcIconReceiveCC: () => null,
  RcIconSendCC: () => null,
}));
jest.mock('@/ui/views/CommonPopup/AssetList/AssetListContainer', () => ({
  AssetListContainer: ({ selectChainId }: any) =>
    require('react').createElement(
      'div',
      { 'data-chain': selectChainId },
      'Assets'
    ),
}));

test('filters the displayed chain and routes send and receive with that chain', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  mockPush.mockClear();
  try {
    await act(async () =>
      root.render(
        createElement(EvmNetworkOverview, {
          chain: CHAINS[CHAINS_ENUM.ETH],
          account: {
            address: '0x0000000000000000000000000000000000000001',
            type: 'HD Key Tree',
            brandName: 'HD Key Tree',
          },
        })
      )
    );
    expect(container.textContent).toContain('$40.00');
    expect(container.textContent).not.toContain('$120.00');
    expect(container.querySelector('[data-chain="eth"]')).not.toBeNull();
    const buttons = Array.from(container.querySelectorAll('button'));
    act(() =>
      Simulate.click(buttons.find((button) => button.textContent === 'Send')!)
    );
    act(() =>
      Simulate.click(
        buttons.find((button) => button.textContent === 'Receive')!
      )
    );
    expect(mockPush).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('token=eth%3Aeth')
    );
    expect(mockPush).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('chain=ETH')
    );
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test('does not present an incomplete chain balance as zero', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  mockBalance.missingList = ['Ethereum'];
  try {
    await act(async () =>
      root.render(
        createElement(EvmNetworkOverview, {
          chain: CHAINS[CHAINS_ENUM.ETH],
          account: {
            address: '0x0000000000000000000000000000000000000001',
            type: 'HD Key Tree',
            brandName: 'HD Key Tree',
          },
        })
      )
    );
    expect(container.textContent).toContain('Balance unavailable');
    expect(container.textContent).not.toContain('$0.00');
  } finally {
    mockBalance.missingList = [];
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
