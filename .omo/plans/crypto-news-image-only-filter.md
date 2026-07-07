# crypto-news-image-only-filter - Work Plan

## TL;DR (For humans)

**What you'll get:** En la UI de keywords, un checkbox **"Only with image"** por keyword. Cuando está activo, esa keyword solo enqueuea mensajes que tengan imagen. Sin imagen = skip (queda fuera de la cola, no PENDING). Configurable por keyword — ejemplo: "bitcoin en cointelegraph" puede tener el checkbox activo, mientras que "bitcoin" en otro source no.

**Why this approach:** La flag se evalúa al momento del enqueue (no al publish). Si el operador la activa, las queue entries que ya existían (de antes de marcar el checkbox) se publican normal — solo las nuevas arrivals con esa keyword se filtran. Si la desactiva, los mensajes futuros con esa keyword vuelven a enqueuearse. Skip = no PENDING, solo log.

**Effort:** Short (~6 files, 1 wave)
**Risk:** Low — additive. Default es `requireImage: false` (current behavior). Keywords existentes no afectadas.

## Scope

### Must have

- `Keyword.requireImage: boolean` field + getter + factory
- `KeywordEntity.require_image` column (boolean, default false)
- `KeywordMapper` for new field
- `KeywordsController` accepts `requireImage` in create/update body + view
- `EnqueueMatchingMessageUseCase`: after keyword match, if `matchedKeyword.requireImage && !message.imagePath` → log + skip
- Frontend: checkbox in keywords-manager create/edit form (in the same row as "Case sensitive")
- All affected specs

### Must NOT have

- No "skipped" status (entries that are skipped never enter the queue)
- No per-template image filter
- No global image filter
- No bulk toggle

## Todos

- [ ] 1. Add `requireImage` to Keyword + match filtering in use case + UI
     What to do:
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/keyword.entity.ts`:
    - Add `requireImage: boolean` to `KeywordProps`
    - In `create()`: accept `requireImage?: boolean`, default false
    - In `reconstitute()`: accept `requireImage: boolean`
    - Add getter `get requireImage(): boolean`
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/keyword.entity.ts`:
    - Add column `@Column({ name: 'require_image', type: 'boolean', default: false }) public requireImage!: boolean;`
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/keyword.mapper.ts`:
    - Map in both `toEntity()` and `toDomain()`
  - `apps/backend/src/telegram/crypto-news-publisher/api/http/keywords.controller.ts`:
    - Add `requireImage: boolean` to `KeywordView`
    - Add `requireImage?: boolean` to `CreateKeywordDto` and `UpdateKeywordDto`
    - In `create()`: pass `requireImage: dto.requireImage ?? false` to `Keyword.create()`
    - In `update()`: handle `requireImage` in nextState + reconstitute
    - In `toView()`: include `requireImage: keyword.requireImage`
  - `apps/backend/src/telegram/crypto-news-publisher/application/handlers/enqueue-matching-message.use-case.ts`:
    - After `if (!matchedKeyword) return;`, add:
      ```ts
      if (matchedKeyword.requireImage && !message.imagePath) {
        this.logger.debug(
          `keyword ${matchedKeyword.id} (${matchedKeyword.phrase}) requires image; message ${message.id} has no image — skipping`,
        );
        return;
      }
      ```
    - **Note**: I need to confirm `message` is accessible here. Looking at the plan for T4 (handle plumbing), `EnqueueMatchingMessageUseCase.execute({ message, matchedKeyword })` receives the full `CryptoNewsMessage`. The message has `imagePath` from the publisher-queue-entry perspective — but wait, `imagePath` is on the QUEUE ENTRY, not on the message. Let me re-check the message shape.

    Actually, looking at the codebase: the `CryptoNewsMessage` in `domain/entities/crypto-news-message.entity.ts` has `media: CryptoNewsMedia[]` (plural). The `imagePath` is on the queue entry, which is derived from the first media item. So at enqueue time, I need to compute `hasImage` from `message.media.length > 0`.

    Looking at the actual handler code: `EnqueueMatchingMessageUseCase.execute({ message })`. The `message` is `CryptoNewsMessage`. Its `media` array contains `CryptoNewsMedia` items. The queue entry's `imagePath` is built from the first media item at enqueue time (in the same use case).

    So the check is `message.media.length > 0`, not `!message.imagePath`. The imagePath field is only available on the queue entry AFTER the use case creates it — so the check has to be on `message.media`.

  - Frontend `apps/frontend/src/features/crypto-news-publisher/api/keywords-api.ts`:
    - Add `requireImage?: boolean` to `CreateKeywordBody` and `UpdateKeywordBody`
    - Add `requireImage: boolean` to `KeywordView`
  - Frontend `apps/frontend/src/features/crypto-news-publisher/ui/keywords-manager.tsx`:
    - Add a new case-sensitive-style checkbox in the create form (same row): "Only with image"
    - Add the same checkbox in the edit form
    - In the row display, optionally show a small icon when `requireImage` is true
  - Tests:
    - `keyword.entity.spec.ts` — add requireImage test
    - `enqueue-matching-message.use-case.spec.ts` — add test: keyword with requireImage=true + message with no media → skip; same keyword + message with media → enqueue
    - `keywords.controller.spec.ts` — update fixtures and add test
    - Frontend tests — update fixtures with `requireImage: false`; add 1 test verifying the checkbox is in the form

## Verification

- tsc clean
- jest backend passes (940+ tests)
- vitest frontend passes
- Manual: create a keyword with requireImage=true, post a message with "phrase" but no image in a source → check that the queue does NOT have a PENDING entry for that message

## Commits

1. `feat(crypto-news-publisher): add requireImage filter to keywords`
