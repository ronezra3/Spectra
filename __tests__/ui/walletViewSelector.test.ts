import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { WalletViewSelector } from '@/ui/views/Dashboard/components/WalletViewSelector';
import { EVM_DASHBOARD_NETWORKS } from '@/ui/views/Dashboard/components/dashboardNetworks';

test('only offers supported EVM mainnets in the chain-filtered view', () => {
  expect(EVM_DASHBOARD_NETWORKS.length).toBeGreaterThan(0);
  expect(EVM_DASHBOARD_NETWORKS.every((chain) => !chain.isTestnet)).toBe(true);
});

test('selects a dashboard view and cannot switch during a pending operation', () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const onChange = jest.fn();
  try {
    act(() =>
      root.render(
        createElement(WalletViewSelector, {
          value: 'evm',
          disabled: false,
          onChange,
        })
      )
    );
    const select = container.querySelector('select')!;
    expect(select.getAttribute('aria-label')).toBe('Network');
    expect(select.textContent).toContain('All EVM networks');
    expect(select.textContent).toContain('Solana Devnet');
    expect(select.textContent).toContain('Ethereum');
    expect(select.options[1].value).toBe('solana');
    act(() => {
      select.value = 'solana';
      Simulate.change(select);
    });
    expect(onChange).toHaveBeenCalledWith('solana');
    onChange.mockClear();
    act(() =>
      root.render(
        createElement(WalletViewSelector, {
          value: 'solana',
          disabled: true,
          onChange,
        })
      )
    );
    expect(select.disabled).toBe(true);
    act(() => {
      select.value = 'evm';
      Simulate.change(select);
    });
    expect(onChange).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
