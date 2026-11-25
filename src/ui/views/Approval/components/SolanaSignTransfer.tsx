import React from 'react';
import { Button } from 'antd';
import { bindApproval, useApproval } from 'ui/utils';
import { parseSolanaReadOnlyAddress } from '@/chains/solana/readOnlyAddress';

export type SolanaSignTransferParams = {
  origin: string;
  cluster: 'solana:devnet';
  send: boolean;
  from: string;
  to: string;
  lamports: string;
  recentBlockhash: string;
  transactionHex: string;
  source?: 'dapp' | 'wallet';
};

const SolanaSignTransfer = ({
  params,
  approvalId,
}: {
  params?: SolanaSignTransferParams;
  approvalId?: string;
}) => {
  const [, resolve, reject] = useApproval(
    bindApproval(approvalId, 'SolanaSignTransfer')
  );
  let canonicalOrigin = false;
  try {
    const origin = new URL(params?.origin || '');
    canonicalOrigin =
      ['https:', 'http:'].includes(origin.protocol) &&
      origin.origin === params?.origin;
  } catch {
    /* Keep confirmation disabled. */
  }
  const validAddress = (value?: string) =>
    !!value && parseSolanaReadOnlyAddress(value)?.address === value;
  const valid =
    canonicalOrigin &&
    params?.cluster === 'solana:devnet' &&
    typeof params?.send === 'boolean' &&
    validAddress(params?.from) &&
    validAddress(params?.to) &&
    validAddress(params?.recentBlockhash) &&
    typeof params?.lamports === 'string' &&
    /^(0|[1-9][0-9]{0,19})$/.test(params.lamports) &&
    typeof params?.transactionHex === 'string' &&
    params.transactionHex.length <= 2464 &&
    /^(?:[0-9a-f]{2})+$/.test(params.transactionHex);
  let sol = '';
  if (valid && params) {
    const lamports = BigInt(params.lamports);
    const fraction = (lamports % 1000000000n)
      .toString()
      .padStart(9, '0')
      .replace(/0+$/, '');
    sol = `${lamports / 1000000000n}${fraction ? `.${fraction}` : ''}`;
  }
  return (
    <main style={{ padding: 24 }}>
      <h1>
        {params?.send
          ? 'Sign and send Solana transfer'
          : 'Sign Solana transfer'}
      </h1>
      {valid ? (
        <>
          <p>
            {params?.source === 'wallet' ? 'Requested by: ' : 'Site: '}
            <strong>
              {params?.source === 'wallet' ? 'Your wallet' : params?.origin}
            </strong>
          </p>
          <p>Network: Solana Devnet</p>
          <p style={{ overflowWrap: 'anywhere' }}>From: {params?.from}</p>
          <p style={{ overflowWrap: 'anywhere' }}>To: {params?.to}</p>
          <p>
            Amount: {sol} SOL ({params?.lamports} lamports)
          </p>
          <p>
            Network fee is additional and is not estimated here.{' '}
            {params?.send
              ? 'The signed transaction will be sent to the public Devnet RPC and may be processed even if the wallet locks or the request fails.'
              : 'The site may submit the signed transaction.'}
          </p>
          <p style={{ overflowWrap: 'anywhere' }}>
            Recent blockhash: {params?.recentBlockhash}
          </p>
          <details>
            <summary>Exact unsigned transaction bytes</summary>
            <pre style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
              {params?.transactionHex}
            </pre>
          </details>
        </>
      ) : (
        <p role="alert">This transaction request is invalid.</p>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <Button onClick={() => reject()}>Cancel</Button>
        <Button
          type="primary"
          disabled={!valid || !approvalId}
          onClick={() => resolve(true)}
        >
          {params?.send ? 'Sign and send' : 'Sign transfer'}
        </Button>
      </div>
    </main>
  );
};

export default SolanaSignTransfer;
