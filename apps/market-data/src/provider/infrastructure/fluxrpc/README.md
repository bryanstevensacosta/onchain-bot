# FluxRPC — Solana Data Provider

> Cost: KEYED (`FLUXRPC_API_KEY`) — chain kind, fallback only. Without the key every method returns null (skip, never throws); zero-cost cascade never spends on it.

FluxRPC adapter: standard Solana JSON-RPC over HTTP for balances, token
accounts, transactions, and chain state. Solana mainnet
(`supportsChains: ['solana']`, kind `chain`, 300 req/min internal
budget — see `../../domain/provider-descriptor.ts:82-86`).

## What it provides

- SOL balances (`getBalance`), SPL token accounts by owner,
  batched account reads (`getMultipleAccounts`).
- Transaction details (`getTransaction`), current slot, latest blockhash.
- Generic `rpcCall(method, params)` escape hatch for any other JSON-RPC method.

## Base URL

Configured endpoint with the key appended as a query param
(`fluxrpc.service.ts:69`):

```
{rpcUrl}?key={apiKey}        (or &key= when rpcUrl already has a query string)
```

Official endpoints are `https://eu.fluxrpc.com?key=<API-KEY>` (Solana)
and `wss://ws.eu.fluxrpc.com` (WebSocket — not used by this service).
Docs: <https://fluxrpc.com/docs> · methods:
<https://fluxrpc.com/docs/rpc>.

## Auth

API key required, sent as `?key=` query param (not a header).

| Env               | Maps to                                                  |
| ----------------- | -------------------------------------------------------- |
| `FLUXRPC_API_KEY` | `FluxRpcConfig.apiKey`                                   |
| `FLUXRPC_RPC`     | `FluxRpcConfig.rpcUrl`                                   |
| `FLUXRPC_WS`      | `FluxRpcConfig.wsUrl` (optional, unused by this service) |

Missing key or URL → constructor warns and every method returns `null`
(`fluxrpc.service.ts:33-37`, guard at `:61`). Module reads `app.fluxrpc`
with empty defaults (`fluxrpc.module.ts:12`).

## Rate limits

- Internal budget: 300 req/min (`provider-descriptor.ts:85`).
- FluxRPC bills per byte transferred (flat bandwidth pricing), not per
  request/credit — throughput depends on the contracted plan; no fixed
  public free-tier request limit.
- HTTP timeout 8 s per call (`fluxrpc.service.ts:72`).

## Key methods → code

| Method                              | Code                         | Upstream                                                                                                                                              |
| ----------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rpcCall(method, params?)` (public) | `fluxrpc.service.ts:57-85`   | Generic JSON-RPC POST `{ jsonrpc: '2.0', id: 'flux-<ts>', method, params }` → `result` or `null`                                                      |
| `getBalance(address)`               | `fluxrpc.service.ts:96-100`  | `getBalance` `[address]` → `result.value` (lamports) or `null`                                                                                        |
| `getTokenAccountsByOwner(owner)`    | `fluxrpc.service.ts:107-112` | `getTokenAccountsByOwner` `[owner, { encoding: 'jsonParsed' }]`                                                                                       |
| `getMultipleAccounts(addresses)`    | `fluxrpc.service.ts`         | `getMultipleAccounts` `[[...addresses], { encoding: 'jsonParsed' }]`                                                                                  |
| `getAccountInfo(address)` (Lane T)  | `fluxrpc.service.ts`         | `getAccountInfo` `[address, { encoding: 'base64', commitment: 'confirmed' }]` — raw bytes for pool-struct decode (jsonParsed is unusable for structs) |
| `getTransaction(signature)`         | `fluxrpc.service.ts:137-144` | `getTransaction` `[signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]`                                                         |
| `getSlot()`                         | `fluxrpc.service.ts:150-152` | `getSlot` (no params) → `number` or `null`                                                                                                            |
| `getLatestBlockhash()`              | `fluxrpc.service.ts:156-165` | `getLatestBlockhash` → `result.value` `{ blockhash, lastValidBlockHeight }` or `null`                                                                 |

Types: `fluxrpc.types.ts` (`JsonRpcRequest/Response`, `SolanaBalanceResponse`,
`SolanaTokenAccount`, `SolanaTransactionResponse`). Module wiring:
`fluxrpc.module.ts` (reads `app.fluxrpc`, `forRoot` override).

## Example

```json
// getBalance request (POST {rpcUrl}?key={apiKey}, Content-Type: application/json)
{ "jsonrpc": "2.0", "id": "flux-1", "method": "getBalance", "params": ["<wallet>"] }

// response → service returns result.value (lamports; divide by 1e9 for SOL)
{ "jsonrpc": "2.0", "result": { "context": { "slot": 283456789 },
  "value": 523456789012 }, "id": "flux-1" }
```

```json
// getLatestBlockhash → service returns result.value
{
  "jsonrpc": "2.0",
  "result": {
    "context": { "slot": 283456789 },
    "value": {
      "blockhash": "Cx...",
      "lastValidBlockHeight": 283456789
    }
  },
  "id": "flux-1"
}
```

```typescript
// escape hatch for methods without a wrapper (fluxrpc.service.ts:57-60)
const epoch = await flux.rpcCall<{ epoch: number }>('getEpochInfo');
```

## Error modes

- No config → `null` before any HTTP (`fluxrpc.service.ts:61`).
- JSON-RPC `error` payload → debug log with `[code]`, `null`
  (`fluxrpc.service.ts:74-79`).
- Transport/timeout (8 s) → debug log, `null`
  (`fluxrpc.service.ts:81-84`).
- Missing `result` → `?? null` at each accessor (`:98`, `:163`).

## Endpoint catalog (full FluxRPC surface)

Catalog verified 2026-09-27. FluxRPC is a standard Solana JSON-RPC
passthrough (key as `?key=` query param), so the AVAILABLE surface is
the full Solana HTTP method list — see `../solana-rpc/README.md` for
the per-method catalog (verified same date against
<https://solana.com/docs/rpc/http>); it is not duplicated here to avoid
drift. (`fluxrpc.com/docs/rpc` is JS-rendered and was not
machine-readable on 2026-09-27; passthrough is confirmed via the
generic `rpcCall` helper plus the homepage statement
"High-performance Solana RPCs".)

### USED-TODAY (6 + escape hatch)

| Method                    | Code                     | Gateway need                    |
| ------------------------- | ------------------------ | ------------------------------- |
| `rpcCall` (public)        | `fluxrpc.service.ts:57`  | Escape hatch (serves all below) |
| `getBalance`              | `fluxrpc.service.ts:96`  | Wallet SOL balance (served)     |
| `getTokenAccountsByOwner` | `fluxrpc.service.ts:107` | Wallet SPL accounts (served)    |
| `getMultipleAccounts`     | `fluxrpc.service.ts:119` | Batch state reads (served)      |
| `getTransaction`          | `fluxrpc.service.ts:137` | Tx detail (served)              |
| `getSlot`                 | `fluxrpc.service.ts:150` | Chain tip (served)              |
| `getLatestBlockhash`      | `fluxrpc.service.ts:156` | Fresh blockhash (served)        |

### AVAILABLE — gateway-relevant highlights (all via `rpcCall` today, no new code)

| Method                        | Gateway need                                        |
| ----------------------------- | --------------------------------------------------- |
| `getAccountInfo`              | Chain probing via FluxRPC (failover for solana-rpc) |
| `getTokenLargestAccounts`     | Top-20 holders via FluxRPC (failover path)          |
| `getTokenAccountBalance`      | Single holder balance (distribution detail)         |
| `getTokenSupply`              | Mint supply (mcap computation)                      |
| `getTokenAccountsByDelegate`  | Delegate exposure (risk signals)                    |
| `getSignaturesForAddress`     | Address tx list (activity feed, audit)              |
| `getSignatureStatuses`        | Confirmation tracking (send path)                   |
| `getProgramAccounts`          | Program-owned account scans (protocol stats)        |
| `getLargestAccounts`          | Whale watching (concentration signals)              |
| `getSupply`                   | Circulating supply (mcap computation)               |
| `getInflationReward`          | Address epoch rewards (staking views)               |
| `getFeeForMessage`            | Fee quote (tx-building path)                        |
| `getRecentPrioritizationFees` | Priority-fee estimation (send path)                 |
| `getEpochInfo`                | Epoch clock (staking-aware features)                |
| `getHealth`                   | Node health (readiness probe)                       |
| `getBlock`                    | Block explore (audit, backfill)                     |
| `getBlockHeight`              | Chain height (health dashboard)                     |
| `simulateTransaction`         | Pre-flight simulation (send path safety)            |
| `sendTransaction`             | Signed-tx submission (future trading path)          |

### AVAILABLE — transports not used

| Surface                                      | Gateway need                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `wss://ws.eu.fluxrpc.com` (WebSocket PubSub) | Standard subscriptions (needs WS transport, like solana-rpc)                  |
| Yellowstone gRPC streaming (paid plans)      | Low-latency stream (operator-gated; same pattern as the P49 ccxt driver gate) |
