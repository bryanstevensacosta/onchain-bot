# Changelog

All notable changes to `@onchain-bot/feed-publisher` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Staging backport 2026-09-27:** declared `@nestjs/swagger ^11.4.7`
  (matches backend/ingestion-telegram) — imported across the API
  surface but previously resolved only via hoisted root, absent in the
  Docker build context. Lockfile regen deferred (see
  `.omo/evidence/staging-backport.log`).

### Added

- **Unified delivery surface `src/target/` (threads-publisher Fase 2
  todo 10, P38-bis per-binding config):** `target = bot telegram via
gateway OR publisher threads` (per-binding choice). `TargetModule`
  (@Global) binds `TargetDispatcherPort` → `TargetDispatcherService`
  (telegram legs via the telegram-bots-gateway with vault-id mapping,
  threads legs via `ThreadsPublisherHttpClient` POST
  `/threads-publisher/queue/enqueue` on `THREADS_PUBLISHER_URL`,
  default `http://localhost:4100`) with per-binding pacing
  (publishDelayMs + dailyCap HOLD, never drop) + `TargetHealthIndicator`
  (P21) + `TargetQueuedArticleDispatcher` (now the LIVE
  `QueuedArticleDispatcherPort` binding: `crypto-news` → telegram,
  `threads` → threads, `not configured` releases to PENDING).
  Migrated callers: sessions planner + explicit publish resolve through
  `target/` (gateway publisher delegates to the dispatcher; use-case
  mapping is structural, no `telegram/` import), queue drain rebound,
  templates assert the per-target bindings + per-target schedule limits
  contract. `src/telegram/` + `src/threads/` deprecated
  (`@deprecated` headers, dual-leg only, removed at threads-publisher
  todo 11 — no deletion here). Caller-migration + secret-shape gates
  spec-pinned (adversarial broken-caller suite red-before/green-after).
  5 suites / 14 tests new (full 153/491 green, `tsc` clean, boot
  `:3099` health + queue stats verified).
- **ai-ml migration, cutover (ai-ml todo 4):** default flipped to
  `FEED_AI_ML_MODE=ai-ml` (fail-closed: ai-ml over HTTP serves, local
  code deprecated, dual-leg only, removal planned). Rollback stays
  explicit (`FEED_AI_ML_MODE=dual` serves local + shadow ledger;
  divergence blocks promotion via `AiMlParityService`
  `assertNoDivergence`, never auto-rolls back). Dev
  (`.env.example`, `AI_ML_URL=http://127.0.0.1:4090`) + staging
  (`.env.staging.template` + `docker-compose.staging.yml`
  `AI_ML_URL=http://onchain-bot-ai-ml-staging:4090`,
  `FEED_AI_ML_MODE=${FEED_AI_ML_MODE:-ai-ml}`) serve ai-ml; PROD
  template untouched (no prod deploy in this todo). CI runs ai-ml +
  feed-publisher suites with the cutover env (`FEED_AI_ML_MODE=ai-ml`).
  Cutover contract spec (`ai-ml-cutover.spec.ts`: default ai-ml,
  dual rollback serves local on ai-ml-down, divergence blocks).
  Full 148/476 green in cutover mode + `tsc` clean both apps.
  Staging prep checklist in `.omo/evidence/task-4-ai-ml.log` (deploy
  deferred to operator).

- **ai-ml migration, dual-run (ai-ml todo 3):** feed-publisher as an
  ai-ml HTTP client (`src/ai-ml/`): generate (`POST /api/llm/generate`),
  embeddings (`POST /api/embeddings/embed`), and prompts resolve
  (`POST /api/prompts/resolve`) with `x-api-key` (`AI_ML_API_KEY`) from
  day one. `FEED_AI_ML_MODE=local|dual|ai-ml` (default `dual`): dual runs
  both legs, compares via `AiMlParityService` (matched/diverged/skipped
  per leg + `assertNoDivergence` cutover gate), and serves LOCAL —
  `ai-ml` mode is fail-closed cutover rehearsal only. `LlmPort` and
  `EmbeddingPort` resolve to the dual adapters (legacy factories kept
  under `LOCAL_*`); `FeedLlmGenerator` records prompt parity
  observationally; `GET /api/ai-ml/status` exposes mode + remote probe +
  ledger. Local gateway/mock + OpenAI/mock adapters deprecated
  (dual-leg only, removed at ai-ml todo 4). 7 suites / 38 tests;
  full 147/473 green. Prompt serving cutover waits for per-template
  knobs on the ai-ml catalog (ai-ml todo 4).

- **App setup + shared transversal (todo 1):** NestJS 11 service skeleton
  (`:3040` dev / `:3041` staging / `:3042` prod), `GET /api/health`,
  10 feature-module shells, and the full `src/shared/` transversal
  (kernel, value objects, events, typed errors, TypeORM base +
  naming strategy, HTTP client + retry policy, cache/messaging ports
  with in-memory adapters, metrics, x-api-key helpers, `ApiKeyGuard`,
  domain exception filter). 34 suites / 56 tests.
- **Ingestion (todo 2):** SSE-only feed client accepting only
  `messageType === 'crypto-news'` (foreign types rejected by negative
  assert), cursor-based catch-up on reconnect with 1s→30s backoff,
  `x-api-key` authentication from day one, HTTP fallback adapter
  (`?type=crypto-news`, fail-open), and a seen-key double-delivery
  guard. 7 suites / 21 tests.
- **Matching (todo 3):** `FilteredFeedService` with typed crypto-only
  fetches, pure OR/AND-group/blacklist/album-merge evaluator,
  single-message dry-run use-case, and a matching cron scheduler with
  overlap guard and adaptive re-poll. 18 suites / 64 tests shared with
  keywords and filters.
- **Keywords (todo 3):** `Keyword` / `BlacklistPhrase` aggregates
  (exact/substring, channel scope, media gate), compound AND-group
  evaluator, phrase registry with 409 intra/cross-table conflicts,
  and CRUD + batch use-cases.
- **Filters (todo 3):** ReDoS-safe `ContentFilterService` (pattern-length
  cap, flags whitelist, compiled cache, overrun warnings) with
  per-channel filter configs and CRUD/toggle use-cases.
- **Queue (todo 4):** Unified `PublisherQueueEntry` with `contentType`
  discriminator (PENDING → SCHEDULED → PUBLISHING → PUBLISHED, plus
  FAILED/BLOCKED terminals), strict `QUEUE_MAX_PENDING = 36` cap with
  backpressure error, oldest-first drain + TTL-expiry schedulers, and
  `GET/DELETE /api/queue` endpoints. 18 suites / 76 tests shared with
  deduplication.
- **Deduplication (todo 4):** Exact → content → semantic cascade
  (fail-open on store/embedding outages), content/URL normalizers,
  threshold scorer (duplicate above 0.95, gray zone never blocks),
  and OpenAI-or-mock embedding selector over a plain fingerprints
  table (no pgvector).
- **LLM (todo 5):** Single-row config with 3-flag control (generation
  runs only when llm AND publishing are on), GLOBAL prompt-template
  catalog scoped per `contentType` (`crypto-news | threads | global`),
  keyword-bound template resolution, mock short-circuit and vision
  fail-open generation, transient preview playground, gateway models
  listing, and pipeline-flags endpoints. 19 suites / 62 tests.
- **Scheduling (todo 6):** Immutable ad catalog with per-format media
  invariants, single-row config with per-target `publishDelayMs` and
  `dailyCap` (telegram/threads independent waits and UTC-day cutoffs,
  held — never dropped — on cap), pure 6-way rotation decider,
  per-tick orchestration + immediate-publish use-cases, sha256-deduped
  media library with magic-byte sniffing, and three controllers
  (ads, rotation-config, media + library). 18 suites / 72 tests.
- **Telegram (todo 7):** Shared Bot API base (split/format/multipart),
  `CryptoNewsBotApiAdapter` and `ThreadsBotApiAdapter` differing only
  in identity with per-bot rate limiters, content-type router, lazy
  token resolution for dashboard-only boot, and LIVE queue/scheduling
  dispatcher bindings. 9 suites / 32 tests.
- **Threads skeleton + v2 contract (todo 8):** `Thread` /
  `ThreadMessage` aggregates with draft-to-completed lifecycle and
  partial-resume support, builder + cumulative-delay scheduler
  services, create/enqueue/publish use-cases, publisher cron, 501 stub
  controller matching the Tramo 1 pinning, and the `CONTRACT.md`
  un-stubbing contract for v2. 14 suites / 54 tests.
- **Content templates + sessions multi-tab (todo 12):** Reusable
  `PublishingContentTemplate` profiles (eligible sources + keywords,
  own on-read content filters, reusable GLOBAL prompt-template ref,
  telegram/threads/both targets, own queue + matching + scheduling
  toggles, one-shot + recurring scheduling posts, DB bot bindings)
  with a P23-like `TemplateBot` catalog (AES-256-GCM tokens,
  redacted reads), plus `PublishingSession` tabs (template-loaded or
  ad-hoc, source toggles only, own keywords and
  matching/publishing/llm switches, own scheduling, N telegram +
  N threads targets, active/inactive) routed by a shared-dedup,
  per-target-paced planner (two differently-configured sessions
  publish to different targets; inactive sessions stay silent).
  Frontend-backed CRUD on `/api/content-templates`,
  `/api/content-template-bots`, and `/api/sessions`.
  16 suites / 31 tests.
- **Cumulative:** full workspace suite at 159 suites / 513 tests green.
- **Rename `src/content-templates/` → `src/template/`:** directory-only
  rename (shorter import paths). Kept intentionally: `ContentTemplatesModule`,
  `PublishingContentTemplate`, file names, `/api/content-templates` and
  `/api/content-template-bots` routes, and the `content-templates` health
  component — no frontend wiring changes needed. 16 suites / 31 tests
  (template + sessions) green, full 143/460 green, `tsc` clean post-rename.
- **Staging deploy prep (todo 10, prep only):** `docker-compose.staging.yml`
  (host `:3041` → container `:3040`, pg `:5437` / redis `:6384`) with
  logical DB `onchain_bot_feed_publisher_staging` plus
  `.env.staging.template` (secrets unset, operator fills on droplet);
  DRY-RUN only, no deploy workflow yet, nothing applied to Oracle
  (branch `feat/mega-refactor-tramos`).
- **API prefix migration dual-serve contract (todo 13, backend-side):**
  no code change in this app (it already serves `feed-*` names); the
  backend dual-serves old+new until cutover todo 11, when this app
  becomes the sole owner of `feed-publisher/*`, `feed-scheduling/*`,
  `feed-threads-publisher/*`, `feed-matching/*`, and `feed-filters/*`.
- **Auth anti-exploit (todo 14, P50):** global API-key guard (401 on
  missing/invalid key, only `GET /api/health` public) with global
  domain-error mapping (403/429/404 survive the wire);
  ownership-enforced `POST /api/sessions/:id/publish` (owned
  session x target binding + admin-verified bot + verified channel,
  every violation 403 with no existence leak); per-session publish
  rate limiter (10/min default, 429, audited, never sent);
  `GET /api/publish-audit` (routing facts only, never tokens);
  secret-scan gate spec (bot tokens, private keys, provider keys);
  and a compromise drill runbook (`docs/compromise-drill.md`).
  The cron planner enforces the same ownership rules fail-safe.
  7 suites / 23 tests.
- **Publishing via telegram-bots-gateway (gateway todo 5, dual mode):**
  HMAC-signed gateway client (`METHOD path timestamp nonce
sha256(rawBody)`, keyless dev fails open) with per-chunk
  `client_msg_id` idempotency; `FEED_PUBLISH_MODE`
  (`direct | dual | gateway`, default `dual`) routing in the queue and
  scheduling dispatchers with an outcome-only parity ledger
  (`messageId`s never compared; `assertNoDivergence` blocks cutover on
  any divergence); vault-to-vault migration of the `TemplateBot`
  catalog plus the crypto/threads env bots via
  `POST /api/content-template-bots/migrate-to-gateway` (labels/ids
  only, never tokens); explicit session publishes resolve vault ids so
  sessions/targets keep working; legacy crypto/threads adapters kept
  as the deprecated dual leg. Gateway-incompatible shapes (local-file
  media, video, button ads) skip the gateway leg without diverging.
  9 suites / 30 tests (159/513 total green).
- **Direct Telegram adapters deprecated (dual-leg only):** the
  `src/telegram/` Bot API adapters are deprecated since the gateway
  migration (gateway todos 5-6) and run dual-leg only; removal at
  cutover — new sends go via `apps/telegram-bots-gateway`.
- **Scheduling core extracted to `apps/scheduling-posts` (branch
  `feat/mega-refactor-tramos`):** `src/scheduling/` moved (not dual-run)
  with unwire in `app.module`, `telegram.module`, publisher router
  `forSchedulingTarget`, and `TelegramScheduledAdDispatcher` (+ 2 specs);
  feed-publisher consumes scheduling via contract.
