import React, { useState } from 'react';
import { Button } from 'antd';
import { useWallet } from 'ui/utils';

type VaultStatus = {
  exists: boolean;
  unlocked: boolean;
  custody?: 'shared' | 'separate';
};
type Mode = 'choice' | 'unlock' | 'create' | 'restore';

/** Devnet onboarding: the generated phrase is only shown in the extension UI. */
export const SolanaOnboarding = ({
  initialStatus,
  onDone,
  onCancel,
  onPendingChange,
}: {
  initialStatus: VaultStatus;
  onDone: () => Promise<void>;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) => {
  const wallet = useWallet();
  const [status, setStatus] = useState(initialStatus);
  const [mode, setMode] = useState<Mode>('choice');
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [index, setIndex] = useState('0');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);

  const createPhrase = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      setPhrase(await wallet.generateMnemonic());
      setSaved(false);
      setMode('create');
    } catch {
      setError('Could not generate a test recovery phrase.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || uncertain || !password || (mode === 'create' && !saved)) return;
    const accountIndex = Number(index);
    if (
      mode !== 'unlock' &&
      (!phrase.trim() ||
        !Number.isSafeInteger(accountIndex) ||
        accountIndex < 0 ||
        accountIndex >= 0x80000000)
    ) {
      setError('Enter a test recovery phrase and a valid account index.');
      return;
    }
    setBusy(true);
    onPendingChange?.(true);
    setError('');
    try {
      const current = await wallet.experimentalSolanaStatus();
      if (
        current.exists !== status.exists ||
        current.custody !== status.custody
      )
        throw new Error('Solana custody changed');
      if (!current.exists && mode !== 'unlock') {
        await wallet.experimentalSolanaCreateNative(
          password,
          phrase.trim(),
          mode === 'create' ? 0 : accountIndex
        );
      } else {
        if (!current.unlocked) await wallet.experimentalSolanaUnlock(password);
        if (mode !== 'unlock') {
          const importAccount =
            current.custody === 'shared'
              ? wallet.experimentalSolanaAddShared
              : wallet.experimentalSolanaImport;
          await importAccount(
            password,
            phrase.trim(),
            mode === 'create' ? 0 : accountIndex
          );
        }
      }
      setPhrase('');
      await onDone();
    } catch {
      if (
        (status.custody === 'shared' || !status.exists) &&
        mode !== 'unlock'
      ) {
        setUncertain(true);
        setError(
          'The account may or may not have been added. Reopen the wallet and check its accounts before trying again.'
        );
      } else {
        setError(
          'Could not complete the operation. Check the test password, recovery phrase, and wallet lock state.'
        );
      }
      try {
        setStatus(await wallet.experimentalSolanaStatus());
      } catch {
        /* Keep the current view. */
      }
    } finally {
      setPassword('');
      setBusy(false);
      onPendingChange?.(false);
    }
  };

  if (mode === 'choice')
    return (
      <section className="solana-wallet__card solana-onboarding">
        <h2>
          {status.custody === 'shared' && !status.unlocked
            ? 'Solana account locked'
            : 'Set up Solana'}
        </h2>
        <p>
          {status.custody === 'shared' && !status.unlocked
            ? 'Use your wallet password to unlock the Solana test account.'
            : 'Create a new disposable Devnet account or restore one with a test recovery phrase.'}
        </p>
        {(status.custody !== 'shared' || status.unlocked) && (
          <>
            <Button
              type="primary"
              disabled={busy}
              onClick={() => void createPhrase()}
            >
              Create a test account
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setPhrase('');
                setMode('restore');
              }}
            >
              Restore a test account
            </Button>
          </>
        )}
        {status.exists && !status.unlocked && (
          <Button disabled={busy} onClick={() => setMode('unlock')}>
            Unlock existing Solana wallet
          </Button>
        )}
        {onCancel && (
          <Button disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    );

  return (
    <form className="solana-wallet__card solana-onboarding" onSubmit={submit}>
      <button
        type="button"
        className="solana-wallet__back"
        disabled={busy}
        onClick={() => {
          setPhrase('');
          setPassword('');
          setError('');
          setMode('choice');
        }}
      >
        ← Back
      </button>
      <h2>
        {mode === 'create'
          ? 'Create a test account'
          : mode === 'restore'
          ? 'Restore a test account'
          : 'Unlock Solana wallet'}
      </h2>
      {mode === 'create' && (
        <>
          <p>
            Save this disposable test recovery phrase before continuing. It is
            the only way to restore this account. Never use it with real funds.
          </p>
          <div className="solana-onboarding__phrase">{phrase}</div>
          <label className="solana-onboarding__confirm">
            <input
              type="checkbox"
              checked={saved}
              onChange={(event) => setSaved(event.target.checked)}
            />{' '}
            I saved this test recovery phrase
          </label>
        </>
      )}
      {mode === 'restore' && (
        <>
          <p>
            Use a disposable test recovery phrase only. Path:
            m/44'/501'/account'/0'.
          </p>
          <label className="solana-wallet__field">
            Disposable test recovery phrase
            <textarea
              autoComplete="off"
              spellCheck={false}
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
            />
          </label>
          <label className="solana-wallet__field">
            Account index
            <input
              type="number"
              min="0"
              max="2147483647"
              value={index}
              onChange={(event) => setIndex(event.target.value)}
            />
          </label>
        </>
      )}
      <label className="solana-wallet__field">
        {status.custody === 'shared' || !status.exists
          ? 'Wallet password'
          : 'Solana test vault password'}
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <p className="solana-wallet__notice">
        {status.custody === 'shared' || !status.exists
          ? 'Use the password for the main wallet.'
          : 'This password is independent of the Ethereum wallet password.'}
      </p>
      {error && <p role="alert">{error}</p>}
      <Button
        type="primary"
        htmlType="submit"
        disabled={
          busy ||
          uncertain ||
          !password ||
          (mode === 'create' && !saved) ||
          (mode === 'restore' && !phrase.trim())
        }
      >
        {mode === 'unlock'
          ? 'Unlock'
          : mode === 'create'
          ? 'Create account'
          : 'Restore account'}
      </Button>
    </form>
  );
};
