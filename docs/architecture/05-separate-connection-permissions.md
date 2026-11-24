# Decision 05: separate EVM and Solana connection permissions

## Decision

An EVM connection grant does not authorize a Solana connection, and a Solana
grant does not authorize an EVM connection. A connection decision is scoped
to a browser-derived origin, an ecosystem and a specific address. A site
must request a separate Solana connection, with its own user approval, even
when it already has an EVM connection.

This PR introduces only a pure decision function. `hasConnectionPermission`
matches a `connect` grant against the requested origin and address identity.
EVM string comparison remains case-insensitive; Solana string comparison is
case-sensitive. Unsupported ecosystems, malformed records, empty addresses,
and non-canonical HTTP(S) origins are rejected. File URLs and opaque origins
are deliberately not supported by this preliminary policy; adding support
requires a separate trusted-origin and privacy design.

## Trust boundary and limits

- This function does not create, persist, revoke, or display grants. It is not
  wired to an extension provider, router, UI, or the existing EVM permission
  service. Existing EVM permissions and behavior are unchanged.
- A matching object is **not evidence of consent**. Before integration the
  background must derive the origin from the browser sender, validate the
  selected Solana public key and account, and load grants from a trusted,
  isolated store. It must write a grant only after an explicit matching user
  approval. Page-supplied grants or origins must never be trusted.
- Connection authorization only controls account exposure; it never grants
  permission to sign a message or transaction. Signing requires a separate
  approval bound to the request, account, origin and exact payload.
- Address comparison and nonempty-string checks do not validate a public key.
  `AddressIdentity` also does not represent a complete wallet account; keyring,
  account removal and switch semantics need design before integration.
- Durable storage, revocation, restart, concurrent approvals, UI and migration
  need their own implementation and tests. Until then this code does not
  connect a Solana dapp or enforce permission isolation in the running wallet.

## Interview walkthrough

1. A site connects to an EVM account; the decision rejects its request for a
   Solana account because the ecosystem differs.
2. A separate Solana approval will eventually create its own trusted grant.
3. The same site and address do not authorize signing; that is a separate flow.
4. Show case-sensitive Solana matching and exact canonical origin matching.
5. Explain that this PR is a tested policy seam, not a complete permission
   system or Solana provider.
