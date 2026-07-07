# crypto-news-system-prompt - Work Plan

## TL;DR (For humans)

**What you'll get:** Cada prompt template tiene ahora DOS campos editables: "System prompt" (la persona/rol/estilo) y "User prompt" (el contenido con placeholders). El LLM recibe ambos como mensajes separados (`[system, user]` en vez de solo `[user]`). Esto da resultados más consistentes y te permite separar las instrucciones de qué publicar del cómo reformatearlo.

**Effort:** Short (~8 files, 1 wave)
**Risk:** Low — additive, existing templates without a system prompt continue to work unchanged.

## Scope

### Must have

- `PromptTemplate.systemPromptText: string` (nullable, default "")
- `LlmPort.LlmGenerateRequest.systemPrompt?: string`
- Both adapters send `[system, user]` when systemPrompt present, else `[user]`
- `CryptoNewsLlmAdapter` reads `template.systemPromptText` and passes through
- `PromptTemplateEntity.system_prompt_text` column (nullable, text)
- `PromptTemplateMapper` mapping
- `PromptTemplateView.systemPromptText` in the view
- POST/PATCH body accepts `systemPromptText`
- `LlmConfigMigration` handles the new field
- Frontend: two textareas in the template form
- All affected specs

### Must NOT have

- No per-keyword system prompt override
- No multi-turn (assistant → user → assistant) — system + user only
- No per-publish system prompt override

## Todos

- [ ] 1. Add `systemPrompt` to `LlmPort` + both adapters
     What to do:
  - `apps/backend/src/shared/llm/llm.port.ts`: add `systemPrompt?: string` to `LlmGenerateRequest`
  - `apps/backend/src/shared/llm/adapters/llm-gateway.adapter.ts`: build the messages array:
    ```ts
    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt && request.systemPrompt.trim().length > 0) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.content });
    ```
    Note: the current code uses `{ role: 'user', content: prompt }` — the `prompt` field is the content. We need to add the system message conditionally.
  - `apps/backend/src/shared/llm/adapters/openai.adapter.ts`: same pattern
  - Update both adapter specs: add a test that verifies `[system, user]` messages when systemPrompt is set, and just `[user]` when not

- [ ] 2. Add `systemPromptText` to `PromptTemplate` entity + TypeORM + mapper
     What to do:
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/prompt-template.entity.ts`:
    - Add `systemPromptText: string` to `PromptTemplateProps`
    - In `create()`: accept `systemPromptText?: string`, default to empty string
    - In `reconstitute()`: accept the field
    - Add getter `get systemPromptText()`
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/prompt-template.entity.ts`:
    - Add `@Column({ name: 'system_prompt_text', type: 'text', nullable: true }) public systemPromptText!: string | null;`
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/prompt-template.mapper.ts`: include in both directions
  - Update entity spec

- [ ] 3. Plumb through controller + migration + adapter (CryptoNewsLlmAdapter)
     What to do:
  - `apps/backend/src/telegram/crypto-news-publisher/api/http/llm-config.controller.ts`:
    - Add `systemPromptText: string` to `PromptTemplateView`
    - Add to `CreatePromptTemplateBody` and `UpdatePromptTemplateBody` (with class-validator: `@IsString systemPromptText` — optional)
    - In `create()` and `update()` and `toView()`: include the field
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/migration/llm-config-migration.service.ts`:
    - In the migration template creation (both branches), include `systemPromptText: null` (the new column is nullable, defaulting to null)
    - For the JSON-import branch: the JSON doesn't have `systemPromptText` field — pass null
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter.ts`:
    - In `generateForEntry()`, read `template.systemPromptText` and pass it as `systemPrompt` in the `generateText` call
  - Update affected specs

- [ ] 4. Frontend types + UI
     What to do:
  - `apps/frontend/src/features/crypto-news-publisher/api/llm-config-api.ts`:
    - Add `systemPromptText: string` to `PromptTemplate` interface
    - Add to `CreatePromptTemplateBody` and `UpdatePromptTemplateBody`
  - `apps/frontend/src/features/crypto-news-publisher/ui/prompt-templates.tsx`:
    - In `TemplateFormModal`: add a second textarea above the user prompt textarea:
      ```tsx
      <label>System prompt (persona, role, style)</label>
      <textarea
        value={form.systemPromptText}
        onChange={(e) => setForm({ ...form, systemPromptText: e.target.value })}
        placeholder="e.g. 'Eres un periodista crypto profesional, escribes en español, sin markdown...'"
        rows={3}
      />
      <label>User prompt (content with placeholders)</label>
      <textarea
        value={form.promptText}
        onChange={...}
        rows={8}
      />
      ```
    - In the form state, include `systemPromptText: ''` as default
  - Update llm-config tests: 1-2 new tests verifying the form has two textareas and that create/update sends `systemPromptText`

## Verification

- tsc clean
- jest: 940+ tests (with new ones for systemPrompt)
- vitest: 29+ tests (with new ones for the two textareas)
- ESLint clean
- Manual: create a template with both prompts, verify the LLM call sends both messages

## Commits

1. `feat(crypto-news-publisher): add systemPrompt to PromptTemplate`
