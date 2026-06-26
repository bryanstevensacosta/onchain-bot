---
slug: live-feed-robust
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/live-feed-robust.md
approach: Three-pillar fix - (1) harden enrichment against undefined→numeric, (2) make Telegram MTProto observable and recoverable, (3) add WS/pipeline health surface that the frontend can render. Plus one-shot cleanup of 9 garbage canonical_token_calls rows and a CHECK constraint on Solana address format.
---

# Draft: live-feed-robust

## Components (topology ledger)
| id | outcome (one line) | status | evidence path |
|---|---|---|---|
| C1-enrichment-hardening | Enrichment never crashes with `undefined`→numeric cast; TokenSnapshot.create and TypeORM mapper coerce defensively | active | `apps/backend/src/chain/explorer/application/handlers/enrich-token.use-case.ts:163`, `:182-225` |
| C2-mtproto-observability | Telegram MTProto adapter reports last-message age + connection status; reconnects on disconnect event; periodic watchdog forces traffic | active | `apps/backend/src/kol/ingestion/api/mtproto/kol-telegram-mtproto.adapter.ts:101-156` |
| C3-pipeline-health-surface | WS Gateway exposes `lastEventAt` + per-BC stats; LiveFeed page shows "stale since Xm" badge + reconnect quality | active | `apps/backend/src/shared/ws/gateway/ws.gateway.ts:60-117`, `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx`, `apps/frontend/src/pages/live-feed/index.tsx` |
| C4-stale-data-cleanup | DELETE 9 invalid Solana rows + TypeORM migration adds CHECK constraint on solana address format (base58 alphabet, length 32-44) | active | `apps/backend/src/token/normalization/infrastructure/persistence/typeorm/repositories/typeorm-canonical-token-call.repository.ts:48-66` |
| C5-kol-reputation-scaling | Replace `findRecent(5000)` × 45 per tick with per-kol SQL filter via TypeORM JSONB query | active | `apps/backend/src/kol/reputation/application/handlers/recompute-kol-reputation.use-case.ts:42` |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| Health HTTP endpoint path | `GET /internal/health/pipeline` (no auth in dev, behind API key in prod) | Standard pattern; no breaking change | Yes |
| Stale threshold for UI badge | 10 minutes no events → show "stale" indicator | Long enough to avoid false positives on quiet KOLs; short enough to catch dead listeners | Yes |
| Watchdog interval for MTProto `getDialogs()` | every 5 minutes | Lightweight (≤5 KB response); survives Telegram's "idle disconnect" pattern | Yes |
| Run migrations automatically on `start:dev` | NO — manual via `npm run migration:run` | Existing project policy (`backend.log` shows `synchronize=true` for typeorm dev only) | Yes |
| Don't change `MarketData` interface shape | YES — keep optional `?:` fields, fix at merge boundary | Schema-shape change ripples to every provider adapter; not needed if `first()` coerces | Yes |

## Findings (cited - path:lines)

**Cause A — Telegram MTProto silent**
- `apps/backend/src/kol/ingestion/api/mtproto/kol-telegram-mtproto.adapter.ts:101-156`: `subscribe()` yields from internal `queue`, blocks on `waitForNext()` indefinitely. No `disconnect` listener, no health check, no watchdog. Once Telegram stops pushing updates (rate limit, session flag, network), the adapter idles forever.
- `apps/backend/backend.log` shows the SAME pattern across 5+ restarts today (PIDs 65243/65370/65639/65840/43913): `Subscribed to 45 KOL(s)` → silence. Confirmed by DB: `MAX(last_seen_at) FROM canonical_token_calls = 2026-06-26 06:34:00+00` (4h ago), `MAX(decided_at) FROM filter_decisions = 2026-06-26 09:58:50+00` (35min ago).

**Cause B — Enrichment `undefined`→numeric cast**
- `apps/backend/src/chain/explorer/application/handlers/enrich-token.use-case.ts:182-225`: `mergeMarketData` uses `first((d) => getter(d))` with `if (v !== null) return v` — returns `undefined` if the provider returned `undefined`, not `null`.
- `apps/backend/src/chain/explorer/domain/ports/market-data-provider.port.ts:4-39`: `MarketData` interface has `holders: number | null` etc. but `totalSupply?`, `insidersPercent?`, `bondingPercent?` are `?:` so providers may omit them. TypeScript lies at runtime.
- `apps/backend/src/chain/explorer/domain/entities/token-snapshot.entity.ts:76-105`: `TokenSnapshot.create` accepts the input as-is; no runtime guard.
- DB column `token_snapshots.holders integer`, `numeric(20,4)` etc.: rejects `"undefined"` string → `invalid input syntax for type numeric: "undefined"` (observed in `/tmp/backend-dev.log:6:35:08`).

**Noise — KolReputationScheduler × 45 × 5000**
- `apps/backend/src/kol/reputation/application/handlers/recompute-kol-reputation.use-case.ts:42`: `this.canonicalRepo.findRecent(5000)` called per KOL, 45 KOLs per tick → 45 full-table scans every 15 min.
- `apps/backend/src/token/normalization/infrastructure/persistence/typeorm/repositories/typeorm-canonical-token-call.repository.ts:48-66`: `findRecent` iterates rows and logs WARN on invalid addresses. 9 invalid rows × 45 calls = 405 WARNs per tick.

**Stale data — 9 invalid Solana rows**
- `SELECT id FROM canonical_token_calls WHERE chain='solana' AND address ~ '[OIl]';` returns 9 rows containing `O`, `I`, or `l` which are NOT in base58 alphabet. Identified: `hkhbrjgc1qdp2xe8x9u5ofgno5buizasrn7j3mfypump`, `gq26xmqocfbpmzmywisq8czenqdzxsn31u7eknqzpump`, `avpjs61gzmwktaepb7qcpko8fk2xqusayyqxpipmpump`, `c2vi8bqvpjsichz1scvgghun68xufcajgn3y1s3bpump`, `y1jx8x2yqcjbj8xm6mduahelaibmb6kenoxqtaspump`, `a11rgtzfm9becpbrmjxi1eucdxu7bdng21ojq74mpump`, `c7heqqfnzdmbufqwchkl9fvdwsfsdrbnfwzddywycltz`, `6ia73gwckklwkbvr8rgibv57mmrxzsaqs9cwpgkbpump`, `cgedt9qzdvvh5gmvkwjh2bximjqmjysc9ihwyr7spump`.

**WS Gateway — lastEventAt tracked but never exposed**
- `apps/backend/src/shared/ws/gateway/ws.gateway.ts:60-117`: `lastEventAt` is set on every broadcast but only sent in `hello` event on new connection. No periodic heartbeat, no idle-warning event, no health endpoint.

**Frontend — LiveFeed reads historical on mount, no staleness UI**
- `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx:71-104`: only loads `fetchRecentDecisions(10)` once via `useEffect`. No `lastEventAt` in WS payload, no stale-detection, no reconnect quality.
- `apps/frontend/src/pages/live-feed/index.tsx:5-47`: connection indicator (green/red dot) but no freshness info.

## Decisions (with rationale)
- **Defense in depth for enrichment**: fix at 4 layers — `mergeMarketData.first()`, `TokenSnapshot.create` runtime guard, `TypeOrmTokenSnapshotMapper.toEntity` coerce, and provider-adapter normalization helper. Reason: each layer is a different team's contract; one provider regression could re-introduce `undefined` if only one layer is hardened.
- **MTProto belt+suspenders**: both reactive (on-error reconnect) AND proactive (5min `getDialogs()` watchdog). Reason: reactive alone misses silent-idle; proactive alone misses fast failures.
- **CHECK constraint on Solana addresses**: prevent future bad data at the DB level. Reason: app-level validation can be bypassed by direct SQL inserts (test backfills, ops scripts).
- **Health endpoint behind `/internal/`**: avoid exposing pipeline internals on the public API. Reason: ops surface, not product surface.
- **LiveFeed staleness badge**: 10min threshold. Reason: KOLs can go quiet for 5-10min naturally; beyond 10min likely means ingestion broken.

## Scope IN
- DELETE 9 invalid `canonical_token_calls` rows
- TypeORM migration: CHECK constraint on `canonical_token_calls.address` for solana chain (base58 alphabet + length 32-44)
- Harden `mergeMarketData.first()` to coerce `undefined`→`null`
- Add runtime guard in `TokenSnapshot.create` for numeric fields
- Add defensive coercion in `TypeOrmTokenSnapshotRepository` / mapper
- Provider adapters (DexScreener, Birdeye, Helius, GeckoTerminal): helper to normalize `MarketData` shape
- MTProto adapter: `getDialogs()` watchdog every 5 min via NestJS `@Interval`
- MTProto adapter: subscribe to `disconnect`/`update` errors, exponential-backoff reconnect
- `KolListenerPort`: expose `lastMessageAt` + `connectionStatus` getters
- WSGateway: emit `pipeline.heartbeat` event every 15s with `{ lastEventAt, mtprotoStatus, queueSize }`
- New HTTP endpoint `GET /internal/health/pipeline` returning the same payload
- TypeORM query on `canonical_token_calls` filtered by `kolId` in JSONB (replaces `findRecent(5000)` × N pattern)
- LiveFeed page: "stale since Xm" badge when `lastEventAt > 10min ago`
- LiveFeed page: reconnect-quality dot (gray if WS reconnecting, yellow if heartbeat missed, green if live)
- Tests: unit (mergeMarketData, TokenSnapshot.create) + integration (enrichment with provider returning undefined) + e2e (parse → enrich → score broadcast)
- Migration runner script for prod

## Scope OUT (Must NOT have)
- NO change to `MarketData` interface shape (keep `?:` optional fields; fix at boundary)
- NO change to provider adapter business logic (only normalization helper)
- NO new WS event types beyond `pipeline.heartbeat`
- NO new DB columns / tables beyond the CHECK constraint
- NO breaking changes to existing REST endpoints
- NO new ENV vars beyond what's documented in `.env.example`
- NO changes to the Telegram publishing path (that's a different BC, out of scope here)
- NO refactor of KolReputationCalculator itself (only the use case's repository call)

## Open questions
(see Approval gate below)

## Approval gate
status: approved
approved: 2026-06-26
decisions:
  - schema change: TypeORM migration with CHECK constraint
  - tests: TDD (red test first)
  - mtproto: belt + suspenders (watchdog 5min + on-error reconnect)
next: spawn Metis gap analysis in parallel; append todos to plan; fill TL;DR last.