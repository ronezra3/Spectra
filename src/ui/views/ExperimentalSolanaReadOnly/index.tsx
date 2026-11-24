import React, { useState } from 'react';
import {
  parseSolanaReadOnlyAddress,
  SolanaReadOnlyAddress,
} from '@/chains/solana/readOnlyAddress';

/** Development-only address inspection; never connects to a dapp or RPC. */
const ExperimentalSolanaReadOnly = () => {
  const [input, setInput] = useState('');
  const [address, setAddress] = useState<SolanaReadOnlyAddress | null>(null);
  const [invalid, setInvalid] = useState(false);

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
          <p>
            No ownership, balance, connection or signing capability is implied.
          </p>
        </section>
      )}
    </main>
  );
};

export default ExperimentalSolanaReadOnly;
