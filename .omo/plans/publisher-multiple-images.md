# publisher-multiple-images - Work Plan

## TL;DR (For humans)

**What you'll get:** The publisher will now send ALL images from the original message as a Telegram album (grouped media), not just the first one. The queue view in the frontend will show all images.

**Why this approach:** `EnqueueMatchingMessageUseCase.firstImagePath()` only saved the first media item. The publisher `dispatchToTelegram()` used `sendPhoto` which only sends one photo. We change both to handle arrays: store all image paths in `imagePaths: string[]`, use Telegram's `sendMediaGroup` API to send multiple photos as an album.

**What it will NOT do:** No video/document support (only photos). No changes to the ingestion/media downloader. No changes to the Telegram Bot API listener. Existing single-image entries continue to work via `sendPhoto`.

**Effort:** Medium
**Risk:** Low - all changes are additive (new `imagePaths` field, backward-compatible `imagePath` getter)
**Decisions to sanity-check:** The `sendMediaGroup` multipart format uses `attach://` references for file attachments.

Your next move: **Approve the plan and use `$start-work` to execute.** Full execution detail follows below.

---

> TL;DR (machine): Medium effort, Low risk. 5 waves, ~15 files. Add `imagePaths: string[]` to domain/DB/TypesORM, implement `sendMediaGroup` in Bot API adapter, update use cases to collect all images and send as album.

## Scope
### Must have
- `PublisherQueueEntry` domain: add `imagePaths: string[]` field, keep `imagePath` getter (returns `imagePaths[0] ?? null`), update `create()` to accept both
- `TelegramPublisherPort`: add `sendMediaGroup(chatId, text, imagePaths: string[]): Promise<SendResult>`
- `BotApiCryptoNewsPublisherAdapter`: implement `sendMediaGroup` using Telegram Bot API `sendMediaGroup` with multipart + `attach://` references. Caption goes on `media[0]` only (Telegram limitation).
- Controller `GET /:id/media`: add `@Query('index') index?: string` to serve `entry.imagePaths[Number(index)] ?? entry.imagePath` for multi-image support
- `EnqueueMatchingMessageUseCase`: change `firstImagePath()` to collect ALL media paths (`message.media.map(m => m.filePath).filter(Boolean)`)
- `ProcessNextQueuedArticleUseCase.dispatchToTelegram()`: if `entry.imagePaths.length > 1` use `sendMediaGroup`, else use `sendPhoto`
- TypeORM entity `PublisherQueueEntity`: add `imagePaths text[]` column
- Mapper: map `imagePaths` both ways
- Controller `QueueEntryView` + `toView`: add `imagePaths: string[]`
- Frontend `queue-api.ts`: add `imagePaths: string[]`
- Frontend `queue-view.tsx`: display all images in the row (grid), show them in Details modal

### Must NOT have (guardrails, anti-slop, scope boundaries)
- NO changes to VIP calls publisher or its `TelegramPublisherPort` abstract class (keep `sendMediaGroup` as crypto-news-only extension)
- NO changes to ingestion/media downloader (CryptoNewsMediaDownloader, extractMediaForMessage, etc.)
- NO video/document support — only `type: 'photo'` media items
- NO changes to the `imagePath` column in DB — keep it, add new `imagePaths` column alongside
- NO changes to existing specs that reference `imagePath` — only add new test cases

## Verification strategy
- Test decision: tests-after (no TDD) + Jest
- Backend: `npx tsc --noEmit` on both apps
- Evidence: .omo/evidence/publisher-multiple-images/

## Execution strategy
### Parallel execution waves
| Wave | Todos | Description |
|------|-------|-------------|
| W1   | 1     | Domain + Port: add `imagePaths` to PublisherQueueEntryProps + TelegramPublisherPort.sendMediaGroup |
| W2   | 2     | Adapter: implement BotApiCryptoNewsPublisherAdapter.sendMediaGroup + buildMediaGroupMultipartBody |
| W3   | 3-4   | Use cases: EnqueueMatchingMessageUseCase collect all paths + ProcessNextQueuedArticleUseCase dispatch |
| W4   | 5     | Persistence + API: TypeORM entity, mapper, controller DTOs |
| W5   | 6-7   | Frontend: queue-api types + queue-view display all images |

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 (domain+port) | — | 2, 3, 4, 5 | — |
| 2 (adapter) | 1 | — | 3 |
| 3 (enqueue) | 1 | — | 2 |
| 4 (process) | 1, 2 | — | 3 |
| 5 (persistence) | 1 | — | 2, 3, 4 |
| 6 (frontend types) | 5 | 7 | — |
| 7 (frontend UI) | 6 | — | — |

## Todos

### Wave 1 — Domain + Port

- [ ] 1. Add `imagePaths: string[]` to domain entity + `sendMediaGroup` to publisher port
  **What to do:**
  - `PublisherQueueEntryProps`: add `readonly imagePaths: string[]` after `imagePath`
  - `PublisherQueueEntry.create()`: accept optional `imagePaths?: string[]`, default `[]`. Derive `imagePath` from `imagePath ?? imagePaths[0] ?? null` (preserve explicit `imagePath` for backward compat)
  - `PublisherQueueEntry.imagePath` getter: `return this.state.imagePath` (unchanged — stores first path or null)
  - `PublisherQueueEntry.imagePaths` getter: add `return this.state.imagePaths ?? []` (**MUST** handle undefined for old DB entries)
  - `PublisherQueueEntry.reconstitute()`: no change needed — it passes `props` directly to the constructor, and `props.imagePath` is already set from old DB entries. The `imagePaths` field in props defaults to `[]` via the interface.
  - `TelegramPublisherPort`: add `sendMediaGroup(chatId: string, text: string, imagePaths: string[]): Promise<SendResult>`
  **Must NOT do:** Don't change the existing `sendPhoto` signature. Don't remove `imagePath` from props (backward compat).
  **References:**
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity.ts:18-42` (props interface)
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity.ts:85-147` (create method)
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity.ts:179-181` (imagePath getter)
  - `apps/backend/src/telegram/shared/domain/ports/telegram-publisher.port.ts:25-43` (port abstract class)
  **Acceptance:** `npx tsc --noEmit` on backend
  **QA:** Jest unit test for `create()` with both `imagePath` and `imagePaths` params
  **Parallelization:** Wave 1 | Blocks: todos 2-5
  **Commit:** Y | `feat(crypto-news-publisher): add imagePaths to domain + sendMediaGroup to port`

### Wave 2 — Adapter

- [ ] 2. Implement `sendMediaGroup` in BotApiCryptoNewsPublisherAdapter
  **What to do:**
  - Add `sendMediaGroup(chatId: string, text: string, imagePaths: string[]): Promise<SendResult>`
  - If `imagePaths.length === 0`, return `{ ok: false, ... error: 'no images' }`
  - If `text` exceeds 1024 chars, truncate with ellipsis (same as `sendPhoto`)
  - Build multipart body with:
    - `chat_id` field
    - `media` field: JSON array like `[{"type":"photo","media":"attach://photo0","caption":"..."},{"type":"photo","media":"attach://photo1"}]`
    - One file part per image: `photo0`, `photo1`, etc. with the image bytes
  - POST to `sendMediaGroup` endpoint
  - Parse response — `sendMediaGroup` returns an array of `message_id`s; return the first one
  - Export `buildMediaGroupMultipartBody()` pure function for testing
  **Must NOT do:** Don't modify existing `sendPhoto` or `buildMultipartBody`. Don't add external dependencies (use `node:https`).
  **References:**
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter.ts:119-175` (sendPhoto implementation as pattern)
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter.ts:239-307` (postMultipart helper)
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter.ts:315-349` (buildMultipartBody helper)
  **Acceptance:** `npx tsc --noEmit` on backend
  **QA:** Unit test for `sendMediaGroup` with 2 images
  **Parallelization:** Wave 2 | Blocked by: 1 | Blocks: 4
  **Commit:** Y | `feat(crypto-news-publisher): implement sendMediaGroup in BotApiCryptoNewsPublisherAdapter`

### Wave 3 — Use Cases

- [ ] 3. Update `EnqueueMatchingMessageUseCase` to collect all image paths
  **What to do:**
  - Change `firstImagePath()` method to collect ALL paths:
    ```ts
    private collectImagePaths(message: CryptoNewsMessage): string[] {
      return message.media.map((m) => m.filePath).filter((p): p is string => p !== null && p !== undefined);
    }
    ```
  - Update `execute()` to pass `imagePaths` to `PublisherQueueEntry.create()`
  **Must NOT do:** Don't import anything new — `CryptoNewsMedia` already has `filePath`.
  **References:**
  - `apps/backend/src/telegram/crypto-news-publisher/application/handlers/enqueue-matching-message.use-case.ts:109-112` (firstImagePath)
  - `apps/backend/src/telegram/crypto-news-publisher/application/handlers/enqueue-matching-message.use-case.ts:69-80` (create call)
  **Acceptance:** `npx tsc --noEmit` on backend
  **QA:** Unit test for `collectImagePaths` with 0, 1, 2 media items
  **Parallelization:** Wave 3 | Blocked by: 1
  **Commit:** Y | `feat(crypto-news-publisher): collect all image paths in enqueue use case`

- [ ] 4. Update `ProcessNextQueuedArticleUseCase.dispatchToTelegram` to use sendMediaGroup
  **What to do:**
  - In `dispatchToTelegram()`, check `entry.imagePaths.length`:
    - If `> 1`: `return this.publisher.sendMediaGroup(cfg.targetChannel, refinedText, entry.imagePaths)`
    - If `=== 1`: `return this.publisher.sendPhoto(cfg.targetChannel, refinedText, entry.imagePaths[0])`
    - If `=== 0`: `return this.publisher.sendMessage(cfg.targetChannel, refinedText)`
  - Inject `TelegramPublisherPort` into the use case (already injected as `this.publisher` — check that `sendMediaGroup` is available)
  **Must NOT do:** Don't change the `sendMessage` fallback for entries without images.
  **References:**
  - `apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts:132-145` (dispatchToTelegram)
  **Acceptance:** `npx tsc --noEmit` on backend
  **QA:** Jest test for dispatch path selection with 0, 1, 2 images
  **Parallelization:** Wave 3 | Blocked by: 1, 2
  **Commit:** Y | `feat(crypto-news-publisher): use sendMediaGroup when entry has multiple images`

### Wave 4 — Persistence + API

- [ ] 5. Update TypeORM entity, mapper, controller for imagePaths
  **What to do:**
  - `PublisherQueueEntity`: add `@Column({ name: 'image_paths', type: 'text', array: true, nullable: true, default: '{}' }) public imagePaths!: string[]`
  - `PublisherQueueEntity.toProps()`: add `imagePaths: this.imagePaths ?? []` (**MUST** handle NULL from old rows)
  - `PublisherQueueMapper.toEntity()`: add `row.imagePaths = entry.imagePaths` (map domain array to ORM column)
  - `PublisherQueueMapper.toDomain()`: no change needed — `toProps()` handles the new field
  - Controller `QueueEntryView`: add `readonly imagePaths: string[]`
  - Controller `toView()`: add `imagePaths: entry.imagePaths`
  - Controller `GET /:id/media`: add `@Query('index') index?: string` param. When provided, serve `entry.imagePaths[Number(index)]` instead of `entry.imagePath`
  **Must NOT do:** Don't remove the existing `imagePath`/`image_path` column — keep for backward compat.
  **References:**
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/publisher-queue.entity.ts:32-99`
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/publisher-queue.mapper.ts:9-30`
  - `apps/backend/src/telegram/crypto-news-publisher/api/http/queue.controller.ts:18-37` (QueueEntryView)
  - `apps/backend/src/telegram/crypto-news-publisher/api/http/queue.controller.ts:150-171` (toView)
  **Acceptance:** `npx tsc --noEmit` on backend
  **QA:** Verify API returns `imagePaths` field via curl
  **Parallelization:** Wave 4 | Blocked by: 1
  **Commit:** Y | `feat(crypto-news-publisher): add imagePaths to persistence and API`

### Wave 5 — Frontend

- [ ] 6. Update frontend QueueEntryView type
  **What to do:**
  - `queue-api.ts`: add `readonly imagePaths: string[]` to `QueueEntryView`
  - Update test data in `crypto-news-page.test.tsx` to include `imagePaths: []`
  **References:**
  - `apps/frontend/src/features/crypto-news-publisher/api/queue-api.ts:14`
  - `apps/frontend/src/pages/crypto-news/__tests__/crypto-news-page.test.tsx:554-583`
  **Acceptance:** `npx tsc --noEmit` on frontend
  **Parallelization:** Wave 5 | Blocked by: 5 | Can parallelize with: 7
  **Commit:** Y | `feat(crypto-news-publisher): add imagePaths to frontend API types`

- [ ] 7. Update frontend queue-view to display all images
  **What to do:**
  - In `QueueRow`, replace the single `<img>` with a grid of images:
    ```tsx
    {entry.imagePaths.length > 0 && (
      <div className={`mt-2 grid gap-1 ${entry.imagePaths.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {entry.imagePaths.map((_, idx) => (
          <img key={idx} src={`/crypto-news-publisher/queue/${entry.id}/media?index=${idx}`} alt={`Media ${idx + 1}`} className="mt-2 h-auto w-full max-h-48 rounded object-contain bg-slate-900" loading="lazy" />
        ))}
      </div>
    )}
    ```
  - Backward compat: use `entry.imagePaths` instead of `entry.imagePath`. The backend's `toView()` ensures `imagePaths` is always present (even if empty).
  **Must NOT do:** Don't remove the existing `imagePath`-based image display; just enhance it to show all.
  **References:**
  - `apps/frontend/src/features/crypto-news-publisher/ui/queue-view.tsx:82-89` (image display)
  **Acceptance:** `npx tsc --noEmit` on frontend
  **QA:** Visual check via Playwright
  **Parallelization:** Wave 5 | Blocked by: 6
  **Commit:** Y | `feat(crypto-news-publisher): display all images in queue view`

## Final verification wave

- [ ] F1. Plan compliance audit — verify all todos completed, no scope creep
- [ ] F2. Code quality — `npx tsc --noEmit` on backend + frontend, no lint errors
- [ ] F3. Real manual QA — start backend, forward a message with 2+ images, verify queue shows all images, verify Telegram post has album
- [ ] F4. Scope fidelity — confirm no changes to vip-calls publisher, no video support, imagePaths column added alongside imagePath

## Commit strategy
- 7 commits, one per todo
- Conventional commit format: `feat(crypto-news-publisher): <description>`
- Each commit with test changes (tests co-located or in __tests__/)
- No squashing — keep atomic history

## Success criteria
1. `PublisherQueueEntry` has `imagePaths: string[]` getter
2. `PublisherQueueEntity` has `image_paths text[]` column
3. Telegram Bot API publisher can send multiple photos via `sendMediaGroup`
4. `EnqueueMatchingMessageUseCase` stores all image paths from the message
5. `dispatchToTelegram` uses `sendMediaGroup` for multiple images, `sendPhoto` for single, `sendMessage` for none
6. Frontend queue view displays all images in a grid
7. All types pass `tsc --noEmit` on both apps
