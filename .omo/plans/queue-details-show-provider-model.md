# Show LLM Provider + Model in Queue Entry Details

## Goal
In the queue entry details modal, show which LLM model (and optionally which provider/gateway) was used to generate the post.

## Current state
- `PublisherQueueEntry` already stores `generatedTemperature` and `generatedReasoningEffort` (both exposed in `QueueEntryView`)
- The `PromptTemplate` used has the `model` field (e.g. `opencode-zen/deepseek-v4-flash`)
- The gateway URL is in `AppConfig.llm.gateway.baseUrl`
- BUT: the queue entry does NOT persist the exact model used at generation time (only temperature and reasoningEffort)

## Options

### Option A — Persist model in PublisherQueueEntry (recommended)
Add a `generatedModel` field to:
1. `PublisherQueueEntryProps` (domain entity)
2. `PublisherQueueEntry.create()` default `null`
3. `PublisherQueueEntry.markPublished()` accept `generated.model`
4. `PublisherQueueEntity` (TypeORM) — add column `generated_model`
5. `queue.controller.ts` `QueueEntryView` — add readonly `generatedModel: string | null`
6. Frontend `QueueEntryView` interface — add `generatedModel: string | null`
7. Frontend `DetailsModal` — show it alongside temperature + reasoningEffort
8. `process-next-queued-article.use-case.ts` — pass the model in `markPublished()`

### Option B — Frontend-only: resolve from template
Use the entry's `keywordTemplateId` → fetch `PromptTemplate` → show `model`. But a `null` templateId falls back to the global default (`LlmConfig.defaultTemplateId`), and we don't have an API to resolve that at the component level.

**Decision**: Option A — persist at generation time. The model is part of the generation metadata; the queue entry already persists generation-related fields.

### How to get the model at generation time
In `process-next-queued-article.use-case.ts`, the LLM adapter already receives a template. The template's `.model` is the model string. Pass it through `markPublished()`.

## Todos

### 1. Backend — domain entity + props
**File**: `publisher-queue-entry.entity.ts`
- Add `generatedModel: string | null` to `PublisherQueueEntryProps` interface (the private state interface at line 18)
- Add `generatedModel: null` in `create()` default state
- Add `model: string | null` to the `generated` param in `markPublished()`:
  - Update the `generated?` param interface to include `model?: string | null`
  - `this.state.generatedModel = generated?.model ?? null;`
- Add `get generatedModel(): string | null` accessor

### 2. Backend — TypeORM entity
- File: `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/publisher-queue.entity.ts`
- Add column: `@Column({ name: 'generated_model', type: 'varchar', length: 255, nullable: true }) public generatedModel!: string | null;`

### 3. Backend — mapper
- File: `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/publisher-queue.mapper.ts`
- Map `generatedModel` entity <-> domain

### 4. Backend — queue controller view
- Add `readonly generatedModel: string | null` to `QueueEntryView` interface
- Add `generatedModel: entry.generatedModel` in `toView()`

### 5. Backend — process-next-queued-article use case
- In `markPublished()`, pass `model: config.model` alongside `temperature/reasoningEffort`

### 6. Frontend — queue-api.ts
- Add `readonly generatedModel: string | null` to `QueueEntryView` interface

### 7. Frontend — queue-view.tsx
- In `DetailsModal`, add a row showing "Model" next to temperature

## Verification
- `cd apps/backend && npx tsc --noEmit --incremental false` — 0 errors
- `cd apps/frontend && npx tsc --noEmit --incremental false` — 0 errors