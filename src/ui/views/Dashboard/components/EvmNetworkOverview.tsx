import React from 'react';
import type { Chain } from '@debank/common';
import type { Account } from '@/background/service/preference';
import { useHistory } from 'react-router-dom';
import useCurrentBalance from '@/ui/hooks/useCurrentBalance';
import { formatUsdValue } from '@/ui/utils';
import { AssetListContainer } from '@/ui/views/CommonPopup/AssetList/AssetListContainer';
import { RcIconReceiveCC, RcIconSendCC } from '@/ui/assets/dashboard/panel';

/** New opt-in dashboard scope; existing aggregate EVM pages remain unchanged. */
export const EvmNetworkOverview = ({
  chain,
  account,
}: {
  chain: Chain;
  account: Account | null;
}) => {
  const history = useHistory();
  const {
    balance,
    balanceLoading,
    success,
    missingList,
    matteredChainBalances,
  } = useCurrentBalance(account?.address, { update: true });
  const matching = matteredChainBalances.find(
    (item) => item.id === chain.serverId
  );
  const missing = missingList?.includes(chain.name);
  const value = !account
    ? 'No account'
    : !success || missing
    ? 'Balance unavailable'
    : balanceLoading || balance === null
    ? 'Loading balance…'
    : formatUsdValue(matching?.usd_value ?? 0);
  const send = () => {
    const query = new URLSearchParams({
      token: `${chain.serverId}:${chain.nativeTokenAddress}`,
      rbisource: 'dashboard',
    });
    history.push(`/send-token?${query.toString()}`);
  };
  const receive = () => {
    const query = new URLSearchParams({
      chain: chain.enum,
      rbisource: 'dashboard',
    });
    history.push(`/receive?${query.toString()}`);
  };
  return (
    <section
      className="evm-network-overview"
      aria-label={`${chain.name} network`}
    >
      <div className="evm-network-overview__balance">
        <button
          type="button"
          onClick={() => history.push('/switch-address')}
          disabled={!account}
        >
          {account
            ? `${account.address.slice(0, 8)}…${account.address.slice(-6)}`
            : 'No account'}{' '}
          ›
        </button>
        <span>{chain.name} assets · USD</span>
        <strong>{value}</strong>
      </div>
      <div className="evm-network-overview__actions">
        <button type="button" onClick={send} disabled={!account}>
          <RcIconSendCC aria-hidden="true" />
          Send
        </button>
        <button type="button" onClick={receive} disabled={!account}>
          <RcIconReceiveCC aria-hidden="true" />
          Receive
        </button>
      </div>
      {account && (
        <AssetListContainer
          key={`${account.address}:${chain.serverId}`}
          selectChainId={chain.serverId}
          visible
          showPerps={false}
          showNfts={false}
          onEmptyAssets={() => undefined}
        />
      )}
    </section>
  );
};
