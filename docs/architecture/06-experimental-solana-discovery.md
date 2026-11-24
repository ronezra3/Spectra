# Decision 06: opt-in Solana discovery without connection

## Scope

Expose an experimental, devnet-only Wallet Standard wallet for development
when explicitly enabled. Registration uses the official
`@wallet-standard/wallet` API and does not set `window.solana` or pretend to be
another wallet. The existing Ethereum provider is still imported unchanged.

The wallet always exposes zero accounts, rejects normal and silent connect,
and does not advertise any Solana signing feature. It has no bridge to the
background, no network calls, and does not use or grant permissions. It is a
discovery handshake only, not Solana connection or a usable wallet.

Some Solana wallet adapters require a transaction signing feature before they
will show a wallet. Those adapters will not show this experimental entry: do
not advertise a signing method that does not exist just to pass their filter.

## Local experiment

From the repository root, with Node 22 and the pinned Yarn:

```sh
OMNI_SOLANA_DISCOVERY=1 yarn build:dev
```

Load `dist` as an unpacked extension in a separate test browser profile. A
Wallet Standard registry can discover `OmniWallet (experimental)` on
`solana:devnet`; attempting `standard:connect` rejects with a clear error.
There is no RPC or test wallet involved. Stop the watch process when finished.

The switch is a build-time flag, not an environment variable that controls an
already-built extension. It defaults off. Production and debug builds cannot
enable it; rebuild and reload the extension when changing the flag. Browser
end-to-end discovery depends on the extension injection lifecycle and still
needs explicit manual verification.

## Design and follow-up

- Discovery follows [Wallet Standard registration](https://github.com/wallet-standard/wallet-standard/blob/master/packages/core/wallet/src/register.ts), including apps that start before or after the wallet.
- The upstream [Solana adapter compatibility check](https://github.com/anza-xyz/wallet-adapter/blob/master/packages/core/base/src/standard.ts) requires a signing feature in addition to connect and events; our discovery-only wallet intentionally does not satisfy it.
- Next design a dedicated trusted extension transport and independently scoped
  permissions, then add an approval UI and account lifecycle. Do not forward
  page-supplied ecosystem or account claims as trusted identity.
- Never expose accounts or add signing until consent, validation, lock,
  account switching and restart behavior have been tested.

## Interview walkthrough

Show the official registration call, the explicit development-only flag, an
empty account list and rejection of connect, then explain why no signing method
is advertised and why the existing EVM provider remains separate.
