# task-sec1-central-auth - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Every sensitive ingestion-telegram endpoint locked behind an API key (only plain health checks and photo/file reads stay open), brute-force throttling, a key-free access audit trail, and a written key-compromise drill — all proven by tests and a live request matrix.

**Why this approach:** The current guard leaves all feed reads open and has a blind spot where the old `/api/crypto-news/*` paths don't match the new rules; browsers can't hold secrets so photo/file reads stay open but throttled instead. A mandatory adversarial review forced these fixes into the plan before any code is written.

**What it will NOT do:** It will not build the backend proxy the newsroom write UI eventually needs (filed as a follow-up — writes will need the key); it will not touch anything outside ingestion-telegram, your secrets, or the auto-generated spec folder; it will not change how Telegram itself is read.

**Effort:** Medium - 7 work items, mostly in two small auth files plus tests and docs.
**Risk:** Medium - locking feed reads changes what the dashboard and backend must send; the plan verifies every consumer read-only first and keeps an allow-all fallback when no key is configured.
**Decisions to sanity-check:** feed reads now need the key (you approved); photo/avatar reads stay public but throttled at 300/min; health-check trio stays public; `?apiKey=` URLs deprecated in favor of the header.

Your next move: say the word and the worker starts (or ask for the dual high-accuracy review first). Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

- C1 guard tightening: key required on ALL machine reads — `GET /api/feed/messages`, `/messages/channel/:channelId`, `/stats`, `GET /api/feed/sources`, `/sources/active/ids`, `PATCH/DELETE /api/feed/sources/*`, `POST /api/feed/sources*` (both), `GET /api/health/channels`, `GET /api/ingestion/stream`, `GET /metrics`, `GET /debug/*`, `POST /api/kol-avatar/:channelId/refresh` — with IDENTICAL matrix on the legacy `/api/crypto-news/*` prefix (dual-serve parity, closes today's hole where crypto-news reads 401 while feed reads are public). Public stays: exact `GET /api/health`, `GET /api/health/ready`, `GET /api/health/live`, `GET /api/media/*`, `GET /api/kol-avatar/:channelId`.
- C2 rate-limit: 60 req/min per IP, in-memory sliding window, bypass health trio (`/api/health`, `/ready`, `/live`), 429 + `Retry-After` on exceed; SSE broadcast path untouched (load-test does 100 msg/min over one SSE connection — limiter applies to HTTP ingress only).
- C3 audit log: one structured log line per auth decision (allow/deny, method, path, clientIp, no key material ever); unit test asserting captured logs contain no key; grep-gate in evidence.
- C4 consumers (READ-ONLY verification, no edits outside `apps/ingestion-telegram`): backend SSE/feed clients send `INGESTION_TELEGRAM_API_KEY`; Docker HEALTHCHECK still hits public `/api/health`; documented frontend impact note (browser reads of feed now need key → follow-up backend-proxy tracked, NOT built here).
- C5 docs: compromise drill doc (revoke + rotate + audit window, placeholders only, never real values), `AGENTS.md` gap-19 rewrite (auth-full matrix), `CHANGELOG.md` Unreleased entry in English.
- C6 tests FAILING-FIRST: red 401/429 specs per endpoint BEFORE implementation turns them green; full curl matrix against a local boot with `INGESTION_API_KEY` set + unset; `jest` + `tsc` green; single evidence file `.omo/evidence/task-sec1-central.log`; kill all spawned servers afterwards.

### Metis fold-in (mandatory fixes, verdict NOT READY → patched here, no code until this doc is complete)

- Guard matches a prefix ARRAY `['/api/feed', '/api/crypto-news']` (closes today's hole: crypto-news reads 401 while feed reads 200); parity specs on BOTH prefixes red-first (C1/A1).
- Browser WRITES (`POST/PATCH/DELETE/toggle /api/feed/sources*` from `apps/frontend/src/shared/api/endpoints.ts`, read-only evidence) require a key the browser must not hold: newsroom-write UI breakage when the key is set is ACCEPTED RISK; the backend-proxy follow-up is filed as a separate task and NOT built here (C2/S1).
- Two-bucket limiter (refines Q3): protected routes + all writes = 60 req/min/IP → 429; public reads (media/avatar) = 300 req/min/IP → 429 (newsroom page-load fans out ~50 media + avatar reads); health trio + SSE handshake exempt from counting (C5/U1).
- Guard ordering: 401 precedes 429 (no key + over limit → 401), pinned by test; single combined guard or explicit `APP_GUARD` order array (M1). IP keying honors `x-forwarded-for`-first only when trustProxy is set at bootstrap; spoof limit documented; tests use mocked IPs (M2).
- `?apiKey=` deprecated (header `x-api-key` canonical); exactly ONE legacy query test marked deprecated; audit/redaction everywhere (M3). Unset-key mode: guard warn-once allow-all, limiter audit-only (never 429), audit logs warn-once (M4).
- Exact-path matrix (no `/api/*` shorthand): `/metrics`, `/debug/telegram/*`, `/api/ingestion/stream`, `/api/health/channels` protected; `?limit`-omitted 400s documented in matrix, `ParseIntPipe({optional:true})` fix DEFERRED out of sec1 (C4/U5).
- Drill covers API-key rotation ONLY (`openssl rand -hex 32`, per-env `.env` + backend `INGESTION_TELEGRAM_API_KEY`, verify matrix) — zero MTProto triple/session steps (S3). No cross-app guard imports (feed-publisher guard is another app — forbidden, S2). Gaps 20/23/26 deferred (S4).

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No key on `GET /api/media/*` or `GET /api/kol-avatar/:channelId` (browser bytes stay public — D1); no locking of `/api/health`, `/ready`, `/live`.
- No removal of `?apiKey=` transport (kept for backend compat; docs steer to `x-api-key` header).
- No Redis-backed limiter, no audit endpoint/table, no new DB migration, no backend proxy build.
- No edits outside `apps/ingestion-telegram` + `.omo/evidence/` (consumers verified read-only); `.kiro/` untouched; no committed secrets (`.env*` stays gitignored; drill + evidence use placeholders/`***`).
- No `git reset --hard`, no `revert --no-commit`, no destructive git; singleQuote style; no `any` crossing the guard/request boundary (type the request shape).
- No success claim without the adversarial second sweep (re-grep every `@Controller` + `@Get/@Post/@Patch/@Delete` under `src/` vs the guard matrix) and without a dirty-worktree check (`git status --short` shows only intended paths).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: FAILING-FIRST TDD + Jest (`cd apps/ingestion-telegram && npx jest <spec> --forceExit`) + `tsc --noEmit` (ingestion project) + curl matrix vs local boot (`INGESTION_API_KEY` set, then unset for allow-all path).
- Evidence: single file `.omo/evidence/task-sec1-central.log` (jest runs, tsc, curl matrix with status codes, grep-gates for keys-in-logs + missed endpoints, dirty-worktree `git status --short`). Servers spawned for the curl matrix are killed at the end (`lsof`/`kill <PID>` by explicit PID only — never `pkill -f`, prod twins share the cmdline).
- Adversarial lanes: (a) missed-endpoint second sweep — enumerate every route via `@Controller` + method decorators under `src/` and assert each appears in the 401 matrix; (b) dirty_worktree — `git status --short` before/after, intended paths only; (c) no-misleading-success — every green claim cites the exact command + artifact line in the evidence log.

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 1 (parallel, no inter-dependencies): 1 guard tightening | 2 rate-limit | 3 audit log — different files, red specs first inside each todo.
- Wave 2 (parallel, blocked by Wave 1): 4 second sweep + curl matrix + jest + tsc | 5 consumers read-only verification | 6 drill doc + AGENTS.md + CHANGELOG.
- Wave 3 (final): 7 evidence assembly + full-suite green + single commit.

### Dependency matrix

| Todo                               | Depends on | Blocks     | Can parallelize with |
| ---------------------------------- | ---------- | ---------- | -------------------- |
| 1 guard tightening + matrix specs  | —          | 4, 5, 6, 7 | 2, 3                 |
| 2 rate-limit + specs               | —          | 4, 6, 7    | 1, 3                 |
| 3 audit log + no-key specs         | —          | 4, 6, 7    | 1, 2                 |
| 4 second sweep + curl + jest + tsc | 1, 2, 3    | 7          | 5, 6                 |
| 5 consumers read-only check        | 1          | 7          | 4, 6                 |
| 6 drill + AGENTS.md + CHANGELOG    | 1, 2, 3    | 7          | 4, 5                 |
| 7 evidence + full green + commit   | 4, 5, 6    | — (closes) | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Guard tightening + dual-prefix parity + 401 matrix specs (red-first)
     What to do / Must NOT do: RED specs first (run, paste failures into evidence), then implement: `isPublicApiKeyExempt` matches prefix ARRAY `['/api/feed','/api/crypto-news']` (loop, not single prefix); protected = ALL machine reads (`GET messages`, `messages/channel/:channelId`, `stats`, `GET sources`, `sources/active/ids`, `health/channels`, `ingestion/stream`, `/metrics`, `/debug/*`) + ALL writes (`POST sources`, `POST sources/batch`, `PATCH/DELETE sources/*`, `POST kol-avatar refresh`); public stays = exact `GET /api/health|/ready|/live`, `GET /api/media/*`, `GET /api/kol-avatar/:channelId`. Header `x-api-key` canonical; keep ONE deprecated `?apiKey=` test. Unset key = warn-once allow-all (M4). Must NOT touch media/avatar public GETs, health trio, or any file outside the allowlist (M5/M6).
     Parallelization: Wave 1 | Blocked by: — | Blocks: 4, 5, 6, 7
     References (executor has NO interview context - be exhaustive): apps/ingestion-telegram/src/shared/common/auth/api-key.guard.ts:30-78,112-182; src/shared/common/auth/api-key.guard.spec.ts:1-155 (extend, never weaken); src/shared/common/config/app.config.ts:567-588; src/app.module.ts:120-124; src/feed/api/http/feed.controller.ts:88-195; src/registry/api/http/sources.controller.ts:66-224; src/health/api/http/health.controller.ts:88-112,242-301; src/stream/api/http/sse-stream.controller.ts:54-60; src/metrics/api/http/metrics.controller.ts:14-30; src/debug/debug-telegram.controller.ts:4-12; src/avatar/kol-avatar.controller.ts:37-93; src/media/api/http/media.controller.ts:90-106.
     Acceptance criteria (agent-executable): `cd apps/ingestion-telegram && npx jest api-key.guard --forceExit` green; new specs assert A1 dual-prefix parity (feed + crypto-news: GET messages keyless→200 pre-tighten RED then locked per D1, POST both without key→401, with key→201/409/400) + A2 write matrix (PATCH/DELETE/refresh no-key→401, wrong→401, header-key→success) + A3 SSE (no-key→401, key→200 event-stream) + unset-key suite (never 401).
     QA scenarios (name the exact tool + invocation): happy: `npx jest api-key.guard --forceExit` green, Evidence `.omo/evidence/task-sec1-central.log`. failure: RED run pasted BEFORE green (no red paste = fail); `curl -s -o /dev/None -w '%{http_code}' localhost:3031/api/feed/sources` without key → 401 (post-tighten) else fail. Evidence `.omo/evidence/task-sec1-central.log`
     Commit: N (bulk commit in T7)
- [ ] 2. In-memory two-bucket rate-limit guard + ordering + trust-proxy (red-first)
     What to do / Must NOT do: RED specs first, then create `src/shared/common/auth/rate-limit.guard.ts` (+ `.spec.ts`, singleQuote): sliding-window in-memory Map keyed by client IP; bucket A protected+writes 60/min/IP → 429 + `Retry-After` + `X-RateLimit-*`; bucket B public reads 300/min/IP → 429; EXEMPT health trio + SSE handshake from counting; enforce 401-before-429 (M1: no key + over limit → 401); honor `x-forwarded-for`-first only with trustProxy set in `main.ts` (verify bootstrap; M2, spoof limit in code comment); unset-key mode = audit-only, never 429 (M4); document single-instance + restart-reset assumption (U2); U1 measurement: count requests per newsroom page-load from frontend query code READ-ONLY to justify bucket B (paste count + math into evidence). Must NOT count SSE broadcast path, must NOT touch media/avatar/health-trio reachability, must NOT add Redis/migration, must NOT import feed-publisher guard (S2).
     Parallelization: Wave 1 | Blocked by: — | Blocks: 4, 6, 7
     References: apps/ingestion-telegram/src/app.module.ts:120-124 (APP_GUARD order array); src/main.ts (bootstrap, trustProxy verify); src/stream/api/http/sse-stream.controller.ts:54-60 (exempt handshake); src/media/api/http/media.controller.ts:90; src/avatar/kol-avatar.controller.ts:37; apps/frontend/src/shared/api/endpoints.ts (READ-ONLY burst measurement); apps/market-data/src/gateway/application/gateway-rate-limit.guard.ts:20-46 (pattern reference ONLY — do not import, different app).
     Acceptance criteria: `npx jest rate-limit --forceExit` green; over-budget WITH key → 429 + Retry-After; WITHOUT key → 401 (not 429); mocked-IP tests for proxy keying; SSE reconnect burst (10 rapid handshakes with key) → no 429; unset-key e2e → never 429.
     QA scenarios: happy: `npx jest rate-limit --forceExit` green, Evidence `.omo/evidence/task-sec1-central.log`. failure: kill-switch check — 61st protected request in-window → 429 else fail; health trio 100 rapid hits → 0 429s else fail. Evidence `.omo/evidence/task-sec1-central.log`
     Commit: N (bulk commit in T7)
- [ ] 3. Keyless access audit log + redaction specs (red-first)
     What to do / Must NOT do: RED specs first, then log ONE structured line per auth decision via existing `StructuredLoggerService` (no new endpoint/table/migration): fields method, path (query STRIPPED — never log `?apiKey=`), decision allow/deny + guard name, clientIp; NEVER key material, NEVER full query, NEVER `x-api-key` value; spec captures log sink and asserts no `apiKey` substring + no key value for allow, deny, and legacy-query hits (D5/M3); unset mode logs warn-once (M4). Must NOT log bodies, must NOT create an HTTP audit endpoint, must NOT persist PII beyond IP.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 4, 6, 7
     References: apps/ingestion-telegram/src/shared/common/logging/structured-logger.service.ts (+ .spec.ts); src/shared/common/auth/api-key.guard.ts:112-124,156-181 (decision points); src/shared/common/auth/rate-limit.guard.ts (T2 decision points).
     Acceptance criteria: `npx jest access-audit --forceExit` (or guard/limiter spec audit blocks) green; `grep -iE 'apiKey|INGESTION_API_KEY|<test-key-value>'` over captured logs → zero hits; A5 satisfied.
     QA scenarios: happy: audit specs green with redaction asserts, Evidence `.omo/evidence/task-sec1-central.log`. failure: inject known key value through denied + allowed + legacy-query requests → key appears in ANY captured log line = fail. Evidence `.omo/evidence/task-sec1-central.log`
     Commit: N (bulk commit in T7)
- [ ] 4. Adversarial second sweep + full curl matrix + jest + tsc
     What to do / Must NOT do: (a) SECOND SWEEP: fresh `grep -rn '@Controller\|@Get(\|@Post(\|@Patch(\|@Delete(' apps/ingestion-telegram/src` and assert EVERY route appears in the T1 matrix table (expected ~31 hits/10 files); any route outside the table = stop, add spec, re-run — paste sweep output into evidence (A6). (b) Boot local with `INGESTION_API_KEY` set (explicit PID, `DATABASE_ENABLED=true` if needed, never `pkill -f`) and curl EVERY matrix cell: no-key→401, wrong-key→401, header-key→success, ONE legacy `?apiKey=`→success, unset-key boot→allow-all + warn-once, `?limit`-omitted 400s documented (U5, no fix); exact paths `/metrics`, `/debug/telegram/message/:c/:m`, `/api/ingestion/stream`, `/api/health/channels` verbatim. (c) Full `npx jest --forceExit` + `tsc --noEmit` green. Kill servers by PID, `ps` check pasted. Must NOT fix swept-in gaps beyond auth matrix (S4 — file follow-ups instead).
     Parallelization: Wave 2 | Blocked by: 1, 2, 3 | Blocks: 7
     References: all 8 controllers (feed, sources, media, avatar, sse-stream, health, metrics, debug — paths in T1) + apps/ingestion-telegram/package.json (jest/tsc scripts) + .omo/evidence/task-sec1-central.log (append-only, placeholders only).
     Acceptance criteria: sweep shows zero routes outside matrix; curl table 100% expected codes; full jest green (815+ new); `tsc --noEmit` exit 0; no server process remains.
     QA scenarios: happy: matrix + suites + tsc all green in one evidence log, Evidence `.omo/evidence/task-sec1-central.log`. failure: ANY curl cell mismatches expected code, or sweep finds an unlisted route, or a server survives `ps` → fail, fix, re-run. Evidence `.omo/evidence/task-sec1-central.log`
     Commit: N (bulk commit in T7)
- [ ] 5. Consumers read-only verification (no edits outside ingestion-telegram)
     What to do / Must NOT do: READ-ONLY greps (no edits): backend SSE/feed clients send `INGESTION_TELEGRAM_API_KEY` on every call incl. `sources/active/ids` (record file:line hits); Docker HEALTHCHECK hits public `/api/health` (record compose path:line); deploy-ingestion ordering gate `GET :3032/api/feed/sources` now needs key → record required gate update as follow-up note (do NOT edit workflow here); document browser-write ACCEPTED RISK (C2) + file backend-proxy follow-up task (S1, not built). Verify `.env.example` + `.env.production.template` + `.env.staging.template` document `INGESTION_API_KEY` (read; template text edits, if any, belong to T6 docs? NO — templates are code-adjacent: only verify + note). Must NOT edit apps/backend, apps/frontend, workflows, nginx, vite.config; must NOT put real values anywhere.
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 7
     References: apps/backend/src (grep `INGESTION_TELEGRAM_API_KEY` only); apps/frontend/src/shared/api/endpoints.ts:14-17,88-93,161 (read-only C2 evidence); apps/ingestion-telegram/.env.example + .env.production.template + .env.staging.template (read); docker-compose.ingestion.yml + docker-compose.staging-ingestion.yml (read HEALTHCHECK); .github/workflows/deploy-ingestion.yml (read gate).
     Acceptance criteria: evidence lists every backend caller with key attached (or flags missing ones as follow-ups); HEALTHCHECK path confirmed public; gate follow-up + proxy follow-up filed as named follow-up tasks with scope lines.
     QA scenarios: happy: checklist complete, zero files changed outside apps/ingestion-telegram (`git status --short` shows only allowlisted paths), Evidence `.omo/evidence/task-sec1-central.log`. failure: `git status --short` shows apps/backend, apps/frontend, .kiro, or workflow modifications → fail, revert, re-verify. Evidence `.omo/evidence/task-sec1-central.log`
     Commit: N (bulk commit in T7)
- [ ] 6. Compromise drill doc + AGENTS.md gap-19 + CHANGELOG (English)
     What to do / Must NOT do: write `docs/deployment/ingestion-api-key-compromise-drill.md` (API-KEY rotation ONLY: detect→revoke→`openssl rand -hex 32`→update per-env `.env` + backend `INGESTION_TELEGRAM_API_KEY`→verify 401/200 matrix→audit window via T3 logs; placeholders/`***` only; ZERO triple/session steps per S3); rewrite `AGENTS.md` gap-19 as auth-FULL matrix (exact paths, buckets, exemptions, browser-write accepted risk + proxy follow-up ref); APPEND `CHANGELOG.md [Unreleased]` entry in English (never rewrite history). Must NOT touch root AGENTS.md, backend/frontend docs, nginx/vite (M6); must NOT commit real keys (grep evidence clean).
     Parallelization: Wave 2 | Blocked by: 1, 2, 3 | Blocks: 7
     References: apps/ingestion-telegram/AGENTS.md (gap-19 block + 17-endpoint table); apps/ingestion-telegram/CHANGELOG.md:5-18 (append under [Unreleased]); docs/deployment/ (drill location); .prettierrc (singleQuote verify via `npx prettier --check`).
     Acceptance criteria: drill doc has numbered revoke→rotate→verify→audit steps with placeholder-only values; AGENTS.md matrix matches T1 implementation cell-for-cell; CHANGELOG entry English under [Unreleased]; `npx prettier --check` on touched files passes.
     QA scenarios: happy: docs complete + prettier green, Evidence `.omo/evidence/task-sec1-central.log`. failure: `grep -riE 'sk-|BEGIN .*PRIVATE|eyJ[A-Za-z0-9_-]{10,}'` on drill + evidence → any hit = fail; AGENTS.md cell mismatching T1 behavior = fail. Evidence `.omo/evidence/task-sec1-central.log`
     Commit: N (bulk commit in T7)
- [ ] 7. Evidence assembly + full green + single commit + DoneClaim
     What to do / Must NOT do: assemble `.omo/evidence/task-sec1-central.log` (append-only): T1 red→green pastes, T2 401-before-429 + bucket proofs + U1 burst math, T3 redaction grep, T4 sweep + curl table + full jest + tsc, T5 consumer checklist + `git status --short` (intended paths only), T6 secret grep; final `npx jest --forceExit` + `tsc --noEmit` + `prettier --check` ALL green; confirm no servers (`ps` paste), `.kiro` untouched, `.env*` uncommitted; SINGLE commit `feat(ingestion-telegram): auth anti-exploit global` (no `--no-verify` evasion — hooks must pass); return DoneClaim citing evidence path + commit SHA. Must NOT split commits per todo, must NOT use destructive git, must NOT claim green without pasted command output.
     Parallelization: Wave 3 (final) | Blocked by: 4, 5, 6 | Blocks: — (closes)
     References: .omo/evidence/task-sec1-central.log; `git status --short`; apps/ingestion-telegram specs + tsconfig; .prettierrc.
     Acceptance criteria: evidence log contains every command + output claimed; full suite green; one commit only; DoneClaim = commit SHA + evidence path + matrix summary.
     QA scenarios: happy: verifier replays any 3 commands from the log and reproduces output. failure: log missing a claimed run, or commit touches non-allowlisted paths, or hooks bypassed → fail, repair, re-verify. Evidence `.omo/evidence/task-sec1-central.log`
     Commit: Y | feat(ingestion-telegram): auth anti-exploit global

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

Single bulk commit at todo 7: `feat(ingestion-telegram): auth anti-exploit global` on `feat/mega-refactor-tramos` (central todo 10 requirement). Todos 1–6 carry `Commit: N` — no intermediate commits, so the 401 matrix, limiter, and audit land atomically (no half-locked state in history). Hooks must pass un-bypassed (no `--no-verify`); `git status --short` before commit must show ONLY allowlisted paths (`apps/ingestion-telegram/src/shared/common/auth/*`, `src/shared/common/config/app.config.ts` if touched, `src/app.module.ts`, `src/main.ts` trustProxy line if needed, co-located specs, `apps/ingestion-telegram/AGENTS.md`, `apps/ingestion-telegram/CHANGELOG.md`, `docs/deployment/ingestion-api-key-compromise-drill.md`, `.omo/evidence/task-sec1-central.log`, plan/draft files).

## Success criteria

- 401/403 matrix green on every sensitive endpoint across BOTH `/api/feed` + `/api/crypto-news` prefixes (A1–A4); public trio + media/avatar reads unaffected under legitimate load.
- 429 + `Retry-After` on over-budget protected/writes traffic; 401 always precedes 429; unset-key mode never 401/429.
- Zero key material in any log, response, or error (unit + grep-gate, A5); adversarial second sweep lists zero routes outside the matrix (A6).
- Full `jest` green + `tsc --noEmit` clean + `prettier --check` clean; evidence log complete; servers killed; `.kiro` untouched; no secrets committed (A7).
- AGENTS.md gap-19 + CHANGELOG Unreleased (English) + compromise drill doc landed; browser-write accepted risk + backend-proxy follow-up filed, not built.
