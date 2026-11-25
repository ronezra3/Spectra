import React, { useState } from 'react';
import { Button } from 'antd';
import { useWallet } from 'ui/utils';
import { parseSolanaReadOnlyAddress } from '@/chains/solana/readOnlyAddress';

export function solToLamports(value: string): string | null {
  const match = /^(0|[1-9][0-9]{0,10})(?:\.([0-9]{1,9}))?$/.exec(value);
  if (!match) return null;
  const amount =
    BigInt(match[1]) * 1000000000n + BigInt((match[2] || '').padEnd(9, '0'));
  return amount > 0n && amount <= 18446744073709551615n
    ? amount.toString()
    : null;
}

export const SolanaSend = ({
  address,
  onSent,
}: {
  address: string;
  onSent: () => void;
}) => {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signature, setSignature] = useState('');
  const lamports = solToLamports(amount);
  const valid =
    parseSolanaReadOnlyAddress(recipient)?.address === recipient &&
    lamports !== null;
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || !lamports || busy) return;
    setBusy(true);
    setError('');
    setSignature('');
    try {
      const result = await wallet.experimentalSolanaSend(
        address,
        recipient,
        lamports
      );
      setSignature(result);
      setRecipient('');
      setAmount('');
      onSent();
    } catch {
      setError(
        'Transfer was not confirmed. It may already have been submitted; check your account activity before retrying.'
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="solana-wallet__card">
      <Button type="primary" onClick={() => setOpen(!open)} disabled={busy}>
        {open ? 'Close send' : 'Send SOL'}
      </Button>
      {open && (
        <form onSubmit={send}>
          <h2>Send SOL · Devnet</h2>
          <label className="solana-wallet__field">
            Recipient address
            <input
              value={recipient}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </label>
          <label className="solana-wallet__field">
            Amount in SOL
            <input
              value={amount}
              inputMode="decimal"
              autoComplete="off"
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <p className="solana-wallet__notice">
            Network fees are additional and are not estimated. You will review
            the exact transfer before signing.
          </p>
          <Button type="primary" htmlType="submit" disabled={!valid || busy}>
            {busy ? 'Waiting for approval…' : 'Review transfer'}
          </Button>
        </form>
      )}
      {signature && (
        <p>
          Submitted to Devnet.{' '}
          <a
            href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction
          </a>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
};
