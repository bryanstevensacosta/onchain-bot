# Changelog — threads-publisher

All notable changes to `@onchain-bot/threads-publisher` are documented here.
Source of truth for the version: `package.json`.

## [Unreleased]

### Fixed

- **Staging backport 2026-09-27:** staging compose now ships the
  `threads-publisher:` app service (local build + env + `4101:4100` +
  node health probe + `onchain-bot-staging-net`, mirroring
  feed-publisher) — previously pg+redis only.

### Added

- Standalone `apps/threads-publisher/` service (Fase 2 todo 9): Meta
  Threads publisher (queue, keywords, blacklist, LLM, matching, cron,
  token refresher) consolidated from backend `src/threads/` plus the
  feed-publisher thread skeleton as v2 owner, with gateway dual-run
  transport (vault bot ids only, never tokens).
- Health composite (`GET /api/health`, 5 components), API-key guard
  (401) + domain filter, Tier-1 config, Dockerfile (`dist/main.js`),
  dev/staging compose files, and env templates for dev (`:4100`),
  staging (`:4101`), and prod (`:4102`).
- Test suite: 12 suites / 41 tests green (71% stmts), covering queue
  lifecycle, matching, LLM gating, adapter truncate/refuse/timeout,
  cron lock pinning, gateway HMAC/mode/parity, and HTTP surfaces.

## [0.1.0] — 2026-09-27

- Initial scaffold (package, nest-cli, tsconfig, Dockerfile, compose,
  env templates, failing-first health spec).
