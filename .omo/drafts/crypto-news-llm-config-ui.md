---
slug: crypto-news-llm-config-ui
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/crypto-news-llm-config-ui.md
approach: Move LLM publisher config from JSON to DB. Expose /v1/models proxy on backend. New frontend section with dropdown of available models, configurable max_tokens/temperature/reasoning_effort, editable prompt template.
---

# Draft: crypto-news-llm-config-ui

## Findings

1. `apps/backend/config/crypto-news-publisher.config.json` — current config lives on disk; mutating requires backend to re-read (we already fixed that with the `getConfig()` getter)
2. `apps/backend/src/telegram/crypto-news-publisher/infrastructure/config/crypto-news-publisher.config.ts` — sync file loader
3. `apps/backend/src/telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter.ts` — reads `model` from JSON config (uses it only for log; the actual model is in the LLM gateway)
4. `LlmGatewayAdapter` uses `app.llm.gateway.model` from env (not from JSON)
5. Gateway already exposes `/v1/models` — we can proxy it
6. The user wants:
   - LLM model selectable from the gateway's available list (dropdown)
   - max_tokens configurable
   - temperature configurable
   - reasoning_effort configurable
   - prompt template editable

## Decisions

1. **Move LLM publisher config from `config/*.json` to a DB table** (`crypto_news_publisher_config`) with a single row. This is the persistence layer for all the user-configurable values. The JSON file is removed; the table is the only source of truth.
2. **The LLM gateway model list** comes from a new backend endpoint `GET /crypto-news-publisher/llm/models` that proxies the gateway's `/v1/models`. The frontend renders this as a dropdown.
3. **Config model** (DB):
   - `model: string` — selected from gateway's /v1/models list
   - `maxTokens: number` — user-configurable, default 800
   - `temperature: number` — user-configurable, default 0.7
   - `reasoningEffort?: 'low' | 'medium' | 'high' | null` — user-configurable, default null (off)
   - `promptTemplate: string` — user-editable; supports `{{title}}`, `{{original}}`, `{{hasImage}}`, `{{sourceUrl}}`, `{{sourceHandle}}` placeholders
4. **Backward compat**: there's a single row with defaults. If the DB is empty, the publisher module creates the row with the previous JSON defaults on first read.
5. **API endpoints**:
   - `GET /crypto-news-publisher/llm/models` — proxy to gateway `/v1/models`, returns `[{id, owned_by?}, ...]`
   - `GET /crypto-news-publisher/llm/config` — returns the current DB row
   - `PATCH /crypto-news-publisher/llm/config` — partial update of any of the 5 fields
6. **Frontend section** lives in the existing crypto-news-publisher feature (already exists at `apps/frontend/src/features/crypto-news-publisher/`). New components: `ui/llm-config.tsx` (form with model dropdown, maxTokens input, temperature slider, reasoningEffort select, promptTemplate textarea).

## Scope IN

- New TypeORM entity `LlmConfigEntity` + port `LlmConfigRepository`
- New use case `GetLlmModelsUseCase` (proxies `/v1/models`)
- New controller endpoint
- New frontend component with form
- `crypto-news-llm.adapter.ts` reads model/maxTokens/temperature/reasoningEffort from the DB via a new port instead of hardcoded
- `BotApiCryptoNewsPublisherAdapter` unchanged (still reads chat_id from env, but moves targetChannel here too)

## Scope OUT

- Bulk operations (only single-row config)
- Per-keyword overrides (all keywords share the same LLM config)
- Multi-model A/B testing
- Cost tracking dashboard
