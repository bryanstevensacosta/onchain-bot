---
slug: crypto-news-image-only-filter
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/crypto-news-image-only-filter.md
approach: Add `requireImage: boolean` flag to Keyword (per-keyword). EnqueueMatchingMessageUseCase checks imagePath at match time. Configurable from frontend.
---

# Draft: crypto-news-image-only-filter

## Findings

1. `EnqueueMatchingMessageUseCase.execute({ message, matchedKeyword })` currently always enqueues if the keyword matches
2. The matched message has `imagePath: string | null` already available (from the `PublisherQueueEntry`)
3. The `Keyword` entity has `sourceChannelId` already (Wave before this)

## Decisions

1. **`requireImage: boolean` on `Keyword`** — false by default (current behavior). When true, only messages with `imagePath !== null` are enqueued.
2. **Skip behavior: leave PENDING** (recommended). Reasoning: if the operator toggles `requireImage` temporarily, the skipped entries remain enqueued for later publication. No new status needed — just a debug log.
3. **Per-keyword, not global or per-template**. The user said: "configurarse vía el frontend, por ejemplo solo las que tienen imagenes con el keyword bitcoin en el source cointelegraph" — that's keyword-scoped.
4. **Filter happens at enqueue time**, not at publish time. The cron publisher already has the data; checking there would be later. But enqueue-time is the correct place: if you don't want to waste a queue slot on a no-image entry when a slot could be used by an image entry, filter at enqueue.
5. **No re-enqueue on toggle.** If `requireImage` is toggled from true to false, entries that were skipped remain skipped (they were never enqueued). This is correct.

## Scope IN

- `Keyword.requireImage: boolean` field + getter
- `KeywordEntity.require_image` column
- `KeywordMapper` for new field
- `KeywordsController` accepts `requireImage` in create/update body
- `EnqueueMatchingMessageUseCase`: after keyword match, check `message.imagePath !== null` if `matchedKeyword.requireImage`
- Frontend: checkbox in keywords-manager create/edit form
- `KeywordView.requireImage` in view

## Scope OUT

- No "skipped" UI (entries that were skipped never appear; the operator sees the cron logs)
- No bulk toggle (set `requireImage` per keyword)
- No per-template image filter (keyword-only)
