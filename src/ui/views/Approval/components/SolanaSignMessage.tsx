import React from 'react';
import { Button } from 'antd';
import './solanaApproval.less';
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
    <main className="solana-approval">
      <h1>Sign Solana message</h1>
      <span className="solana-approval__network">Solana Devnet</span>
      {valid ? (
        <>
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
            Review every byte below. A signature can authorize actions on a
            site.
          </p>
          <div className="solana-approval__card">
            <span className="solana-approval__label">
              Message bytes (hexadecimal)
            </span>
            <pre className="solana-approval__bytes">
              {params?.messageHex || '(empty message)'}
            </pre>
          </div>
        </>
      ) : (
        <p role="alert">This signing request is invalid.</p>
      )}
      <div className="solana-approval__footer">
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
