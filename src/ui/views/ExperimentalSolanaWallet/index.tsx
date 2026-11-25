import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from 'ui/utils';
import { Button } from 'antd';
import { useHistory } from 'react-router-dom';
import { SolanaAssets } from './SolanaAssets';
import { SolanaSend } from './SolanaSend';
import { SolanaReceive } from './SolanaReceive';
import { SolanaActivity } from './SolanaActivity';
import './style.less';

type Status = {
  exists: boolean;
  unlocked: boolean;
  accounts: string[];
  selected: { address: string; cluster: 'solana:devnet' } | null;
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
  const [password, setPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [index, setIndex] = useState('0');
  const [busy, setBusy] = useState(false);
  const [sendPending, setSendPending] = useState(false);
  const [error, setError] = useState('');
  const [assetRefresh, setAssetRefresh] = useState(0);
  const [view, setView] = useState<
    'overview' | 'send' | 'receive' | 'activity' | 'accounts' | 'restore'
  >('overview');
  const refreshTimer = useRef<number>();

  useEffect(() => {
    onPendingChange?.(sendPending);
  }, [sendPending, onPendingChange]);

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
      () => {
        if (active) setError('Could not load the experimental Solana vault.');
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
      setPassword('');
      setMnemonic('');
      setBusy(false);
    }
  };

  return (
    <main className="solana-wallet">
      <button
        className="solana-wallet__back"
        type="button"
        disabled={sendPending}
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
          Never use real keys or funds. The Solana vault is separate from
          Ethereum, has an independent password, and locks when the wallet
          locks.
        </details>
      </div>
      {error && <p role="alert">{error}</p>}
      {!status ? (
        <p>Loading…</p>
      ) : (
        <>
          {!status.unlocked ? (
            <form
              className="solana-wallet__card"
              onSubmit={(event) => {
                event.preventDefault();
                void perform(() =>
                  status.exists
                    ? wallet.experimentalSolanaUnlock(password)
                    : wallet.experimentalSolanaCreate(password)
                );
              }}
            >
              <label
                className="solana-wallet__field"
                htmlFor="solana-vault-password"
              >
                Solana test vault password
                <input
                  id="solana-vault-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <Button
                type="primary"
                htmlType="submit"
                disabled={busy || !password}
              >
                {status.exists ? 'Unlock test vault' : 'Create test vault'}
              </Button>
            </form>
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
              {!status.selected && view === 'overview' && (
                <section className="solana-wallet__card">
                  <h2>Add a Solana test account</h2>
                  <p>
                    Restore a disposable test account to start using Solana
                    Devnet.
                  </p>
                  <Button type="primary" onClick={() => setView('restore')}>
                    Restore test account
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void perform(() => wallet.experimentalSolanaLock())
                    }
                  >
                    Lock Solana vault
                  </Button>
                </section>
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
                  <Button type="primary" onClick={() => setView('restore')}>
                    Restore test account
                  </Button>
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
              {view === 'restore' && (
                <form
                  className="solana-wallet__card"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const number = Number(index);
                    if (
                      !Number.isSafeInteger(number) ||
                      number < 0 ||
                      number >= 0x80000000
                    ) {
                      setError('Enter a valid account index.');
                      return;
                    }
                    void perform(async () => {
                      await wallet.experimentalSolanaImport(
                        password,
                        mnemonic,
                        number
                      );
                      setView('overview');
                    });
                  }}
                >
                  <h2>Restore a test account</h2>
                  <p>
                    Path: m/44'/501'/account'/0'. Do not enter a real recovery
                    phrase.
                  </p>
                  <label
                    className="solana-wallet__field"
                    htmlFor="solana-test-mnemonic"
                  >
                    Disposable test recovery phrase
                    <textarea
                      id="solana-test-mnemonic"
                      autoComplete="off"
                      spellCheck={false}
                      value={mnemonic}
                      onChange={(event) => setMnemonic(event.target.value)}
                    />
                  </label>
                  <label
                    className="solana-wallet__field"
                    htmlFor="solana-test-index"
                  >
                    Account index
                    <input
                      id="solana-test-index"
                      type="number"
                      min="0"
                      max="2147483647"
                      value={index}
                      onChange={(event) => setIndex(event.target.value)}
                    />
                  </label>
                  <label
                    className="solana-wallet__field"
                    htmlFor="solana-test-password"
                  >
                    Solana test vault password
                    <input
                      id="solana-test-password"
                      type="password"
                      autoComplete="off"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                  <Button
                    type="primary"
                    htmlType="submit"
                    disabled={busy || !password || !mnemonic}
                  >
                    Restore test account
                  </Button>
                </form>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
};

export default ExperimentalSolanaWallet;
