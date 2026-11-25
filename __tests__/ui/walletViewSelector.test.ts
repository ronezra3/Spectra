import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { WalletViewSelector } from '@/ui/views/Dashboard/components/WalletViewSelector';

test('selects a dashboard view and cannot switch during a pending operation', () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const onChange = jest.fn();
  try {
    act(() => root.render(createElement(WalletViewSelector, {
      value: 'evm', disabled: false, onChange,
    })));
    const select = container.querySelector('select')!;
    expect(select.getAttribute('aria-label')).toBe('Wallet view');
    expect(select.textContent).toContain('All EVM networks');
    expect(select.textContent).toContain('Solana Devnet');
    act(() => {
      select.value = 'solana';
      Simulate.change(select);
    });
    expect(onChange).toHaveBeenCalledWith('solana');
    onChange.mockClear();
    act(() => root.render(createElement(WalletViewSelector, {
      value: 'solana', disabled: true, onChange,
    })));
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
