# Changelog

All notable changes to `@onchain-bot/ai-ml` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
