---
slug: crypto-news-system-prompt
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/crypto-news-system-prompt.md
approach: Add a systemPromptText field to PromptTemplate, plumb through LlmPort and both adapters so the LLM call sends [system, user] instead of just [user].
---

# Draft: crypto-news-system-prompt

## Findings

1. `apps/backend/src/shared/llm/llm.port.ts:1-41` — `LlmGenerateRequest.prompt` is the only content field
2. `apps/backend/src/shared/llm/adapters/llm-gateway.adapter.ts:46-65` — sends `messages: [{ role: 'user', content: prompt }]`
3. `apps/backend/src/shared/llm/adapters/openai.adapter.ts` — same pattern
4. `apps/backend/src/telegram/crypto-news-publisher/domain/entities/prompt-template.entity.ts` — has only `promptText` field
5. `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/prompt-template.entity.ts` — only `prompt_text` column
6. `apps/backend/src/telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter.ts` — passes only `prompt` to generateText
7. Frontend `llm-config-api.ts` — `PromptTemplate` type has only `promptText`
8. `apps/backend/src/telegram/crypto-news-publisher/infrastructure/migration/llm-config-migration.service.ts` — seeds from JSON

## Decisions

1. **Two-message pattern**: system + user. Standard chat completion. The LLM respects system instructions more than user-instruction-following.
2. **System prompt is nullable** (default empty string). Existing templates without system prompt continue to work unchanged (single user message).
3. **Empty system prompt is sent as empty string** (not omitted). This makes the logic simpler. If `systemPrompt.trim() === ''` we can skip it, but the simpler approach is to always include it. The OpenAI API accepts empty system messages without issues.
4. **Migration: existing JSON prompt → user prompt**. The new `systemPromptText` is empty for migrated templates. Users can edit them in the UI to add system instructions.
5. **Default system prompt** is empty (no "you are a journalist" boilerplate). Users add their own.
6. **Frontend layout**: two textareas stacked, "System prompt" first (with hint about persona/role), "User prompt" second (with placeholders hint).

## Scope IN

- `LlmPort.LlmGenerateRequest.systemPrompt?: string`
- `PromptTemplate.systemPromptText: string` (nullable, default "")
- `PromptTemplateEntity.system_prompt_text` column (nullable, text)
- `PromptTemplateMapper` mapping for new field
- `LlmGatewayAdapter` — send `[system, user]` when systemPrompt present, else `[user]`
- `OpenAiAdapter` — same
- `CryptoNewsLlmAdapter` — read `template.systemPromptText` and pass to `llmPort.generateText`
- `PromptTemplateView.systemPromptText`
- `CreatePromptTemplateBody.systemPromptText` and `UpdatePromptTemplateBody.systemPromptText`
- Migration: `systemPromptText` empty for migrated templates
- LlmConfigMigrationService — handle the new field
- All affected specs: prompt-template.entity, llm-gateway.adapter, openai.adapter, crypto-news-llm.adapter, llm-config.controller, llm-config migration, frontend
- Frontend template form: two textareas

## Scope OUT

- No separate LLM/keyword interactions with system prompt (the system prompt is global per template, not per-keyword)
- No multi-turn (assistant → user → assistant) — system + user only
- No per-template override of system prompt at publish time — just the template's systemPromptText
