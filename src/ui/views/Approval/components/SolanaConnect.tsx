import React from 'react';
import { Button } from 'antd';
import { bindApproval, useApproval } from 'ui/utils';
import { parseSolanaReadOnlyAddress } from '@/chains/solana/readOnlyAddress';

export type SolanaConnectParams = {
  origin: string;
  account: string;
  cluster: 'solana:devnet';
};

/** A separate confirmation: an Ethereum grant never implies this consent. */
const SolanaConnect = ({
  params,
  approvalId,
}: {
  params?: SolanaConnectParams;
  approvalId?: string;
}) => {
  const [, resolve, reject] = useApproval(
    bindApproval(approvalId, 'SolanaConnect')
  );
  let originIsCanonical = false;
  try {
    const origin = new URL(params?.origin || '');
    originIsCanonical =
      ['https:', 'http:'].includes(origin.protocol) &&
      origin.origin === params?.origin;
  } catch {
    // Invalid approval data must never enable consent.
  }
  const valid =
    originIsCanonical &&
    params?.cluster === 'solana:devnet' &&
    !!params?.account &&
    parseSolanaReadOnlyAddress(params.account)?.address === params.account;

  return (
    <main style={{ padding: 24 }}>
      <h1>Connect to Solana</h1>
      {valid ? (
        <>
          <p>Allow this site to see your Solana address on Devnet?</p>
          <p>
            Site: <strong>{params?.origin}</strong>
          </p>
          <p style={{ overflowWrap: 'anywhere' }}>Address: {params?.account}</p>
          <p>Network: Solana Devnet</p>
          <p>Signing will require a separate approval.</p>
        </>
      ) : (
        <p role="alert">This connection request is invalid.</p>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <Button onClick={() => reject()}>Cancel</Button>
        <Button
          type="primary"
          disabled={!valid || !approvalId}
          onClick={() => resolve(true)}
        >
          Connect
        </Button>
      </div>
    </main>
  );
};

export default SolanaConnect;
