import { parseSolanaReadOnlyAddress } from './readOnlyAddress';

export const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com';

/** Explicitly requested, public-address-only devnet balance lookup. */
export async function getDevnetBalance(address: string, signal?: AbortSignal) {
  const parsed = parseSolanaReadOnlyAddress(address);
  if (!parsed) throw new Error('Invalid Solana address');
  const response = await fetch(SOLANA_DEVNET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [parsed.address, { commitment: 'confirmed' }],
    }),
    credentials: 'omit',
    signal,
  });
  if (!response.ok) throw new Error('Devnet request failed');
  const body = await response.json();
  const value = body?.result?.value;
  if (
    body?.jsonrpc !== '2.0' ||
    body?.id !== 1 ||
    body?.error != null ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error('Invalid devnet response');
  }
  return value as number;
}

/** Exact decimal rendering for safely represented lamport values. */
export function formatLamports(lamports: number): string {
  if (!Number.isSafeInteger(lamports) || lamports < 0) {
    throw new Error('Invalid lamport amount');
  }
  const value = BigInt(lamports);
  const whole = value / 1000000000n;
  const fraction = (value % 1000000000n)
    .toString()
    .padStart(9, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
