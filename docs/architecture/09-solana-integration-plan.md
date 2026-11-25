# Experimental Solana Devnet integration

This is an opt-in development experiment for disposable test wallets. It is
not production-ready, audited, mainnet support, or general Solana transaction
support. Existing Ethereum provider routing and account storage remain separate.

## Local flow

Build the Chrome MV3 extension with `MANIFEST_TYPE=chrome-mv3 OMNI_SOLANA_DISCOVERY=1 OMNI_SOLANA_READONLY=1 yarn build:dev`, load
it in an isolated extension profile. Unlock the existing Rabby test wallet and
choose Solana Devnet in the dashboard view selector. A fresh test installation
creates or restores its first Solana account in the main encrypted wallet vault
using the main wallet test password. A legacy installation can continue using its
separate vault or explicitly copy its accounts into the main vault. Use only
disposable test phrases at `m/44'/501'/account'/0'`; never enter a real recovery
phrase or use real funds.

The legacy vault stores encrypted data in IndexedDB using compare-and-write.
Migration retains that ciphertext and stores a fingerprint in the encrypted
target keyring; a changed source blocks shared signing until reconciliation.
Native custody has a distinct encrypted marker and fails closed if a legacy
source appears. Both paths require acknowledged target storage before use.
Solana secrets stay out of unencrypted keyring data and ordinary EVM account
lists. Main wallet lock/unlock invalidates Solana sessions. Solana recovery
requires the appropriate test mnemonic and index. The user may explicitly
derive an associated account from a supported selected EVM HD seed; independent
Solana accounts are never linked automatically. A complete backup/export flow
is not yet available.

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
  simulation; no computed fee, recovery export, or arbitrary program instructions.
  The experimental wallet shows SOL and unverified SPL balances and supports
  native SOL sends with the same approval-bound signing pipeline. Versioned and multi-instruction transactions
  fail closed. Some dapps and transaction options are therefore unsupported.
- No independent security audit. Browser, worker-restart, lock/account/chain
  races, production gating, real RPC failures, and EVM regression must be
  tested before any release claims. JavaScript cannot guarantee that all
  immutable copies of secrets are wiped from memory.
- Keep secrets out of page contexts, logs, telemetry and the unencrypted EVM
  keyring mirror. The encrypted keyring service now restores the explicitly
  tagged Solana keyring, while ordinary EVM lookup and creation paths remain
  isolated. Shared custody is not a general-purpose keyring integration.
- The dashboard selector currently switches views, not individual EVM networks
  or dApp network state. First-time native custody needs fresh-profile browser
  testing. Multiple links need explicit choice and source reconciliation is
  unfinished; linked HD-seed derivation is limited to supported test accounts.

Reference: https://solana.com/developers/cookbook/wallets/restore-from-mnemonic
