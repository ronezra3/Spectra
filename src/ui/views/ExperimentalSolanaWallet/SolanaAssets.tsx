import React, { useEffect, useState } from 'react';
import { Button, Skeleton } from 'antd';
import QRCode from 'qrcode.react';
import { copyAddress } from '@/ui/utils/clipboard';
import {
  formatLamports,
  getDevnetBalance,
} from '@/chains/solana/devnetBalance';
import {
  DevnetToken,
  formatTokenAmount,
  getDevnetTokens,
} from '@/chains/solana/devnetTokens';

export const SolanaAssets = ({ address }: { address: string }) => {
  const [balance, setBalance] = useState<number | null>(null);
  const [tokens, setTokens] = useState<DevnetToken[] | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const [tokenError, setTokenError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [receiving, setReceiving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setBalance(null);
    setTokens(null);
    setBalanceError(false);
    setTokenError(false);
    setReceiving(false);
    getDevnetBalance(address, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setBalance(value);
      },
      () => {
        if (!controller.signal.aborted) setBalanceError(true);
      }
    );
    getDevnetTokens(address, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setTokens(value);
      },
      () => {
        if (!controller.signal.aborted) setTokenError(true);
      }
    );
    return () => controller.abort();
  }, [address, refresh]);
  return (
    <section className="solana-assets" aria-label="Solana assets">
      <div className="solana-assets__balance">
        <span>Solana Devnet balance</span>
        {balance !== null ? (
          <strong>{formatLamports(balance)} SOL</strong>
        ) : balanceError ? (
          <strong>Balance unavailable</strong>
        ) : (
          <Skeleton.Input active size="small" />
        )}
        <div className="solana-assets__actions">
          <Button onClick={() => setReceiving(!receiving)}>Receive</Button>
          <Button onClick={() => setRefresh((value) => value + 1)}>
            Refresh
          </Button>
        </div>
      </div>
      {receiving && (
        <div className="solana-assets__receive">
          <QRCode value={address} size={144} />
          <p>Receive Solana Devnet assets only</p>
          <code>{address}</code>
          <Button onClick={() => void copyAddress(address)}>
            Copy address
          </Button>
        </div>
      )}
      <h2>Assets</h2>
      <div className="solana-assets__row">
        <span className="solana-assets__icon">S</span>
        <span>
          <b>Solana</b>
          <small>SOL · Devnet</small>
        </span>
        <strong>
          {balance === null ? '—' : `${formatLamports(balance)} SOL`}
        </strong>
      </div>
      {tokens?.map((token) => (
        <div className="solana-assets__row" key={token.mint}>
          <span className="solana-assets__icon">T</span>
          <span>
            <b>Unknown token</b>
            <small title={token.mint}>
              {token.mint.slice(0, 8)}…{token.mint.slice(-6)}
            </small>
          </span>
          <strong>{formatTokenAmount(token.amount, token.decimals)}</strong>
        </div>
      ))}
      {tokenError && (
        <p role="alert">Could not load token balances. Try refreshing.</p>
      )}
      {!tokens && !tokenError && <p>Loading token balances…</p>}
      <p className="solana-assets__hint">
        Balances are loaded from the public Solana Devnet RPC. Token names and
        prices are not verified.
      </p>
    </section>
  );
};
