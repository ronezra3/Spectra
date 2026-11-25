import React, { useEffect, useState } from 'react';
import { Button } from 'antd';
import { useWallet } from 'ui/utils';
import type { MigrationPreflight } from '@/chains/solana/migrationPreflight';

/** Explicit Devnet-only copy; the separate source vault is always retained. */
export const SolanaMigration = ({
  onDone,
  onPendingChange,
}: {
  onDone: () => Promise<void>;
  onPendingChange: (pending: boolean) => void;
}) => {
  const wallet = useWallet();
  const [preflight, setPreflight] = useState<MigrationPreflight | null>(null);
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    wallet.experimentalSolanaMigrationPreflight().then(
      (result) => {
        if (active) setPreflight(result);
      },
      () => {
        if (active) setError('Could not check migration readiness.');
      }
    );
    return () => {
      active = false;
    };
  }, [wallet]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !confirmed || !password || preflight?.state !== 'ready') return;
    setBusy(true);
    onPendingChange(true);
    setError('');
    try {
      await wallet.experimentalSolanaMigrate(password);
      await onDone();
    } catch (cause) {
      const message = (cause as { message?: unknown } | null)?.message;
      if (message !== 'Solana vault decryption failed') setPreflight(null);
      setError(
        message === 'Solana vault decryption failed'
          ? 'Could not unlock the original test vault. Check its password.'
          : 'The copy may or may not have completed. The original test vault was retained. Reopen the wallet and check the account before retrying.'
      );
    } finally {
      setPassword('');
      setBusy(false);
      onPendingChange(false);
    }
  };

  return (
    <form className="solana-wallet__card solana-onboarding" onSubmit={submit}>
      <h2>Move test account to wallet vault</h2>
      <p>
        Copy the Solana Devnet test account into the main wallet vault. The
        original encrypted test vault is retained.
      </p>
      <p>
        The main wallet password will unlock the copied account. Adding shared
        Solana accounts is not available yet.
      </p>
      {!preflight && !error && <p>Checking migration readiness…</p>}
      {preflight?.state === 'ready' && (
        <p>{preflight.sourceCount} test account(s) ready to copy.</p>
      )}
      {preflight && preflight.state !== 'ready' && (
        <p role="alert">
          Migration is unavailable ({preflight.state}). No account was moved.
        </p>
      )}
      <label className="solana-wallet__field">
        Original Solana test vault password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label className="solana-onboarding__confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />{' '}
        I understand this is for disposable Devnet test accounts only.
      </label>
      {error && <p role="alert">{error}</p>}
      <Button
        type="primary"
        htmlType="submit"
        disabled={
          busy || !confirmed || !password || preflight?.state !== 'ready'
        }
      >
        {busy ? 'Copying…' : 'Copy test account'}
      </Button>
    </form>
  );
};
