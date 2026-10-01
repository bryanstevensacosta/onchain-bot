---
slug: task-sec1-central-auth
status: drafting
intent: clear
pending-action: write .omo/plans/task-sec1-central-auth.md
approach: <fill: the approach you intend to plan>
---

# Draft: task-sec1-central-auth

## Components (topology ledger)

<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

| C1 guard-tighten | ApiKeyGuard requires key on ALL machine reads (feed/messages+sources+stats, health/channels, SSE, metrics, debug, all writes) + dual-prefix crypto-news parity; public stays exact /api/health + /ready + /live + GET media + GET avatar | active | apps/ingestion-telegram/src/shared/common/auth/api-key.guard.ts |
| C2 rate-limit | 60 req/min per IP in-memory sliding window, bypass health trio, 429 + Retry-After | active | apps/ingestion-telegram/src (new guard, none exists today) |
| C3 audit-log | structured access audit log, never keys, + grep-gate | active | apps/ingestion-telegram/src/shared/common/logging/ |
| C4 consumers-env | backend key send verified, templates + HEALTHCHECK untouched, frontend-breakage documented | active | apps/ingestion-telegram/.env.example + templates (read), backend clients (read-only) |
| C5 docs-drill | compromise drill doc + AGENTS.md gap-19 + CHANGELOG Unreleased English | active | apps/ingestion-telegram/AGENTS.md, CHANGELOG.md, docs/deployment/ |
| C6 tests-matrix | FAILING-FIRST 401/429 matrix per endpoint + drill test + curl matrix + jest + tsc, evidence task-sec1-central.log | active | apps/ingestion-telegram/src/\*_/_.spec.ts |

## Open assumptions (announced defaults)

<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

| limiter storage | in-memory sliding window (no Redis dependency) | zero new infra, deterministic in tests; 1:1 per-env instances make per-node state acceptable | yes (swap to Redis later) |
| audit sink | structured pino log lines only (no endpoint, no DB table) | no schema change, no new sensitive endpoint to protect | yes |
| query-key transport | keep `?apiKey=` accepted (existing contract) but keys never logged; docs steer to header | backward compat with backend clients; logging discipline enforced by grep-gate | yes (can deprecate later) |
| dual-serve old prefix | `/api/crypto-news/*` gets IDENTICAL auth matrix as `/api/feed/*` | same handlers, must not diverge (current hole: crypto-news reads 401 while feed reads public) | yes (dies at cutover todo 11) |

## Findings (cited - path:lines)

- ApiKeyGuard global + public allowlist: apps/ingestion-telegram/src/shared/common/auth/api-key.guard.ts:30-78 (PUBLIC_FEED/MEDIA/AVATAR prefixes, HEALTH_EXACT + LIVE/READY prefixes; POST never exempt via method check line 55).
- Guard spec pins current matrix: apps/ingestion-telegram/src/shared/common/auth/api-key.guard.spec.ts:61-109 (public GET list incl. feed/sources/stats/media/avatar/health trio; 401 stream/metrics/debug/health-channels/feed-writes/avatar-refresh).
- Dual-serve hole: apps/ingestion-telegram/src/feed/api/http/feed.controller.ts:88 + registry/api/http/sources.controller.ts:66 (`@Controller(['api/feed','api/crypto-news'])`) vs guard prefix only `/api/feed` (guard line 30).
- Key plumbing: apps/ingestion-telegram/src/shared/common/config/app.config.ts:567-588 (INGESTION_API_KEY trim, unset=undefined allow-all; security.apiKey mirror).
- Global wiring: apps/ingestion-telegram/src/app.module.ts:120-124 (APP_GUARD ApiKeyGuard).
- No limiter/audit infra: grep `Throttler|rate.?limit|RateLimit|audit` in apps/ingestion-telegram/src = only guard/config/spec hits (no limiter, no audit sink).
- Consumer surface (read-only): backend SSE/feed clients send INGESTION_TELEGRAM_API_KEY optionally; frontend reads feed/media/avatar direct from browser (no secret possible) — hence Q1 decision.
- Central spec: .omo/plans/mega-refactor-central.md:147-153 (todo 10, Wave 4, evidence .omo/evidence/task-sec1-central.log, commit feat(ingestion-telegram): auth anti-exploit global). P50: .omo/drafts/mega-refactor-tramos.md:154.
- Dirty worktree: branch feat/mega-refactor-tramos has ~25 modified paths (backend/frontend/omo) — worker stays inside apps/ingestion-telegram + .omo/evidence, leaves .kiro alone.

## Open assumptions (announced defaults)

<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

## Findings (cited - path:lines)

## Decisions (with rationale)

- D1 (Q1, APPROVED 2026-09-25): lock machine reads (feed/messages+sources+stats incl. per-channel + active/ids, health/channels, SSE, metrics, debug, ALL writes incl. PATCH/DELETE sources + avatar refresh); keep GET /api/media/\* + GET /api/kol-avatar/:channelId public with rate-limit. Rationale: browser cannot hold a shared secret; locking bytes breaks dashboard without a backend proxy (out of scope).
- D2 (Q2, APPROVED 2026-09-25): public = exact GET /api/health + GET /api/health/ready + GET /api/health/live; GET /api/health/channels stays protected. Rationale: Docker HEALTHCHECK + k8s probes must not flap; channels leaks inventory.
- D3 (Q3, APPROVED 2026-09-25): 60 req/min per IP in-memory sliding window, health-trio bypass, 429 + Retry-After, FAILING-FIRST red-before-green. Rationale: exact numbers prevent e2e flake (load-test does 100 msg/min — limiter must NOT count SSE broadcast path, only HTTP ingress).
- D4: full 401 matrix covers BOTH prefixes (api/feed + api/crypto-news) per route — second adversarial sweep required before green claim (missed-endpoint lane).
- D5: keys never in logs/responses/errors — enforced by unit test (log capture has no key) + grep-gate in evidence.

## Scope IN

- api-key.guard.ts tightening + crypto-news prefix parity; new rate-limit guard/module; audit log lines; guard+limiter+audit specs (red-first); curl matrix + jest + tsc evidence; drill doc; AGENTS.md gap-19 update; CHANGELOG Unreleased English; backend/frontend consumers READ-only verification (no edits outside apps/ingestion-telegram).

## Scope OUT (Must NOT have)

- No backend proxy build; no edits outside apps/ingestion-telegram (consumers read-only); .kiro untouched; no `?apiKey=` removal (kept, steered); no Redis-backed limiter; no auth audit endpoint/table; no media/avatar locking; no `git reset --hard` / destructive git; no committed secrets (.env\* stays gitignored, drill uses placeholders).

## Open questions

- None. All forks approved 2026-09-25 with recommended defaults. Proceed to plan write.

## Metis review (mandatory, 2026-09-25)

verdict: NOT READY → fixed in plan doc (no code until majors folded). Session ses_f258e90e0ffepjNpY3mh0zlZGf, confidence HIGH on C1-C5/M1-M4/U3.

- C1 dual-prefix hole → T1: guard uses prefix ARRAY ['/api/feed','/api/crypto-news'], parity specs both prefixes red-first.
- C2 browser WRITES direct (frontend endpoints.ts POST/PATCH/DELETE/toggle) → T1+T5: writes require key; newsroom-write breakage when key set = ACCEPTED RISK, follow-up backend-proxy task filed, NOT built (S1).
- C3 health flap → T5 verifies HEALTHCHECK + deploy gate with key set; allowlist frozen per D2 (Metis freeze-list superseded by owner D1 on feed reads).
- C4 exact paths → matrix lists /metrics (no /api prefix), /debug/telegram/\*, /api/ingestion/stream verbatim.
- C5 limiter burst → T2 TWO buckets: protected+writes 60/min/IP 429, public reads 300/min/IP 429, SSE handshake + health trio exempt (refines Q3, no contradiction).
- M1 ordering → T2: 401 precedes 429, pinned by test. M2 trust-proxy → T2. M3 ?apiKey= deprecated, header canonical, redaction → T1+T3. M4 unset mode (limiter audit-only, warn-once, never 401/429) → T1+T2+T3 acceptance.
- S2 cross-app guard copy forbidden (feed-publisher guard is another app — no imports). S3 drill = API-key rotation ONLY, no triple steps. S4 gaps 20/23/26 deferred. U1 newsroom burst measured read-only in T2. U2 single-instance + restart-reset documented. U5 ?limit-400 documented, fix deferred out of sec1.

## Approval gate

status: approved-plan-write
pending-action: DONE — .omo/plans/task-sec1-central-auth.md written with Metis fold-in; awaiting $start-work (planner never implements).
approach: tighten ApiKeyGuard (C1) + new in-memory 60/min rate-limit guard (C2) + keyless structured audit log (C3), FAILING-FIRST specs per component, full 401/429 matrix over both api/feed + api/crypto-news prefixes with adversarial second sweep, curl matrix + jest + tsc into .omo/evidence/task-sec1-central.log, drill doc + AGENTS.md + CHANGELOG, single commit feat(ingestion-telegram).
