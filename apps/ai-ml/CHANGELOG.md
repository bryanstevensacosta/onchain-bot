# Changelog

All notable changes to `@onchain-bot/ai-ml` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
