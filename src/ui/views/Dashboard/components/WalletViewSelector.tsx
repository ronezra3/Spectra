import React from 'react';
import {
  EVM_DASHBOARD_NETWORKS,
  isWalletView,
  WalletView,
} from './dashboardNetworks';
export type { WalletView } from './dashboardNetworks';

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
    <span>Network</span>
    <select
      aria-label="Network"
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const next = event.currentTarget.value;
        if (!disabled && isWalletView(next)) onChange(next);
      }}
    >
      <option value="evm">All EVM networks</option>
      <option value="solana">Solana Devnet</option>
      {EVM_DASHBOARD_NETWORKS.map((chain) => (
        <option key={chain.id} value={`evm:${chain.id}`}>
          {chain.name}
        </option>
      ))}
    </select>
  </label>
);
