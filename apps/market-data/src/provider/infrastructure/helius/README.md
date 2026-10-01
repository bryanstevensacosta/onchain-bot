# Helius — Solana Data Provider

> Cost: KEYED (`HELIUS_API_KEY`) — chain kind, fallback only. Without the key every method returns null (skip, never throws); zero-cost cascade never spends on it.

Helius adapter: Solana RPC (standard + DAS) plus the Enhanced Transactions
API for token metadata, holder counts, and parsed transactions.
Solana-only (`supportsChains: ['solana']`, kind `chain`, 300 req/min
internal budget — see `../../domain/provider-descriptor.ts:76-80`).

## What it provides

- SPL holder counts via the `getTokenAccounts` RPC method.
- Asset metadata (name, symbol, image, supply, price) via the DAS `getAsset`
  method.
- Parsed transactions and address history via the Enhanced Transactions API.

## Base URLs

| Surface           | URL                                                          | Code                    |
| ----------------- | ------------------------------------------------------------ | ----------------------- |
| RPC + DAS         | `https://mainnet.helius-rpc.com`                             | `helius.service.ts:12`  |
| DAS endpoint      | `RPC_BASE + /?api-key=<key>`                                 | `helius.service.ts:36`  |
| Parse transaction | `https://api.helius.xyz/v0/transactions/`                    | `helius.service.ts:156` |
| Address history   | `https://api.helius.xyz/v0/addresses/{address}/transactions` | `helius.service.ts:186` |

Docs: <https://docs.helius.dev/> · DAS: <https://www.helius.dev/docs/das-api>
· Enhanced Transactions: <https://www.helius.dev/docs/enhanced-transactions>
(note: current docs show `api-mainnet.helius-rpc.com/v0/...`; the code
still targets the legacy `api.helius.xyz/v0/...` host).

## Auth

API key required. Env (via backend shims → `forRoot`; standalone
market-data has no `app.helius` key, so the provider stays disabled):

| Env                      | Maps to                       |
| ------------------------ | ----------------------------- |
| `HELIUS_API_KEY`         | `HeliusConfig.apiKey`         |
| `HELIUS_RPC_URL_MAINNET` | `HeliusConfig.mainnet.rpcUrl` |

Missing key or RPC URL → constructor warns and every method returns
`null` (`helius.service.ts:34-43`). Key travels as `?api-key=<key>`
query param on all four surfaces.

## Rate limits

- Internal budget: 300 req/min (`provider-descriptor.ts:79`).
- Helius free tier is credit-based (~1M credits/month); each RPC call
  counts. HTTP timeout is 8 s per call (`helius.service.ts:75`).

## Key methods → code

| Method                                   | Code                        | Upstream                                                                                       |
| ---------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| `getTokenAccounts(mint)`                 | `helius.service.ts:97-123`  | RPC `getTokenAccounts` `{ mint, page: 1, limit: 1000 }` → `{ total, distinctOwners, holders }` |
| `getAsset(id)`                           | `helius.service.ts:131-139` | DAS `getAsset` `{ id, displayOptions: { showFungible: true } }`                                |
| `parseTransaction(signature)`            | `helius.service.ts:151-171` | `POST /v0/transactions/` `{ transactions: [signature] }` → first element                       |
| `getAddressHistory(address, limit=100)`  | `helius.service.ts:180-198` | `GET /v0/addresses/{address}/transactions?apiKey=&limit=`                                      |
| `jsonRpc(url, method, params)` (private) | `helius.service.ts:63-86`   | Generic JSON-RPC POST, envelope `{ jsonrpc: '2.0', id: 'hel-<ts>', method, params }`           |

Types: `helius.types.ts` (`HeliusGetTokenAccountsResponse`,
`HeliusDasResponse`, `HeliusParsedTransaction`). Module wiring:
`helius.module.ts` (reads `app.helius`, `forRoot` override).

## Example

```json
// getAsset request (JSON-RPC over POST https://mainnet.helius-rpc.com/?api-key=<key>)
{ "jsonrpc": "2.0", "id": "hel-1", "method": "getAsset",
  "params": { "id": "<mint>", "displayOptions": { "showFungible": true } } }

// getAsset response (shape per helius.types.ts:38-48)
{ "result": {
    "content": { "metadata": { "name": "...", "symbol": "..." },
                 "links": { "image": "https://..." } },
    "token_info": { "symbol": "...", "supply": "...", "decimals": 9,
                    "price_info": { "price_per_token": 1.23, "currency": "USD" } } } }
```

```json
// parseTransaction request (POST https://api.helius.xyz/v0/transactions/?api-key=<key>)
{ "transactions": ["<signature>"] }

// parseTransaction response: array, service returns element [0]
// { "signature": "...", "slot": 123, "type": "SWAP", "fee": 5000,
//   "tokenTransfers": [{ "fromUserAccount": "...", "toUserAccount": "...",
//                        "mint": "...", "tokenAmount": 1.5 }] }
```

## Error modes

- No config → `null` (warn at construction; per-method guards at
  `helius.service.ts:102,134,154,184`).
- JSON-RPC `error` payload → debug log, `null` (`helius.service.ts:77-80`).
- Transport/timeout (8 s) → debug log, `null` (`helius.service.ts:82-85`).
- `getTokenAccounts` with zero holders → `holders: null`
  (`helius.service.ts:120-121`).
- `parseTransaction` on non-array body → `null`
  (`helius.service.ts:162-164`).

## Endpoint catalog (full Helius surface)

Catalog verified 2026-09-27 against <https://docs.helius.dev/> (index),
<https://www.helius.dev/docs/das-api>,
<https://www.helius.dev/docs/enhanced-transactions>,
<https://www.helius.dev/docs/getting-data>, and
<https://www.helius.dev/docs/api-reference>. Legend: USED-TODAY = called
by `helius.service.ts` now; AVAILABLE = exists upstream, not called by
this adapter.

### USED-TODAY (4)

| Endpoint                                            | Code                    | Gateway need                                 |
| --------------------------------------------------- | ----------------------- | -------------------------------------------- |
| DAS `getTokenAccounts`                              | `helius.service.ts:97`  | Holder counts (served)                       |
| DAS `getAsset`                                      | `helius.service.ts:131` | Token metadata (served)                      |
| Enhanced `POST /v0/transactions`                    | `helius.service.ts:151` | Parsed tx detail (served; legacy — see note) |
| Enhanced `GET /v0/addresses/{address}/transactions` | `helius.service.ts:180` | Address history (served; legacy — see note)  |

> Enhanced Transactions API is legacy in maintenance mode (no new parser
> types); its successor is Parsed Events (10 credits/req, all plans, with
> a migration guide), and `getTransactionsForAddress` covers
> history/backfill. No code change yet — future gateway work should
> target the successors, not the legacy REST shape.

### AVAILABLE — DAS API (10 further methods)

| Method                  | Gateway need                                              |
| ----------------------- | --------------------------------------------------------- |
| `getAssetBatch`         | Batch metadata for up to 1,000 mints (snapshot fan-out)   |
| `getAssetsByOwner`      | Wallet portfolio holdings (future wallet snapshot)        |
| `getAssetsByGroup`      | Collection-wide asset listing (collection analytics)      |
| `getAssetsByCreator`    | Creator-minted assets (creator tracking)                  |
| `getAssetsByAuthority`  | Authority-controlled assets (authority tracking)          |
| `searchAssets`          | Filtered queries by owner/collection/tokenType (explorer) |
| `getAssetProof`         | cNFT Merkle proof (compressed-asset support)              |
| `getAssetProofBatch`    | Batched cNFT proofs (compressed-asset support)            |
| `getSignaturesForAsset` | Asset tx history, incl. compressed (audit trail)          |
| `getNftEditions`        | Master-edition prints (NFT marketplace views)             |

### AVAILABLE — Helius-exclusive RPC (2 methods)

| Method                      | Gateway need                                        |
| --------------------------- | --------------------------------------------------- |
| `getTransactionsForAddress` | Full-history backfill in one call (indexers, audit) |
| `getTransfersByAddress`     | Reconciled SOL+token transfers (PnL, tax, tracking) |

### AVAILABLE — Wallet API, REST beta (6 endpoints)

| Endpoint   | Gateway need                                    |
| ---------- | ----------------------------------------------- |
| balances   | Portfolio with USD values (dashboard holdings)  |
| history    | Wallet tx history, simple shape (activity feed) |
| transfers  | Transfer-level history (PnL inputs)             |
| identity   | Wallet identity (compliance, labeling)          |
| funded-by  | Funding source (compliance, wallet intel)       |
| balance-at | Historical balance (PnL snapshots)              |

### AVAILABLE — fees, streaming, trading, other

| Surface / method                                                            | Gateway need                                   |
| --------------------------------------------------------------------------- | ---------------------------------------------- |
| Priority Fee API `getPriorityFeeEstimate`                                   | Fee estimation for send paths (future trading) |
| Webhooks                                                                    | Push on address events (replace polling)       |
| LaserStream gRPC                                                            | Low-latency stream + replay (realtime fan-out) |
| LaserStream WebSocket (`transactionSubscribe`, enhanced `accountSubscribe`) | Live account/tx notifications (realtime)       |
| Sender                                                                      | Reliable tx landing, validator+Jito (trading)  |
| MEV Protect                                                                 | Private routing vs sandwich (trading safety)   |
| Backrun rebates                                                             | MEV rebate capture (trading econ)              |
| Shred Delivery                                                              | Fastest tx-data path (HFT-grade streaming)     |
| Pre Confirmations                                                           | Sub-slot confirmation signals (trading speed)  |
| ZK Compression API                                                          | Compressed-account ops (infra cost, not data)  |
| Privacy Protocol                                                            | Shielded transfers (product surface, not data) |
| Standard Solana RPC (full list — see `../solana-rpc/README.md`)             | Any RPC method over the Helius endpoint        |
