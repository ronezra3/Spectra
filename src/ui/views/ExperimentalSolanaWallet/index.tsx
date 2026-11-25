import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from 'ui/utils';
import { Button } from 'antd';
import { useHistory } from 'react-router-dom';
import { SolanaAssets } from './SolanaAssets';
import { SolanaSend } from './SolanaSend';
import { SolanaReceive } from './SolanaReceive';
import { SolanaActivity } from './SolanaActivity';
import { SolanaOnboarding } from './SolanaOnboarding';
import { SolanaMigration } from './SolanaMigration';
import './style.less';

type Status = {
  exists: boolean;
  unlocked: boolean;
  accounts: string[];
  selected: { address: string; cluster: 'solana:devnet' } | null;
  custody?: 'shared' | 'separate';
};

/** Opt-in development view. No real credentials or funds should be used. */
const ExperimentalSolanaWallet = ({
  onExit,
  onPendingChange,
}: {
  onExit?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) => {
  const wallet = useWallet();
  const history = useHistory();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendPending, setSendPending] = useState(false);
  const [migrationPending, setMigrationPending] = useState(false);
  const [error, setError] = useState('');
  const [assetRefresh, setAssetRefresh] = useState(0);
  const [view, setView] = useState<
    | 'overview'
    | 'send'
    | 'receive'
    | 'activity'
    | 'accounts'
    | 'setup'
    | 'migration'
  >('overview');
  const refreshTimer = useRef<number>();

  useEffect(() => {
    onPendingChange?.(sendPending || migrationPending);
  }, [sendPending, migrationPending, onPendingChange]);

  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);

  const refresh = useCallback(async () => {
    setStatus(await wallet.experimentalSolanaStatus());
  }, [wallet]);

  useEffect(() => {
    let active = true;
    wallet.experimentalSolanaStatus().then(
      (next) => {
        if (active) setStatus(next);
      },
      (cause) => {
        if (active)
          setError(
            cause?.message === 'Solana migration requires reconciliation'
              ? 'The original test vault changed after migration. Reconciliation is required; the original vault has been retained.'
              : 'Could not load the experimental Solana vault.'
          );
      }
    );
    return () => {
      active = false;
    };
  }, [wallet]);

  const perform = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operation();
      await refresh();
    } catch (cause) {
      // Only display explicitly recognized messages: unexpected errors can
      // contain the recovery phrase or other sensitive input.
      const message = (cause as { message?: unknown } | null)?.message;
      const known: Record<string, string> = {
        'Solana vault decryption failed':
          'Could not decrypt the Solana vault. Check the test vault password; the vault data may also be damaged.',
        'Invalid mnemonic': 'The test recovery phrase is invalid.',
        'Wallet is locked': 'Unlock the Rabby wallet before using Solana.',
        'Solana vault is locked': 'Unlock the Solana test vault first.',
        'Solana account already exists': 'This test account already exists.',
        'Solana migration requires reconciliation':
          'The original test vault changed after migration. Reconciliation is required; the original vault has been retained.',
        'Could not read Solana vault storage':
          'Could not read Solana vault storage.',
        'Could not write Solana vault storage':
          'Could not write Solana vault storage.',
      };
      setError(
        typeof message === 'string' &&
          Object.prototype.hasOwnProperty.call(known, message)
          ? known[message]
          : 'The operation failed. Check the test password, test recovery phrase and wallet lock state.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="solana-wallet">
      <button
        className="solana-wallet__back"
        type="button"
        disabled={sendPending || migrationPending}
        onClick={() =>
          view === 'overview' || !status?.unlocked
            ? onExit
              ? onExit()
              : history.push('/dashboard')
            : setView('overview')
        }
      >
        {view === 'overview' || !status?.unlocked
          ? '← Back to wallet'
          : '← Back to Solana'}
      </button>
      <header className="solana-wallet__header">
        <h1>Solana wallet</h1>
        <span className="solana-wallet__badge">Devnet</span>
      </header>
      <div className="solana-wallet__devnet-notice">
        Devnet only · Use disposable test wallets and test funds.
        <details>
          <summary>About this wallet</summary>
          Never use real keys or funds.{' '}
          {status?.custody === 'shared'
            ? 'This test account uses the main wallet vault and its password.'
            : 'The Solana vault is separate from Ethereum, has an independent password, and locks when the wallet locks.'}
        </details>
      </div>
      {error && <p role="alert">{error}</p>}
      {!status ? (
        error ? null : (
          <p>Loading…</p>
        )
      ) : (
        <>
          {!status.unlocked ||
          view === 'setup' ||
          (!status.selected && view === 'overview') ? (
            <SolanaOnboarding
              initialStatus={status}
              onDone={async () => {
                await refresh();
                setView('overview');
              }}
              onCancel={
                status.unlocked && status.selected
                  ? () => setView('overview')
                  : undefined
              }
            />
          ) : (
            <>
              {status.selected && view === 'overview' && (
                <>
                  <SolanaAssets
                    key={`assets:${status.selected.address}:${assetRefresh}`}
                    address={status.selected.address}
                    onSend={() => setView('send')}
                    onReceive={() => setView('receive')}
                    onActivity={() => setView('activity')}
                    onAccounts={() => setView('accounts')}
                  />
                </>
              )}
              {status.selected && view === 'send' && (
                <SolanaSend
                  key={status.selected.address}
                  address={status.selected.address}
                  onPendingChange={setSendPending}
                  onSent={() => {
                    setAssetRefresh((value) => value + 1);
                    window.clearTimeout(refreshTimer.current);
                    refreshTimer.current = window.setTimeout(
                      () => setAssetRefresh((value) => value + 1),
                      4000
                    );
                  }}
                />
              )}
              {status.selected && view === 'receive' && (
                <SolanaReceive address={status.selected.address} />
              )}
              {status.selected && view === 'activity' && (
                <SolanaActivity
                  key={`activity:${status.selected.address}:${assetRefresh}`}
                  address={status.selected.address}
                />
              )}
              {view === 'migration' && status.custody !== 'shared' && (
                <SolanaMigration
                  onPendingChange={setMigrationPending}
                  onDone={async () => {
                    await refresh();
                    setView('overview');
                  }}
                />
              )}
              {view === 'accounts' && (
                <section className="solana-wallet__card">
                  <h2>Test accounts</h2>
                  {status.accounts.length === 0 && (
                    <p>No Solana test accounts yet.</p>
                  )}
                  <ul>
                    {status.accounts.map((address) => (
                      <li key={address} className="solana-wallet__account">
                        {address}{' '}
                        {status.selected?.address === address ? (
                          '(selected)'
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void perform(async () => {
                                await wallet.experimentalSolanaSelect(address);
                                setView('overview');
                              })
                            }
                          >
                            Select
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {status.custody === 'shared' ? (
                    <p>
                      Adding shared Solana test accounts is not available yet.
                    </p>
                  ) : (
                    <Button type="primary" onClick={() => setView('setup')}>
                      Add test account
                    </Button>
                  )}
                  {status.custody !== 'shared' && status.selected && (
                    <Button
                      disabled={busy}
                      onClick={() => setView('migration')}
                    >
                      Move test account to wallet vault
                    </Button>
                  )}
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await wallet.experimentalSolanaLock();
                        setView('overview');
                      })
                    }
                  >
                    Lock Solana vault
                  </Button>
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
};

export default ExperimentalSolanaWallet;
