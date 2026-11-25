import React, { useEffect, useState } from 'react';
import { Button, Skeleton } from 'antd';
import { copyAddress } from '@/ui/utils/clipboard';
import {
  RcIconReceiveCC,
  RcIconSendCC,
  RcIconTransactionsCC,
  RcIconManageCC,
} from '@/ui/assets/dashboard/panel';
import {
  formatLamports,
  getDevnetBalance,
} from '@/chains/solana/devnetBalance';
import {
  DevnetToken,
  formatTokenAmount,
  getDevnetTokens,
} from '@/chains/solana/devnetTokens';

export const SolanaAssets = ({
  address,
  onReceive,
  onSend,
  onActivity,
  onAccounts,
}: {
  address: string;
  onReceive: () => void;
  onSend: () => void;
  onActivity: () => void;
  onAccounts: () => void;
}) => {
  const [balance, setBalance] = useState<number | null>(null);
  const [tokens, setTokens] = useState<DevnetToken[] | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const [tokenError, setTokenError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setBalance(null);
    setTokens(null);
    setSelectedMint(null);
    setBalanceError(false);
    setTokenError(false);
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
  const selectedToken = tokens?.find((token) => token.mint === selectedMint);
  if (selectedToken) {
    return (
      <section className="solana-wallet__card solana-assets__detail">
        <Button type="link" onClick={() => setSelectedMint(null)}>
          ← Back to assets
        </Button>
        <h2>Unverified token</h2>
        <strong>
          {formatTokenAmount(selectedToken.amount, selectedToken.decimals)}
        </strong>
        <p>Solana Devnet</p>
        <p>Mint address</p>
        <code>{selectedToken.mint}</code>
        <Button onClick={() => void copyAddress(selectedToken.mint)}>
          Copy mint address
        </Button>
        <p className="solana-wallet__notice">
          Token names, prices, and authenticity are not verified. Token
          transfers are not available in this experimental wallet.
        </p>
      </section>
    );
  }
  return (
    <section className="solana-assets" aria-label="Solana assets">
      <div className="solana-assets__balance">
        <button
          className="solana-assets__account"
          type="button"
          onClick={onAccounts}
        >
          <span>Solana account</span>
          <span>
            {address.slice(0, 6)}...{address.slice(-6)} ›
          </span>
        </button>
        <span>Solana Devnet balance</span>
        {balance !== null ? (
          <strong>{formatLamports(balance)} SOL</strong>
        ) : balanceError ? (
          <strong>Balance unavailable</strong>
        ) : (
          <Skeleton.Input active size="small" />
        )}
      </div>
      <div className="solana-assets__actions">
        <button type="button" onClick={onSend}>
          <RcIconSendCC aria-hidden="true" />
          Send
        </button>
        <button type="button" onClick={onReceive}>
          <RcIconReceiveCC aria-hidden="true" />
          Receive
        </button>
        <button type="button" onClick={onActivity}>
          <RcIconTransactionsCC aria-hidden="true" />
          Transactions
        </button>
        <button type="button" onClick={onAccounts}>
          <RcIconManageCC aria-hidden="true" />
          Accounts
        </button>
      </div>
      <div className="solana-assets__section-heading">
        <h2>Assets</h2>
        <button type="button" onClick={() => setRefresh((value) => value + 1)}>
          Refresh
        </button>
      </div>
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
      {!!tokens?.length && (
        <details className="solana-assets__unknown">
          <summary>Unverified tokens ({tokens.length})</summary>
          {tokens.map((token) => (
            <button
              type="button"
              className="solana-assets__row solana-assets__token"
              key={token.mint}
              onClick={() => setSelectedMint(token.mint)}
            >
              <span className="solana-assets__icon">T</span>
              <span>
                <b>Unknown token</b>
                <small title={token.mint}>
                  {token.mint.slice(0, 8)}…{token.mint.slice(-6)}
                </small>
              </span>
              <strong>
                {formatTokenAmount(token.amount, token.decimals)} →
              </strong>
            </button>
          ))}
        </details>
      )}
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
