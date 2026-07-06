# crypto-news-publisher - Work Plan

## TL;DR (For humans)

**What you'll get:** Un nuevo BC `crypto-news-publisher` que escucha mensajes nuevos de crypto-news, filtra por keywords (configurables desde el frontend), genera un post con un LLM multimodal (texto + imagen como contexto), y lo publica en un canal/grupo de Telegram — el texto generado + la imagen original (subida localmente vía multipart). Rate limiting de 36/día + delays aleatorios de 3-15 min + foto intacta.

**Why this approach:** Sigue el mismo patrón que `vip-calls` (modular hexagonal) y crea su **propio adapter de Telegram** (no comparte token/canal con vip-calls). La cola es DB-backed para sobrevivir reinicios. El LLM se llama **solo en el momento del publish** (no en el ingress) para evitar costos innecesarios cuando se reemplazan mensajes viejos de la cola con nuevos. **El LLM recibe texto + URL de imagen** del mensaje original como contexto multimodal. La imagen al canal se envía usando el path local ya descargado (no la URL efímera de Telegram que expira en ~1h). La cola hace INSERT + overflow DELETE en transacción atómica para evitar race conditions durante bursts. **Fix-1 ToS compliance:** el handler NO usa `event.content` (no existe en el evento); hace fetch separado desde el repo.

**Effort:** Large (~12-15 archivos, 4 waves)
**Risk:** Medium — introduces LLM dependency + DB schema + scheduled jobs + Telegram image upload. All additive, all decryptable.

## Scope

### Must have

- New BC at `apps/backend/src/telegram/crypto-news-publisher/`
- Generic `shared/llm/LlmPort` + OpenAI adapter
- DB: `keywords`, `publisher_queue` tables
- Endpoints: CRUD for keywords; GET queue status
- Cron-based publisher (every 60s), respects daily cap + random delay
- Replaces oldest pending queue entry when cap is reached and new match arrives
- Frontend: keyword management UI + queue visualization in `/crypto-news`
- Reuses `TelegramPublisherPort` (shared)
- LLM call deferred until publish time (cost optimization)

### Must NOT have

- NO multiple publishers (single channel target)
- NO inline LLM generation in event handler
- NO hardcoded keywords (DB-driven)
- NO exposing API keys to frontend
- NO modifying vip-calls or crypto-news (ingestion) BCs' core logic
- NO breaking existing `TelegramPublisherPort` contract

## Verification strategy

- Tests per wave (unit + integration)
- Evidence per todo
- Local end-to-end: message arrive → keyword match → queue entry → cron tick → publish → confirm
- Use a mock LLM adapter by default; switch to OpenAI only when OPENAI_API_KEY env is set

## Execution strategy

Wave 1 (foundation): shared LLM port + generic adapter; TelegramPublisherPort already exists.
Wave 2 (BC scaffolding): domain entities + repos + controller skeleton
Wave 3 (event-driven ingestion): listener for crypto-news-message-ingested → keyword match → enqueue
Wave 4 (publisher): cron job, rate limit, random delay, LLM call, publish
Wave 5 (frontend): keyword CRUD + queue visualization

### Dependency matrix

| Todo                                       | Depends on       | Blocks     |
| ------------------------------------------ | ---------------- | ---------- |
| T1. shared/llm port + adapter              | —                | T6         |
| T2. keywords + queue DB entities + repos   | T1 (via TypeORM) | T3, T4, T5 |
| T3. API: keywords CRUD + queue GET         | T2               | T5         |
| T4. event handler: keyword match → enqueue | T1, T2           | T5         |
| T5. cron publisher + throttle              | T2, T1           | T5         |
| T6. frontend: keyword mgmt + queue view    | T2, T3           | —          |

## Todos

- [ ] 1. Create shared LLM abstraction + OpenAI adapter
     What to do:
  - **New:** `apps/backend/src/shared/llm/llm.port.ts`:
    ```ts
    export interface LlmGenerateRequest {
      prompt: string;
      /** Optional image URL to include as context. Adapters that
       *  support multimodal LLMs (GPT-4o, Claude) include the image
       *  in the prompt; text-only adapters log a warning and ignore. */
      imageUrl?: string;
      maxTokens?: number;
      temperature?: number;
    }
    export abstract class LlmPort {
      public abstract generateText(
        request: LlmGenerateRequest,
      ): Promise<string>;
      public abstract isAvailable(): Promise<boolean>;
    }
    ```
  - **New:** `apps/backend/src/shared/llm/adapters/openai.adapter.ts`
    - Uses OpenAI SDK
    - Reads `OPENAI_API_KEY` env
    - `generateText` calls `/v1/chat/completions` with the prompt
  - **New:** `apps/backend/src/shared/llm/llm.module.ts`: DI module exporting `LlmPort` provider that injects `OpenAiAdapter` (or `MockLlmAdapter` in tests)
  - **New:** `apps/backend/src/shared/llm/mock.llm.adapter.ts` for tests
  - **New:** `apps/backend/src/shared/llm/index.ts` barrel export
  - **Wiring:** add to `app.module.ts` imports
    References:
  - `apps/backend/src/shared/` pattern of `data-provider/`, `common/`
  - NO new dependencies in `package.json` outside `openai`

- [ ] 2. Create `crypto-news-publisher` domain + repos + migrations
     What to do:
  - **New entity:** `Keyword` (AggregateRoot)
    - props: `{ id, phrase, caseSensitive, enabled, createdAt }`
    - method: `matches(content: string): boolean`
  - **New entity:** `PublisherQueueEntry` (AggregateRoot)
    - props: `{ id, channelId, messageId, rawContent, rawTitle, imagePath, groupedId, messageReceivedAt, status, publishedAt, lastError, attempts }`
    - status: `'PENDING' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED'`
    - methods: `markScheduled(at: Date)`, `markPublished(messageId: string)`, `markFailed(reason)`, `incrementAttempts()`
  - **`imagePath` is the local filesystem path** (e.g. `/uploads/crypto-news/media/<channelId>/<messageId>_0.jpg`) of the already-downloaded photo, NOT the Telegram CDN URL. Telegram CDN URLs expire after ~1h and would fail at publish time (which may be up to 9 min after ingest + delay). The local path is durable.
  - **`attempts: number`** for LLM retry budgeting. Max `llmMaxAttempts` from config.
  - **New ports:**
    - `KeywordRepository`: `findAll()`, `findEnabled()`, `save(kw)`, `delete(id)`
    - `PublisherQueueRepository`: `findNextPending()`, `enqueue(entry)` (does INSERT + OVERFLOW DELETE in one txn), `markPublished`, `markFailed`, `markFailedRetry` (increment attempts), `findAllForDisplay(limit)`, `countPublishedToday(resetHourUtc)`, `findByIdForThrottleState()`
  - **New crypto-news-publisher-mode repository** (shared with `crypto-news` BC): `CryptoNewsMessageRepository.findByChannelAndMessageId(channelId, messageId)` — used by event handler to fetch the full message (fix-1 invariant).
    - The existing `crypto-news/infrastructure/persistence/typeorm/repositories/typeorm-crypto-news-message.repository.ts` needs a new public method `findByChannelAndMessageId`. This is a non-breaking additive change to the existing BC.
  - **New throttle state** persisted in a new `publisher_throttle_state` table (single-row config):
    - `lastPublishAt: Date | null`
    - **Important**: this MUST be persisted, not in-memory. Backend restart would otherwise reset the throttle and cause multiple rapid publishes.
  - **New table** `publisher_queue_pending`:
    - index `idx_message_received_at_desc` for the overflow DELETE
    - all entries (PENDING + PUBLISHED — see below)
    - the overflow DELETE keeps newest 36 entries regardless of status (since PUBLISHED entries are also retained in queue for visibility)
  - **New tables** `crypto_news_publisher_keywords` and `publisher_throttle_state`
  - **New TypeORM entities** matching the domain:
    - `KeywordEntity`
    - `PublisherQueueEntity`
    - `PublisherThrottleStateEntity` (single-row)
  - **New module file** `crypto-news-publisher.module.ts` with providers
  - **New DB migration** via TypeORM `synchronize: true` (no manual SQL). **NOTE**: this deviates from vip-calls prod path. Acceptable for v1 since crypto-news-publisher hasn't reached prod yet.
    References:
  - Follow same pattern as `crypto-news/infrastructure/persistence/typeorm/` in existing BC

- [ ] 3. Create API controllers for keywords + queue
     What to do:
  - **New:** `api/http/keywords.controller.ts`:
    - `GET /crypto-news-publisher/keywords`
    - `POST /crypto-news-publisher/keywords` body: `{ phrase: string, caseSensitive?: boolean }`
    - `DELETE /crypto-news-publisher/keywords/:id`
    - `PATCH /crypto-news-publisher/keywords/:id` body: `{ enabled?: boolean, phrase?: string }`
  - **New:** `api/http/queue.controller.ts`:
    - `GET /crypto-news-publisher/queue?limit=50`
    - `GET /crypto-news-publisher/queue/counts` (returns `{ pending, publishedToday, remaining }
  - **DTOs** as needed
  - Tests:
    - `keywords.controller.spec.ts`
    - `queue.controller.spec.ts`

- [ ] 4. Event handler: match incoming crypto-news messages against keywords + enqueue (fix-1 compliant)
     What to do:
  - **NEW port method on crypto-news BC:** `CryptoNewsMessageRepository.findByChannelAndMessageId(channelId, messageId)` — fetches the full message including `content`, `media[].filePath`, `linkPreviewUrl`, `groupedId`. Needed because `CryptoNewsMessageIngestedEvent` deliberately does NOT carry content (fix-1 Bot Dev ToS §4.3 invariant — see `crypto-news-message-ingested.event.ts` for the explicit comment).
  - **New:** `crypto-news-publisher/infrastructure/event-bus/crypto-news-message-ingested.handler.ts`:
    - Listens to `CryptoNewsMessageIngestedEvent`. Only `channelId`, `messageId`, `title`, `occurredAt` are on the event — that's enough to look up.
    - Loads enabled keywords from `KeywordRepository` (cache for 10s to avoid hitting the DB on every message)
    - For each enabled keyword, test against the message's `content` (fetched via the lookup, NOT from the event)
    - If any keyword matches, call `EnqueueMatchingMessageUseCase` with the full fetched `CryptoNewsMessage`
  - **New use case:** `EnqueueMatchingMessageUseCase`:
    1. Open transaction via `DataSource.transaction()`
    2. INSERT new entry with `messageReceivedAt = NOW` from the source message's `ingestedAt`
    3. Delete oldest entries to keep queue at 36: `DELETE FROM publisher_queue WHERE id NOT IN (SELECT id FROM publisher_queue ORDER BY message_received_at DESC LIMIT 36)`
    4. Commit (atomic — no TOCTOU)
  - **Wiring:** subscribe to `CryptoNewsMessageIngestedEvent` in `crypto-news-publisher.module.ts`
  - Tests:
    - Insert when under cap → queue has new entry
    - Insert when at cap → oldest entries dropped, new entry in queue
    - Burst (multiple inserts in quick succession) → queue always ≤ 36
    - Items ordered by `messageReceivedAt DESC` (newest first)
    - **Fix-1 invariant verification**: assert that handler does NOT log raw `content` (test that `Logger.warn` is not called with the content as the payload)
    - Empty keyword phrase → silently skip (validation guard at the use case boundary)

- [ ] 5. Cron publisher with throttling + LLM generation
     What to do:
  - **New:** `application/scheduling/publisher-cron.scheduler.ts`:
    - Registers a `CronJob` to run every 60 seconds (configurable)
    - Calls `ProcessNextQueuedArticleUseCase.execute()` with Postgres advisory lock
    - The cron first acquires `pg_try_advisory_lock(<LOCK_ID>)` — if false, skip this tick. Ensures no concurrent run even if multiple replicas exist.
  - **New use case:** `ProcessNextQueuedArticleUseCase`:
    1. Get throttle state (count published today)
    2. If at cap (>= 36), no-op
    3. Otherwise: get next PENDING queue entry
    4. Check last publish time + random delay (3-15 min) — if not enough time passed, no-op
    5. Build LLM prompt from queue entry's content (text) + image URL (multimodal context)
    6. Generate refined text via LLM
    7. Publish via TelegramPublisherPort: `sendPhoto(chatId, generatedText, queueEntry.imagePath)` — text from LLM, image **from local file path** uploaded via multipart to Bot API
    8. Mark entry PUBLISHED with timestamp + telegramMessageId
    9. If failure: if `attempts < llmMaxAttempts`, increment attempts, leave as PENDING; otherwise mark FAILED with error, log
  - **New publisher adapter** (DO NOT reuse `VipCallsBotApiPublisherAdapter` — that's bound to VIP channel/token):
    - `crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter.ts` extends `TelegramPublisherPort`
    - Constructor takes `app.publishing.cryptoNews.botToken` + `.outputChannel` via `ConfigModule`
    - **Send-photo path**: when `imagePath` points to a local file, **upload via `multipart/form-data`** to the channel. Telegram Bot API supports `sendPhoto` with multipart/form-data.
  - **Port extension** to `apps/backend/src/telegram/shared/domain/ports/telegram-publisher.port.ts`:
    - Add new abstract method `sendPhoto(chatId, text, imagePath: string): Promise<SendResult>`
    - This is what the crypto-news adapter uses (local file upload).
    - Existing `sendMessage` stays unchanged (vip-calls still uses it for URL-based images).
    - Both methods exist on the port; adapters choose which to implement based on need. The crypto-news publisher passes `sendPhoto` since the image is local. The vip-calls adapter can either implement `sendPhoto` (likely no-op throwing for now) or just inherit the abstract — but since the port is abstract, every adapter MUST implement both. **vip-calls adapter will need a `sendPhoto` implementation (stub OK for now, throws "not implemented").**
  - **New env-var slots** in `apps/backend/src/shared/common/config/app.config.ts`:
    ```ts
    publishing: {
      cryptoNews: {
        botToken: process.env.CRYPTO_NEWS_BOT_TOKEN ?? '',
        outputChannel: process.env.CRYPTO_NEWS_OUTPUT_CHANNEL ?? '',
      },
      vipCalls: { ... }, // existing — do NOT modify
      chainDexterBot: { ... }, // existing — do NOT modify
    }
    ```
  - **Throttle state** (NOT in-memory): `publisher_throttle_state` row with `lastPublishAt: Date | null`. Fetch + update inside `ProcessNextQueuedArticleUseCase`. **Critical for restart safety** — restart must not reset the throttle.
  - **New service** `ThrottleSchedulerService` (in application/services):
    - method `shouldPublish(lastPublishAt: Date | null): { canPublish: boolean, nextDelayMs: number }`
    - computes random delay `Math.floor(3 + Math.random() * 12) * 60_000` since `lastPublishAt`
    - returns whether enough time has passed to publish now
  - **Scheduler lock**: cron must NOT run concurrently. Two options:
    - **Option A (recommended)**: use Postgres advisory lock (`pg_try_advisory_lock(<random_id>)`) at the start of each cron tick. If lock not acquired, skip this tick.
    - **Option B**: single-instance deployment assumption (document if chosen).

  ## Daily cap & queue overflow: "always keep the N most recent"

  The cap is 36 PUBLISHED articles per day (resets at 04:00 UTC = 00:00 AST). **The queue always holds the 36 most-recent items** (by `messageReceivedAt`), regardless of publish status.

  ### Enqueue algorithm (decided by the user, refined here)

  When a new match arrives:

  1. Run INSERT into queue with `messageReceivedAt = NOW`.
  2. Within the same transaction, run `DELETE FROM queue WHERE id NOT IN (SELECT id FROM queue ORDER BY messageReceivedAt DESC LIMIT 36)`.
  3. Done.

  Net effect: the queue is capped at 36 entries at the database level. The dropped entries are always the OLDEST (lowest `messageReceivedAt`). The newest always survives.

  ### Single-step correctness (no race condition)

  Both INSERT and the overflow DELETE happen in one transaction. The DELETE removes anything older than the 36th-newest. There is no in-between state where the queue momentarily exceeds 36 — atomic with the database snapshot.

  ### Examples

  | Scenario                                                                     | Result                                                                                                                                                                                                                                         |
  | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Queue has 5 entries (oldest 55min, newest 12min). New msg at T-1min arrives. | Insert → queue is 6. DELETE oldest (55min) → queue back to 5. New order by recency: `[12min, 1min]`.                                                                                                                                           |
  | Queue is at 36. Burst of 30 new msgs at T-0min.                              | Insert 30 → queue is 66. DELETE 30 oldest. Queue ends at 36 with the 30 newest + 6 of the oldest.                                                                                                                                              |
  | Queue is at 36. New msg at T-0min arrives.                                   | Insert → 37. DELETE 1 oldest → back to 36.                                                                                                                                                                                                     |
  | Queue has 0 pending but 36 PUBLISHED today (cap reached on publish side).    | New match still gets enqueued (subject to the 36-item queue cap). It will be published tomorrow (or whenever the next day's window opens), bounded by the per-day publish rate. **The queue cap is independent of the published-per-day cap.** |

  ### Two caps, two rules
  - **Published-per-day cap** = 36. Reset at 04:00 UTC. The cron publisher refuses to publish more than 36/day.
  - **Queue depth cap** = 36 entries (PENDING + SCHEDULED). Maintained by the enqueue transaction above.

  These are independent. The queue can fill up regardless of the published count, and vice-versa.

  - **New:** `infrastructure/llm/crypto-news-llm.adapter.ts` — wraps shared `LlmPort` with crypto-news-specific prompt
    - **Multimodal context**: passes BOTH `text` AND `imageUrl` (or downloaded image as base64) to the LLM. The LLM gets the visual context of the news image so the generated text can describe/relate to it.
    - For GPT-4o: pass image URL directly (OpenAI fetches it)
    - The shared `LlmPort` interface needs extension: add `imageUrl?: string` field to `LlmGenerateRequest`
  - **New:** `infrastructure/llm/prompt-template.ts` — default prompt loaded from config
  - **New:** `apps/backend/config/crypto-news-publisher.config.json` — defaults: enabled=false, targetChannelId='', prompts, etc.
    References:
  - Existing `TrackingCronScheduler` for cron pattern
  - Existing `TelegramPublisherPort.sendMessage(chatId, text, imageUrl?)` — use image URL from queue entry's media

- [ ] 6. Frontend: keyword management + queue visualization
     What to do:
  - **New:** `apps/frontend/src/features/crypto-news-publisher/` (FSD feature slice):
    - `api/keywords-api.ts`: list/create/delete/update methods via `httpGet/httpPost/httpDelete/httpPatch`
    - `api/queue-api.ts`: list + counts via `httpGet`
    - `ui/keywords-manager.tsx`: table to list keywords, form to add, button to delete
    - `ui/queue-view.tsx`: table to show pending/scheduled/published articles, with counts at top
    - `model/use-keywords.ts`, `model/use-queue.ts`: React Query hooks
  - **Modify** `apps/frontend/src/pages/crypto-news/index.tsx`:
    - Add two new sections under the existing filters: "Keywords" (manager) + "Queue" (status + list)
  - **Wiring:** add to frontend route or section
  - Modify tests if needed (don't break existing 8 tests)
