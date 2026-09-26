# apps/scheduling-posts/ — NestJS Knowledge Base

> Verified 2026-09-26 against code + `.omo/evidence/task-1-scheduling-posts.log`
>
> - `.omo/evidence/task-2-scheduling-posts.log`. v0.1.0 (source of truth:
>   `package.json`; scheduling-posts todos 1-2 DONE, 3 pending).
>   Decisions cited as Pxx come from `.omo/drafts/mega-refactor-tramos.md`
>   §7.6. Contract: `.omo/evidence/contract-sessions-scheduler.md` (SIGNED
>   2026-09-26, todos 0).

Contents: OVERVIEW · PROGRAM STATUS · COMMANDS · STRUCTURE · MODULES ·
ENV INVENTORY · PORTS · HEALTH · TS/ESLINT CONVENTIONS · TESTS · GAPS ·
DECISIONS

## OVERVIEW

NestJS 11 service owning all scheduled-post execution outside
feed-publisher: contract posts (session → scheduler one-shot + cron,
idempotency-keyed) + the moved rotation catalog (scheduling ads with
per-target delay+caps) + media library (permanent retention) +
gateway-only telegram transport (HMAC, vault ids, never tokens).

Built from `git mv` of feed-publisher `src/scheduling/` + `src/shared/`
(staged renames, history kept) plus new contract code
(`src/scheduled-posts/`, `src/telegram/`, `src/health/`,
`src/app.module.ts`, `src/main.ts`). No behavior change in moved
code except: dispatcher binding is gateway-only (was dual) and the
media root env is `SCHEDULING_POSTS_UPLOADS_ROOT` (was
`FEED_PUBLISHER_UPLOADS_ROOT`, kept as fallback).

Design pivots:

- **P38 — session configures, scheduler enforces.** Per-target
  `publishDelayMs` + `dailyCap` (telegram|threads, UTC dayKey, HOLD
  never drop, sibling unaffected) enforced at fire time for contract
  posts AND rotation ads, sharing one `SchedulingConfig`/`SchedulingState`.
- **P38-ter — dashboard-only mode.** Zero active verified bindings →
  409 `NO_ACTIVE_TARGET`; schedule calls block with a message.
- **P42 — telegram ONLY via telegram-bots-gateway.** Vault `botId`,
  HMAC-signed, `message`/`photo`-URL/`media_group`-URL shapes only.
  No Bot API adapter exists here — do not add one.
- **P50 — x-api-key + ownership triple on schedule AND fire paths.**
  Global `ApiKeyGuard` (401; only `@Public()` health skips) +
  `DomainExceptionFilter` (403/409/422 survive the wire) +
  per-session rate limit (10/min, 429, never burns idempotency keys).
- **P52 — contract before code.** Tables moved (`feed_scheduled_*`
  - new `scheduled_posts`) only after the signed contract.

## PROGRAM STATUS

Todos 1-2 DONE (verified 2026-09-26 against code + evidence logs):

- Wired modules: Scheduling (moved) + ScheduledPosts (new) +
  Telegram gateway-only (new) + Health (composite, 5 components).
  0 stubs remain.
- Full-suite tally: 45 suites / 144 tests green (28/88 at scaffold,
  2 red on the missing telegram module — the failing-first baseline;
  +17/+56 new). Coverage 87% stmts (target >80%).
- Live boot matrix (`:4080`): health 5-up, guarded 401s, schedule
  201 → replay 200, hijack 403, ghost 404, past-fireAt 422.
- P38 delay/caps live on both paths. Parity ledger live
  (`GET /api/telegram/parity`).

Todo 3 PENDING (cutover + cleanup, no evidence):

- Flags/corte, CI/deploy staging/prod, HTTP session lookup
  (replaces the JSON seed), TypeORM wiring (`synchronize:false`
  outside dev), frontend wiring, final review.

Worktree state 2026-09-26: staged `git mv` renames feed-publisher →
scheduling-posts (+ unwired-import cleanup in feed-publisher:
`app.module`, `telegram.module`, router, 2 specs). No commit per
todo convention (worktree left dirty, no commit).

## COMMANDS

```bash
npm test -w @onchain-bot/scheduling-posts      # jest, all specs
npm run build -w @onchain-bot/scheduling-posts # nest build -> dist/main.js
curl -s localhost:4080/api/health              # {"status":"ok",...}
docker compose -f apps/scheduling-posts/docker-compose.yml up -d  # pg :5442 + redis :6389
```

From repo root (root `package.json` untouched — run via `-w`).

## STRUCTURE

```
apps/scheduling-posts/
  src/main.ts            # bootstrap :4080 (SCHEDULING_POSTS_PORT) + ValidationPipe + Tier-1 check
  src/app.module.ts      # Config global + Health + Scheduling + ScheduledPosts + Telegram + guard + filter
  src/health/            # GET /api/health composite (5 components, @Public keyless)
  src/scheduling/        # MOVED (git mv): ScheduledAd catalog + SchedulingConfig/State (P38) +
                         # RotationDecider + publish use-cases + media upload/clear/reuse +
                         # LocalSchedulingMediaStorage (uploads/ads*, permanent) + cron 1min +
                         # 3 controllers (/api/scheduling/ads, /rotation-config, /media + library)
  src/scheduled-posts/   # NEW (contract §§2-6): ScheduledPost (scheduled→fired|cancelled|failed) +
                         # SchedulePost (201/200 replay, 404/403/409/422) + FireDuePosts (HOLD delay/cap,
                         # BOT_REVOKED/CHANNEL_MISMATCH/MEDIA_MISSING/CONTENT_REF_GONE, TARGET_DOWN stays) +
                         # CancelScheduledPost + publish-now + 1min cron + callbacks (HTTP at-least-once,
                         # log-only unconfigured) + TypeORM scheduled_posts shape (UNWIRED, GAP-1) +
                         # controller (POST/GET/GET :id/DELETE/publish-now) + health hook
  src/telegram/          # NEW (P42, gateway-only): HMAC signer + send client (message/photo-URL/
                         # media_group-URL, fail-closed) + vault bot mapping + parity ledger
                         # (planned-vs-gateway, assertNoDivergence CONFLICT gate) + LIVE
                         # ScheduledAdDispatcherPort binding + parity reads + health hook
  src/shared/            # MOVED (git mv): kernel + api-key guard/filter/security/decorators +
                         # NEW config/ (scheduling-posts + database namespaces, Tier-1 DATABASE_URL)
  uploads/               # media library on disk (gitignored; permanent — no janitor)
  Dockerfile             # EXPOSE 4080, CMD dist/main.js, uploads volume path
  docker-compose.yml     # pg :5442 + redis :6389 (next free repo-wide)
  docker-compose.staging.yml  # host :4081, pg :5443, redis :6390 (DRY-RUN, OPERATOR-CONFIRM)
  .env.example / .development / .staging.template / .production.template
```

## MODULES

- `SchedulingModule` (moved, rewired): `ScheduledAdDispatcherPort`
  is now bound to `SchedulingGatewayDispatcher` (gateway-only text
  posts; button/media shapes hold as `not configured` without failure
  bookkeeping — the rotation use-case matches on the substring).
  `ScheduleModule.forRoot()` lives here (single registration).
- `ScheduledPostsModule` (new, imports Scheduling + Telegram):
  `SchedulePostUseCase` (rate-limit → replay → ownership triple →
  P38-ter → shape → content-ref → persist) + `FireDuePostsUseCase`
  (liveness → fire-time re-check → due → HOLD → resolve → gateway →
  fired/failed/stays + callback) + `CancelScheduledPostUseCase` +
  `ScheduledPostsCronScheduler` (1min, overlap guard, double-gated
  `SCHEDULING_POSTS_ENABLED` + `SCHEDULING_CRON_ENABLED`) +
  `ScheduledPostsController` + `ScheduledPostsHealthIndicator`.
  Session bindings seed from `SCHEDULING_SESSION_BINDINGS` JSON at
  boot. Port bindings use `useExisting` (single shared instance —
  `useClass` + concrete registration double-instantiates; the seed
  would land on the wrong copy).
- `TelegramModule` (new): `SchedulingGatewaySenderPort` →
  `GatewaySendClient`; exports dispatcher + mapping + parity.
- `HealthModule` (new): imports the three feature modules so their
  P21 indicators resolve in scope (all `@Optional`).

## ENV INVENTORY

`.env.example` (30 vars): switches (`SCHEDULING_POSTS_ENABLED`,
`SCHEDULING_CRON_ENABLED`), port, `SCHEDULING_POSTS_API_KEY`
(inbound, fail-open), `DATABASE_URL` + `DATABASE_SYNCHRONIZE` +
`DATABASE_LOGGING`, `SCHEDULING_POSTS_UPLOADS_ROOT` +
`SCHEDULING_MEDIA_PUBLIC_BASE_URL` (empty = media posts fail
`MEDIA_MISSING`), P38 seeds (`SCHEDULING_TELEGRAM|THREADS_{PUBLISH_DELAY_MS,DAILY_CAP}`),
`PUBLISH_RATE_LIMIT_PER_MIN=10`, `SCHEDULING_SESSION_BINDINGS` JSON,
`SESSION_CALLBACK_URL` + `SESSION_CALLBACK_API_KEY` (empty =
log-only), gateway client (`BOTS_GATEWAY_URL` dev `:4070` /
staging `:4071` / prod `:4072`, `BOTS_GATEWAY_CLIENT_ID`,
`BOTS_GATEWAY_CLIENT_SECRET`, DISTINCT per env), rotation legacy
channels (`CRYPTO_NEWS|THREADS_OUTPUT_CHANNEL`, pending session
bindings). Templates for staging (`:4081`) + prod (`:4082`).

## PORTS

| Env     | App   | Postgres      | Redis         |
| ------- | ----- | ------------- | ------------- |
| dev     | :4080 | :5442         | :6389         |
| staging | :4081 | :5443\*       | :6390\*       |
| prod    | :4082 | server-shared | server-shared |

\* DRY-RUN, OPERATOR-CONFIRM on Oracle. No clashes with backend
(`:3030`), ingestion (`:3031/32/33`), frontend (`:5173`),
feed-publisher (`:3040/41/42`, pg `:5436`), kol-stacks, market-data
(`:5438`/`:6385`), dexter (`:5440`/`:6387`), gateway (`:4070/71/72`).

## HEALTH

`GET /api/health` → `{ status: 'ok', components }` with
`scheduling-posts`, `database` (in-memory until the persistence
todo), `scheduling`, `scheduled-posts`, `telegram` (via their P21
indicators). Shape backward compatible (`status: 'ok'`).

## TS/ESLINT CONVENTIONS

Mirrors feed-publisher: `singleQuote`, strictNullChecks/noImplicitAny,
`emitDecoratorMetadata` + `experimentalDecorators`, path aliases
`shared/*`, `scheduling/*`, `scheduled-posts/*`, `telegram/*`,
`health/*`, `gateway/*`, `src/*`. No `@/*` alias here.

## TESTS

Jest (`testRegex: .*\.spec\.ts$`, `--forceExit --runInBand`).
Failing-first: scaffold baseline 2-red captured, entity/cron/fire
specs written red before impl. Shared coverage target >80% (pure
units, no I/O) — current 87% stmts.

## GAPS

1. Persistence wiring (TypeORM `scheduled_posts` + rotation tables,
   `synchronize:false` outside dev) — shapes + mappers ship UNWIRED.
2. HTTP session lookup (replaces `SCHEDULING_SESSION_BINDINGS` JSON
   seed) + content-ref HTTP resolver (queue lives in feed-publisher).
3. Transient-failure exhaustion counter (TARGET_DOWN stays scheduled
   indefinitely today — fail-safe default, operator cancels).
4. `/metrics` exporter + Pino logging.
5. Deploy workflows (staging/prod) + rollback rehearsal (todo 3).
6. No eslint flat config in this app (same as siblings — lint script
   resolves via root).

## DECISIONS

- P42 deviation (documented): parity compares gateway outcome vs the
  planned expectation (no direct Bot API leg exists to dual against —
  the sibling dual-send degenerates honestly; no second Telegram
  message is ever sent). `assertNoDivergence` stays the cutover gate.
- No `SCHEDULING_PUBLISH_MODE` flag: gateway-only by construction,
  nothing to switch.
- `dailyCap: 0` = target paused; delay/cap HOLD, never drop; `failed`
  needs a §6 code; unknown errors stay `scheduled` + alert.
- `messageId` in callbacks is a string (contract §4 example).
- Rotation ads keep env-channel resolution (legacy path pending
  session bindings); contract posts carry their own verified chatId.
- Media URLs need `SCHEDULING_MEDIA_PUBLIC_BASE_URL` (gateway
  forwards URLs to Bot API); without it media posts fail
  `MEDIA_MISSING` rather than half-send.
- Root `package.json` untouched (no `dev:scheduling-posts` alias —
  run via `-w @onchain-bot/scheduling-posts`). Lockfile untouched
  (no new deps: `cron` + `class-validator/transformer` + `supertest`
  resolve via hoisted root modules).
