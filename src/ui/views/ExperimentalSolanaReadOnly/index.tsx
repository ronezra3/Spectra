import React, { useEffect, useRef, useState } from 'react';
import {
  parseSolanaReadOnlyAddress,
  SolanaReadOnlyAddress,
} from '@/chains/solana/readOnlyAddress';
import {
  formatLamports,
  getDevnetBalance,
} from '@/chains/solana/devnetBalance';

/** Development-only public-address inspection, with an explicit devnet lookup. */
const ExperimentalSolanaReadOnly = () => {
  const [input, setInput] = useState('');
  const [address, setAddress] = useState<SolanaReadOnlyAddress | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<AbortController | null>(null);

  const clearLookup = () => {
    pending.current?.abort();
    pending.current = null;
    setBalance(null);
    setLoading(false);
    setFailed(false);
  };
  useEffect(
    () => () => {
      const controller = pending.current;
      pending.current = null;
      controller?.abort();
    },
    []
  );

  const lookup = async () => {
    if (!address || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setFailed(false);
    setBalance(null);
    try {
      const result = await getDevnetBalance(address.address, controller.signal);
      if (pending.current === controller) setBalance(result);
    } catch {
      if (pending.current === controller) setFailed(true);
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setLoading(false);
      }
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 560, margin: 'auto' }}>
      <h1>Solana address viewer</h1>
      <p>Experimental, read-only and temporary. Use test addresses only.</p>
      <p>
        Enter a public address only. Never enter a seed phrase or private key.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          clearLookup();
          const result = parseSolanaReadOnlyAddress(input);
          setAddress(result);
          setInvalid(!result);
        }}
      >
        <label htmlFor="solana-address">Solana public address</label>
        <input
          id="solana-address"
          value={input}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            clearLookup();
            setInput(event.target.value);
            setAddress(null);
            setInvalid(false);
          }}
          style={{ display: 'block', width: '100%', margin: '12px 0' }}
        />
        <button type="submit">View address</button>
      </form>
      {invalid && <p role="alert">Enter a valid 32-byte Base58 address.</p>}
      {address && (
        <section aria-label="Read-only address">
          <h2>Read-only address</h2>
          <p style={{ overflowWrap: 'anywhere' }}>{address.address}</p>
          <p>No ownership, connection or signing capability is implied.</p>
          <p>
            Checking the balance sends this public address to Solana Labs’
            public devnet RPC (api.devnet.solana.com).
          </p>
          <button type="button" disabled={loading} onClick={lookup}>
            {loading ? 'Checking devnet balance…' : 'Check devnet balance'}
          </button>
          {balance !== null && (
            <p>Devnet balance: {formatLamports(balance)} SOL</p>
          )}
          {failed && (
            <p role="alert">Could not load devnet balance. Try again.</p>
          )}
        </section>
      )}
    </main>
  );
};

export default ExperimentalSolanaReadOnly;
