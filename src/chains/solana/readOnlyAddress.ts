import { base58 } from '@scure/base';

export type SolanaReadOnlyAddress = {
  readonly ecosystem: 'solana';
  readonly address: string;
  readonly access: 'read-only';
};

/** Decode canonical Base58 public address bytes, without proving ownership. */
export const parseSolanaReadOnlyAddress = (
  input: string
): SolanaReadOnlyAddress | null => {
  const address = input.trim();
  if (address.length < 32 || address.length > 44) return null;

  try {
    const bytes = base58.decode(address);
    if (bytes.length !== 32 || base58.encode(bytes) !== address) return null;
    return { ecosystem: 'solana', address, access: 'read-only' };
  } catch {
    return null;
  }
};
