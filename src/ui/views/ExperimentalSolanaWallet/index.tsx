import React, { useCallback, useEffect, useState } from 'react';
import { useWallet } from 'ui/utils';
import { Button } from 'antd';
import { useHistory } from 'react-router-dom';
import { SolanaAssets } from './SolanaAssets';
import { SolanaSend } from './SolanaSend';
import { SolanaActivity } from './SolanaActivity';
import './style.less';

type Status = {
  exists: boolean;
  unlocked: boolean;
  accounts: string[];
  selected: { address: string; cluster: 'solana:devnet' } | null;
};

/** Opt-in development view. No real credentials or funds should be used. */
const ExperimentalSolanaWallet = () => {
  const wallet = useWallet();
  const history = useHistory();
  const [status, setStatus] = useState<Status | null>(null);
  const [password, setPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [index, setIndex] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [assetRefresh, setAssetRefresh] = useState(0);

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
        onClick={() => history.push('/dashboard')}
      >
        ← Back to wallet
      </button>
      <header className="solana-wallet__header">
        <h1>Solana wallet</h1>
        <span className="solana-wallet__badge">Devnet</span>
      </header>
      <p className="solana-wallet__notice">
        Devnet only. Use disposable test wallets, test passwords and test
        recovery phrases. Never use real keys or funds.
      </p>
      <p className="solana-wallet__notice">
        The Solana vault is separate from Ethereum and locks when the wallet
        locks. Its password is independent.
      </p>
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
              {status.selected && (
                <SolanaAssets
                  key={`${status.selected.address}:${assetRefresh}`}
                  address={status.selected.address}
                />
              )}
              {status.selected && (
                <SolanaSend
                  key={status.selected.address}
                  address={status.selected.address}
                  onSent={() => setAssetRefresh((value) => value + 1)}
                />
              )}
              {status.selected && (
                <SolanaActivity
                  key={`${status.selected.address}:${assetRefresh}`}
                  address={status.selected.address}
                />
              )}
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
                            void perform(() =>
                              wallet.experimentalSolanaSelect(address)
                            )
                          }
                        >
                          Select
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
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
                  void perform(() =>
                    wallet.experimentalSolanaImport(password, mnemonic, number)
                  );
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
              <Button
                htmlType="button"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await wallet.experimentalSolanaLock();
                  })
                }
              >
                Lock Solana vault
              </Button>
            </>
          )}
        </>
      )}
    </main>
  );
};

export default ExperimentalSolanaWallet;
