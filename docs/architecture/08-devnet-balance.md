# Decision 08: experimental devnet SOL balance

The development-only public-address viewer can explicitly request a SOL balance
from Solana Labs' public devnet RPC. The UI identifies the endpoint before the
user clicks: the address is sent to that service. No request is made just by
entering or validating an address. Requests omit credentials, and changing the
address aborts the old request and prevents late results from being displayed.

`getBalance` returns lamports. We reject malformed, negative, and unsafe
JavaScript integer responses rather than silently rounding a u64. Accepted values
are formatted using integer arithmetic. The public endpoint is rate limited;
network, HTTP, RPC and malformed-response errors are shown as failures.

This is not an account import, ownership proof, dapp connection, mainnet
balance, token balance, or signing feature. No persistence or Ethereum account
flow is changed. The endpoint is fixed to devnet for this experiment; production
needs explicit network and RPC configuration, privacy review, and a numeric
representation supporting the full u64 range before release.

Reference: https://solana.com/docs/rpc/http/getbalance
