# Decision 03: make the address comparison domain explicit

## Problem

The existing UI helper compares non-empty values case-insensitively, an EVM
convention. Solana public keys are represented in case-sensitive Base58, so
using this rule for both ecosystems could equate different strings.

## Decision

Introduce a small, in-memory `AddressIdentity` discriminated union with an
explicit `ecosystem` and address string. `areAddressIdentitiesEqual` compares
EVM strings using the existing EVM helper, Solana strings exactly, and returns
false for different or unknown ecosystems. `evmAddressIdentity` is an adapter
for callers that already know they hold EVM values; it does not infer or
validate the ecosystem from the address.

The existing UI `isSameAddress` keeps its public signature and its explicit
empty-value guard. For non-empty strings it adapts both inputs as EVM values
and delegates to the new comparator. Its callers, all still on legacy paths,
therefore retain the previous EVM comparison semantics. Background comparison
remains unchanged, including its different treatment of empty strings.

```text
existing UI caller -> isSameAddress(a, b)
                   -> reject empty inputs as before
                   -> tag both values EVM (legacy boundary)
                   -> ecosystem-aware address comparison
                   -> existing EVM lowercase comparison
```

## Limits and future work

This compares strings, not validated public keys or checksums. A matching
address does not establish wallet account identity: network, keyring, account
type and authorization may also matter. Do not use it alone for permissions,
signing, storage keys, or to establish a Solana account. It does not alter
persisted state or expose a Solana provider. Legacy `isSameAddress` remains
EVM-only; tagging untrusted or future Solana input as EVM is unsafe. Migrate
each caller only after tracing its source and preserving its existing contract.

## Interview walkthrough

1. Show why an address string alone does not identify its comparison rule.
2. Compare mixed-case EVM strings, then show case-sensitive Solana strings.
3. Show the explicit EVM adapter at the legacy UI boundary and its empty guard.
4. Explain the scope: no vault, permissions, network or provider changes;
   further identity and security design is required before Solana integration.
