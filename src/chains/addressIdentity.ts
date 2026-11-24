import { areEvmAddressesEqual } from './evm/address';

/** An address and its encoding domain, not a complete wallet account. */
export type AddressIdentity =
  | { ecosystem: 'evm'; address: string }
  | { ecosystem: 'solana'; address: string };

/** Adapts a value already known to come from an EVM-only path. */
export const evmAddressIdentity = (address: string): AddressIdentity => ({
  ecosystem: 'evm',
  address,
});

/** Compare address strings only; this does not validate either address. */
export const areAddressIdentitiesEqual = (
  a: AddressIdentity,
  b: AddressIdentity
): boolean => {
  if (a.ecosystem !== b.ecosystem) return false;

  switch (a.ecosystem) {
    case 'evm':
      return areEvmAddressesEqual(a.address, b.address);
    case 'solana':
      return a.address === b.address;
    default:
      return false;
  }
};
