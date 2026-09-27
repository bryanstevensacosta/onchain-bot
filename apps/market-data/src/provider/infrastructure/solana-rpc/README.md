# Solana RPC — Data Provider

Plain Solana JSON-RPC 2.0 client: top-20 holders via
`getTokenLargestAccounts` and chain probing via `getAccountInfo`, with
primary → public-RPC failover on transport errors only.
Solana-only (kind `chain`, 300 req/min internal budget — see
`../../domain/provider-descriptor.ts:88-92`). No API key needed.

## What it provides

- Holders: 20 largest token accounts (address, amount, decimals) per SPL mint.
- Chain probing: account existence/state (owner, lamports, executable) —
  `null` when the account does not exist.
- Failover: primary RPC → public RPC automatically on transport errors.

## Base URL

| URL                                                                 | Role                                  | Code                               |
| ------------------------------------------------------------------- | ------------------------------------- | ---------------------------------- |
| `primaryRpcUrl` (Helius mainnet URL, from `HELIUS_RPC_URL_MAINNET`) | Primary                               | `solana-rpc.service.ts:29-39`      |
| `https://api.mainnet.solana.com`                                    | Hardcoded fallback, always tried last | `solana-rpc.service.ts:13,107-112` |

Without `primaryRpcUrl` every call goes straight to the public RPC
(`solana-rpc.service.ts:34-38`). Docs: <https://solana.com/docs/rpc> ·
[getTokenLargestAccounts](https://solana.com/docs/rpc/http/gettokenlargestaccounts) ·
[getAccountInfo](https://solana.com/docs/rpc/http/getaccountinfo).
Public endpoints are rate-limited with no SLA — unsuitable for production
load; use the Helius primary.

## Auth

None. No key, no env required (`SolanaRpcConfig` in
`solana-rpc.config.ts:3-6` carries only URLs; the module default leaves
`primaryRpcUrl` undefined — `solana-rpc.module.ts:6-9`).

## Rate limits

- Internal budget: 300 req/min (`provider-descriptor.ts:91`).
- Public fallback: ~100 req/10 s per IP (shared, no key).
- HTTP timeout 10 s per call (`solana-rpc.service.ts:90`).

## Key methods → code

| Method                                   | Code                            | Upstream                                                                                                     |
| ---------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `getTokenLargestAccounts(mintAddress)`   | `solana-rpc.service.ts:45-59`   | RPC `getTokenLargestAccounts` `[mint]` → `result.value` (`TokenAccountEntry[]`) or `null`                    |
| `getAccountInfo(address)`                | `solana-rpc.service.ts:65-79`   | RPC `getAccountInfo` `[address, { encoding: 'base58', commitment: 'confirmed' }]` → `result.value` or `null` |
| `callRpc(url, method, params)` (private) | `solana-rpc.service.ts:81-102`  | POST `{ jsonrpc: '2.0', id: 'solana-rpc', method, params }`; RPC `error` → `null`                            |
| `buildRpcUrls()` (private)               | `solana-rpc.service.ts:107-112` | `[primary?, public]` — primary first, public always last                                                     |

Types: `solana-rpc.types.ts` (`TokenAccountEntry`,
`GetTokenLargestAccountsResult`, `AccountInfoResult`). Module wiring:
`solana-rpc.module.ts` (default config + `forRoot` override).

## Example

```json
// getTokenLargestAccounts request
{ "jsonrpc": "2.0", "id": "solana-rpc", "method": "getTokenLargestAccounts",
  "params": ["<mint>"] }

// response → service returns result.value
{ "jsonrpc": "2.0", "result": { "context": { "slot": 1114 }, "value": [
  { "address": "FYjHNoFtSQ5uijKrZFyYAxvEr87hsKXkXcxkcmkBAf4r",
    "amount": "771", "decimals": 2, "uiAmount": 7.71, "uiAmountString": "7.71" } ] } }
```

```json
// getAccountInfo request
{ "jsonrpc": "2.0", "id": "solana-rpc", "method": "getAccountInfo",
  "params": ["<address>", { "encoding": "base58", "commitment": "confirmed" }] }

// account exists → service returns result.value
{ "jsonrpc": "2.0", "result": { "context": { "slot": 341197053 }, "value": {
  "data": ["", "base58"], "executable": false, "lamports": 88849814690250,
  "owner": "11111111111111111111111111111111",
  "rentEpoch": 18446744073709551615 } } }

// missing account → result.value is null → service returns null
{ "jsonrpc": "2.0", "result": { "context": { "slot": 341197053 }, "value": null } }
```

## Error modes

- RPC `error` payload → debug log, try next URL (`null` if exhausted)
  (`solana-rpc.service.ts:92-95`).
- HTTP 404 → short-circuit `null`, no fallback
  (`solana-rpc.service.ts:98`).
- Other transport errors/timeout → debug log, fall through to next URL;
  all URLs failing → `null` (`solana-rpc.service.ts:99-100`, loop at
  `:49-57` / `:69-78`).

## Endpoint catalog (full Solana JSON-RPC surface)

Catalog verified 2026-09-27 against
<https://solana.com/docs/rpc/http> (HTTP methods) and
<https://solana.com/docs/rpc/websocket> (PubSub). Legend: USED-TODAY =
called by `solana-rpc.service.ts`; AVAILABLE = standard method,
reachable today via a hand-rolled POST (no wrapper). The adapter is
HTTP-only — every `*Subscribe` row needs a new WebSocket transport
before the gateway can use it.

### USED-TODAY (2)

| Method                    | Code                       | Gateway need            |
| ------------------------- | -------------------------- | ----------------------- |
| `getTokenLargestAccounts` | `solana-rpc.service.ts:45` | Top-20 holders (served) |
| `getAccountInfo`          | `solana-rpc.service.ts:65` | Chain probing (served)  |

### AVAILABLE — Accounts (5 further methods)

| Method                              | Gateway need                                 |
| ----------------------------------- | -------------------------------------------- |
| `getBalance`                        | Wallet SOL balance (snapshot field)          |
| `getLargestAccounts`                | Whale watching (concentration signals)       |
| `getMinimumBalanceForRentExemption` | Rent quote (future tx-building path)         |
| `getMultipleAccounts`               | Batch state reads (snapshot fan-out)         |
| `getProgramAccounts`                | Program-owned account scans (protocol stats) |

### AVAILABLE — Tokens (3 further methods)

| Method                       | Gateway need                                |
| ---------------------------- | ------------------------------------------- |
| `getTokenAccountBalance`     | Single holder balance (distribution detail) |
| `getTokenAccountsByDelegate` | Delegate exposure (risk signals)            |
| `getTokenAccountsByOwner`    | Wallet SPL portfolio (wallet snapshot)      |
| `getTokenSupply`             | Mint supply (mcap computation)              |

### AVAILABLE — Transactions (11 methods)

| Method                        | Gateway need                               |
| ----------------------------- | ------------------------------------------ |
| `getFeeForMessage`            | Fee quote (tx-building path)               |
| `getLatestBlockhash`          | Fresh blockhash (tx-building path)         |
| `getRecentPrioritizationFees` | Priority-fee estimation (send path)        |
| `getSignaturesForAddress`     | Address tx list (activity feed, audit)     |
| `getSignatureStatuses`        | Confirmation tracking (send path)          |
| `getTransaction`              | Tx detail by signature (audit, explorer)   |
| `getTransactionCount`         | Network throughput (health dashboard)      |
| `isBlockhashValid`            | Tx validity check (send path)              |
| `requestAirdrop`              | Devnet faucet only (no gateway use)        |
| `sendTransaction`             | Signed-tx submission (future trading path) |
| `simulateTransaction`         | Pre-flight simulation (send path safety)   |

### AVAILABLE — Blocks (10 methods)

| Method                        | Gateway need                             |
| ----------------------------- | ---------------------------------------- |
| `getBlock`                    | Block explore (audit, backfill)          |
| `getBlockCommitment`          | Slot commitment weight (confidence)      |
| `getBlockHeight`              | Chain height (health dashboard)          |
| `getBlockProduction`          | Validator production stats (health)      |
| `getBlocks`                   | Slot-range scans (backfill windows)      |
| `getBlocksWithLimit`          | Bounded slot scans (backfill windows)    |
| `getBlockTime`                | Block timestamps (time-series alignment) |
| `getFirstAvailableBlock`      | Ledger floor (backfill bounds)           |
| `getRecentPerformanceSamples` | 60-s perf samples (network health)       |
| `minimumLedgerSlot`           | Local ledger floor (backfill bounds)     |

### AVAILABLE — Cluster (15 methods)

| Method                   | Gateway need                             |
| ------------------------ | ---------------------------------------- |
| `getClusterNodes`        | Node topology (infra observability)      |
| `getEpochInfo`           | Epoch clock (staking-aware features)     |
| `getEpochSchedule`       | Epoch params (staking-aware features)    |
| `getGenesisHash`         | Cluster guard (mainnet vs devnet check)  |
| `getHealth`              | Node health (readiness probe)            |
| `getHighestSnapshotSlot` | Snapshot freshness (infra observability) |
| `getIdentity`            | Node identity (infra observability)      |
| `getLeaderSchedule`      | Leader schedule (timing-sensitive sends) |
| `getMaxRetransmitSlot`   | Retransmit tip (infra observability)     |
| `getMaxShredInsertSlot`  | Shred-insert tip (infra observability)   |
| `getSlot`                | Chain tip (freshness anchor)             |
| `getSlotLeader`          | Current leader (timing-sensitive sends)  |
| `getSlotLeaders`         | Leader range (timing-sensitive sends)    |
| `getVersion`             | Node version (compat checks)             |
| `getVoteAccounts`        | Validator set (stake analytics)          |

### AVAILABLE — Economics (5 methods)

| Method                      | Gateway need                          |
| --------------------------- | ------------------------------------- |
| `getInflationGovernor`      | Inflation params (staking views)      |
| `getInflationRate`          | Current inflation (staking views)     |
| `getInflationReward`        | Address epoch rewards (staking views) |
| `getStakeMinimumDelegation` | Min delegation (staking views)        |
| `getSupply`                 | Circulating supply (mcap computation) |

### AVAILABLE — WebSocket subscriptions (9 pairs, transport not built)

| Subscribe ( + `*Unsubscribe`) | Gateway need                                   |
| ----------------------------- | ---------------------------------------------- |
| `accountSubscribe`            | Live balance/state push (realtime snapshot)    |
| `programSubscribe`            | Program-account change feed (protocol monitor) |
| `logsSubscribe`               | Log-matched tx feed (event-driven triggers)    |
| `signatureSubscribe`          | Confirmation push (send-path UX)               |
| `blockSubscribe`              | Block push (realtime indexer)                  |
| `rootSubscribe`               | Finalized-root push (finality gate)            |
| `slotSubscribe`               | Slot push (freshness heartbeat)                |
| `slotsUpdatesSubscribe`       | Slot lifecycle events (validator-grade timing) |
| `voteSubscribe`               | Gossip vote feed (validator observability)     |
