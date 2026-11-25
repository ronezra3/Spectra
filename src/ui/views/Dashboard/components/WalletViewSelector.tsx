import React from 'react';

export type WalletView = 'evm' | 'solana';

/** Dashboard presentation only: does not switch a dapp's network or account. */
export const WalletViewSelector = ({
  value,
  disabled,
  onChange,
}: {
  value: WalletView;
  disabled: boolean;
  onChange: (view: WalletView) => void;
}) => (
  <label className="wallet-view-selector">
    <span>Wallet view</span>
    <select
      aria-label="Wallet view"
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const next = event.currentTarget.value;
        if (!disabled && (next === 'evm' || next === 'solana')) onChange(next);
      }}
    >
      <option value="evm">All EVM networks</option>
      <option value="solana">Solana Devnet</option>
    </select>
  </label>
);
