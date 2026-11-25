import React from 'react';
import { Button } from 'antd';
import './solanaApproval.less';
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
    <main className="solana-approval">
      <h1>Connect to Solana</h1>
      <span className="solana-approval__network">Solana Devnet</span>
      {valid ? (
        <>
          <p>Allow this site to see your Solana address on Devnet?</p>
          <div className="solana-approval__card">
            <div className="solana-approval__row">
              <span className="solana-approval__label">Site</span>
              <strong>{params?.origin}</strong>
            </div>
            <div className="solana-approval__row">
              <span className="solana-approval__label">Account</span>
              <span>{params?.account}</span>
            </div>
          </div>
          <p className="solana-approval__warning">
            Signing will require a separate approval.
          </p>
        </>
      ) : (
        <p role="alert">This connection request is invalid.</p>
      )}
      <div className="solana-approval__footer">
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
