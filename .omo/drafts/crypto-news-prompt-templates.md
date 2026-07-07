---
slug: crypto-news-prompt-templates
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/crypto-news-prompt-templates.md
approach: Move from single hardcoded config to a DB-backed multi-template system. Users can create/edit/delete prompt templates via the frontend and bind them to keywords (or use a default). Also expose the gateway's /v1/models as a dropdown.
---

# Draft: crypto-news-prompt-templates

## Findings

1. Current config is in `apps/backend/config/crypto-news-publisher.config.json` (single row, on disk)
2. `crypto-news-llm.adapter.ts` reads `model`, `maxTokens`, `temperature` from that config
3. Keywords live in `keyword.entity.ts`; each keyword just has a phrase + caseSensitive
4. Gateway at `144.126.203.139:4845` exposes `/v1/models` — we can proxy it
5. The user wants multi-template: create/edit/delete templates via the frontend, switch between them at will
6. The current `LlmGatewayAdapter` is configured per-process via env (model, baseUrl, apiKey); the _user-configurable_ knobs (model selection, maxTokens, temperature, reasoningEffort, prompt text) are what we move to DB

## Architecture

The hardcoded single-config model is replaced with three DB-backed entities:

1. **`PromptTemplate`**: a user-defined prompt + LLM params, reusable across keywords
2. **`LlmConfig`** (single-row): the active **default** settings (which template, which model, which LLM tuning params). Used when no keyword-template binding is set.
3. **`LlmConfig` ↔ `Keyword`** binding: optionally, a keyword can override the default with a specific template. Without override, falls back to LlmConfig.defaultTemplateId.

So the data model is:

- Templates are a library of named presets (e.g. "Default", "Clickbait", "Professional", "Short tweet-style")
- LlmConfig holds the active default template id + LLM tuning
- Keywords may have a `templateId` override; null = use default

This gives you: create templates freely, switch the active default, optionally pin a specific template to a specific keyword.

## Decisions

1. **New entities**:
   - `PromptTemplateEntity` (id, name, description?, model, maxTokens, temperature, reasoningEffort?, promptText, createdAt, updatedAt)
   - `LlmConfigEntity` (id=1, defaultTemplateId, updatedAt) — single row
   - `KeywordEntity` adds optional `templateId: string | null` (FK to PromptTemplateEntity)
2. **Ports**:
   - `PromptTemplateRepository`: findAll, findById, save, delete
   - `LlmConfigRepository`: load (single row), update
   - `KeywordRepository.save` / `findAll` already exist; just extend with `templateId`
3. **Default seed**: on first read, if `LlmConfig` is empty, seed it with the current JSON defaults (model=default, maxTokens=800, temperature=0.7, defaultTemplateId = the only existing PromptTemplate). After that, the JSON file is dead code and we remove it.
4. **Wire-up**:
   - `CryptoNewsLlmAdapter` no longer takes `loadCryptoNewsPublisherConfig()`. It takes `LlmConfigRepository` + `PromptTemplateRepository`. At call time, it resolves the template:
     - If `entry.templateId` is set, use that template
     - Otherwise, use `LlmConfig.defaultTemplateId`
   - BotApiCryptoNewsPublisherAdapter unchanged (chat_id, token still from env)
5. **API endpoints** (new controller `LlmConfigController`):
   - `GET /crypto-news-publisher/llm/models` — proxy to gateway `/v1/models`, returns `[{ id: string, ownedBy?: string }, ...]`
   - `GET /crypto-news-publisher/llm/templates` — list all templates
   - `GET /crypto-news-publisher/llm/templates/:id` — single
   - `POST /crypto-news-publisher/llm/templates` — create (body: name, description?, model, maxTokens, temperature, reasoningEffort?, promptText)
   - `PATCH /crypto-news-publisher/llm/templates/:id` — update
   - `DELETE /crypto-news-publisher/llm/templates/:id` — delete (refuse if it's the default OR any keyword is using it)
   - `GET /crypto-news-publisher/llm/config` — return LlmConfig (default template id + LLM params)
   - `PATCH /crypto-news-publisher/llm/config` — update default template id, maxTokens, temperature, reasoningEffort, etc.
6. **Frontend section** (in the existing `features/crypto-news-publisher/`):
   - `ui/llm-config.tsx` — top form: "Default LLM settings" (model dropdown from gateway, maxTokens, temperature, reasoningEffort select, default template picker)
   - `ui/prompt-templates.tsx` — list of templates + create/edit modal + delete
   - Each keyword in the existing `keywords-manager.tsx` shows its current template (with override indicator)
7. **Migration of existing config**:
   - On startup, if `LlmConfig` is empty AND `apps/backend/config/crypto-news-publisher.config.json` exists, import the values from JSON (one-time migration). After that, the JSON file is dead code.
   - The existing prompt template is migrated as a `PromptTemplate` row named "Default (imported from JSON)".

## Scope IN

- `PromptTemplate` entity + repo + CRUD
- `LlmConfig` entity + repo + read/update
- `Keyword.templateId` (optional override)
- `LlmConfigController` (the 7 endpoints above)
- `GetLlmModelsUseCase` (proxy)
- `LlmConfig` + `PromptTemplate` TypeORM entities in `crypto-news-publisher.module`
- Update `CryptoNewsLlmAdapter` to resolve template per entry
- Update `EnqueueMatchingMessageUseCase` (no change) — same handler, the template resolution happens at publish time
- Frontend `llm-config.tsx` + `prompt-templates.tsx` + small edit in `keywords-manager.tsx` to show template binding
- `useLlmModels`, `useLlmConfig`, `useLlmTemplates` hooks
- One-time migration from JSON to DB on startup (idempotent)
- Tests: prompt-template + llm-config + adapter template resolution

## Scope OUT

- A/B testing across templates (a future feature)
- Per-keyword prompt preview ("how this template would render for this message")
- Cost tracking per template
- Multi-tenant templates (only one org)
- Hardcoded fallback to the old JSON config (after migration, the JSON file is dead)
