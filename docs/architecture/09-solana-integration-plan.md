# Experimental Solana Devnet integration

This is an opt-in development experiment for disposable test wallets. It is
not production-ready, audited, mainnet support, or general Solana transaction
support. Existing Ethereum provider routing and account storage remain separate.

## Local flow

Build with `OMNI_SOLANA_DISCOVERY=1 OMNI_SOLANA_READONLY=1 yarn build:dev`, load
it in an isolated extension profile, and open the extension tab at
`#/experimental/solana-wallet`. Unlock the existing Rabby test wallet, create
a separate Solana test vault with a disposable test password, and import a
publicly known test mnemonic at `m/44'/501'/account'/0'`. Never enter a real
recovery phrase or use real funds.

The vault stores only password-encrypted data in a dedicated IndexedDB. Writes
use an atomic compare-and-write transaction. Solana secrets are not added to the
legacy EVM account lists, the EVM vault, or the EVM sync export. Existing EVM
lock/unlock invalidates Solana sessions and clears the in-memory Solana keyring.
Vault recovery currently means re-entering the same test mnemonic and index;
there is no wallet backup/export flow or remembered mnemonic.

## Trust and consent

The injected dev-only Wallet Standard adapter has a dedicated page/content/
background channel. Background determines origin from browser sender metadata,
not the page's payload. The selected Solana account is available to that
origin only after a separate `SolanaConnect` approval. Grants are in memory and
are revoked at lock, unlock, account changes, chain notifications, disconnect,
or service-worker restart. Ethereum grants never grant Solana access.

`solana:signMessage` requires a separate approval showing the exact bytes.
`solana:signTransaction` and `solana:signAndSendTransaction` accept only a
single, unsigned, single-signer legacy System Program SOL transfer. The approval
shows the origin, account, recipient, amount, blockhash, and that network fees
are not estimated. It distinguishes signing from submission. The background
binds approvals to origin, account, cluster, kind and exact bytes, verifies the
signature, and refuses stale sessions. Once a submission leaves the extension,
aborting or locking cannot guarantee that the RPC did not broadcast it.

The public Devnet RPC receives the signed transaction on explicit send. A
failed or timed-out submission may already have been accepted; callers must
check the transaction signature and should not blindly retry. No real funds are
needed or permitted for this experiment.

## Deliberate limits and follow-up

- No mainnet, hardware wallet, token transfer, NFT, swaps, or full transaction
  simulation; no computed fee, account balance dashboard, recovery export, or
  arbitrary program instructions. Versioned and multi-instruction transactions
  fail closed. Some dapps and transaction options are therefore unsupported.
- No independent security audit. Browser, worker-restart, lock/account/chain
  races, production gating, real RPC failures, and EVM regression must be
  tested before any release claims. JavaScript cannot guarantee that all
  immutable copies of secrets are wiped from memory.
- Keep secrets out of page contexts, logs, telemetry and the unencrypted EVM
  keyring mirror. Do not register `SolanaKeyring` with `KeyringService`:
  `persistAllKeyrings` and legacy lookup paths have distinct assumptions.

Reference: https://solana.com/developers/cookbook/wallets/restore-from-mnemonic
