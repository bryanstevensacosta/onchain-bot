# crypto-news-prompt-templates - Work Plan

## TL;DR (For humans)

**What you'll get:** Una biblioteca de templates de prompt + LLM settings en la DB. Los creas, editas y borras desde el frontend sin tocar código. Cada keyword puede tener un template propio, o usar el "default" configurado globalmente. La UI además tiene un dropdown de modelos del gateway (vía `/v1/models` proxyeado por el backend) y campos para `maxTokens`, `temperature`, `reasoningEffort`.

**Why this approach:** Hoy todo está hardcodeado en `crypto-news-publisher.config.json`. Cualquier cambio requiere editar JSON en disco. Con templates en la DB, todo se gestiona desde el UI. Y al ser una entity con CRUD, los templates son reutilizables entre keywords.

**Effort:** Medium-large (~10 archivos, 1 wave + 2 waves)
**Risk:** Low — todo es aditivo, no se elimina nada hasta que el JSON se migra y queda dead-code

## Scope

### Must have

- `PromptTemplate` entity (id, name, description?, model, maxTokens, temperature, reasoningEffort?, promptText, createdAt, updatedAt)
- `LlmConfig` entity (single row, default template id + global LLM params)
- `Keyword.templateId` (optional override)
- Repos: `PromptTemplateRepository`, `LlmConfigRepository`
- 7 endpoints in `LlmConfigController` (CRUD templates + get/post LlmConfig + GET gateway models)
- `GetLlmModelsUseCase` (proxy to gateway)
- `CryptoNewsLlmAdapter` resolves the template per entry
- One-time JSON→DB migration on startup (idempotent)
- Frontend: `llm-config.tsx` (default LLM settings form) + `prompt-templates.tsx` (list + create/edit modal) + small edit in `keywords-manager.tsx` to show template binding
- Hooks: `useLlmModels`, `useLlmConfig`, `useLlmTemplates`
- Tests for: prompt template entity, llm config, adapter template resolution, controllers

### Must NOT have

- No A/B testing across templates
- No per-keyword preview of how the template would render
- No cost tracking per template
- No multi-tenant (single org)
- No removing the JSON file until migration is verified

## Execution strategy

### Parallel execution waves

Wave 1: backend foundation (entities, repos, use case for models proxy, migration logic)
Wave 2: backend controller (CRUD endpoints) + adapter change (template resolution)
Wave 3: frontend (config + templates UI)

### Dependency matrix

| Todo                                         | Depends on | Blocks |
| -------------------------------------------- | ---------- | ------ |
| T1. Entities + repos + migration             | —          | T2     |
| T2. LlmConfigController + adapter change     | T1         | T3     |
| T3. Frontend: models + config + templates UI | T2         | —      |

## Todos

- [ ] 1. Entities + repos + JSON→DB migration
     What to do:
  - New: `apps/backend/src/telegram/crypto-news-publisher/domain/entities/prompt-template.entity.ts` (AggregateRoot)
    - props: `{ id, name, description?, model, maxTokens, temperature, reasoningEffort?, promptText, createdAt, updatedAt }`
    - `name` is unique (caller enforces — see M1)
    - `model` is the LLM model identifier (gated by gateway availability at call time)
    - `maxTokens` and `temperature` are LLM-call knobs (caller enforces range)
    - `promptText` is the template with placeholders `{{title}} {{original}} {{hasImage}}` (the only three placeholders the queue entry actually has)
  - New: `apps/backend/src/telegram/crypto-news-publisher/domain/entities/llm-config.entity.ts` (single-row config)
    - props: `{ id, defaultTemplateId, targetChannel, enabled, dailyCap, dailyResetUtcHour, randomDelayMinMs, randomDelayMaxMs, llmMaxAttempts, updatedAt }`
    - **Owns the publishing knobs** that were in the JSON (targetChannel, enabled, dailyCap, dailyResetUtcHour, randomDelayMin/Max, llmMaxAttempts) — these are NOT in PromptTemplate because they are global, not per-template
  - New: `apps/backend/src/telegram/crypto-news-publisher/application/ports/prompt-template.repository.ts`
    - `findAll(): Promise<PromptTemplate[]>`
    - `findById(id): Promise<PromptTemplate | null>`
    - `save(template): Promise<PromptTemplate>`
    - `delete(id): Promise<void>`
    - `findByIds(ids: string[]): Promise<PromptTemplate[]>` (for batch-fetching keyword-bound templates)
  - New: `apps/backend/src/telegram/crypto-news-publisher/application/ports/llm-config.repository.ts`
    - `load(): Promise<LlmConfig>` (single row, returns the only row; throws if missing)
    - `save(config): Promise<LlmConfig>`
  - Modify: `KeywordEntity` add `templateId: string | null` field
  - Modify: `KeywordRepository` add `findAll` and `save` to handle `templateId`
  - New TypeORM entities: `PromptTemplateEntity`, `LlmConfigEntity` with the columns above
    - `PromptTemplateEntity.name` has `@Unique` constraint
    - `KeywordEntity.templateId` has `@Index` for the DELETE-refuse query
  - Mappers: domain ↔ TypeORM for both
  - New: `apps/backend/src/telegram/crypto-news-publisher/infrastructure/migration/llm-config-migration.ts`
    - On startup, check if `LlmConfigEntity` table is empty
    - **Branch A: JSON file exists.** Read `apps/backend/config/crypto-news-publisher.config.json`. Create a `PromptTemplateEntity` named "Default (imported)" with `model = JSON.prompt.model, maxTokens = 2000, temperature = 0.7, promptText = JSON.prompt.template` (the `2000/0.7` come from the current `crypto-news-llm.adapter.ts` hardcoded defaults, NOT the JSON). Create `LlmConfigEntity(id=1)` with `defaultTemplateId = imported.id` and ALL 7 JSON fields populated.
    - **Branch B: JSON file absent** (fresh deploy). Same as A but use the in-code `DEFAULTS` constants for the prompt and template values: `model = 'default', maxTokens = 2000, temperature = 0.7, promptText = DEFAULT_PROMPT_TEXT, dailyCap = 36, ...` etc. So a fresh prod deploy with no JSON file still seeds a working LlmConfig.
    - Both branches are idempotent: if `LlmConfigEntity.findById(1)` returns a row, no-op.
    - Wrap both branches in a transaction (`dataSource.transaction`) to prevent two concurrent backend starts from racing the empty-check.
    - Log "[llm-config-migration] seeded LlmConfig + N template(s)" on success.
  - `crypto-news-publisher.module.ts`:
    - Add `TypeOrmModule.forFeature([PromptTemplateEntity, LlmConfigEntity])`
    - Add `PromptTemplateRepository`, `LlmConfigRepository` providers
    - Add `LlmConfigMigration` to `onApplicationBootstrap` (NestJS lifecycle hook)
  - **Delete `apps/backend/config/crypto-news-publisher.config.json` AS PART OF THIS TODO** (not T2). Once migration runs and LlmConfig is populated, the file is dead code. We remove the file in T1 commit so future T2 changes are unambiguous about the source of truth.
  - **DO NOT modify `crypto-news-llm.adapter.ts` here** — that change is in T2 once we know the new repos exist.
  - Tests: `prompt-template.entity.spec.ts`, `llm-config.entity.spec.ts`, `llm-config-migration.spec.ts` (with two branches: JSON present, JSON absent)

- [ ] 2. LlmConfigController + LlmPort change + adapter + handler plumbing
     What to do:
  - **Modify `apps/backend/src/shared/llm/llm.port.ts`**:
    - Add `model?: string` to `LlmGenerateRequest`. Adapters use it if provided, else fall back to their own configured model. Adapters that don't support per-request model (current OpenAiAdapter hardcodes `'gpt-4o-mini'`) must thread this field through to `chat.completions.create({ model: this.model })`. This unblocks the template.model UX.
  - **Modify `LlmGatewayAdapter`** (and OpenAiAdapter for symmetry): if `request.model` is set, use it; else fall back to `this.model`. This is the wire-level plumbing for template.model.
  - New: `apps/backend/src/telegram/crypto-news-publisher/application/handlers/get-llm-models.use-case.ts`
    - Reads `app.llm.gateway.baseUrl` + `apiKey` from ConfigService
    - Calls `https://${baseUrl}/v1/models` with `Authorization: Bearer ${apiKey}` and a 5-second timeout
    - Returns `Array<{ id: string; ownedBy?: string }>`
    - On error: throw (the controller catches and returns 502)
  - New: `apps/backend/src/telegram/crypto-news-publisher/api/http/llm-config.controller.ts`
    - `GET /crypto-news-publisher/llm/models` — calls GetLlmModelsUseCase
    - `GET /crypto-news-publisher/llm/templates` — list all
    - `GET /crypto-news-publisher/llm/templates/:id` — single
    - `POST /crypto-news-publisher/llm/templates` — body: `{ name, description?, model, maxTokens, temperature, reasoningEffort?, promptText }` with class-validator (`@Min(1)`, `@Max(8000)` for maxTokens; `@Min(0) @Max(2)` for temperature)
    - `PATCH /crypto-news-publisher/llm/templates/:id` — partial update
    - `DELETE /crypto-news-publisher/llm/templates/:id` — refuse (409) if it's `LlmConfig.defaultTemplateId` OR any keyword's `templateId` references it. Error body explains: "in use by default config" or "in use by N keyword(s)"
    - `GET /crypto-news-publisher/llm/config` — return LlmConfig
    - `PATCH /crypto-news-publisher/llm/config` — body: `{ defaultTemplateId?, targetChannel?, enabled?, dailyCap?, dailyResetUtcHour?, randomDelayMinMs?, randomDelayMaxMs?, llmMaxAttempts? }` (LlmConfig's actual fields; **does not** include model/maxTokens/temperature — those are on PromptTemplate, not LlmConfig, per the separation of concerns in T1)
  - **Modify `CryptoNewsMessageIngestedHandler`** (`infrastructure/event-bus/crypto-news-message-ingested.handler.ts`):
    - `handle()` currently does `const keywords = await this.keywordRepo.findEnabled()` and then `keywords.find((kw) => kw.matches(...))` — it discards the matched keyword. **Pass the matched keyword to the use case.** The variable name is `matchedKeyword`. Pass it as a new arg.
  - **Modify `EnqueueMatchingMessageUseCase`** (`application/handlers/enqueue-matching-message.use-case.ts`):
    - Input shape now: `EnqueueMatchingMessageInput = { message: CryptoNewsMessage, matchedKeyword?: Keyword }` (matched keyword is optional in case the match logic is changed in the future)
    - When `matchedKeyword` is present, pass `keywordTemplateId = matchedKeyword.templateId ?? null` to the queue repo's enqueue call (add a new field on the queue entry)
  - **Modify `PublisherQueueEntry`** (`domain/entities/publisher-queue-entry.entity.ts`):
    - Add `keywordTemplateId: string | null` field
    - Add to constructor and `reconstitute()` factory
  - **Modify `PublisherQueueRepository` (port + TypeORM impl)**:
    - `enqueue()` signature now takes `entry: PublisherQueueEntry` (already does); no change
    - `PublisherQueueEntity` (TypeORM) gets a new column `keywordTemplateId: string | null`
  - **Modify `CryptoNewsLlmAdapter`** (`infrastructure/llm/crypto-news-llm.adapter.ts`):
    - Constructor: take `PromptTemplateRepository` + `LlmConfigRepository` (no more JSON file dependency)
    - `generateForEntry(entry: PublisherQueueEntry): Promise<string>`:
      1. `const cfg = await this.llmConfigRepo.load()`
      2. `const templateId = entry.keywordTemplateId ?? cfg.defaultTemplateId`
      3. `const template = await this.templateRepo.findById(templateId)` — throw if null (config error: defaultTemplateId points to non-existent template; surface a clear error)
      4. `const prompt = template.promptText.replace('{{title}}', entry.rawTitle ?? '').replace('{{original}}', entry.rawContent).replace('{{hasImage}}', entry.imagePath ? 'sí' : 'no')` — use a single regex pass to avoid O(N×M) chained replaces
      5. `return this.llmPort.generateText({ prompt, imageBase64, mimeType, model: template.model, maxTokens: template.maxTokens, temperature: template.temperature, reasoningEffort: template.reasoningEffort })`
  - **Modify `keywords.controller.ts`**: when creating/updating a keyword, accept `templateId: string | null` in the request body and pass it through to the repo
  - Tests: `get-llm-models.use-case.spec.ts`, `llm-config.controller.spec.ts`, `llm-config-template-resolution.spec.ts` (covers: default template path, keyword-template override path, template-not-found error), update `crypto-news-llm.adapter.spec.ts` to mock the new repos
  - **No file deletes** — the JSON config is deleted in T1 (already done in this plan)

- [ ] 3. Frontend: config + templates UI
     What to do:
  - New: `apps/frontend/src/features/crypto-news-publisher/api/llm-config-api.ts`
    - `fetchLlmModels(): Promise<{id: string, ownedBy?: string}[]>` — `/crypto-news-publisher/llm/models`
    - `fetchLlmConfig(): Promise<LlmConfig>` — `/crypto-news-publisher/llm/config`
    - `updateLlmConfig(patch): Promise<LlmConfig>` — PATCH
    - `fetchTemplates(): Promise<PromptTemplate[]>` — `/crypto-news-publisher/llm/templates`
    - `fetchTemplate(id): Promise<PromptTemplate>`
    - `createTemplate(body): Promise<PromptTemplate>` — POST
    - `updateTemplate(id, patch): Promise<PromptTemplate>` — PATCH
    - `deleteTemplate(id): Promise<void>` — DELETE
    - Types: `PromptTemplate`, `LlmConfig`
  - New: `apps/frontend/src/features/crypto-news-publisher/model/use-llm-config.ts`
    - `useLlmModels()` — `staleTime: 5 * 60_000` (5 min, NOT 10s — model list is static and polling it faster wastes gateway quota)
    - `useLlmConfig()` — `staleTime: 5_000` (5s, low-latency for config edits)
    - `useUpdateLlmConfig()` (mutation)
    - `useTemplates()` — `staleTime: 30_000` (30s, templates change rarely)
    - `useTemplate(id)` — `staleTime: 30_000`
    - `useCreateTemplate()` / `useUpdateTemplate()` / `useDeleteTemplate()` (mutations that invalidate templates cache)
  - New: `apps/frontend/src/features/crypto-news-publisher/ui/llm-config.tsx`
    - Top section: "Default LLM settings" form
    - Form fields:
      - **Model**: dropdown populated from `useLlmModels()` — `<select>` with `{id, ownedBy}` options
      - **Max tokens**: number input (200-8000, default 2000)
      - **Temperature**: number input (0-2, step 0.1, default 0.7) OR a range slider
      - **Reasoning effort**: `<select>` with `null | 'low' | 'medium' | 'high'`
      - **Default template**: dropdown from `useTemplates()`
    - "Save" button → PATCH `/crypto-news-publisher/llm/config`
  - New: `apps/frontend/src/features/crypto-news-publisher/ui/prompt-templates.tsx`
    - List of templates (card or row per template) showing name, model, max tokens, temperature, description
    - "New template" button → opens create modal
    - "Edit" button per template → opens edit modal (same form fields as config + `promptText` textarea with `{{title}}`, `{{original}}`, `{{hasImage}}` placeholder hints — **only these three, the only ones the queue entry actually has**)
    - "Delete" button per template (with confirmation dialog, disabled if it's the default or any keyword uses it)
  - Modify: `apps/frontend/src/features/crypto-news-publisher/ui/keywords-manager.tsx`
    - Each keyword row shows: name, caseSensitive, enabled, and now **template** (e.g. "Default" or "Template: Clickbait" if overridden)
    - The create/edit keyword form includes a "Template" dropdown (default = "Use global default")
  - Add to the existing publisher section in `pages/crypto-news/index.tsx`:
    - New collapsible `<details>` for "LLM Configuration" inside the publisher section
    - Or: render `llm-config.tsx` + `prompt-templates.tsx` as separate sections

## Verification

- tsc clean
- jest passes (845 baseline + new tests for templates, config, adapter resolution, migration idempotency)
- ESLint clean
- Vitest passes (133 baseline + new tests for frontend)
- **Integration test**: a keyword with `templateId = X` triggers the `X` template's `promptText` through `llmPort.generateText` (asserted by spying on the port)
- **Concurrency test**: the migration runs twice in parallel (two `Test.createTestingModule` instances) and only seeds the row once
- **End-to-end manual**: create a new template via the frontend, mark it as default, run the cron manually, verify a queued entry is published with the new template's promptText
- **End-to-end manual (override)**: create a keyword, pin it to a specific template, trigger an ingest, verify the keyword-bound template (not the default) is used

## Commits

1. `feat(crypto-news-publisher): add prompt templates + llm config persistence`
2. `feat(crypto-news-publisher): add LlmConfigController + model list proxy`
3. `feat(frontend): add LLM config + prompt templates UI`

## Success criteria

- [ ] User can create a template via the frontend (e.g. "Clickbait" with prompt: "Headline-style...")
- [ ] User can edit / delete templates via the frontend
- [ ] User can pick the active model from the gateway's available list (dropdown populated by `/v1/models`)
- [ ] User can configure `maxTokens`, `temperature`, `reasoningEffort` per template
- [ ] User can pin a template to a specific keyword (overrides the default)
- [ ] DELETE on a template in use (default or referenced by a keyword) returns 409 with a clear error
- [ ] The `targetChannel`, `enabled`, `dailyCap`, `dailyResetUtcHour`, `randomDelayMin/Max`, `llmMaxAttempts` settings are configurable from the LlmConfig form (NOT lost from the JSON→DB migration)
- [ ] After PATCH `/llm/config`, the next cron publisher tick (within 60s) uses the new values
- [ ] A new prod deploy with empty DB seeds a working `LlmConfig` even when the JSON file is absent
- [ ] When a message is published, the LLM call uses the resolved template (entry's template or default)
- [ ] No restart needed for any of the above changes
