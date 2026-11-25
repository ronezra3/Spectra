import React from 'react';
import { Button } from 'antd';
import { bindApproval, useApproval } from 'ui/utils';
import { parseSolanaReadOnlyAddress } from '@/chains/solana/readOnlyAddress';

export type SolanaSignMessageParams = {
  origin: string;
  account: string;
  cluster: 'solana:devnet';
  messageHex: string;
};

const SolanaSignMessage = ({
  params,
  approvalId,
}: {
  params?: SolanaSignMessageParams;
  approvalId?: string;
}) => {
  const [, resolve, reject] = useApproval(
    bindApproval(approvalId, 'SolanaSignMessage')
  );
  let canonicalOrigin = false;
  try {
    const origin = new URL(params?.origin || '');
    canonicalOrigin =
      ['https:', 'http:'].includes(origin.protocol) &&
      origin.origin === params?.origin;
  } catch {
    // Keep confirmation disabled on invalid input.
  }
  const valid =
    canonicalOrigin &&
    params?.cluster === 'solana:devnet' &&
    !!params?.account &&
    parseSolanaReadOnlyAddress(params.account)?.address === params.account &&
    typeof params?.messageHex === 'string' &&
    params.messageHex.length <= 2048 &&
    /^(?:[0-9a-f]{2})*$/.test(params.messageHex);
  return (
    <main style={{ padding: 24 }}>
      <h1>Sign Solana message</h1>
      {valid ? (
        <>
          <p>
            Site: <strong>{params?.origin}</strong>
          </p>
          <p style={{ overflowWrap: 'anywhere' }}>Account: {params?.account}</p>
          <p>Network: Solana Devnet</p>
          <p>
            Review every byte below. A signature can authorize actions on a
            site.
          </p>
          <p>Message bytes (hexadecimal):</p>
          <pre
            style={{
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
              maxHeight: 240,
              overflowY: 'auto',
            }}
          >
            {params?.messageHex || '(empty message)'}
          </pre>
        </>
      ) : (
        <p role="alert">This signing request is invalid.</p>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <Button onClick={() => reject()}>Cancel</Button>
        <Button
          type="primary"
          disabled={!valid || !approvalId}
          onClick={() => resolve(true)}
        >
          Sign message
        </Button>
      </div>
    </main>
  );
};

export default SolanaSignMessage;
