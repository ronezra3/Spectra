import React, { useEffect, useState } from 'react';
import { Button } from 'antd';
import { formatLamports } from '@/chains/solana/devnetBalance';
import {
  SolanaActivity as Activity,
  SolanaActivityDetail,
  getDevnetActivity,
  getDevnetTransaction,
} from '@/chains/solana/devnetActivity';

export const SolanaActivity = ({ address }: { address: string }) => {
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<SolanaActivityDetail | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setActivity(null);
    setFailed(false);
    getDevnetActivity(address, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setActivity(result);
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      }
    );
    return () => controller.abort();
  }, [address]);
  useEffect(() => {
    setDetail(null);
    setDetailError(false);
    if (!selected) return;
    const controller = new AbortController();
    getDevnetTransaction(selected, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setDetail(result);
      },
      () => {
        if (!controller.signal.aborted) setDetailError(true);
      }
    );
    return () => controller.abort();
  }, [selected]);
  return (
    <section className="solana-wallet__card solana-activity">
      {selected ? (
        <>
          <Button type="link" onClick={() => setSelected(null)}>
            ← Back to activity
          </Button>
          <h2>Transaction details</h2>
          {detailError && (
            <p role="alert">Could not load transaction details.</p>
          )}
          {!detail && !detailError && <p>Loading transaction…</p>}
          {detail && (
            <>
              <p>
                Status:{' '}
                <strong>
                  {detail.status === 'success' ? 'Confirmed' : 'Failed'}
                </strong>
              </p>
              {detail.transfers.map((transfer, index) => (
                <div
                  className="solana-activity__detail"
                  key={`${transfer.from}:${transfer.to}:${index}`}
                >
                  <p>
                    <strong>{formatLamports(transfer.lamports)} SOL</strong>
                  </p>
                  <p>From: {transfer.from}</p>
                  <p>To: {transfer.to}</p>
                </div>
              ))}
              {detail.otherInstructions > 0 && (
                <p>
                  {detail.otherInstructions} additional instruction(s) are not
                  decoded here. Check the explorer for full details.
                </p>
              )}
              <p>Network fee: {formatLamports(detail.fee)} SOL</p>
            </>
          )}
          <p className="solana-activity__detail">Signature: {selected}</p>
          <a
            href={`https://explorer.solana.com/tx/${selected}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
          >
            View on Solana Explorer ↗
          </a>
        </>
      ) : (
        <>
          <h2>Recent activity</h2>
          {failed && (
            <p role="alert">Could not load activity. Refresh to try again.</p>
          )}
          {!failed && !activity && <p>Loading activity…</p>}
          {activity?.length === 0 && <p>No transactions yet.</p>}
          {activity?.slice(0, showAll ? undefined : 5).map((item) => (
            <button
              type="button"
              className="solana-activity__row"
              key={item.signature}
              onClick={() => setSelected(item.signature)}
            >
              <span>
                <b>Solana transaction</b>
                <small>
                  {item.blockTime === null
                    ? 'Time unavailable'
                    : new Date(item.blockTime * 1000).toLocaleString()}
                </small>
                <small>
                  {item.signature.slice(0, 8)}…{item.signature.slice(-6)}
                </small>
              </span>
              <strong>
                {item.status === 'success' ? 'Confirmed' : 'Failed'} →
              </strong>
            </button>
          ))}
          {!!activity && activity.length > 5 && (
            <Button type="link" onClick={() => setShowAll(!showAll)}>
              {showAll
                ? 'Show less'
                : `Show all ${activity.length} transactions`}
            </Button>
          )}
          <p className="solana-assets__hint">
            Activity is provided by the public Devnet RPC.
          </p>
        </>
      )}
    </section>
  );
};
