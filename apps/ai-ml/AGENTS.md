# apps/ai-ml/ — NestJS Knowledge Base

> Verified 2026-09-26 against code + `.omo/evidence/task-2-ai-ml.log`
> (todos 0-2). v0.1.0 (source of truth: `package.json`; ai-ml plan
> todos 0-2 DONE, todos 3-4 pending). Decisions cited as Pxx come
> from `.omo/drafts/mega-refactor-tramos.md` §7.6. Plan:
> `.omo/plans/ai-ml.md` (5 todos: 0-4). Central contracts:
> `.omo/plans/mega-refactor-central.md`.

Contents: OVERVIEW · PROGRAM INDEX · PROGRAM STATUS · COMMANDS ·
STRUCTURE · MODULES · ENV INVENTORY · PORTS · HEALTH · SECURITY ·
TS/ESLINT CONVENTIONS · TESTS · GAPS · DECISIONS INDEX · DECISIONS ·
STANDING RULE · NOTES

## OVERVIEW

NestJS 11 service owning everything AI/ML outside the monolith: a
multi-provider LLM gateway (mock default, LiteLLM-style gateway,
OpenAI direct) + the 3-flag mirror (llm + publishing owned here,
matching arrives from the consumer) + scoped API keys with per-key
rate limits + usage audit (sizes only, never content). Any app
generates via ai-ml over HTTP or uses pre-written content — ai-ml
never makes business decisions (templates, scoring, scheduling
decide; ai-ml only generates). Todos 0-2 DONE (setup + gateway +
prompts catalog + embeddings + playground); todos 3-4 pending
(feed-publisher migration, cutover).

Design pivots that govern every future todo:

- **Single gateway (plan §Scope)** — one LLM gateway, one catalog,
  one playground. N gateways is the failure mode being removed.
- **3-flag mirror** — ai-ml owns `llmEnabled` + `publishingEnabled`
  (`LlmConfig`); `matching` lives in the consumer and arrives as
  input. LLM generation runs ONLY when llm AND publishing are on.
- **C-DB-01 — own logical DB**: `onchain_bot_ai_ml[_staging]`
  on the same server as the backend DB per env (compose ships the
  volumes; TypeORM persistence lands with the prompts catalog).
- **Tramo lessons (P30)** — x-api-key day one, `dist/main.js`,
  app-level `npm run dev`, env templates staging+prod from setup,
  AGENTS.md vivo.

## PROGRAM INDEX

| Todo | Status                                                                | What                                                                                                                                                                                          |
| ---- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | DONE (evidence `.omo/evidence/task-0-ai-ml.log`)                      | App setup + LLM gateway (ports 4090/91/92, health, compose dev+staging, envs, DB `onchain_bot_ai_ml[_staging]`, gateway mock/openai/LiteLLM + config + auth keys + rate-limit + audit; 14/46) |
| 1    | DONE (evidence `.omo/evidence/task-1-ai-ml.log`)                      | Global versioned prompt-templates catalog + dual-read migration from feed-publisher (CRUD + history + activate + resolve; 17/57)                                                              |
| 2    | DONE (evidence `.omo/evidence/task-2-ai-ml.log`)                      | Centralized embeddings (mock/OpenAI/local, model-per-call + LRU cache, loud 503s) + playground dry-run preview (render or one generation, `persisted: false`)                                 |
| 3    | DONE (feed-publisher side, evidence `.omo/evidence/task-3-ai-ml.log`) | feed-publisher as HTTP client (dual-run + parity + cutover + local llm deprecation)                                                                                                           |
| 4    | DONE (evidence `.omo/evidence/task-4-ai-ml.log`)                      | Cutover + cleanup + CI/deploy staging/prod (prep only, no prod deploy)                                                                                                                        |

## PROGRAM STATUS

Todo 0 DONE (verified 2026-09-26 against code + evidence log):

- Wired modules: health (live `GET /api/health`, `@Public()`) +
  shared (global audit) + auth (scoped keys + admin key management +
  startup ENCRYPTION_KEY guard) + llm (gateway + config + flags +
  models + usage).
- Provider selection: `USE_MOCK_AI=true` (mock, zero cost) wins, then
  gateway (`LLM_GATEWAY_BASE_URL` + key, `OPENAI_API_KEY` fallback),
  then OpenAI direct; nothing configured → gateway bound but
  unavailable, generations fail fast with a clear error.
- Live boot `:4090` verified (health + models + generate + flags +
  config PATCH + usage); keyless dev fail-open mirrors market-data.
- Wired modules: + prompts (global versioned catalog + dual-read
  `POST /api/prompts/resolve` with `legacy-fallback` to the
  feed-publisher `default-feed` snapshot; live boot `:4090`
  verified incl. create → v2 → pin v1 → rollback → history).
- Wired modules: + embeddings (single `EmbeddingsService` over
  mock/OpenAI/local adapters, model-per-call routing
  `text-embedding-*` → openai / `*MiniLM*|xenova*` → local /
  `mock*` → mock, LRU cache per effective model + text, outages
  throw LOUD 503 with an explicit hint — never null) + playground
  (`POST /api/playground/preview`: catalog name+version or inline
  draft, render-only default or exactly ONE dry-run generation,
  `persisted: false` contract-pinned; live boot `:4099` verified
  incl. render → generate → template path → 503 on pinned
  OpenAI-down).

Todos 3-4 DONE (2026-09-26, feed-publisher is the migration client):

- Todo 3 (dual-run, evidence `.omo/evidence/task-3-ai-ml.log`):
  feed-publisher calls ai-ml over HTTP behind `FEED_AI_ML_MODE`
  (local serves, dual shadows with `AiMlParityService`, ai-ml
  rehearsal fail-closed). No ai-ml code change — gateway vision +
  knobs already live here.
- Todo 4 (cutover, evidence `.omo/evidence/task-4-ai-ml.log`):
  feed-publisher default flipped to `ai-ml`; local legs deprecated
  dual-leg only. This side contributed CI test entries + staging
  prep only (compose + templates); PROD untouched, deploy deferred.
  23/85 green + `tsc` clean.

## COMMANDS

```bash
cd apps/ai-ml
npm run dev            # watch, :4090 (AI_ML_PORT)
npm run build          # nest build -> dist/main.js
npm test               # jest, 23 suites / 85 tests
npm run test:cov       # coverage (no thresholds enforced)
npx tsc --noEmit -p tsconfig.json
AI_ML_PORT=4090 node dist/main.js   # prod-shaped boot
curl -s http://127.0.0.1:4090/api/health
curl -s http://127.0.0.1:4090/api/embeddings/models
curl -s -X POST http://127.0.0.1:4090/api/embeddings/embed \
  -H 'content-type: application/json' -d '{"text":"hello"}'
curl -s -X POST http://127.0.0.1:4090/api/playground/preview \
  -H 'content-type: application/json' \
  -d '{"draft":{"promptText":"Rewrite: {{original}}"},"rawContent":"hello"}'
curl -s -X POST http://127.0.0.1:4090/api/prompts/resolve \
  -H 'content-type: application/json' -d '{"name":"default-feed"}'
```

Root aliases (`dev:ai-ml`, `test:ai-ml`, …) are NOT wired yet —
read-only constraint outside `apps/ai-ml` (see GAPS).

## STRUCTURE

```
src/
  main.ts                 # bootstrap (:4090 dev, loopback-only default)
  app.module.ts           # Config + Health + Shared + Auth + Llm, APP_GUARD
  health/                 # GET /api/health -> { status: 'ok' } (@Public)
  shared/                 # global audit + @Public + ApiKeyGuard + api-key util
  auth/                   # scopes (read|generate|admin) + HMAC store +
                          #   rate limiter + audit + admin controller + module
  llm/                    # port + 3 adapters + config + flags + audit +
                          #   3 use-cases + controller + module
  prompts/                # versioned GLOBAL catalog (todo 1): domain +
                          #   repository port + in-memory store + legacy
                          #   feed-publisher snapshot + catalog service
                          #   (dual-read) + controller + module (+ unwired
                          #   TypeORM shape `ai_ml_prompt_templates`)
  embeddings/             # centralized vectors (todo 2): port + LRU cache +
                          #   cosine helper + service (model-per-call
                          #   routing) + mock/openai/local adapters +
                          #   controller + module
  playground/             # dry-run preview (todo 2): use-case (render or
                          #   ONE generation, `persisted: false`) +
                          #   controller + module (imports Llm + Prompts)
docker-compose.yml        # dev pg :5444 + redis :6391
docker-compose.staging.yml# staging pg :5445 + redis :6392 + app :4091→:4090
Dockerfile                # multi-stage, CMD dist/main.js, EXPOSE 4090
.env.example / .env.staging.template / .env.production.template
```

## MODULES

| Module     | Routes (all under `/api`)                                    | Notes                                                            |
| ---------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| health     | `GET /health`                                                | Public, Docker HEALTHCHECK target                                |
| auth       | `POST /auth/keys`, `GET /auth/keys`, `DELETE /auth/keys/:id` | Admin scope; plaintext returned EXACTLY ONCE on create           |
| llm        | `POST /llm/generate` (generate)                              | Single generation entry; fails fast when no provider             |
| llm        | `GET /llm/models` (read)                                     | Gateway hits `{base}/v1/models` fail-open; mock/static otherwise |
| llm        | `GET /llm/config` (read), `PATCH /llm/config` (admin)        | The two owned switches (llm + publishing)                        |
| llm        | `GET /llm/flags?matching=` (read)                            | Resolved 3-flag view (`mode` + `llmActive`)                      |
| llm        | `GET /llm/usage` (admin)                                     | Sizes + latency + status only — never prompt/output content      |
| prompts    | `GET /prompts[?contentType=]` (read)                         | Active templates (global scope matches any filter)               |
| prompts    | `GET /prompts/:name[?version=]` (read)                       | Active row, or pinned version                                    |
| prompts    | `GET /prompts/:name/versions` (read)                         | Immutable version history                                        |
| prompts    | `GET /prompts/:name/active` (read)                           | The rollback pointer                                             |
| prompts    | `POST /prompts` (admin)                                      | Create (v1, active; 409 on duplicate name)                       |
| prompts    | `POST /prompts/:name/versions` (admin)                       | New version (auto-active)                                        |
| prompts    | `POST /prompts/:name/versions/:v/activate` (admin)           | Move pointer (rollback = older version)                          |
| prompts    | `POST /prompts/resolve` (read)                               | Dual-read name+version (ai-ml first, legacy fallback)            |
| prompts    | `DELETE /prompts/:name[?version=]` (admin)                   | Drop one version or the whole name                               |
| embeddings | `POST /embeddings/embed` (generate)                          | Single vector (optional `model` pin)                             |
| embeddings | `POST /embeddings/batch` (generate)                          | Up to 100 vectors (same pin)                                     |
| embeddings | `POST /embeddings/similarity` (generate)                     | `cosine(embed(a), embed(b))` for dedup + search                  |
| embeddings | `GET /embeddings/models` (read)                              | Providers + default model + cache stats                          |
| playground | `POST /playground/preview` (generate)                        | Render or ONE dry-run generation; `persisted: false` always      |

## ENV INVENTORY

See `.env.example` (authoritative). Key vars: `AI_ML_PORT` (4090),
`AI_ML_HOST` (127.0.0.1), `AI_ML_API_KEY` (legacy env key,
admin-equivalent), `ENCRYPTION_KEY` (REQUIRED staging/prod — boot
throws without it; HMAC pepper), `DATABASE_URL`
(`onchain_bot_ai_ml[_staging]`), `REDIS_URL`, `LLM_ENABLED` /
`PUBLISHING_ENABLED`, `USE_MOCK_AI` (default true), `LLM_GATEWAY_*`,
`OPENAI_API_KEY`, `LLM_MODEL` (gpt-4o-mini), `LLM_MAX_ATTEMPTS=3`,
`EMBEDDING_MODEL` (text-embedding-3-small, `DEDUP_EMBEDDING_MODEL`
fallback alias), `EMBEDDING_LOCAL_MODEL`
(Xenova/all-MiniLM-L6-v2), `EMBEDDING_CACHE_MAX_ENTRIES=500`.

## PORTS

| Env     | HTTP                             | Postgres  | Redis        |
| ------- | -------------------------------- | --------- | ------------ |
| dev     | `:4090`                          | `:5444`   | `:6391`      |
| staging | host `:4091` → container `:4090` | `:5445`   | `:6392`      |
| prod    | host `:4092` → container `:4090` | server DB | server redis |

Triplet 4090/91/92 + 5444/45 + 6391/92 verified free repo-wide
2026-09-26 (lsof + source grep zero hits; OPERATOR-CONFIRM host
ports on Oracle with lsof before first deploy).

## HEALTH

- `GET /api/health` → `{ status: 'ok' }` (public).
- Dockerfile HEALTHCHECK + staging compose probe via node (image has
  no wget/curl — same pattern as market-data).

## SECURITY

- Inbound `x-api-key` enforced globally (APP_GUARD). Resolution:
  `@Public()` → scoped store keys (HMAC-SHA256 peppered with
  ENCRYPTION_KEY; timing-safe verify; scope check 403; per-key
  sliding-window rate limit 429) → legacy `AI_ML_API_KEY` env key
  (admin-equivalent) → fail-open ONLY when nothing is configured
  (keyless dev). Otherwise 401.
- Audit: every guard decision recorded (key id + method + path +
  status). Key material, hashes, and query strings never enter logs.
- Scopes: `admin > generate > read` (downward only).
- `ENCRYPTION_KEY` missing → LOUD: `ApiKeyService` throws
  `ENCRYPTION_KEY is required but empty (distinct per env)` on any
  key operation; `AuthModule.onModuleInit` throws at boot on
  staging/production (dev only warns — keyless fail-open).
- Loopback-only bind by default (`AI_ML_HOST=127.0.0.1`).

## TS/ESLINT CONVENTIONS

- `singleQuote: true`, `trailingComma: all` (root `.prettierrc`).
- Strict-ish (`tsconfig.base.json`): `strictNullChecks`,
  `noImplicitAny`, `noFallthroughCasesInSwitch`,
  `forceConsistentCasingInFileNames`, `isolatedModules`.
- Path aliases: `shared/*`, `llm/*`, `auth/*`, `prompts/*`,
  `embeddings/*`, `playground/*`, `src/*` (no `@/*`).

## TESTS

Jest (`testRegex: .*.spec\.ts$`), co-located: **23 suites / 85
tests** green (+6/+28 in todo 2: LRU cache + cosine + service
routing/cache/loud-errors + module wiring ×2 + playground
render/generate/no-persistence/validation + playground wiring).
Coverage, no thresholds: domain 100%, guard 93%, adapters
availability-only (no network in CI — gateway/openai
`generateText` happy paths are covered by dual-run parity in
todo 3; OpenAI/local embedding vectors likewise). Failing-first:
`app-wiring.spec.ts` was written before
`AppModule` existed (module-not-found red), then green; todo 1
specs went red on missing `prompts/` modules (3 suites), then
green (11 tests: validation + versioning/rollback + fallback);
todo 2 specs went red on missing `embeddings/` + `playground/`
modules (6 suites, module-not-found), then green (28 tests;
two import-depth slips + one missing `GenerateTextUseCase`
export caught red, fixed).

## GAPS

- G-1: TypeORM persistence unwired (in-memory `LlmConfig` + key
  store + audits + prompt catalog + embedding LRU cache;
  `ai_ml_prompt_templates` + key shapes land wired in a later todo
  reusing the same shapes; `@xenova/transformers` is an OPTIONAL
  local-embedding dep — missing dep is an explicit 503, and the
  package is deliberately absent from `package.json` so the
  lockfile stays untouched).
- G-2: Root wiring untouched (read-only outside `apps/ai-ml`):
  no `dev:ai-ml` / `test:ai-ml` / `build:ai-ml` root aliases, no
  lint-staged entry, no pre-commit `tsc` coverage — wire when the
  constraint lifts.
- G-3: Gateway/openai `generateText` success paths need live creds
  (covered by dual-run parity in todo 3, not unit tests).
- G-4: Staging/prod deploy workflows do not exist yet (todo 4 shipped
  prep only: CI test entries for ai-ml + feed-publisher cutover env,
  staging compose + templates for both apps, checklist in
  `.omo/evidence/task-4-ai-ml.log`; no prod deploy, PROD templates
  untouched — deploy deferred to operator).

## DECISIONS INDEX

| ID  | Decision                                                                                  |
| --- | ----------------------------------------------------------------------------------------- |
| D-1 | Ports 4090/91/92 + pg 5444/45 + redis 6391/92 (verified free)                             |
| D-2 | Scopes read\|generate\|admin (ai-ml-specific; generate = LLM use)                         |
| D-3 | HMAC-peppered key hashes (ENCRYPTION_KEY); missing = loud error                           |
| D-4 | Provider order mock > gateway > openai; unconfigured = fail fast                          |
| D-5 | Usage audit stores sizes only, never content                                              |
| D-6 | No root-file edits (read-only constraint) — aliases pending (G-2)                         |
| D-7 | Prompts: versions immutable + single active pointer; pinned resolve never falls back      |
| D-8 | Embeddings: single service, model-per-call, LRU cache; outages are LOUD (503, never null) |
| D-9 | Playground: render or exactly ONE generation; `persisted: false` is the contract          |

## DECISIONS

- **D-1** — 4090/91/92 triplet per plan (verificar): lsof free +
  zero repo hits 2026-09-26; pg/redis picked adjacent-free 5444/45 +
  6391/92 (5440/6387 taken by dexter/scheduling-posts).
- **D-2** — `generate` scope (not `snapshot`): ai-ml authorizes LLM
  use, not data snapshots; hierarchy admin > generate > read.
- **D-3** — HMAC pepper (not plain SHA-256): stolen DB rows alone
  do not verify without the env pepper; missing pepper fails loud
  (adversarial requirement), never silent-keyless.
- **D-4** — Mock default ON (`USE_MOCK_AI=true`): zero-cost dev/test;
  prod template flips it off.
- **D-5** — Audit sizes only: usage billing without prompt leakage.
- **D-6** — Root `package.json` / `lint-staged.config.js` / Husky
  untouched per task constraint; documented in G-2.
- **D-7** — Prompt versions are immutable rows, exactly one active
  per name; `activate` moves the pointer (rollback = older version,
  spec-pinned + live-verified). Pinned `resolve` never falls back
  (a pinned miss is a caller bug, 404); unpinned unknown names fall
  back to the hand-copied feed-publisher `default-feed` snapshot
  (legacy-fallback) until feed-publisher todo 3 repoints it here —
  never an import, so the source stays readable read-only.
- **D-8** — One embeddings interface (`EmbeddingsService`) over
  three adapters. Routing is model-per-call (pinned names select
  the adapter; unknown names are 400, never silent fallback);
  unpinned calls use mock > openai > local. Cache is per
  (effective model, text) with a 500-entry LRU. Outages are LOUD:
  503 with a remediation hint (deliberate deviation from the
  feed-publisher fail-open source — centralization means callers
  must see the outage, and `assertNoDivergence`-style parity in
  todo 3 needs the explicit signal).
- **D-9** — Playground writes nothing: no queue, no publish, no
  repo save — `persisted: false` rides every response and is
  spec-pinned. Render path is byte-parity with the
  feed-publisher source (`{{title}}/{{original}}/{{hasImage}}`,
  `sí`/`no`); template knobs fall back to gateway defaults
  because the ai-ml catalog v1 carries no per-template model
  settings (documented deviation, revisit if templates gain
  knobs).

## STANDING RULE

ai-ml never decides — it only generates. Business logic
(templates, scoring, scheduling) lives in the consumer; pre-written
content always stays allowed (ai-ml is optional by design).

## NOTES

- Backend `shared/llm` + feed-publisher `src/llm` are the migration
  SOURCES (inventory: `.omo/plans/ai-ml.md` §INVENTARIO) — ai-ml
  replicates their shape, it does not import them.
- Prompt catalog + embeddings + playground = todos 1-2 (this todo
  ships the gateway they will hang off).
- `.kiro/` untouched per task constraint.
