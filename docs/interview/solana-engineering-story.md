# OmniWallet: introducing Solana alongside an EVM wallet

## The engineering problem

OmniWallet starts from Rabby, a mature browser-extension wallet designed around Ethereum and EVM networks. The objective is to add a Solana experience without treating a Solana address, signature, permission, or transaction as if it were an Ethereum one. The project is a portfolio demonstration; the current implementation is an experimental Devnet wallet, not a production wallet or an audited custody system.

## 1. Establish the existing boundaries

We first mapped the extension's UI, background service, injected page provider, content script, account store, keyrings, approvals, and transaction pipeline. The browser-extension message bridge is reusable infrastructure, but the payloads and authorization rules on top of it were strongly EVM-shaped: hexadecimal addresses, EVM chain IDs, Ethereum keyrings, and EVM transaction formats.

**Why:** identifying a reusable transport separately from chain-specific behavior avoids replacing working Ethereum infrastructure or spreading Solana conditionals through it.

## 2. Characterize address behavior before abstracting it

We preserved the existing equality behavior and introduced explicitly named EVM comparison at existing boundaries, followed by ecosystem-scoped address comparison. Ethereum addresses can be compared without case sensitivity; Solana Base58 addresses must retain their case and be decoded and validated independently.

**Why:** a seemingly harmless generic comparison can silently conflate different Solana addresses or alter existing Ethereum behavior. Compatibility wrappers and characterization tests let us move call sites incrementally.

## 3. Separate the provider and permissions

EVM requests were routed through an explicit boundary. Solana gained its own Wallet Standard discovery and a separate page/content/background channel. The background derives the requesting origin from browser sender metadata. Solana grants are distinct from EVM grants and are scoped to origin, selected account, and cluster.

**Why:** a site authorized for an Ethereum account must not gain access to a Solana account implicitly. Browser transport is shared in concept; identity, authorization, and signing semantics are not.

## 4. Introduce isolated custody, then move toward a shared vault

The first experimental Solana keyring derived Ed25519 keys in a separately encrypted IndexedDB vault. We subsequently added explicit, opt-in migration into the main encrypted keyring vault, retaining the original ciphertext. The target is activated only after storage acknowledgement and a check that the encrypted source still matches the fingerprint stored inside the encrypted target. A native Devnet setup can also create its first Solana account in the main vault without a legacy source. Lock and unlock invalidate Solana sessions. Solana keys are excluded from the unencrypted keyring mirror and ordinary EVM account lists.

**Why:** isolation let us validate chain-specific behavior before sharing encryption. The migration preserves a recovery source and fails closed when its state is ambiguous. A native marker distinguishes new accounts from migrated ones. A shared encrypted container does not by itself imply that EVM and Solana accounts share a recovery phrase; that relationship must be established explicitly.

## 5. Bind approvals to exact intent

Connection, message signing, transaction signing, and signing plus submission require separate approvals. A transaction request is inspected, tied to an origin, account, cluster, approval kind and exact bytes, and revalidated after approval and signing. A signature is checked before returning or broadcasting. Lock, account changes, disconnect and worker lifecycle changes invalidate relevant state.

**Why:** an approval for one request must never authorize another request, and a consent decision must not survive a change in the security context. A pending broadcast may still succeed after a timeout or lock, so the UI must not promise otherwise.

## 6. Fail closed on unsupported transactions

The first transaction path accepts only an unsigned, single-signer legacy System Program transfer with one instruction. It explicitly rejects versioned, multi-instruction, and arbitrary program transactions. Approval shows the recipient, amount, network, and blockhash; fee estimation and simulation are not yet implemented.

**Why:** Solana transactions can encode arbitrary programs and instructions. Showing an incomplete summary as if it explained the whole transaction would be misleading. Complex dApp transactions are deliberately deferred.

## 7. Prove the vertical slice in a real extension

We built the development extension in an isolated Chrome profile using disposable public test accounts. We verified discovery, separate connection consent, refusal of silent connection without a grant, message signatures, transaction signatures, and grant revocation after disconnect. We sent one lamport on Devnet and verified that the transaction reached `finalized` without an error. No mainnet assets or real recovery phrases were used.

During browser testing, the Solana page-provider import pulled an extension-only polyfill into a separate Webpack chunk. Because page and content scripts run in different browser worlds, the provider did not start on the dApp page. Importing the page-side message transport directly removed that unwanted dependency. A separate build issue was that MV2 and MV3 builds wrote to different output directories; the final Chrome test used the explicitly selected MV3 build.

**Why:** unit tests cannot prove browser-world injection, real approval windows, runtime messaging, or RPC integration. An end-to-end test exposed an integration failure that individual modules did not catch.

## 8. Shape the wallet experience

The wallet experience uses Rabby controls, theme variables, and dashboard navigation while keeping Solana state separate. A Devnet account view shows SOL and unverified SPL token balances, a receive address and QR code, recent confirmed activity with transaction details, dedicated receive and send screens, token detail views, and account management. Activity decodes simple SOL transfers and explicitly marks other instructions as unrecognized rather than guessing. Native sends reuse the same exact-byte transaction inspection, approval, signature verification, and broadcast controllers as the dApp flow, while using a separate internal permission session. Unverified token detail screens explicitly say that token transfers are unavailable. Token mint addresses are used as identifiers; unknown token metadata is not presented as verified names or prices. Balance fetch failures remain visible rather than looking like zero balances.

**Why:** this creates a familiar wallet experience without sending Solana accounts through EVM balance, address normalization, or token models. SPL metadata, token transfers, and full EVM regression coverage require separate verification before claiming feature completeness.

## 9. Incrementally unify the account experience

The development dashboard now offers a remembered view selector for the aggregate EVM dashboard and Solana Devnet. Shared-vault users can add a disposable Solana account, authenticated with the main wallet password. A supported selected EVM HD account can also explicitly derive a Solana account from the same test recovery phrase, without exposing that phrase to the UI. The encrypted Solana keyring stores the association and derivation index. The flow suggests the EVM account index, checks the selected address throughout the operation, and rejects ambiguous or unsupported sources. Existing unrelated Solana accounts are never linked by guesswork.

When opening the Solana view, the wallet verifies a unique association and its derivation before selecting the linked account. It leaves existing accounts unchanged if there is no unique link and tells the user to verify the address; manually selected accounts are identified separately. A change in EVM account or a lock invalidates the relevant Solana session.

The selector currently chooses a dashboard view: it does not select individual EVM chains or switch a dApp's network. Multiple Solana associations for one EVM account are not automatically resolved. A complete unified network and account model still needs a shared UI shell and explicit handling of multiple associations.

**Why:** presenting a dashboard view as a protocol network switch would be misleading. EVM address identity and dApp permissions must not be reused implicitly for Solana. Explicit incremental boundaries make it possible to test each change without pretending the final UX already exists.

## 10. Evidence and remaining verification

An isolated Chrome test verified migration of three disposable accounts into the main vault, preserved their public addresses, and reopened them after reloading the extension with the main wallet password; the EVM test address remained visible. The new dashboard selector was also exercised in Chrome. A separate automated integration test uses the actual encrypted keyring and Ed25519 implementation to create accounts, sign, lock, reopen, and preserve an EVM account. IndexedDB and unrelated unavailable hardware dependencies are mocked in that test.

Linked creation and signing were also exercised in an automated integration test with real HD/Ed25519 derivation and encrypted keyring serialization; browser storage, hardware and unrelated boundaries were mocked. The first-time linked and native shared-vault onboarding and addition of a shared account have not yet been validated end to end in a fresh browser profile. A post-migration test transfer was prepared, but its submission was not confirmed, so it must not be reported as a successful transaction. Earlier Devnet provider and transfer results in section 7 describe the earlier separate-vault implementation, not a complete regression of the new custody path.

The focused regression run passed 85 tests across 11 suites, with one pre-existing skip. The EVM keyring suite required mocks for unavailable Ledger and browser-related dependencies; these results do not establish complete EVM regression coverage.

## Current limits and trade-offs

- Devnet and explicit development flags only; no Mainnet support.
- Shared custody and legacy migration are experimental. Same-seed linking covers explicitly selected supported HD accounts; SLIP-39, passphrase-protected seeds and complete backup/export remain unsupported.
- The dashboard has a view selector rather than one complete network and account selector. The Solana views have not yet been fully merged into the shared dashboard components.
- General dApp instructions, versioned transactions, swaps, NFTs, and hardware wallets are outside the implemented scope.
- No fee estimate or transaction simulation; displaying only the supported simple transfer is intentional.
- Test results provide evidence for the paths exercised, not proof that Ethereum behavior is unchanged everywhere.
- Before real custody or funds: threat modeling, broader race/restart and EVM regression tests, hardened secret handling, and independent security review are required.
