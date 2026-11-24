# Decision 02: inventory EVM address equality before account identity changes

## Scope and method

Baseline: `develop` after PR #1 (squash commit `81adf190`). The search
`rg -n 'isSameAddress\(' src --glob '*.{ts,tsx}'` returned 263 matching lines
in 121 files. This is a search inventory, not a complete call graph: it counts
text matches, may include different functions and misses aliases, dynamic
calls and address comparison without this name. Re-run and inspect before
changing a domain. The repository also contains direct lowercase operations,
address parsing and keys built from strings.

## Two helpers, two contracts

- `src/background/utils/index.ts`: `isSameAddress(a, b)` delegates to
  `chains/evm.areEvmAddressesEqual`. It lowercases both strings and compares
  them; empty strings compare equal. It does not validate either argument.
- `src/ui/utils/index.ts`: another function with the same name first returns
  `false` if either value is falsy, then compares case-insensitively. Therefore
  `isSameAddress('', '')` is **false** in UI but **true** in background.

Do not mechanically unify the helpers: callers can rely on those distinct
empty-value contracts. Neither helper is a safe generic comparison for
case-sensitive Solana Base58 addresses. No current helper should be treated
as proof that a string is a valid EVM address.

## Mapped domains and risks

| Domain | Representative locations | Risk when adding another ecosystem |
| --- | --- | --- |
| Account identity and selection | `background/controller/base.ts`, `background/service/keyring/index.ts`, `ui/hooks/useAccounts.ts`, `ui/component/AccountSelectDrawer/index.tsx` | Matching an account by address alone can select or expose the wrong account; keyring type and ecosystem also matter. |
| Hardware signing | `background/service/keyring/eth-ledger-keyring.ts`, `eth-onekey-keyring/eth-onekey-keyring.ts` | Device-to-request address matching is security-sensitive; do not generalize Ethereum adapters or bypass validation. |
| Allowlist and security rules | `background/service/whitelist.ts`, `background/service/securityEngine.ts` | Case-insensitive membership and stored lowercase keys could incorrectly combine distinct Base58 values; origin rules and address rules need separate review. |
| Contacts and preferences | `background/service/contactBook.ts`, `background/service/preference.ts` | Some paths lowercase keys directly, independent of the helper; changing only comparisons leaves storage collisions or missing entries. |
| Transaction state and watchers | `background/service/transactionHistory.ts`, `transactionWatcher.ts`, `transactionBroadcastWatcher.ts` | Wrong account matches could associate status/history with a different account; transaction identity and network must also be considered. |
| Approval and asset presentation | `ui/views/Approval/components/Actions/`, `ui/utils/portfolio/`, `ui/views/Swap/` | The helper compares token/contract IDs as well as user accounts. A single account identity abstraction will not automatically cover asset identifiers. |
| Cross-window UI state | `ui/hooks/backgroundState/useAccount.ts`, `ui/utils/portfolio/usePortfolio.ts` | Missing addresses and stale state have UI-specific semantics; lifecycle and false matches can affect displayed account data. |

`ConnectedSite` in `background/service/permission.ts` currently holds an EVM
chain and optional account. It is important for future chain-scoped consent,
but it is not a direct caller of either helper. Address comparisons also occur
outside the helper, for example `provider/controller.ts` and stored-key
normalization in `contactBook.ts`, `preference.ts`, and `whitelist.ts`.

## Characterization tests in this change

- UI comparison: case-insensitive equality for non-empty values and false for
  missing values.
- Existing background comparison: separate test from PR #1 preserves empty
  string equality and case-insensitive behavior.
- Allowlist: mixed-case lookup, duplicate rejection, lowercase storage and
  case-insensitive removal, using the actual EVM comparison implementation.

These tests capture current behavior, not an endorsement of applying it to
Solana. They do not exercise the browser, signing, hardware, or migration.

## Next implementation slice

Design a discriminated `AccountRef` and explicit EVM adapter at a narrow,
non-persisted boundary first. Retain the UI/background empty-value behavior at
existing callers and leave current stored account shape unchanged. Select a
specific caller only after tracing its data sources and existing tests; the
inventory alone is not evidence that a global rewrite is safe. Before any
Solana account enters a service, ensure its identity, storage keys,
permissions, and comparison are explicitly ecosystem-scoped and tested.
