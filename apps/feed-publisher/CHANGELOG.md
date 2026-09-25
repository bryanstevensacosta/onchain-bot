# Changelog

All notable changes to `@onchain-bot/feed-publisher` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
- **Cumulative:** full workspace suite at 143 suites / 460 tests green.
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
