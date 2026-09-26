# Changelog

All notable changes to `@onchain-bot/ai-ml` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Cutover readiness (todo 4, prep only, no prod deploy):** no ai-ml
  code change needed — vision payload (`imageUrl`/`imageBase64`) +
  per-call knobs (`model`/`maxTokens`/`temperature`/`reasoningEffort`)
  already live on the gateway since todos 0-2, so the feed-publisher
  cutover blockers from todo 3 are resolved server-side. Todo 4 on
  this side is CI (`ci.yml` runs ai-ml + feed-publisher suites with
  `FEED_AI_ML_MODE=ai-ml`) + staging prep (compose + templates carry
  host `:4091` → container `:4090`; PROD template untouched). Staging
  prep checklist in `.omo/evidence/task-4-ai-ml.log`; deploy deferred
  to operator. 23 suites / 85 tests green, `tsc` clean.

- **Centralized embeddings (todo 2):** new `src/embeddings/`
  module (`EmbeddingsModule`, wired in `AppModule`) exposing THE
  single embeddings interface (`EmbeddingsService`) for dedup +
  search: model-per-call routing (`text-embedding-*` → OpenAI,
  `*MiniLM*`/`xenova*` → local, `mock*` → mock; unknown names are
  400, never silent fallback) with an LRU cache per (effective
  model, text) (`EMBEDDING_CACHE_MAX_ENTRIES=500`) and a pure
  `cosineSimilarity` helper. Three adapters: deterministic mock
  (64-dim, `USE_MOCK_AI=true` default), OpenAI
  (`EMBEDDING_MODEL`, default `text-embedding-3-small`), and lazy
  local all-MiniLM (`EMBEDDING_LOCAL_MODEL`, default
  `Xenova/all-MiniLM-L6-v2`, 30s load timeout, `@xenova/transformers`
  stays an OPTIONAL dep — missing dep is an explicit 503). Outages
  are LOUD (503 with a remediation hint, never null — deliberate
  deviation from the feed-publisher fail-open source). Routes
  under `/api/embeddings`: `POST /embed` + `/batch` (≤100) +
  `/similarity` (`generate`-scoped) and `GET /models` (`read`).
- **Playground dry-run preview (todo 2):** new `src/playground/`
  module (`PlaygroundModule`, wired in `AppModule`) with
  `POST /api/playground/preview` (`generate`-scoped): catalog
  template (name+version, dual-read `ai-ml` → `legacy-fallback`)
  or inline draft rendered against sample content
  (`{{title}}`/`{{original}}`/`{{hasImage}}`, byte-parity with the
  feed-publisher source incl. `sí`/`no`), render-only by default
  or exactly ONE gateway generation (`generate=true`). Writes
  nothing — `persisted: false` rides every response (spec-pinned).
  Template knobs fall back to gateway defaults (the ai-ml catalog
  v1 carries no per-template model settings).
- **Tests:** 23 suites / 85 tests green (Jest, +6/+28) — LRU
  cache + cosine + routing/cache/loud-error service specs +
  module wiring ×2 + playground render/generate/no-persistence;
  live boot `:4099` verified (health, models, embed, similarity,
  draft render → generate, catalog create → named preview,
  pinned-OpenAI-down 503, unknown-model 400). Evidence
  `.omo/evidence/task-2-ai-ml.log`.

- **Versioned global prompt catalog (todo 1):** new `src/prompts/`
  module (`PromptsModule`, wired in `AppModule`) with a `PromptTemplate`
  entity per (name, version) — `name`, `version`, `content`,
  `systemContent`, `variables` (extracted `{{placeholders}}`),
  `contentType` scope (`crypto-news` / `threads` / `global`) — plus
  CRUD, immutable version history, `activate` rollback pointer, and
  `GET` by name+version (`GET /api/prompts/:name[?version=]`,
  `/versions`, `/:name/active`, `POST /:name/versions`,
  `POST /:name/versions/:version/activate`, `DELETE /:name[?version=]`
  under `/api/prompts`; reads `read`-scoped, writes `admin`-scoped).
- **Dual-read migration path:** `POST /api/prompts/resolve`
  (`{ name, version? }`) serves the ai-ml row first and falls back to
  a read-only `default-feed` snapshot of the feed-publisher GLOBAL
  catalog (`source: 'ai-ml' | 'legacy-fallback'`) so any consumer app
  can reference templates by name+version during the migration window
  (pinned versions never fall back — a pinned miss is a caller bug).
  Live store is in-memory; the TypeORM shape
  (`ai_ml_prompt_templates`, unique `(name, version)`) ships unwired
  (same GAP-1 pattern as the migration source).
- **Tests:** 17 suites / 57 tests green (Jest, +3/+11) — domain
  validation + versioning/rollback + dual-read fallback; live boot
  `:4090` verified (health, resolve fallback, create → v2 →
  pin v1 → rollback → history). Evidence
  `.omo/evidence/task-1-ai-ml.log`.

- **App setup + LLM gateway (todo 0):** new `apps/ai-ml/` NestJS 11
  service (triplet 4090 dev / 4091 staging / 4092 prod, loopback-only
  default, `dist/main.js`) with `GET /api/health`, dev + staging
  compose (own logical DBs `onchain_bot_ai_ml[_staging]`, pg
  :5444/:5445, redis :6391/:6392), and env templates
  (dev/staging/production).
- **Multi-provider gateway + Mock:** provider order mock
  (`USE_MOCK_AI=true`, zero cost, tagged output) > LiteLLM-style
  gateway (`LLM_GATEWAY_BASE_URL` + key, `OPENAI_API_KEY` fallback,
  vision + reasoning effort) > OpenAI direct; unconfigured providers
  report unavailable and generations fail fast with a clear error.
- **3-flag mirror config:** ai-ml owns `llmEnabled` +
  `publishingEnabled` (`GET/PATCH /api/llm/config`, admin-gated
  writes); `GET /api/llm/flags?matching=` resolves the full view
  (`mode` + `llmActive`, LLM active only when llm AND publishing).
- **Auth keys + rate-limit + audit:** scoped keys
  (admin > generate > read, HMAC-SHA256 peppered with
  `ENCRYPTION_KEY`, admin-managed `/api/auth/keys` with
  write-only-once plaintext), per-key sliding-window limits (429),
  guard-decision audit + generation usage audit (sizes only, never
  content). Missing `ENCRYPTION_KEY` fails loud (key-op error +
  staging/prod boot error); keyless dev stays fail-open.
- **Tests:** 14 suites / 46 tests green (Jest), domain 100%;
  live boot `:4090` verified (health, models, generate, flags,
  config, usage).
