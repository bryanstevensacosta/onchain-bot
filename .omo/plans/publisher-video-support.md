# publisher-video-support - Work Plan

## TL;DR (For humans)

**What you'll get:** Telegram messages with videos will now be ingested (video file downloaded to disk, stored in DB with type `'video'`), displayed in the frontend Recent Messages, and when enqueued by a keyword, the publisher will send them as a video via Telegram Bot API `sendVideo` (or `sendMediaGroup` with mixed photo+video). Existing photo-only messages continue to work unchanged.

**Why this approach:** The ingestion pipeline (`extractMediaForMessage`) only handled `MessageMediaPhoto`. Videos arrive as `MessageMediaVideo` or `MessageMediaDocument` with video MIME. We add `extractRawVideoAttachment()`, download video bytes with the same gramjs + FloodWait pattern, extend `TelegramMediaAttachment` to support `type: 'video'`, add `'video'` to `CryptoNewsMediaType`, and implement `sendVideo` in the publisher adapter.

**What it will NOT do:** No support for stickers, GIFs (animated vs video), audio, documents, or polls. No inline video playback in the frontend (thumbnail only from `/crypto-news/media/:id` endpoint). No `sendMediaGroup` mixed-type album support (photos+video in same group) — only `sendVideo` for single-video entries.

**Effort:** Large
**Risk:** Medium — video files are larger (longer download, bigger buffer), need MIME detection, and `downloadMedia` may behave differently for `MessageMediaVideo` than for `MessageMediaPhoto`. The multipart body for `sendVideo` needs a `thumbnail` field while `sendPhoto` just needs the file directly.

**Decisions to sanity-check:** Video file size limit for download (default 50MB same as photos 10MB?), MIME detection for common video formats (mp4, mov, avi, mkv — Telegram's Bot API `sendVideo` accepts `video/mp4` primarily), and whether to serve the video as-is from the local endpoint or only show a screenshot/thumbnail.

Your next move: **Approve the plan**, or review the details. Full execution follows below.

---

> TL;DR (machine): Large effort, Medium risk. Add `type: 'video'` to `TelegramMediaAttachment`, `CryptoNewsMediaType`, `crypto-news-media.entity` DB. Add `extractRawVideoAttachment()` + download in `extractMediaForMessage`. Add `sendVideo` to port + `BotApiCryptoNewsPublisherAdapter`. Extend frontend media type union.

## Scope
### Must have
- `TelegramMediaAttachment.type` union: `'photo' | 'video'` (was `'photo'`)
- `CryptoNewsMediaType`: add `'video'` (was only `'photo'`)
- `CryptoNewsMessageMediaEntity`: `type` column already accepts `varchar` — no migration needed
- `TelegramMtprotoListenerAdapter`: add `extractRawVideoAttachment(media)` + `parseMsgMedia()` that dispatches to photo or video extraction
- `extractMediaForMessage`: handle both `photo` and `video` attachments; download with same `downloadMedia` → `saveToDisk` pattern
- `CryptoNewsMediaDownloader.saveToDisk`: increase size limit for videos (10MB → 50MB)
- Frontend: `CryptoNewsMediaView.type` union reflects `'photo' | 'video'`
- Frontend: show video thumbnail in Recent messages (use existing media endpoint)
- `TelegramPublisherPort`: add `sendVideo(chatId, text, imagePath): Promise<SendResult>`
- `BotApiCryptoNewsPublisherAdapter`: implement `sendVideo` using Telegram Bot API `sendVideo` with multipart, `supports_streaming: true`, optional `thumbnail`
- `ProcessNextQueuedArticleUseCase.dispatchToTelegram`: when entry has `type: 'video'` media → use `sendVideo` instead of `sendPhoto`/`sendMediaGroup`
- DB column `image_paths` already stores all media (photo and video)

### Must NOT have (guardrails, anti-slop, scope boundaries)
- NO changes to VIP calls publisher or its adapter
- NO GIF/animation/document/audio support
- NO inline video player in frontend (still shows thumbnail, video served as file download)
- NO `sendMediaGroup` mixed-media album — photos and videos send separately
- NO thumbnail generation for video (use first frame from Telegram's video `thumb` size instead)

## Verification strategy
- Test decision: tests-after + Jest
- Evidence: `.omo/evidence/task-<N>-publisher-video-support.<ext>`

## Execution strategy
### Parallel waves

| Wave | Description |
|------|-----------|
| W1 | Listener: add `extractRawVideoAttachment()` + `parseMsgMediaType()` + video download in `extractMediaForMessage` |
| W2 | Domain/VO: add `'video'` to `CryptoNewsMediaType` + `TelegramMediaAttachment` + `CryptoNewsMedia.create()` accepts `'video'` |
| W3 | Publisher: add `sendVideo` to port + BotApiCryptoNewsPublisherAdapter |
| W4 | Use case: `dispatchToTelegram` selects `sendVideo` for video entries |
| W5 | Frontend: media type union + video display in Recent messages |
| FV | Final verification wave |

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 (domain VO) | — | 4 | 2 |
| 2 (listener) | 1 | — | 3 |
| 3 (publisher) | — | 4 | 1 |
| 4 (use case) | 3 | — | 5 |
| 5 (frontend) | 1 | — | 2, 3, 4 |

## Todos

### Wave 1 — Domain VO + Port types

- [ ] 1. Add `'video'` to `CryptoNewsMediaType` + `TelegramMediaAttachment.type` union
  **What to do:**
  - `crypto-news-media.vo.ts:19`: change `export type CryptoNewsMediaType = 'photo';` to `export type CryptoNewsMediaType = 'photo' | 'video';`
  - `CryptoNewsMedia.create()`: already validates `type` via `CryptoNewsMediaType` — no change needed (TS checks at compile time)
  - `telegram-listener.port.ts:45`: change `readonly type: 'photo';` to `readonly type: 'photo' | 'video';`
  - `CryptoNewsMediaProps.type`: change from `CryptoNewsMediaType` (already correct, no change needed)
  - `crypto-news-message-media.entity.ts`: `type` column is `varchar`, no change needed
  - `crypto-news-message-mapper.ts`: `mediaToEntity/ToDomain` already map `type` as-is, no change needed
  **Must NOT do:** Don't add any DB migrations — `type` column is `varchar` and already accepts any string.
  **References:**
  - `apps/backend/src/telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo.ts:19`
  - `apps/backend/src/telegram/ingestion/shared/domain/ports/telegram-listener.port.ts:45`
  **Acceptance:** `cd apps/backend && npx tsc --noEmit` passes clean
  **QA:** Unit test for `CryptoNewsMedia.create({ type: 'video', ... })` — should succeed
  **Parallelization:** Wave 1 | Blocks: 2 | Can parallelize with: 3
  **Commit:** Y | `feat(crypto-news): add 'video' to media type unions`

### Wave 2 — Listener: extract + download video

- [ ] 2. Add video extraction and download in TelegramMtprotoListenerAdapter
  **What to do:**
  In `telegram-mtproto-listener.adapter.ts`, after `extractRawPhotoAttachment()`:
  - Add `extractRawVideoAttachment(media): TelegramMediaAttachment | null`:
    - Check `media.video` (MessageMediaVideo) — extract `id`, `accessHash`, `fileReference`, `dcId`, `date`, `mimeType`
    - Check `media.document` (MessageMediaDocument) with `document.mimeType` starting with `'video/'` — extract same fields
    - Return `{ type: 'video', fileId, accessHash, fileReference, mimeType, dcId, date }`
  - Modify `extractMediaForMessage()`:
    1. Try `extractRawPhotoAttachment(msg.media)` first
    2. If null, try `extractRawVideoAttachment(msg.media)`
    3. If still null, log and return undefined
  - In the download section (current lines 460-467), add handling for video download:
    - For photo: construct `Api.MessageMediaPhoto` with `Api.Photo` + sizes
    - For video: construct `Api.MessageVideo` with `Api.Document` for video file
    - Use `client.downloadMedia(videoMedia, {})` via FloodWaitHandler
    - Save via `mediaDownloader.saveToDisk(peerId, msg.id, 0, attachment, buffer)`
  - Update `extractRawPhotoAttachment` to also check for `webpage.video` in `MessageMediaWebPage`
  - Add private helper `extractVideoWebpagePreview(media): TelegramMediaAttachment | null`
  **Must NOT do:** Don't modify the `extractRawPhotoAttachment` logic (keep it intact). Don't change the `saveToDisk` function signature.
  **References:**
  - `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:361-376` (extractRawPhotoAttachment)
  - `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:445-515` (extractMediaForMessage)
  - `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:420-437` (extractWebpagePreview)
  **Acceptance:** `cd apps/backend && npx tsc --noEmit` passes clean
  **QA:** Forward a video message to the test channel → verify queue entry has `imagePaths` populated with the video file path, verify curl to `/crypto-news/media/:id` returns video data, verify DB `crypto_news_message_media` row has `type='video'`
  **Parallelization:** Wave 2 | Blocked by: 1
  **Commit:** Y | `feat(crypto-news): extract and download video media from Telegram messages`

### Wave 3 — Publisher sendVideo

- [ ] 3. Add `sendVideo` to TelegramPublisherPort + BotApiCryptoNewsPublisherAdapter
  **What to do:**
  - `telegram-publisher.port.ts`: add `sendVideo(chatId: string, text: string, imagePath: string): Promise<SendResult>` after `sendPhoto`
  - `bot-api-crypto-news-publisher.adapter.ts`: implement `sendVideo`:
    - Same pattern as `sendPhoto` (config check, truncate caption at 1024 chars, read file bytes)
    - POST to `sendVideo` endpoint with multipart
    - Fields: `chat_id`, `video` (file), `caption`, `parse_mode: 'Markdown'`, `supports_streaming: true`
    - Optionally send `thumb` — an additional file part with a thumbnail image (h264 videos need it; Telegram also accepts `thumb` as a file attachment). We'll omit `thumb` for simplicity — Telegram generates its own from the video.
  - VIP calls adapter: add stub `sendVideo` (throws or returns `{ ok: false }`)
  **Must NOT do:** Don't modify existing `sendPhoto` or `sendMediaGroup`. Don't add `thumb` support (out of scope).
  **References:**
  - `apps/backend/src/telegram/shared/domain/ports/telegram-publisher.port.ts:25-43`
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter.ts:119-175` (sendPhoto as pattern)
  **Acceptance:** `cd apps/backend && npx tsc --noEmit` passes clean
  **QA:** Unit test mocking `sendVideo` response
  **Parallelization:** Wave 3 | Blocked by: (none — port is independent, adapter needs port interface)
  **Commit:** Y | `feat(crypto-news): implement sendVideo in publisher adapter`

### Wave 4: Use case dispatch

- [ ] 4. Update `dispatchToTelegram` to route video entries to `sendVideo`
  **What to do:**
  - In `ProcessNextQueuedArticleUseCase.dispatchToTelegram()`:
    - Check `entry.imagePaths.length`:
      - `=== 0` → `sendMessage`
      - `>= 1` → need to know the media type to decide
    - Currently `PublisherQueueEntry` stores `imagePaths: string[]` but NOT media types. The media types are only in the `CryptoNewsMessage` which was already consumed at enqueue.
    - **Approach**: add a new port method `findMediaTypeByFilePath(path: string): Promise<'photo' | 'video' | null>` OR check the file extension
    - **Simpler approach**: check file extension — `.mp4`, `.mov`, `.avi`, `.mkv` → `sendVideo`. Otherwise `sendPhoto/sendMediaGroup`
    - Or: the `PublisherQueueEntry` could store `mediaTypes: Array<'photo' | 'video'>` alongside `imagePaths`
    - **Decision for this plan**: use file extension check (simplest, no DB changes):
      ```ts
      private isVideoPath(path: string): boolean {
        const ext = path.toLowerCase().split('.').pop();
        return ext === 'mp4' || ext === 'mov' || ext === 'avi' || ext === 'mkv';
      }
      ```
    - Update `dispatchToTelegram`:
      ```ts
      const paths = entry.imagePaths;
      if (paths.length > 1) {
        // Check if any is video — if so, send individually (no mixed album)
        const videoIdx = paths.findIndex(p => this.isVideoPath(p));
        if (videoIdx >= 0) {
          return this.publisher.sendVideo(...);
        }
        return this.publisher.sendMediaGroup(...);
      }
      if (paths.length === 1) {
        if (this.isVideoPath(paths[0])) {
          return this.publisher.sendVideo(cfg.targetChannel, refinedText, paths[0]);
        }
        return this.publisher.sendPhoto(cfg.targetChannel, refinedText, paths[0]);
      }
      return this.publisher.sendMessage(cfg.targetChannel, refinedText);
      ```
  **Must NOT do:** Don't add DB changes or new ports. Don't modify `imagePaths` or `create()` logic.
  **References:**
  - `apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts:140-153`
  **Acceptance:** `cd apps/backend && npx tsc --noEmit` passes clean
  **QA:** Create test with mock publisher + video file path
  **Parallelization:** Wave 4 | Blocked by: 3
  **Commit:** Y | `feat(crypto-news): route video paths to sendVideo in dispatch`

### Wave 5: Frontend

- [ ] 5. Update frontend media type and Recent messages display
  **What to do:**
  - `frontend/src/pages/crypto-news/index.tsx`: check `media[index].type` in the lightbox or image display — for `type: 'video'`, render a video player instead of `<img>`. Actually simplest: use `<video>` tag with controls if MIME is video, otherwise `<img>`.
  - In the Recent messages article (where images are displayed), check each `msg.media[idx].startsWith('video/')` and use `<video>` with `controls` instead of `<img>`.
  - Or simpler: just show a "Video" badge on the media and keep `<img>` with `poster` attribute (first frame from Telegram's thumbnail).
  - For now, simplest: if `media[idx].mimeType?.startsWith('video/')`, render `<video>` with `controls className="h-auto w-full max-h-56 rounded object-contain bg-slate-900"` instead of `<img>`.
  **Must NOT do:** Don't add videoplayer libraries. Don't create new components.
  **References:**
  - `apps/frontend/src/pages/crypto-news/index.tsx:200-226` (image grid)
  **Acceptance:** `cd apps/frontend && npx tsc --noEmit` passes clean
  **Parallelization:** Wave 5 | Blocked by: 2 (need video media in DB to test)
  **Commit:** Y | `feat(crypto-news): display video media in frontend`

## Final verification wave

- [ ] F1. Plan compliance — verify all todos completed
- [ ] F2. Code quality — `npx tsc --noEmit` on backend + frontend
- [ ] F3. Manual QA — forward a video to Telegram test channel → verify it appears in Recent messages + queue entry → verify it publishes as video to output channel
- [ ] F4. Scope fidelity — no GIF/doc/audio support, VIP calls untouched

## Commit strategy
- 5 atomic commits, one per todo
- Conventional commit format: `feat(crypto-news): <description>`
- No squashing

## Success criteria
1. `CryptoNewsMediaType` accepts `'video'`
2. `TelegramMediaAttachment.type` accepts `'video'`
3. Videos from Telegram messages are extracted, downloaded to disk, stored in `crypto_news_message_media` with `type='video'`
4. Frontend Recent messages shows video media (as `<video>` element with controls)
5. Publisher `dispatchToTelegram` routes video paths to `sendVideo`
6. `sendVideo` sends the MP4 file to Telegram via Bot API
7. All types pass `tsc --noEmit` on both apps
