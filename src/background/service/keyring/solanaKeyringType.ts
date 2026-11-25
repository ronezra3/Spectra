/** Solana software keys are restored only from encrypted keyring storage;
 * they must never enter the unencrypted mirror or generic EVM account paths. */
export const SOLANA_KEYRING_TYPE = 'OmniWallet Solana Keyring';
