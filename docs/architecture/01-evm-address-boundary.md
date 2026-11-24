# Decision 01: name the EVM address comparison boundary

## Context

Rabby's background `isSameAddress` helper compares strings without regard to
case. It is used by existing EVM services, including security-sensitive code.
Solana addresses must not be passed through this comparison: Base58 is case
sensitive. Existing account, storage and permission models are not yet
chain-aware.

## Change

Move the existing comparison, unchanged, to `src/chains/evm/address.ts` and
keep `background/utils.isSameAddress` as a compatibility wrapper. Existing
callers retain their API and behavior. The new name makes the scope explicit
for future code. This is string equality, not EVM address or checksum
validation; even non-address strings keep their old comparison behavior.

```text
existing EVM service
  -> background/utils.isSameAddress(a, b)  [existing API]
  -> chains/evm.areEvmAddressesEqual(a, b)  [same lowercase comparison]
  -> boolean
```

This does not add Solana support or protect existing generic call sites from
being given a Solana address. Before passing non-EVM accounts to those paths,
inventory and migrate each caller to an explicit ecosystem-aware identity and
comparison. Account data, permissions, storage and signing remain unchanged.

## Verification

The focused tests cover case variants, unequal addresses and preservation of
the old behavior for arbitrary strings. Existing EVM regression tests should
also be run; unit tests do not replace extension end-to-end or security tests.

## Interview walkthrough

1. Show why lowercase comparison is valid for this existing EVM string rule
   and unsafe as a general rule for case-sensitive Base58 addresses.
2. Trace an existing caller through the compatibility wrapper into the EVM
   helper; no data format or caller needs to change in this step.
3. Show the tests, especially that comparison is not validation.
4. Explain the limitation: the legacy name is still widely used. The next
   step must classify callers and introduce explicit account/network identity
   before routing Solana addresses into existing services.
