import React, { act, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import SolanaConnect from '@/ui/views/Approval/components/SolanaConnect';
import SolanaSignMessage from '@/ui/views/Approval/components/SolanaSignMessage';
import SolanaSignTransfer from '@/ui/views/Approval/components/SolanaSignTransfer';

const mockResolve = jest.fn();
const mockReject = jest.fn();
jest.mock('ui/utils', () => ({
  bindApproval: (id: string, component: string) => ({ id, component }),
  useApproval: () => [jest.fn(), mockResolve, mockReject],
}));
jest.mock('antd', () => ({
  Button: ({ children, onClick, disabled }: any) =>
    require('react').createElement('button', { onClick, disabled }, children),
}));

const address = '11111111111111111111111111111111';
const params = {
  origin: 'https://example.org',
  account: address,
  cluster: 'solana:devnet' as const,
};
let container: HTMLDivElement;
let root: Root;
let previousActEnvironment: unknown;

beforeEach(() => {
  previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  jest.clearAllMocks();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

test('connection shows the exact site and address and resolves an explicit approval', () => {
  act(() =>
    root.render(
      createElement(SolanaConnect, { params, approvalId: 'approval' })
    )
  );
  expect(container.textContent).toContain(params.origin);
  expect(container.textContent).toContain(address);
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent === 'Connect'
  )!;
  expect(button.disabled).toBe(false);
  act(() => Simulate.click(button));
  expect(mockResolve).toHaveBeenCalledWith(true);
});

test('message approval shows exact bytes and rejects invalid origin', () => {
  act(() =>
    root.render(
      createElement(SolanaSignMessage, {
        params: { ...params, messageHex: '000102ff' },
        approvalId: 'approval',
      })
    )
  );
  expect(container.textContent).toContain('000102ff');
  act(() =>
    root.render(
      createElement(SolanaSignMessage, {
        params: {
          ...params,
          origin: 'https://example.org/path',
          messageHex: '00',
        },
        approvalId: 'approval',
      })
    )
  );
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(
    Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent === 'Sign message'
    )?.disabled
  ).toBe(true);
});

test('transfer approval distinguishes signing from submission', () => {
  const transfer = {
    origin: params.origin,
    cluster: params.cluster,
    from: address,
    to: address,
    lamports: '1000000001',
    recentBlockhash: address,
    transactionHex: '0102',
    send: true,
  };
  act(() =>
    root.render(
      createElement(SolanaSignTransfer, {
        params: transfer,
        approvalId: 'approval',
      })
    )
  );
  expect(container.textContent).toContain('1.000000001 SOL');
  expect(container.textContent).toContain('Sign and send');
  expect(container.textContent).toContain('may be processed even if');
});
