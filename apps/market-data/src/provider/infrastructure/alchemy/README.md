# Alchemy provider

> Cost: KEYED (`ALCHEMY_API_KEY`) — chain kind, fallback only. Without the key every method returns null (skip, never throws); zero-cost cascade never spends on it.

EVM chain-data adapter (Ethereum mainnet JSON-RPC + Alchemy Enhanced API).
Kind: `chain` (registry: `provider-descriptor.ts:70-74`).

> Catalog verified against official docs on **2026-09-27**.
> Sections marked **USED-TODAY** are wired in `alchemy.service.ts`
> (cross-checked 2026-09-27); sections marked **AVAILABLE** are
> docs-cited upstream endpoints NOT yet wired — candidates for future
> gateway/aggregator work. No endpoint below is invented: every entry
> links its official reference page.

## What it provides

Chain data, not price / holders / security data:

- Account state: ETH balance, contract bytecode (EOA vs contract), `eth_call`
- Chain identity: chain id, latest block number
- Token balances: `alchemy_getTokenBalances` (Enhanced API)
- Logs and receipts: `eth_getLogs`, `eth_getTransactionReceipt`

## Base URL

`https://eth-mainnet.g.alchemy.com/v2` (`alchemy.service.ts` `BASE`) for
the legacy mainnet-only methods. Lane T (todo 22) adds the per-chain
table `EVM_CHAIN_TRANSPORTS` (`alchemy.chains.ts`): OUR chain id →
`https://<subdomain>.g.alchemy.com/v2/{apiKey}` (ethereum→eth-mainnet,
base→base-mainnet, bsc→bnb-mainnet, arbitrum→arb-mainnet,
polygon→polygon-mainnet, optimism→opt-mainnet,
unichain→unichain-mainnet). Robinhood has NO row (no known Alchemy
slug, Multicall3 unverified — `isChainSupported` false, transports
resolve fail-open nulls until a verified row lands).

## Auth

API key in the URL path. Config token `ALCHEMY_CONFIG`
(`alchemy.config.ts:1-5`); `AlchemyModule` reads the `app.alchemy`
namespace from `ConfigService` and falls back to `{ apiKey: '' }`
(`alchemy.module.ts:8-13`). Missing key: constructor warns
`ALCHEMY_API_KEY missing` (`alchemy.service.ts:39-43`) and every method
returns `null` (disabled, never throws).

## Rate limits

- Registry budget: 300 req/min (`provider-descriptor.ts:70-74`).
- Upstream Alchemy limits are plan-based compute units, not a fixed
  per-method RPS — see https://www.alchemy.com/docs/reference/error-reference.md
  (`Monthly capacity limit exceeded` → 403). No client-side throttle here.
- Per-method CU is published in each method's OpenRPC spec
  (e.g. `eth_getBalance` costs 20 CU — see
  https://www.alchemy.com/docs/chains/ethereum/ethereum-api-endpoints/eth-get-balance).

## USED-TODAY — Methods → code

Every row cross-checked with `alchemy.service.ts` on 2026-09-27.
Transport for all: `POST /v2/{apiKey}` JSON-RPC 2.0, 8 s timeout.

| Method                                               | Code                         | Upstream                                                                                  | SnapshotQuote / gateway need                                             |
| ---------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `rpcCall(method, params?)`                           | `alchemy.service.ts:66-93`   | generic JSON-RPC POST, 8 s timeout                                                        | shared transport for every row below                                     |
| `getBalance(address)`                                | `alchemy.service.ts:105-107` | `eth_getBalance [address, latest]`                                                        | wallet-kind snapshots (`GET /api/v1/addresses/:chain/:address`)          |
| `getCode(address)` / `getCode(chain, address)`       | `alchemy.service.ts`         | `eth_getCode [address, latest]` per chain (single-arg = mainnet, backend-prober contract) | kind probe (EOA vs contract) + Lane T existence checks                   |
| `getTransactionCount(chain, address)`                | `alchemy.service.ts`         | `eth_getTransactionCount [address, latest]` per chain (Lane T)                            | hex nonce, EOA-vs-dead signal                                            |
| `ethCall(chain, to, data, block?)`                   | `alchemy.service.ts`         | `eth_call [{ to, data }, block]` per chain (Lane T, was mainnet-only)                     | raw on-chain reads + Multicall3 aggregate transport                      |
| `rpcCallForChain(chain, method, params?, {signal}?)` | `alchemy.service.ts`         | per-chain POST, 8 s timeout, AbortSignal passthrough                                      | shared transport for the three rows above                                |
| `tryAggregate(chain, calls)`                         | `multicall.service.ts`       | ONE `eth_call` to Multicall3 `0xcA11…CA11` + documented per-call fallback                 | batched reads, tryAggregate semantics (one revert never fails the batch) |
| `getChainId()`                                       | `alchemy.service.ts:140-144` | `eth_chainId`, hex → number                                                               | chain-detect edge (`GET /api/v1/chains/detect`)                          |
| `getTokenBalances(address, contracts?)`              | `alchemy.service.ts:157-168` | `alchemy_getTokenBalances`; default `DEFAULT_TOKENS`                                      | wallet holdings for wallet-kind snapshots / batch POST                   |
| `getLogs(filter)`                                    | `alchemy.service.ts:180-190` | `eth_getLogs [filter]`, returns `r?.logs ?? null`                                         | event-scan jobs (Swap/Transfer), future trade-activity signals           |
| `getTransactionReceipt(txHash)`                      | `alchemy.service.ts:198-204` | `eth_getTransactionReceipt [txHash]`                                                      | receipt status/logs for future tx-lookup gateway                         |
| `getBlockNumber()`                                   | `alchemy.service.ts:211-215` | `eth_blockNumber`, hex → number                                                           | freshness anchor for cached snapshots (30 s TTL)                         |

## AVAILABLE — Full upstream catalog (not wired)

Same transport (`POST /v2/{apiKey}`) and same auth (key in path)
unless noted. Response shape is JSON-RPC `{ jsonrpc, id, result }`
unless noted.

### A. Standard Ethereum JSON-RPC (Chain API)

Docs index: https://www.alchemy.com/docs/reference/api-overview.
Per-method pages live under
`https://www.alchemy.com/docs/chains/ethereum/ethereum-api-endpoints/<slug>`.

| JSON-RPC method                          | Params                                          | Response shape              | Gateway need (future)                                                                    |
| ---------------------------------------- | ----------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| `eth_getBlockByNumber`                   | `[blockTag, fullTx?]`                           | block object (hash, txs, …) | block-anchored snapshot history (`snapshot-history.repository`)                          |
| `eth_getBlockByHash`                     | `[blockHash, fullTx?]`                          | block object                | same as above, hash-addressed                                                            |
| `eth_getTransactionByHash`               | `[txHash]`                                      | tx object or `null`         | future tx-lookup gateway alongside `getTransactionReceipt`                               |
| `eth_getTransactionCount` (WIRED Lane T) | `[address, blockTag]`                           | hex quantity (nonce)        | `getTransactionCount(chain, address)` — wallet-activity signal for wallet-kind snapshots |
| `eth_gasPrice`                           | `[]`                                            | hex wei                     | execution-quality / fee context for Dexter (todo 9)                                      |
| `eth_maxPriorityFeePerGas`               | `[]`                                            | hex wei                     | same as above (EIP-1559 chains)                                                          |
| `eth_feeHistory`                         | `[blockCount, newestBlock, rewardPercentiles?]` | baseFee + reward history    | fee-trend panel for Dexter / data dashboard (todos 7, 9)                                 |
| `eth_estimateGas`                        | `[txObject, blockTag?]`                         | hex gas units               | pre-trade estimates for Dexter                                                           |
| `eth_getStorageAt`                       | `[address, slot, blockTag]`                     | hex storage value           | deep token-identity reads (owner slots, pause flags)                                     |
| `eth_call` (with state override)         | `[{ to, data }, blockTag, stateOverride?]`      | hex return data             | batched view reads without new endpoints                                                 |

### B. Alchemy Token API (Enhanced, same JSON-RPC transport)

Docs: https://www.alchemy.com/docs/reference/token-api-overview and
https://www.alchemy.com/docs/reference/token-api-quickstart.

| JSON-RPC method             | Params                               | Response shape                      | Gateway need (future)                                         |
| --------------------------- | ------------------------------------ | ----------------------------------- | ------------------------------------------------------------- |
| `alchemy_getTokenMetadata`  | `[contractAddress]`                  | `{ decimals, logo, name, symbol }`  | `symbol`/`name` SnapshotQuote fields for kind=token snapshots |
| `alchemy_getTokenAllowance` | `[contractAddress, owner, spender]`  | `{ allowance }`                     | approval-risk signal for future security aggregator           |
| Token Prices API            | by symbol or address (REST/JSON-RPC) | real-time + historical token prices | `priceUsd` fallback for EVM tokens (today Birdeye-first)      |

### C. Alchemy Transfers API (Enhanced, same JSON-RPC transport)

Docs: https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers.

| JSON-RPC method             | Params                                                                                         | Response shape                                                          | Gateway need (future)                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `alchemy_getAssetTransfers` | `[{ fromBlock, toBlock, fromAddress?, toAddress?, contractAddresses?, category[], pageKey? }]` | `{ transfers[], pageKey? }` (external/internal/ERC-20/ERC-721/ERC-1155) | wallet-activity history for wallet-kind snapshots; KOL-wallet intel |

### D. Other Data APIs (REST, same API key)

Docs: https://www.alchemy.com/docs/reference/data-overview.

| API                       | Endpoint shape                                                                      | Response shape            | Gateway need (future)                                    |
| ------------------------- | ----------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| NFT API `getNftsForOwner` | indexed NFT ownership per address                                                   | NFTs + metadata per owner | wallet-kind snapshot enrichment (holdings beyond ERC-20) |
| Portfolio API             | `POST https://api.g.alchemy.com/data/v1/{apiKey}/assets/tokens/balances/by-address` | token balances by wallet  | batch wallet snapshots (`POST /api/v1/addresses/batch`)  |
| Simulation API            | pre-send tx simulation                                                              | state-change preview      | Dexter pre-trade safety (todo 9)                         |
| Utility API               | e.g. blocks-by-timestamp, tx receipts                                               | indexed helpers           | snapshot-history backfill by time                        |
| Webhooks                  | push on transfers / txs / balance changes                                           | event callbacks           | push alternative to the 30 s poll model                  |

### E. WebSocket subscriptions (AVAILABLE, transport not wired)

Docs: https://www.alchemy.com/docs (Chain APIs → WebSockets:
"Subscribe to pending transactions, log events, new blocks, and more").
The adapter uses HTTP POST only; no WS client exists here.

| Subscription (`eth_subscribe`) | Params     | Push shape    | Gateway need (future)                                     |
| ------------------------------ | ---------- | ------------- | --------------------------------------------------------- |
| `newHeads`                     | —          | block headers | live freshness anchor instead of `getBlockNumber` polling |
| `logs`                         | `[filter]` | log entries   | live Swap/Transfer feed (replaces `getLogs` polling)      |
| `pendingTransactions`          | —          | tx hashes     | mempool-early token discovery                             |

## Example

Request (`getBalance` → `rpcCall`):

```json
POST https://eth-mainnet.g.alchemy.com/v2/{apiKey}
{ "jsonrpc": "2.0", "id": "alc-1727443200000", "method": "eth_getBalance", "params": ["0x00000000219ab540356cBB839Cbe05303d7705Fa", "latest"] }
```

Response (hex wei, returned as-is):

```json
{ "jsonrpc": "2.0", "id": "alc-1727443200000", "result": "0x0234c8a3397aab58" }
```

## Error modes

All failures collapse to `null` (callers fall through to the next
provider). Proven paths only:

- No API key → `null` before any HTTP (`alchemy.service.ts:70`).
- JSON-RPC `error` payload → debug log + `null` (`alchemy.service.ts:82-87`).
- Network/timeout/parse throw → debug log + `null`
  (`alchemy.service.ts:89-92`).
- Upstream 401 (`Must be authenticated!` / `Invalid access key`) and 403
  (`Monthly capacity limit exceeded`, allowlist) surface as thrown HTTP
  errors or JSON-RPC error payloads — both become `null` here.
