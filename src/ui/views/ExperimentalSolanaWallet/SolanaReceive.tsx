import React from 'react';
import { Button } from 'antd';
import QRCode from 'qrcode.react';
import { copyAddress } from '@/ui/utils/clipboard';

export const SolanaReceive = ({ address }: { address: string }) => (
  <section
    className="solana-wallet__card solana-assets__receive"
    aria-label="Receive Solana"
  >
    <h2>Receive SOL and tokens</h2>
    <p>Solana Devnet only</p>
    <QRCode value={address} size={160} />
    <code>{address}</code>
    <Button type="primary" onClick={() => void copyAddress(address)}>
      Copy address
    </Button>
    <p className="solana-wallet__notice">
      Only send Solana Devnet assets to this address.
    </p>
  </section>
);
