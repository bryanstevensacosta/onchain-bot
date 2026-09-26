# ai-ml - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Una app `ai-ml/` con todo lo AI/ML reutilizable: gateway LLM multi-provider, catálogo global de prompt-templates, embeddings y playground. scheduling-posts (y cualquiera) genera posts opcionales o usa pre-escritos.

**Why this approach:** El LLM vive hoy acoplado a feed-publisher; centralizarlo evita N gateways y unifica costos, rate-limits y playground.

**What it will NOT do:** No lógica de negocio (templates, scoring, scheduling deciden; ai-ml solo genera).

**Effort:** Large (6 todos)
**Risk:** Medium - migración con dual-run
**Decisions I made for you:** puertos 4090/91/92 (verificar); DB propia `onchain_bot_ai_ml[_staging]` (templates+auditoría uso); auth keys como market-data.

Your next move: <fill - e.g. approve, or run a high-accuracy review>. Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

- App `apps/ai-ml/` (:4090/91/92): `llm/` (gateway multi-provider + Mock, config 3-flag espejo), `prompts/` (catálogo global versionado, reutilizable por cualquier app), `embeddings/` (centralizado para dedup y búsqueda), `playground/` (preview sin side-effects), auth keys + rate-limit + audit uso.
- Migración desde `feed-publisher/src/llm/` con dual-run + cutover + deprecación; feed-publisher (y scheduling-posts) como clientes HTTP.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO decisiones de negocio (solo generación). NO breaking sin dual-run.

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + Jest + e2e (dual-run paridad generación) + live playground.
- Evidence: .omo/evidence/task-<N>-ai-ml.<ext>

## Execution strategy

### Parallel execution waves

> Wave 1: setup+gateway. Wave 2: catálogo+embeddings+playground. Wave 3: migración feed + cutover.

### Dependency matrix

| Todo                                  | Depends on           | Blocks  | Can parallelize with |
| ------------------------------------- | -------------------- | ------- | -------------------- |
| 0, 1 (setup+gateway)                  | central C-PORTS/C-DB | 2, 3, 4 | entre sí             |
| 2, 3 (catálogo+embeddings+playground) | 0, 1                 | 4       | entre sí             |
| 4, 5 (migración+cutover)              | 2, 3                 | —       | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 0. App setup + gateway LLM (puertos 4090/91/92, health, compose, envs, DB `onchain_bot_ai_ml[_staging]`, gateway multi-provider + Mock + config, auth keys + rate-limit + audit). Tests + coverage. Evidence .omo/evidence/task-0-ai-ml.log | Commit: Y | feat(ai-ml): setup y gateway
- [ ] 1. Catálogo prompt-templates global versionado + migración desde feed-publisher (dual-read temporal). Tests. Evidence .omo/evidence/task-1-ai-ml.log | Commit: Y | feat(ai-ml): catálogo prompts
- [ ] 2. Embeddings centralizados (deduplicación + búsqueda) + playground preview sin side-effects. Tests. Evidence .omo/evidence/task-2-ai-ml.log | Commit: Y | feat(ai-ml): embeddings y playground
- [ ] 3. Migración feed-publisher a cliente HTTP (dual-run + paridad + cutover + deprecación llm local). Tests. Evidence .omo/evidence/task-3-ai-ml.log | Commit: Y | feat(feed-publisher): LLM vía ai-ml
- [ ] 4. Cutover + cleanup + CI/deploy staging/prod. Evidence .omo/evidence/task-4-ai-ml.log | Commit: Y | feat(ai-ml)!: cutover

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

Un commit por todo; cutover con `!`; pre-escritos siempre permitidos (ai-ml es opcional por diseño).

## Success criteria

- Cualquier app genera vía ai-ml o usa pre-escritos, a elección.
- Un solo gateway LLM, un catálogo, un playground.

## INVENTARIO (exhaustivo, 2026-09-26, branch feat/mega-refactor-tramos)

> Fuente: grep sistemático sobre `apps/*` (2 pasadas, ver `.omo/evidence/ai-inventory.log`).
> SDK común: `openai` (npm) en backend + feed-publisher. Ningún otro provider-SDK
> (anthropic/langchain/ollama/gemini/mistral/groq/cohere = 0 imports; `anthropic|claude`
> solo aparece en 2 specs como string de modelo vía gateway LiteLLM-compatible).
> Sin scripts python en el repo. `scheduling-posts` no existe (cero hits).

### A. Backend legacy (origen de la migración — se depreca, no se extiende)

| item                                                                                                        | location                                                                                                      | provider                                                                                                                             | consumers                                                          | moves in todo #                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------- |
| LlmPort + LlmModule (factory gateway>openai>mock, @Global)                                                  | `apps/backend/src/shared/llm/` (`llm.port.ts`, `llm.module.ts`, `mock.llm.adapter.ts`)                        | LiteLLM `/v1/chat/completions` vía SDK openai / OpenAI directo / Mock                                                                | CryptoNewsLlmAdapter, ThreadsLlmAdapter, ProcessNextThreadsArticle | 0 (contrato gateway) + 3 (clientes) |
| OpenAiAdapter (chat.completions, default `gpt-4o-mini`, vision)                                             | `apps/backend/src/shared/llm/adapters/openai.adapter.ts`                                                      | `openai` SDK, `OPENAI_API_KEY`                                                                                                       | LlmModule factory                                                  | 0                                   |
| LlmGatewayAdapter (baseURL override, `app.llm.gateway.*`)                                                   | `apps/backend/src/shared/llm/adapters/llm-gateway.adapter.ts`                                                 | LiteLLM-compatible, `LLM_GATEWAY_{BASE_URL,API_KEY,MODEL}`                                                                           | LlmModule factory                                                  | 0                                   |
| CryptoNewsLlmAdapter (`{{title}}/{{original}}/{{hasImage}}`, vision fail-open, `USE_MOCK_AI` short-circuit) | `apps/backend/src/telegram/crypto-news-publisher/infrastructure/llm/`                                         | vía LlmPort                                                                                                                          | ProcessNextQueuedArticleUseCase, PreviewPromptUseCase              | 3                                   |
| LlmConfig entity/repo/controller + prod guard (`llmEnabled` bloqueado en prod)                              | `apps/backend/src/telegram/crypto-news-publisher/` (domain/entities, application, api/http)                   | — (config)                                                                                                                           | drain path, frontend llm-config UI                                 | 1 + 3                               |
| PromptTemplate entity/repo/controller (crypto-only)                                                         | `apps/backend/src/telegram/crypto-news-publisher/`                                                            | — (catálogo)                                                                                                                         | CryptoNewsLlmAdapter (keyword-bound > default)                     | 1                                   |
| PreviewPromptUseCase + GetLlmModelsUseCase                                                                  | `apps/backend/src/telegram/crypto-news-publisher/application/handlers/`                                       | vía LlmPort / gateway `/v1/models`                                                                                                   | playground controller, frontend                                    | 2 + 0                               |
| ThreadsLlmAdapter + ThreadsLlmConfig + ThreadsPromptTemplate + in-memory repo                               | `apps/backend/src/threads/publisher/` (infrastructure/llm, domain/entities, application)                      | vía LlmPort                                                                                                                          | ProcessNextThreadsArticle, frontend threads UI                     | 1 + 3                               |
| GetThreadsLlmModelsUseCase                                                                                  | `apps/backend/src/threads/publisher/application/handlers/`                                                    | gateway `/v1/models`                                                                                                                 | threads UI                                                         | 0                                   |
| EmbeddingService (local `Xenova/all-MiniLM-L6-v2`, 30s timeout, fail-open)                                  | `apps/backend/src/shared/deduplication/infrastructure/ml/embedding.service.ts`                                | `@xenova/transformers` (único uso local-ML del repo)                                                                                 | semantic-scorer/dedup-scorer, EnqueueMatchingMessageUseCase        | 2                                   |
| SemanticScorer/DedupScorer + blocking-failure-reasons                                                       | `apps/backend/src/shared/deduplication/`                                                                      | vía EmbeddingService                                                                                                                 | crypto-news-ingested handler, threads                              | 2                                   |
| threshold-tuner.mjs (tooling offline)                                                                       | `apps/backend/scripts/dedup/`                                                                                 | —                                                                                                                                    | operadores                                                         | 2 (referencia)                      |
| Env keys backend                                                                                            | `apps/backend/.env.{example,staging.template,production.template}` + `src/shared/common/config/app.config.ts` | `OPENAI_API_KEY`, `USE_MOCK_AI`, `LLM_GATEWAY_{BASE_URL,API_KEY,MODEL}`, `DEDUP_EMBEDDING_MODEL`, `DEDUP_SEMANTIC_ARBITER_THRESHOLD` | LlmModule, adapters, dedup                                         | 0                                   |

### B. feed-publisher (hogar canónico actual — ai-ml replica esta forma, no la mueve)

| item                                                                                                                                                                                                                               | location                                                                  | provider                                                                                                     | consumers                                            | moves in todo #                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------- |
| `src/llm/` BC completo (LlmConfig single-row id=1, PromptTemplate GLOBAL `crypto-news\|threads\|global`, FeedLlmGenerator, LlmArticleRendererAdapter LIVE, gateway default + mock, 3 controllers, latin-validator, pipeline-flags) | `apps/feed-publisher/src/llm/`                                            | `openai` SDK, flat `LLM_GATEWAY_*` + `OPENAI_API_KEY` fallback, `LLM_MODEL`, `LLM_MAX_ATTEMPTS=3`            | QueueModule drain, matching, frontend                | 3 (lado servidor del contrato HTTP) |
| Embeddings OpenAI (`text-embedding-3-small`) + Mock + cosine/semantic-scorer (tabla plana `dedup_fingerprints`, NO pgvector)                                                                                                       | `apps/feed-publisher/src/deduplication/`                                  | `openai` SDK / determinista                                                                                  | DeduplicationService cascade, EnqueueMatchingMessage | 2                                   |
| Playground controller (preview+models, nunca persiste)                                                                                                                                                                             | `apps/feed-publisher/src/llm/api/http/llm-playground.controller.ts`       | vía LlmPort                                                                                                  | frontend prompt-playground                           | 2                                   |
| Env keys feed-publisher                                                                                                                                                                                                            | `apps/feed-publisher/.env.example` + `.env.{staging,production}.template` | `USE_MOCK_AI`, `OPENAI_API_KEY`, `LLM_MODEL`, `LLM_MAX_ATTEMPTS`, `LLM_GATEWAY_BASE_URL/_API_KEY`, `DEDUP_*` | LlmModule, dedup                                     | 0                                   |

### C. Frontend (clientes — se re-apuntan, no se mueven)

| item                                                                                                                              | location                                                     | provider         | consumers                                                 | moves in todo # |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------- | --------------------------------------------------------- | --------------- |
| prompt-playground feature (api/model/ui + markdown-to-telegram-html) → `POST /feed-api/api/llm/preview`                           | `apps/frontend/src/features/prompt-playground/`              | backend vía HTTP | `pages/playground/`                                       | 2               |
| feed-publisher UI (llm-config-api, use-llm-config, llm-config, prompt-templates, matching-toggle-button, queue-view, stats-strip) | `apps/frontend/src/features/feed-publisher/`                 | backend vía HTTP | `pages/feed/`, `pages/feed/__tests__/llm-config.test.tsx` | 3               |
| threads-publisher LLM UI (llm-config-api, use-threads-llm-config)                                                                 | `apps/frontend/src/features/threads-publisher/`              | backend vía HTTP | `pages/threads/`                                          | 3               |
| VITE_APP_ENV prod LLM-toggle hide + VITE_FEED_PUBLISHER_URL base                                                                  | `apps/frontend/src/shared/config/env.ts`, feed-scheduling UI | —                | todas las páginas feed                                    | 3               |

### D. Explícitamente FUERA (verificado, no mover)

| item                                                                      | location                                                                  | veredicto                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------- |
| token/classification (ClassifyTokenUseCase heurístico)                    | `apps/backend/src/token/classification/`                                  | regla, sin LLM — NO mover |
| token/scoring (ScoreTokenUseCase 501 líneas, reglas + reputación)         | `apps/backend/src/token/scoring/`                                         | regla, sin LLM — NO mover |
| kol-system/src                                                            | —                                                                         | 0 hits AI — limpio        |
| market-data/src                                                           | 2 hits falsos (`class-transformer`, "embedding the plaintext")            | limpio                    |
| ingestion-telegram/src                                                    | 26 hits, todos `transformation/transformers` (shaping de mensajes, no ML) | limpio                    |
| telegram-bots-gateway, kol-calls, kol-calls-publisher, dexter-onchain-bot | hits falsos (`restoreAllMocks`, `lastCallMcAt`) o 0                       | limpio                    |
