/* eslint-disable @typescript-eslint/no-var-requires */
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import {
  SolanaSend,
  solToLamports,
} from '@/ui/views/ExperimentalSolanaWallet/SolanaSend';
const mockSend = jest.fn();
jest.mock('ui/utils', () => ({
  useWallet: () => ({ experimentalSolanaSend: mockSend }),
}));
jest.mock('antd', () => ({
  Button: ({ children, onClick, disabled, htmlType }: any) =>
    require('react').createElement(
      'button',
      { onClick, disabled, type: htmlType },
      children
    ),
}));
const account = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const recipient = '2KW2XRd9kwqet15Aha2oK3tYvd3nWbTFH1MBiRAv1BE1';

test('decimal SOL parsing uses integer arithmetic and rejects extra precision', () => {
  expect(solToLamports('0.000000001')).toBe('1');
  expect(solToLamports('1.25')).toBe('1250000000');
  expect(solToLamports('0')).toBeNull();
  expect(solToLamports('0.0000000001')).toBeNull();
  expect(solToLamports('1e3')).toBeNull();
});

test('invalid input cannot submit; valid input passes exact lamports and reports pending state', async () => {
  const previous = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const pending = jest.fn();
  const sent = jest.fn();
  mockSend.mockResolvedValue('signature');
  try {
    await act(async () => {
      root.render(
        createElement(SolanaSend, {
          address: account,
          onSent: sent,
          onPendingChange: pending,
        })
      );
    });
    const [to, amount] = container.querySelectorAll('input');
    act(() => {
      Simulate.change(to, { target: { value: 'bad' } } as any);
      Simulate.change(amount, { target: { value: '0.0000000001' } } as any);
    });
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(2);
    expect(container.querySelector('button')?.disabled).toBe(true);
    act(() => {
      Simulate.change(to, { target: { value: recipient } } as any);
      Simulate.change(amount, { target: { value: '0.000000001' } } as any);
    });
    await act(async () => {
      Simulate.submit(container.querySelector('form')!);
    });
    expect(mockSend).toHaveBeenCalledWith(account, recipient, '1');
    expect(pending.mock.calls).toEqual([[true], [false]]);
    expect(sent).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
    container.remove();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
