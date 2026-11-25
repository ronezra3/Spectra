import { SOLANA_DEVNET_RPC } from './devnetBalance';
import { parseSolanaReadOnlyAddress } from './readOnlyAddress';

const TOKEN_PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
] as const;

export type DevnetToken = { mint: string; amount: string; decimals: number };

/** Public, untrusted RPC data: token symbols and prices are intentionally not inferred. */
export async function getDevnetTokens(
  owner: string,
  signal?: AbortSignal
): Promise<DevnetToken[]> {
  if (parseSolanaReadOnlyAddress(owner)?.address !== owner)
    throw new Error('Invalid owner');
  const groups = await Promise.all(
    TOKEN_PROGRAMS.map(async (programId, index) => {
      const response = await fetch(SOLANA_DEVNET_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: index + 1,
          method: 'getTokenAccountsByOwner',
          params: [
            owner,
            { programId },
            { encoding: 'jsonParsed', commitment: 'confirmed' },
          ],
        }),
      });
      if (!response.ok) throw new Error('Token lookup failed');
      const data = await response.json();
      if (
        data?.jsonrpc !== '2.0' ||
        data?.id !== index + 1 ||
        data.error ||
        !Array.isArray(data?.result?.value)
      )
        throw new Error('Invalid token response');
      return data.result.value.map(
        (entry: any): DevnetToken => {
          const info = entry?.account?.data?.parsed?.info;
          const mint = info?.mint;
          const amount = info?.tokenAmount?.amount;
          const decimals = info?.tokenAmount?.decimals;
          if (
            info?.owner !== owner ||
            typeof mint !== 'string' ||
            parseSolanaReadOnlyAddress(mint)?.address !== mint ||
            typeof amount !== 'string' ||
            !/^(0|[1-9][0-9]{0,77})$/.test(amount) ||
            !Number.isInteger(decimals) ||
            decimals < 0 ||
            decimals > 255
          )
            throw new Error('Invalid token account');
          return { mint, amount, decimals };
        }
      );
    })
  );
  const tokens = new Map<string, DevnetToken>();
  for (const item of groups.flat()) {
    const previous = tokens.get(item.mint);
    if (previous && previous.decimals !== item.decimals)
      throw new Error('Inconsistent token decimals');
    tokens.set(item.mint, {
      ...item,
      amount: (
        BigInt(previous?.amount || '0') + BigInt(item.amount)
      ).toString(),
    });
  }
  return [...tokens.values()].filter((token) => token.amount !== '0');
}

export function formatTokenAmount(amount: string, decimals: number): string {
  if (
    !/^(0|[1-9][0-9]{0,77})$/.test(amount) ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 255
  )
    throw new Error('Invalid token amount');
  if (!decimals) return amount;
  const padded = amount.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}
