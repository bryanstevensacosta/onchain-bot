# RugCheck provider

> Cost: FREE — no API key. Zero-cost cascade tier `free` (runs 24/7 at $0).

Solana token-safety adapter. Fetches the RugCheck report summary for a
mint and exposes deterministic mock data for tokens without a report.

- Service: `rugcheck.service.ts` (`RugCheckService`, `name = 'rugcheck'`)
- Registry: kind `security`, chains `['solana']`, internal budget
  `rateLimitPerMin: 60` (`../../domain/provider-descriptor.ts`)

## Base URL

- Default: `https://api.rugcheck.xyz/v1` (`rugcheck.service.ts:8`)
- Override: `RugCheckModule.forRoot({ baseUrl })`
  (`rugcheck.module.ts:14-23`). Default module uses `{ baseUrl: undefined }`
  (`rugcheck.module.ts:8`), so the service falls back to the default.

## Auth

None. Free API, no API key. (Upstream reserves the `refresh` query param
for paid keys; this adapter never sends it.)

## Rate limits

- Internal registry budget: 60/min (failover ordering only, not an
  upstream quota).
- Upstream publishes no hard public quota for the summary endpoint.

## Methods

| Method                 | Code                     | HTTP                                                                                                                                                          |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSummary(address)`  | `rugcheck.service.ts:32` | `GET {baseUrl}/tokens/{address}/report/summary` (`rugcheck.service.ts:34-37`), `timeout: 5_000`                                                               |
| `getMockData(address)` | `rugcheck.service.ts:54` | No HTTP — deterministic values from `hashCode(address)` (`rugcheck.service.ts:65-72`): `lockedLiquidityPercent: 50 + (hash % 50)`, `burnedPercent: hash % 30` |

`getSummary` returns `RugCheckSummary` (`rugcheck.types.ts:1-14`):
`tokenProgram`, `tokenType` (deprecated upstream, empty), `risks[]`,
`lockedLiquidity[]` (`amount`/`percent`/`tokenAddress`),
`totalMarketLiquidity`, `totalLPProviders`, `totalSupply`,
`burnedPercent`.

## Example

```bash
curl -H 'accept: application/json' \
  'https://api.rugcheck.xyz/v1/tokens/eb5U8spZFfJUUTS4RoterQTVTKwctzMRcd4PctZpump/report/summary'
```

```json
{
  "tokenProgram": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "tokenType": "",
  "risks": [
    {
      "name": "Low Liquidity",
      "value": "$2228.92",
      "description": "Low amount of liquidity in the token pool",
      "score": 771,
      "level": "warn"
    }
  ],
  "score": 1272,
  "score_normalised": 24,
  "lpLockedPct": 100
}
```

Docs: `https://api.rugcheck.xyz/swagger/index.html`
(`GET /v1/tokens/{id}/report/summary`).

## Error modes

- `404` → `null` (token has no report) (`rugcheck.service.ts:41-43`).
- Falsy body → `null` (`rugcheck.service.ts:38`).
- Any other transport error → `logger.debug` + `null`
  (`rugcheck.service.ts:44-45`). Callers treat `null` as "no data" and
  fall through to the next provider or mock data.

## Endpoint catalog (full RugCheck surface)

Catalog verified 2026-09-27 against
`https://api.rugcheck.xyz/swagger/index.html` (RugCheck API 1.0 index),
`https://rugcheck.xyz/api`, and the FluxRPC RugCheck mirror
(`https://fluxrpc.com/docs/rugcheck`, `/tokens`, `/stats`, plus the
GitBook `rugcheck-api` endpoint pages). Legend: USED-TODAY = called by
`rugcheck.service.ts` now; AVAILABLE = exists upstream, not called by
this adapter.

### USED-TODAY (1)

| Endpoint                             | Code                     | Gateway need                                                                                                              |
| ------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/tokens/{id}/report/summary` | `rugcheck.service.ts:32` | Token-safety summary (served). Query params: `cacheOnly`, `refresh` (paid keys only — this adapter never sends `refresh`) |

### AVAILABLE — token reports

| Endpoint                       | Gateway need                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/tokens/{id}/report`   | Full report (risks + insider summary + holder detail) — richer security-scoring input than the summary                              |
| `POST /v1/bulk/tokens/summary` | Summaries for up to 255 mints per call (paid key, cache-served; the marketing page advertises up to 1,000/batch) — snapshot fan-out |
| `POST /v1/bulk/tokens/report`  | Full reports in bulk (paid key, always cacheable, no forced regen) — batch enrichment                                               |
| `GET /v1/search`               | Full-text search over name/symbol/mint, ranked (legit first); empty query returns trending — explorer/discovery                     |
| `POST /v1/tokens/{id}/report`  | Deprecated upstream (no-op on current RugCheck) — do NOT wire                                                                       |

### AVAILABLE — insider networks

| Endpoint                                | Gateway need                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `GET /v1/tokens/{id}/insiders/graph`    | Detailed insider-network report (capped at 2,000 accounts) — honeypot side-input |
| `GET /v1/tokens/{id}/insiders/networks` | Insider-network listing — honeypot side-input                                    |

### AVAILABLE — stats / discovery

| Endpoint                    | Gateway need                                                                   |
| --------------------------- | ------------------------------------------------------------------------------ |
| `GET /v1/stats/new_tokens`  | Recently detected tokens — discovery feed                                      |
| `GET /v1/stats/recent`      | Most viewed in 24h — trending UI                                               |
| `GET /v1/stats/trending`    | Most voted in 24h — trending UI (votes are cosmetic, not scoring)              |
| `GET /v1/stats/verified`    | Recently verified (`.token` domains) — trust list                              |
| `GET /v1/stats/analytics`   | Aggregate analytics — ops dashboard                                            |
| `GET /v1/leaderboard`       | User leaderboard — cosmetic, no gateway need                                   |
| `GET /v1/stats/rugs/stream` | Listed in the swagger index; response shape unverified — confirm before wiring |

### AVAILABLE — verification (`.token` domain flow, out of scope)

| Endpoint                             | Gateway need                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `POST /v1/tokens/verify`             | Submit a token for verification — not a market-data need                               |
| `POST /v1/tokens/verify/eligible`    | Domain-eligibility check (scoring-gated; website-intended) — not a market-data need    |
| `POST /v1/tokens/verify/transaction` | Verification payment transaction — not a market-data need                              |
| `GET /v1/tokens/verified`            | Verified-token list, newest first (paid key, cursor pagination) — trust list candidate |

### AVAILABLE — votes (cosmetic, do not score on)

| Endpoint                    | Gateway need                                                |
| --------------------------- | ----------------------------------------------------------- |
| `GET /v1/tokens/{id}/votes` | Community votes for a mint — cosmetic only, no gateway need |
| `POST /v1/tokens/{id}/vote` | Submit a vote — cosmetic only, no gateway need              |

### AVAILABLE — other

| Surface / endpoint              | Gateway need                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `GET /v1/tokens/{id}/meta`      | Under development upstream — watch, do not wire yet                               |
| `GET /v1/`                      | Service ping — health probing                                                     |
| WebSocket report/insider stream | Paid-key push for reports + insider detections — realtime risk (replaces polling) |
