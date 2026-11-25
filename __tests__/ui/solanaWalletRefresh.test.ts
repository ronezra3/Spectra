/* eslint-disable @typescript-eslint/no-var-requires */
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import SolanaWallet from '@/ui/views/ExperimentalSolanaWallet';

jest.mock('@/ui/views/ExperimentalSolanaWallet/style.less', () => ({}));
const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
  useHistory: () => ({ push: mockPush }),
}));
jest.mock('antd', () => ({
  Button: ({ children, onClick, disabled }: any) =>
    require('react').createElement('button', { onClick, disabled }, children),
}));
const mockWallet = {
  experimentalSolanaSelectAssociated: jest.fn(),
  experimentalSolanaVerifiedLinks: jest.fn<Promise<string[]>, [string]>(
    async () => []
  ),
  experimentalSolanaStatus: jest.fn(async () => ({
    exists: true,
    unlocked: true,
    accounts: ['account'],
    selected: { address: 'account', cluster: 'solana:devnet' },
  })),
};
jest.mock('ui/utils', () => ({ useWallet: () => mockWallet }));
jest.mock('@/ui/views/ExperimentalSolanaWallet/SolanaAssets', () => ({
  SolanaAssets: ({ onSend, onReceive, onActivity, onAccounts }: any) =>
    require('react').createElement(
      'div',
      { 'data-testid': 'assets' },
      'Assets',
      require('react').createElement(
        'button',
        { onClick: onAccounts },
        'Accounts'
      ),
      require('react').createElement('button', { onClick: onSend }, 'Send'),
      require('react').createElement(
        'button',
        { onClick: onReceive },
        'Receive'
      ),
      require('react').createElement(
        'button',
        { onClick: onActivity },
        'Transactions'
      )
    ),
}));
jest.mock('@/ui/views/ExperimentalSolanaWallet/SolanaReceive', () => ({
  SolanaReceive: () =>
    require('react').createElement(
      'div',
      { 'data-testid': 'receive' },
      'Receive view'
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
    const click = (label: string) => {
      const button = Array.from(container.querySelectorAll('button')).find(
        (item) => item.textContent === label
      )!;
      expect(button).toBeDefined();
      act(() => Simulate.click(button));
    };
    click('Receive');
    expect(container.querySelectorAll('[data-testid="receive"]')).toHaveLength(
      1
    );
    click('← Back to Solana');
    click('Send');
    click('Test send');
    click('← Back to Solana');
    expect(container.querySelectorAll('[data-testid="assets"]')).toHaveLength(
      1
    );
    click('Transactions');
    expect(container.querySelectorAll('[data-testid="activity"]')).toHaveLength(
      1
    );
  } finally {
    act(() => root.unmount());
    container.remove();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test('aligns a linked account before loading the view and labels an unlinked one', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const evmAccount = {
    address: '0x0000000000000000000000000000000000000001',
    type: 'HD Key Tree',
    brandName: 'HD Key Tree',
  };
  mockWallet.experimentalSolanaSelectAssociated.mockResolvedValue('not-linked');
  mockWallet.experimentalSolanaStatus.mockClear();
  try {
    await act(async () =>
      root.render(createElement(SolanaWallet, { evmAccount }))
    );
    expect(mockWallet.experimentalSolanaSelectAssociated).toHaveBeenCalledWith(
      evmAccount.address
    );
    expect(
      mockWallet.experimentalSolanaSelectAssociated.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mockWallet.experimentalSolanaStatus.mock.invocationCallOrder[0]
    );
    expect(container.textContent).toContain('No unique Solana test account');
    expect(container.querySelectorAll('[data-testid="assets"]')).toHaveLength(
      1
    );
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test('does not render the previous EVM account result after the selection changes', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  let release!: (result: string) => void;
  mockWallet.experimentalSolanaSelectAssociated.mockReset();
  mockWallet.experimentalSolanaSelectAssociated.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  mockWallet.experimentalSolanaSelectAssociated.mockResolvedValue('not-linked');
  const first = {
    address: '0x0000000000000000000000000000000000000001',
    type: 'HD Key Tree',
    brandName: 'HD Key Tree',
  };
  const second = {
    ...first,
    address: '0x0000000000000000000000000000000000000002',
  };
  try {
    await act(async () =>
      root.render(createElement(SolanaWallet, { evmAccount: first }))
    );
    await act(async () =>
      root.render(createElement(SolanaWallet, { evmAccount: second }))
    );
    expect(container.textContent).toContain('No unique Solana test account');
    await act(async () => release('selected'));
    expect(container.textContent).toContain('No unique Solana test account');
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test('uses the dashboard selector for navigation while retaining subview back navigation', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(createElement(SolanaWallet, { onExit: jest.fn() }))
    );
    expect(container.textContent).not.toContain('Back to wallet');
    const receive = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Receive'
    )!;
    act(() => Simulate.click(receive));
    const back = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '← Back to Solana'
    )!;
    expect(back).toBeDefined();
    act(() => Simulate.click(back));
    expect(container.querySelectorAll('[data-testid="assets"]')).toHaveLength(
      1
    );
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test('labels only accounts verified for the selected EVM account', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const evmAccount = {
    address: '0x0000000000000000000000000000000000000001',
    type: 'HD Key Tree',
    brandName: 'HD Key Tree',
  };
  mockWallet.experimentalSolanaSelectAssociated.mockResolvedValue('not-linked');
  mockWallet.experimentalSolanaVerifiedLinks.mockResolvedValueOnce(['account']);
  try {
    await act(async () =>
      root.render(createElement(SolanaWallet, { evmAccount }))
    );
    const button = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent === 'Accounts'
    )!;
    act(() => Simulate.click(button));
    expect(container.textContent).toContain('Linked to selected EVM account');
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test('can open the existing wallet account chooser from Solana accounts', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const evmAccount = {
    address: '0x0000000000000000000000000000000000000001',
    type: 'HD Key Tree',
    brandName: 'HD Key Tree',
  };
  mockPush.mockClear();
  mockWallet.experimentalSolanaSelectAssociated.mockResolvedValue('selected');
  try {
    await act(async () =>
      root.render(createElement(SolanaWallet, { evmAccount }))
    );
    const accounts = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent === 'Accounts'
    )!;
    act(() => Simulate.click(accounts));
    const change = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent === 'Change wallet account'
    )!;
    act(() => Simulate.click(change));
    expect(mockPush).toHaveBeenCalledWith('/switch-address');
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
