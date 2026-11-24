/**
 * Compare EVM address strings using the legacy Rabby case-insensitive rule.
 * This compares strings only; it does not validate an address or its checksum.
 */
export const areEvmAddressesEqual = (a: string, b: string): boolean =>
  a.toLowerCase() === b.toLowerCase();
