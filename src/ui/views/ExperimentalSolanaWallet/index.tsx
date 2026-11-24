import React, { useCallback, useEffect, useState } from 'react';
import { useWallet } from 'ui/utils';

type Status = {
  exists: boolean;
  unlocked: boolean;
  accounts: string[];
  selected: { address: string; cluster: 'solana:devnet' } | null;
};

/** Opt-in development view. No real credentials or funds should be used. */
const ExperimentalSolanaWallet = () => {
  const wallet = useWallet();
  const [status, setStatus] = useState<Status | null>(null);
  const [password, setPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [index, setIndex] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    } catch {
      setError(
        'The operation failed. Check the test password, test recovery phrase and wallet lock state.'
      );
    } finally {
      setPassword('');
      setMnemonic('');
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 600, margin: 'auto' }}>
      <h1>Experimental Solana wallet</h1>
      <p>
        Devnet only. Use disposable test wallets, test passwords and test
        recovery phrases. Never use real keys or funds.
      </p>
      <p>
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
              onSubmit={(event) => {
                event.preventDefault();
                void perform(() =>
                  status.exists
                    ? wallet.experimentalSolanaUnlock(password)
                    : wallet.experimentalSolanaCreate(password)
                );
              }}
            >
              <label htmlFor="solana-vault-password">
                Solana test vault password
              </label>
              <input
                id="solana-vault-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="submit" disabled={busy || !password}>
                {status.exists ? 'Unlock test vault' : 'Create test vault'}
              </button>
            </form>
          ) : (
            <>
              <h2>Test accounts</h2>
              {status.accounts.length === 0 && (
                <p>No Solana test accounts yet.</p>
              )}
              <ul>
                {status.accounts.map((address) => (
                  <li key={address} style={{ overflowWrap: 'anywhere' }}>
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
              <form
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
                <label htmlFor="solana-test-mnemonic">
                  Disposable test recovery phrase
                </label>
                <textarea
                  id="solana-test-mnemonic"
                  autoComplete="off"
                  spellCheck={false}
                  value={mnemonic}
                  onChange={(event) => setMnemonic(event.target.value)}
                />
                <label htmlFor="solana-test-index">Account index</label>
                <input
                  id="solana-test-index"
                  type="number"
                  min="0"
                  max="2147483647"
                  value={index}
                  onChange={(event) => setIndex(event.target.value)}
                />
                <label htmlFor="solana-test-password">
                  Solana test vault password
                </label>
                <input
                  id="solana-test-password"
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button type="submit" disabled={busy || !password || !mnemonic}>
                  Restore test account
                </button>
              </form>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await wallet.experimentalSolanaLock();
                  })
                }
              >
                Lock Solana vault
              </button>
            </>
          )}
        </>
      )}
    </main>
  );
};

export default ExperimentalSolanaWallet;
