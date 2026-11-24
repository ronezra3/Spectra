# Decision 04: route page provider requests at a trusted boundary

## Context

The existing EVM page provider sends messages through the content script to
the background port handler. That handler derives the session and origin from
the browser port, prepares a `ProviderRequest`, handles subscriptions, and
then calls the existing provider controller. That controller chooses the
account and runs the existing EVM permission and approval flow.

## Change

The page-request path now calls `routeProviderRequest('evm', request)` after
the existing subscription handling. The ecosystem is a constant selected by
extension code for the current EVM provider; the router does not derive it
from page-controlled request data. The EVM route passes the same request to
the same controller and returns its result or error unchanged. Other values,
including `solana`, are rejected without invoking the EVM controller.

```text
EVM page -> content script -> background port handler
         -> existing session and subscription handling
         -> routeProviderRequest('evm', request)
         -> existing EVM provider -> existing permission/approval flow
```

## Boundaries and limitations

- This is an internal routing seam, not a new page protocol or provider.
- Subscription handling is unchanged and remains outside this router.
- Internal wallet requests and built-in provider/direct controller paths are
  unchanged; this router does not claim to cover every request in the wallet.
- It does not add Solana connectivity, accounts, permissions or signing.
- A future provider must establish its identity via a trusted extension-owned
  entry point, with separately designed session and permission isolation; do
  not trust an ecosystem field supplied in page data or enable a new case here
  without those checks.
- Tests verify routing and existing mocked EVM flows, not browser injection or
  real signing. Existing full-suite issues remain outside this change.

## Interview walkthrough

1. Trace the page-to-content-to-background path and point out the trusted
   boundary: the extension selects the route, not the webpage.
2. Show that the router preserves request identity and EVM results/errors.
3. Demonstrate that an unsupported ecosystem cannot reach the EVM handler.
4. Explain which paths are deliberately unchanged and why Solana still needs
   separate provider discovery, permissions, lifecycle and signing design.
