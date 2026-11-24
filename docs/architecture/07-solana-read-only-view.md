# Decision 07: experimental Solana public-address viewer

## Scope

Add an opt-in, development-only view for inspecting a public Solana address.
This is not a wallet account import: it does not generate or hold keys, prove
ownership, persist data, query an RPC, display balances, connect to a dapp, or
sign. The value is held only in React state for the lifetime of the view.
Use public test addresses only, never seed phrases or private keys.

`parseSolanaReadOnlyAddress` trims surrounding whitespace, decodes canonical
Base58 and accepts exactly 32 bytes using the explicitly pinned `@scure/base`
dependency. It does not require an on-curve key because Solana addresses also
include program-derived addresses. Length and encoding are not proof that the
address belongs to the user, represents a funded account, or is safe to use.

The view is separate from legacy EVM account selection, storage, permissions
and signing. No value from it is published to the experimental Wallet Standard
provider. Its UI makes these limitations explicit and clears a displayed
result on input changes or invalid submission.

## Local use

```sh
OMNI_SOLANA_READONLY=1 yarn build:dev
```

Load the development build in a test profile, open the extension's full tab,
and navigate to `#/experimental/solana-read-only`. The route is not available
by default, or in production/debug builds. The flag is embedded at build time;
rebuild and reload when changing it. This flag is independent of
`OMNI_SOLANA_DISCOVERY`.

## Follow-up before real accounts and connections

- Define account identity, validation, persistence, removal, and recovery.
- Add a separate trusted Solana connection and consent flow; do not treat an
  address entered here as proof of ownership or an authorization grant.
- Design RPC, network selection, privacy, failure and loading states before
  showing balances. Add signing only with independently reviewed key custody
  and consent-bound transaction flows.

## Interview walkthrough

Trace input -> Base58 decoding -> 32-byte validation -> ephemeral display.
Explain why this does not share the EVM account store, and why a public address
is useful for inspection but does not enable a wallet to sign or prove control.
