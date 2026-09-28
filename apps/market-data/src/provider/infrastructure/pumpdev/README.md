# PumpDev provider

> Cost: KEYED (`PUMPDEV_API_KEY`) — trading kind, fallback only. Without the key every method returns null (skip, never throws); zero-cost cascade never spends on it.

pump.fun trading / token-creation adapter via the PumpDev REST API
(`https://pumpdev.io/`, see `@see` in `pumpdev.service.ts:25`).

- Service: `pumpdev.service.ts` (`PumpDevService`, `name = 'pumpdev'`)
- Registry: kind `trading`, chains `['solana']`, internal budget
  `rateLimitPerMin: 60` (`../../domain/provider-descriptor.ts`)

## Base URL

`https://pumpdev.io/api` — hardcoded `BASE` (`pumpdev.service.ts:16`).
Not overridable via config.

## Auth

- Header `X-API-Key: <apiKey>` on every call
  (`pumpdev.service.ts:71,97,131,154,179,204`).
- Key comes from `PumpDevConfig.apiKey` (`pumpdev.config.ts:3-7`).
  `PumpDevModule` reads `app.pumpdev` from `ConfigService`
  (`pumpdev.module.ts:12`); no `app.pumpdev` key exists in the shared
  app config, so it falls back to `{ apiKey: '', walletPublic: '',
walletPrivate: '' }` (`pumpdev.module.ts:12-16`).
- Missing key: constructor warns `PUMPDEV_API_KEY missing`
  (`pumpdev.service.ts:37-41`) and **every method returns `null`**
  without HTTP. Present key: `onModuleInit` logs initialized
  (`pumpdev.service.ts:44-48`).

## Rate limits

- Internal registry budget: 60/min (failover ordering only).
- Upstream quota: not documented in code; PumpDev prices per-call
  (0.25% commission per its site). Timeouts: `8_000` ms on every call.

## Methods

| Method                   | Code                     | HTTP                                                                                                                                                                              |
| ------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tradeLocal(params)`     | `pumpdev.service.ts:59`  | `POST /trade-local` (`pumpdev.service.ts:68-72`) — client-side signing: returns serialized tx to sign locally (`publicKey`, `buy`\|`sell`, `mint`, `amount`, `denominatedInSol?`) |
| `tradeLightning(params)` | `pumpdev.service.ts:88`  | `POST /trade-lightning` (`pumpdev.service.ts:95-99`) — server-side execution, one call (`action`, `mint`, `amount`)                                                               |
| `createToken(params)`    | `pumpdev.service.ts:119` | `POST /create` (`pumpdev.service.ts:128-132`) — client-side token creation (`name`, `symbol`, `description?`, `image?`, `amount?`)                                                |
| `createBundle(params)`   | `pumpdev.service.ts:146` | `POST /create-bundle` (`pumpdev.service.ts:151-155`) — atomic Jito multi-buyer launch (`PumpDevBundleRequest`, `pumpdev.types.ts:31-37`)                                          |
| `claimAccount()`         | `pumpdev.service.ts:173` | `POST /claim-account` with `{}` body (`pumpdev.service.ts:176-180`) — claim creator fees                                                                                          |
| `transfer(params)`       | `pumpdev.service.ts:196` | `POST /transfer` (`pumpdev.service.ts:201-205`) — SOL transfer (`to`, `amount`, `pumpdev.types.ts:45-48`)                                                                         |

Response shapes: `pumpdev.types.ts` (`PumpDevTradeResponse`,
`PumpDevCreateTokenResponse`, `PumpDevBundleResponse`,
`PumpDevTransferResponse`, `PumpDevClaimResponse` — all
`{ success, txId?, error? }`, plus `mint?` / `amount?` where noted).

Not wired (upstream offers, this adapter does not call):
`/create-lightning`, `/bundle-lightning`, `/bundle`, `/trade-bundle`,
`/transfer-all`, `/claim-distribute`, `/claim-cashback`, `/ws`.

## Example

```bash
curl -X POST 'https://pumpdev.io/api/trade-lightning' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: YOUR_KEY' \
  -d '{"action":"buy","mint":"TokenMintAddress","amount":0.1}'
```

```json
{ "success": true, "txId": "<signature>" }
```

Docs: `https://pumpdev.io/` and
`https://github.com/pumpdev3/pumpdev.io` (endpoint table).

## Error modes

- Missing `apiKey` → `null`, no HTTP (every method guards first).
- `404` → `null` (each method: `pumpdev.service.ts:75,102,135,158,183,208`).
- Any other error → `logger.debug` + `null`
  (`pumpdev.service.ts:76-79`, `103-106`, `136`, `159-161`, `184-187`,
  `209`). Falsy body → `null` (`?? null` on each return).

## Endpoint catalog (full PumpDev surface)

Catalog verified 2026-09-27 against `https://pumpdev.io/` (homepage API
Reference + Lightning/trade/create/bundle/claim/transfer docs) and
`https://github.com/pumpdev3/pumpdev.io` (README endpoint table +
`examples/`). Legend: USED-TODAY = called by `pumpdev.service.ts` now;
AVAILABLE = exists upstream, not called by this adapter.

Upstream key style note: Lightning examples on `pumpdev.io` pass the
key as a `?api-key=` query param; this adapter sends an `X-API-Key`
header on every call instead.

Pricing (upstream, for future trade-path costing): 0.25% per
client-side trade/dev-buy, 0.5% per Lightning trade, token creation
without dev-buy free, SOL transfers free, WebSocket data free.

### USED-TODAY (6)

| Endpoint                | Code                     | Gateway need                                                                |
| ----------------------- | ------------------------ | --------------------------------------------------------------------------- |
| `POST /trade-local`     | `pumpdev.service.ts:59`  | Client-sign buy/sell (served; future trade execution)                       |
| `POST /trade-lightning` | `pumpdev.service.ts:88`  | One-call server-side buy/sell (served; future trade execution)              |
| `POST /create`          | `pumpdev.service.ts:119` | Client-sign token creation + optional dev buy (served; future launch)       |
| `POST /create-bundle`   | `pumpdev.service.ts:146` | Atomic create + multi-buyer Jito bundle (served; future snipe-proof launch) |
| `POST /claim-account`   | `pumpdev.service.ts:173` | Claim creator fees (served; future revenue collection)                      |
| `POST /transfer`        | `pumpdev.service.ts:196` | SOL transfer (served; future wallet management)                             |

### AVAILABLE — Lightning server-side

| Endpoint                 | Gateway need                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `POST /create-lightning` | One-call token launch (metadata, sign, send) — future launch without client signing                                    |
| `POST /bundle-lightning` | One-call Jito bundle of buy/sell/create (docs say up to 4 txs in one place, 5 in another) — MEV-protected launch/trade |
| `POST /wallet/create`    | Create Lightning wallet + API key (`label` → `apiKey`, `publicKey`, `privateKey`) — operator setup, not runtime        |
| `POST /wallet/import`    | Import existing key, get API key — operator setup, not runtime                                                         |

### AVAILABLE — local-sign bundles

| Endpoint             | Gateway need                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /bundle`       | Unified local-sign Jito bundle (returns unsigned txs; self-send to Jito) — MEV protection without key custody  |
| `POST /trade-bundle` | Multi-wallet trades in ONE request (shared blockhash, per-name results + `stats`) — 3-4x faster batch sell/buy |

### AVAILABLE — fees / cashback

| Endpoint                 | Gateway need                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET /claim-account`     | Read-only claimable balance (`publicKey` + `mint`; include `mint` for fee-sharing/graduated/non-SOL quotes) — pre-claim check |
| `POST /claim-distribute` | Distribute creator fees (fee sharing / reward split) — revenue split                                                          |
| `GET /claim-cashback`    | Read-only claimable trader cashback (`publicKey`, `program: both\|pump\|pumpswap`) — rewards balance check                    |
| `POST /claim-cashback`   | Claim trader cashback — rewards surface                                                                                       |

### AVAILABLE — transfers

| Endpoint             | Gateway need                                                  |
| -------------------- | ------------------------------------------------------------- |
| `POST /transfer-all` | Sweep entire wallet balance minus fees — wallet consolidation |

### AVAILABLE — realtime WebSocket (`wss://pumpdev.io/ws`, free)

Streams bonding-curve + PumpSwap AMM events; token subscriptions
auto-follow migration (no re-subscribe). Methods: `subscribeNewToken`,
`subscribeTokenTrade` (`keys: [mints]`), `subscribeAccountTrade`
(`keys: [wallets]`), plus the three `unsubscribe*` counterparts.
Event `txType`s: `create`, `buy`, `sell`, `complete` (migration),
`create_pool`. Limits: anon 5 subs / 10k trades/mo; free account 25
subs / 50k trades/mo; paid up to 10k subs / 20M trades/mo, 1–15
connections by tier. Gateway need: sniper/discovery feed + whale
tracking (future `stream/` discovery input).

### Out-of-scope upstream surface

PONS (Robinhood Chain) feed/trading (`/pons-api`, `/pons-data-api`,
`/pons-trade-api`, `/pons-lightning-setup`, `/pons-create-token`) —
separate chain, not a Solana-gateway need.
