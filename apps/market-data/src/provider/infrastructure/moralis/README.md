# Moralis provider

> Cost: KEYED (`MORALIS_API_KEY`) — fallback tier `keyed`. Without the key every method returns null (skip, never throws); zero-cost cascade never spends on it.

EVM-only market-data adapter (analytics, holders, metadata, price,
wallet balances). Kind: `market` (registry:
`provider-descriptor.ts:63-68`).

## What it provides

- Analytics: price, liquidity, FDV, 24 h change (`getTokenAnalytics`)
- Holders: total count + top-10 supply percent
  (`getTokenHolders`)
- Metadata: token logo (`getTokenMetadata`)
- Price: lightweight USD lookup (`getTokenPrice`)
- Wallet: all ERC-20 balances with USD values (`getWalletBalances`)

No Solana: `CHAIN_MAP` covers ethereum, bsc, base, arbitrum, polygon
only (`moralis.service.ts:34-40`). Unknown chain or missing key returns
`null` before any HTTP.

## Base URL

`https://deep-index.moralis.io/api/v2.2` (`moralis.service.ts:16`).

## Auth

`X-API-Key` header on every request (`moralis.service.ts:79`, `121`,
`164`, `193`, `226`). Config token `MORALIS_CONFIG`
(`moralis.config.ts:1-5`); `MoralisModule` reads the `app.moralis`
namespace from `ConfigService` and falls back to `{ apiKey: '' }`
(`moralis.module.ts:8-13`). Missing key: constructor warns
`MORALIS_API_KEY missing` (`moralis.service.ts:45-49`) and every method
returns `null` (disabled, never throws). Key source: Moralis dashboard
(`MORALIS_API_KEY`); `onModuleInit` logs only when a key is present
(`moralis.service.ts:52-56`).

## Rate limits

- Registry budget: 60 req/min (`provider-descriptor.ts:63-68`).
- Upstream is plan-based (Compute Units per endpoint, e.g. holder stats
  cost 50 CU per docs; quotas live in the Moralis dashboard, not here).
  No client-side throttle here; all calls use an 8 s timeout.

## Methods → code

| Method                              | Code                         | Upstream                                 |
| ----------------------------------- | ---------------------------- | ---------------------------------------- |
| `getTokenAnalytics(address, chain)` | `moralis.service.ts:68-98`   | `GET /tokens/{address}/analytics?chain=` |
| `getTokenHolders(address, chain)`   | `moralis.service.ts:110-141` | `GET /erc20/{address}/holders?chain=`    |
| `getTokenMetadata(address, chain)`  | `moralis.service.ts:153-174` | `GET /erc20/metadata?chain=&addresses=`  |
| `getTokenPrice(address, chain)`     | `moralis.service.ts:182-203` | `GET /erc20/{address}/price?chain=`      |
| `getWalletBalances(wallet, chain)`  | `moralis.service.ts:215-235` | `GET /wallets/{wallet}/tokens?chain=`    |

Types: `moralis.types.ts:1-55` (raw responses plus normalised
`MoralisTokenAnalytics`, `MoralisTokenHolderSummary`).

## Example

Request (`getTokenAnalytics`):

```http
GET https://deep-index.moralis.io/api/v2.2/tokens/0xdAC17F958D2ee523a2206206994597C13D831ec7/analytics?chain=eth
X-API-Key: YOUR_API_KEY
```

Response (normalised per `moralis.service.ts:83-92`):

```json
{
  "priceUsd": 1.0,
  "liquidityUsd": 530.0,
  "fdvUsd": 530.0,
  "priceChange24h": 2.5
}
```

## Error modes

All failures collapse to `null` (callers fall through to the next
provider). Proven paths only:

- No API key or unknown chain → `null` before any HTTP
  (`moralis.service.ts:73`, `115`, `158`, `187`, `220`).
- HTTP 404 → `null` without logging (analytics, holders, metadata,
  price: `moralis.service.ts:94`, `137`, `170`, `199`). Wallet
  balances has no 404 fast-path — every throw is debug-logged
  (`moralis.service.ts:232`).
- Any other throw (401 bad key, 429 rate limit, timeout) → debug log +
  `null` (`moralis.service.ts:95-96`, `138-139`, `171-172`,
  `200-201`, `232-233`).

## Endpoint catalog — exhaustive reference

Verified 2026-09-27 against the official docs index
(`https://docs.moralis.com/llms.txt` → Global API Reference,
`https://moralis.mintlify.app/get-started/global-api-reference`).
EVM base for every path below:
`https://deep-index.moralis.io/api/v2.2`.

Convention: USED-TODAY rows cite the adapter code (ground truth);
AVAILABLE rows cite the official docs page — a literal path is shown
only where the docs show it verbatim, otherwise the docs-page slug
(no guessed paths).

### USED-TODAY (wired in this adapter)

| Adapter method      | Literal HTTP (from code)          | Code                         |
| ------------------- | --------------------------------- | ---------------------------- |
| `getTokenAnalytics` | `GET /tokens/{address}/analytics` | `moralis.service.ts:75-82`   |
| `getTokenHolders`   | `GET /erc20/{address}/holders`    | `moralis.service.ts:117-124` |
| `getTokenMetadata`  | `GET /erc20/metadata`             | `moralis.service.ts:160-167` |
| `getTokenPrice`     | `GET /erc20/{address}/price`      | `moralis.service.ts:189-196` |
| `getWalletBalances` | `GET /wallets/{wallet}/tokens`    | `moralis.service.ts:222-229` |

### AVAILABLE — EVM Token API (not wired) → gateway needs

Prices:

| Upstream endpoint    | Docs page                                      | Future gateway need                         |
| -------------------- | ---------------------------------------------- | ------------------------------------------- |
| `POST /erc20/prices` | `data-api/evm/token/prices/token-prices-batch` | Batch-50 snapshot fan-out, no N round trips |
| OHLC candlesticks    | `data-api/evm/token/prices/ohlc`               | Candle/sparkline charts (frontend todo 7)   |

Transfers:

| Upstream endpoint                                                | Docs page                                      | Future gateway need                      |
| ---------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------- |
| `GET /:address/erc20/transfers`, `GET /erc20/:address/transfers` | `data-api/evm/token/transfers/token-transfers` | Whale/activity feed, volume confirmation |

Metadata & scores:

| Upstream endpoint      | Docs page                                            | Future gateway need                |
| ---------------------- | ---------------------------------------------------- | ---------------------------------- |
| Token Score            | `data-api/evm/token/metadata/token-score`            | Security-aggregator input (todo 3) |
| Token Score Timeseries | `data-api/evm/token/metadata/token-score-timeseries` | Score trend inside snapshots       |

Pairs & swaps:

| Upstream endpoint                 | Docs page                              | Future gateway need                             |
| --------------------------------- | -------------------------------------- | ----------------------------------------------- |
| `GET /erc20/:token_address/pairs` | `data-api/evm/token/swaps/token-pairs` | Pair discovery, pool-level depth                |
| Pair Stats                        | `data-api/evm/token/swaps/pair-stats`  | Per-pool stats for the snapshot liquidity field |
| Pair Swaps                        | `data-api/evm/token/swaps/pair-swaps`  | Trade tape per pair                             |
| Token Swaps                       | `data-api/evm/token/swaps/token-swaps` | Buy/sell pressure signal                        |

Holders:

| Upstream endpoint                             | Docs page                                                          | Future gateway need                                  |
| --------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| `GET /erc20/{token_address}/owners`           | `data-api/evm/token/holders/token-holders`                         | Whale table (top-N + % of supply), richer than stats |
| `GET /erc20/:tokenAddress/holders/historical` | migration list (`docs.moralis.com/data-feeds/migration/endpoints`) | Holder-growth trend                                  |

Discovery & signals:

| Upstream endpoint | Docs page                                       | Future gateway need                               |
| ----------------- | ----------------------------------------------- | ------------------------------------------------- |
| Token Search      | `data-api/universal/token/search/token-search`  | Symbol/name resolution (ticker-resolver fallback) |
| Token Categories  | `data-api/evm/token/discovery/token-categories` | Category tag filter                               |
| Top Traders       | `data-api/evm/token/signals/top-traders`        | Smart-money leaderboard                           |
| Trending Tokens   | `data-api/universal/token/trending-tokens`      | Discovery feed                                    |

### AVAILABLE — EVM Wallet API (not wired) → gateway needs

| Upstream endpoint                        | Docs page                                                                                                                   | Future gateway need                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Native Balance / Native Balances (batch) | `data-api/evm/wallet/native-balance`, `data-api/evm/wallet/native-balances-batch`                                           | Native denominator for net worth          |
| `GET /wallets/:address/net-worth`        | `data-api/evm/wallet/net-worth`                                                                                             | Single-call portfolio USD total           |
| Wallet P&L / P&L Summary                 | `data-api/evm/wallet/wallet-pnl`, `data-api/evm/wallet/wallet-pnl-summary`                                                  | KOL-wallet performance (reputation input) |
| Wallet Stats                             | `data-api/evm/wallet/wallet-stats`                                                                                          | Wallet quality card                       |
| Wallet Swaps                             | `data-api/evm/wallet/wallet-swaps`                                                                                          | Swap-activity feed per tracked wallet     |
| `GET /wallets/:address/approvals`        | `data-api/evm/wallet/approvals`                                                                                             | Allowance-risk signal                     |
| `GET /wallets/:address/chains`           | `data-api/evm/wallet/chain-activity`                                                                                        | Multi-chain footprint                     |
| Wallet History / Transactions / Decoded  | `data-api/evm/wallet/wallet-history`, `data-api/evm/wallet/wallet-transactions`, `data-api/evm/wallet/decoded-transactions` | Tracked-wallet activity feed              |
| Wallet Protocols / Positions / Detailed  | `data-api/evm/wallet/wallet-protocols`, `data-api/evm/wallet/wallet-positions`, `data-api/evm/wallet/detailed-positions`    | DeFi exposure section                     |
| ENS Lookup / Resolve Address             | `data-api/evm/wallet/ens-lookup`, `data-api/evm/wallet/resolve-address`                                                     | Human-readable wallet labels              |

(Token Balances `GET /wallets/:address/tokens` is the same family as
the USED `getWalletBalances` endpoint above.)

### AVAILABLE — Solana + Universal (not wired) → gateway needs

The adapter is EVM-only today (`CHAIN_MAP` has no `solana`); these
are the cutover surface if Solana ever moves to Moralis (Solana reads
currently come from Helius/Birdeye):

- Solana Token: metadata (+batch), score (+timeseries), price
  (+batch), OHLC, pairs/stats/swaps, analytics (+batch, +timeseries),
  search (`data-api/solana/token/…`).
- Solana Wallet: native/SPL balances, swaps, portfolio, NFTs
  (`data-api/solana/wallet/…`).
- Universal Token: analytics (+multi, +timeseries), score
  (+timeseries) (`data-api/universal/token/…`); Entity search / by-id /
  by-category / categories (`data-api/universal/entity/endpoints/…`)
  — exchange/protocol labels for counterparties.

### Explicitly out of scope for market-data v1

EVM NFT API (collections/metadata/prices/trades/transfers/traits),
Solana NFT/Price APIs, EVM Blockchain API (blocks/transactions/logs),
Streams API (webhook push model — conflicts with the poll/snapshot
v1). Revisit only with a gateway decision + todo.
