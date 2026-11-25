import { SOLANA_DEVNET_RPC } from './devnetBalance';
import { parseSolanaReadOnlyAddress } from './readOnlyAddress';

export type SolanaActivity = {
  signature: string;
  status: 'success' | 'failed';
  blockTime: number | null;
};

/** Show public chain records; a successful submission is not the same as confirmation. */
export async function getDevnetActivity(
  address: string,
  signal?: AbortSignal
): Promise<SolanaActivity[]> {
  if (parseSolanaReadOnlyAddress(address)?.address !== address)
    throw new Error('Invalid address');
  const response = await fetch(SOLANA_DEVNET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    signal,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [address, { limit: 20, commitment: 'confirmed' }],
    }),
  });
  if (!response.ok) throw new Error('Activity unavailable');
  const body = await response.json();
  if (
    body?.jsonrpc !== '2.0' ||
    body?.id !== 1 ||
    body?.error != null ||
    !Array.isArray(body?.result) ||
    body.result.length > 20
  )
    throw new Error('Invalid activity response');
  return body.result.map((entry: any) => {
    if (
      typeof entry?.signature !== 'string' ||
      !/^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(entry.signature) ||
      (entry.blockTime !== null &&
        (!Number.isSafeInteger(entry.blockTime) || entry.blockTime < 0)) ||
      !('err' in entry)
    )
      throw new Error('Invalid transaction');
    return {
      signature: entry.signature,
      status: entry.err === null ? 'success' : 'failed',
      blockTime: entry.blockTime,
    };
  });
}

export type SolanaActivityDetail = {
  fee: number;
  status: 'success' | 'failed';
  transfers: { from: string; to: string; lamports: number }[];
  otherInstructions: number;
};

/** Only describe instructions the RPC identifies as canonical system transfers. */
export async function getDevnetTransaction(
  signature: string,
  signal?: AbortSignal
): Promise<SolanaActivityDetail> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(signature))
    throw new Error('Invalid signature');
  const response = await fetch(SOLANA_DEVNET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    signal,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [
        signature,
        {
          encoding: 'jsonParsed',
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error('Transaction unavailable');
  const body = await response.json();
  const result = body?.result;
  const instructions = result?.transaction?.message?.instructions;
  if (
    body?.jsonrpc !== '2.0' ||
    body?.id !== 1 ||
    body?.error != null ||
    result?.transaction?.signatures?.[0] !== signature ||
    !result?.meta ||
    !Number.isSafeInteger(result.meta.fee) ||
    result.meta.fee < 0 ||
    !Array.isArray(instructions) ||
    instructions.length > 128
  )
    throw new Error('Invalid transaction response');
  const transfers: SolanaActivityDetail['transfers'] = [];
  let otherInstructions = 0;
  for (const instruction of instructions) {
    const info = instruction?.parsed?.info;
    if (
      instruction?.programId === '11111111111111111111111111111111' &&
      instruction?.parsed?.type === 'transfer' &&
      typeof info?.source === 'string' &&
      parseSolanaReadOnlyAddress(info.source)?.address === info.source &&
      typeof info?.destination === 'string' &&
      parseSolanaReadOnlyAddress(info.destination)?.address ===
        info.destination &&
      Number.isSafeInteger(info?.lamports) &&
      info.lamports >= 0
    ) {
      transfers.push({
        from: info.source,
        to: info.destination,
        lamports: info.lamports,
      });
    } else otherInstructions += 1;
  }
  return {
    fee: result.meta.fee,
    status: result.meta.err === null ? 'success' : 'failed',
    transfers,
    otherInstructions,
  };
}
