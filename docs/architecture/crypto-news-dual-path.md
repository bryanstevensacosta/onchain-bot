# Crypto-News Dual-Path Architecture (SSE + Polling)

> Status: reality doc. The scheduler interval is dynamic (not a fixed `@Cron`),
> and the SSE handler never throws. Both behaviors below are verified against
> the code cited in each section.

## Overview

Crypto-news ingestion runs on two paths that share the same downstream
(filter, match, enqueue, publish). Only one path is fast; the other exists
so no message is lost when the fast one stalls.

- **PRIMARY PATH (SSE, real-time):** `ProcessCryptoNewsMessageHandler`
  (`apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts`)
  handles one `messageType='crypto-news'` event at a time off the live SSE
  stream. Target end-to-end latency under 10 seconds.
- **FALLBACK PATH (polling):** `EnqueueMatchingCronScheduler`
  (`apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts`)
  polls the ingestion-telegram HTTP API on a dynamic interval and enqueues
  whatever the SSE path missed.

Shared components (used identically by both paths):

- `FilteredCryptoNewsService.getMatchingMessages()` — fetch RAW content
  from ingestion-telegram, apply per-channel `ContentFilterService` regex
  transforms on-read, evaluate keywords (simple + AND-groups), check
  blacklist phrases.
- `EnqueueMatchingMessageUseCase` — queue insertion, queue cap 36.
- `PublisherQueueRepository.findByChannelIdAndMessageId()` — dedup +
  status tracking.
- `PublisherCronScheduler` — drains the queue toward LLM + Bot API
  (every minute; out of scope for this doc).

Related docs (sibling tasks own them; linked by path only):

- `docs/configuration/CRYPTO_NEWS_ENV_REFERENCE.md`
- `docs/guides/ADD_CRYPTO_NEWS_SOURCE.md`

## ASCII Diagram

```text
Telegram channel
    |
    v
ingestion-telegram (persists RAW, stores media, emits SSE metadata)
    |
    +--- PRIMARY PATH (SSE, per-event, <10s target) ------------------+
    |                                                                  |
    |  SSE stream :3031/api/ingestion/stream                           |
    |    | messageType='crypto-news'                                   |
    |    v                                                             |
    |  SSE routing layer                                               |
    |    |                                                             |
    |    v                                                             |
    |  ProcessCryptoNewsMessageHandler.handle(raw)                     |
    |    1. matchingEnabled? (skip if false, debug log)                |
    |    2. DEDUP FIRST via queueRepo.findByChannelIdAndMessageId      |
    |       skip PENDING / PUBLISHED / FAILED-blocking                 |
    |    3. getMatchingMessages(10, channelId) -> find own entry       |
    |    4. enqueueUseCase.execute() if keyword-matched                |
    |    5. logLatency(Date.now() - ingestedAt)                        |
    |    catch-all: log + return (NEVER throws)                        |
    |                                                                  |
    +--- FALLBACK PATH (polling, batch, catches gaps) ----------------+
    |                                                                  |
    |  EnqueueMatchingCronScheduler.tick()                             |
    |    interval: 1 min when SSE disabled (primary mode)               |
    |              N min when SSE enabled (fallback mode,                |
    |              CRYPTO_NEWS_POLLING_INTERVAL_MINUTES, default 5)     |
    |    1. matchingEnabled? (silent skip if false;                    |
    |       error skip if MatchingConfig fails to load)                |
    |    2. getMatchingMessages(FETCH_LIMIT=50)                        |
    |    3. mapToPublisherDto() per match -> enqueueUseCase.execute()  |
    |    4. log "Enqueue batch complete: X enqueued, Y skipped"        |
    |    guard: skip tick if previous tick still running               |
    |                                                                  |
    +--- SHARED TAIL --------------------------------------------------+
                                                                       |
    Publisher queue (cap 36, TTL 24h) -> PublisherCronScheduler        |
      -> LLM (if enabled) -> Bot API publish                           |
```

Why the two windows differ: the handler fetches a window of **10** (not 1)
because album siblings arrive together and the merge inside
`getMatchingMessages` needs them co-present to attach all photos to one
entry; it then enqueues only its own event (`find`, never `[0]`-assumed).
The scheduler fetches **FETCH_LIMIT=50** because it sweeps for backlog,
not for one event.

## Dynamic Interval (Not a Fixed Cron)

The recommendations doc sketches `@Cron('*/5 * * * *')`. That is stale.
The real scheduler registers a dynamic `CronJob` in
`onApplicationBootstrap()`:

- Reads `app.ingestion.useSseCryptoNews` (`USE_SSE_CRYPTO_NEWS`,
  default `true`) and `app.cryptoNews.pollingIntervalMinutes`
  (`CRYPTO_NEWS_POLLING_INTERVAL_MINUTES`, default `5`, min 1, max 60).
- Effective interval: `useSse ? pollingInterval : 1`.
- Cron expression: `` `*/${intervalMinutes} * * * *` `` under the
  `SchedulerRegistry` job name `crypto-news-polling`.
- Bootstrap log (verified string):
  `EnqueueMatchingCronScheduler ready (fetch limit: 50, enabled: <bool>,
interval: <N>min, SSE: <enabled|disabled>)`, with a `warn` variant when
  `MatchingConfig` cannot be loaded.

Per-tick log strings (verified):

- `Previous tick still running; skipping this tick` (warn, overlap guard)
- `No matching messages found (fetched up to 50)` (debug, empty batch)
- `Found N matching messages, enqueuing...` (log)
- `Enqueue batch complete: X enqueued, Y skipped (out of N matches)` (log)
- `Failed to enqueue message <channelId>:<messageId>: <msg>` (error,
  per-message, continues the batch)

## 4-Combination Table (`USE_SSE_CRYPTO_NEWS` x `matchingEnabled`)

| `USE_SSE_CRYPTO_NEWS` | `matchingEnabled` | Behavior                                                                                                                                                                                                                                                                                       |
| :-------------------: | :---------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|        `true`         |      `true`       | **Full dual-path.** SSE handler processes each event in real time (<10s target); scheduler ticks every `CRYPTO_NEWS_POLLING_INTERVAL_MINUTES` (default 5 min) as a fallback that catches SSE disconnection gaps. Dedup (`PENDING`/`PUBLISHED`/blocking-`FAILED` skips) makes the overlap safe. |
|        `true`         |      `false`      | **Paused.** Handler returns early (`Matching disabled, skipping <peerId>:<messageId>`, debug); scheduler `tick()` returns silently. Queue drains only if publishing stays on; nothing new enters.                                                                                              |
|        `false`        |      `true`       | **Polling-only (primary mode).** No SSE processing; scheduler ticks every **1 minute** with `FETCH_LIMIT=50`. Expected latency is minutes, not seconds.                                                                                                                                        |
|        `false`        |      `false`      | **All paused.** Neither path enqueues anything.                                                                                                                                                                                                                                                |

## Rollback Procedure

No code change, no deploy, no data loss. One env var:

```bash
USE_SSE_CRYPTO_NEWS=false
```

Effect: on next boot `onApplicationBootstrap()` computes `intervalMinutes = 1`
and registers `*/1 * * * *`; polling becomes the primary (and only)
ingestion path at a 1-minute cadence. The SSE handler is inert in this mode
(no events arrive), so there is nothing else to switch off.

To roll forward again, set `USE_SSE_CRYPTO_NEWS=true` (or unset it; the
default is `true`) and restart. The scheduler returns to the configured
fallback interval (`CRYPTO_NEWS_POLLING_INTERVAL_MINUTES`, default 5).

Caveat: rollback trades latency for availability. Polling-only latency is
bounded by the 1-minute tick plus fetch/filter time, so the <10s SLO below
does not apply while rolled back.

## Latency SLO (<10s, SSE Path Only)

- **SLO:** `Date.now() - ingestedAt < 10_000ms`, measured in
  `ProcessCryptoNewsMessageHandler.logLatency()` after a successful enqueue.
  `ingestedAt` is the timestamp from ingestion-telegram (when the message
  was stored); the clock therefore covers SSE delivery + dedup check +
  fetch/filter/match + enqueue.
- **Met (INFO):** `log` level —
  `Enqueued <channelId>:<messageId> via SSE (id: <queueId>)` followed by
  `Latency <N.NN>s for <channelId>:<messageId> (target <10s met)`.
- **Missed (WARN):** `warn` level —
  `Latency <N.NN>s for <channelId>:<messageId> (target <10s MISSED)`.
- **Invalid clock:** `warn` level —
  `Invalid ingestedAt for <channelId>:<messageId>: <value> — skipping
latency log` (null, non-`Date`, or `NaN`; enqueue still stands).
- The polling path emits **no** latency log; its batches are measured in
  enqueued/skipped counts instead.

## Dedup Rules Summary

Checked in `PublisherQueueRepository.findByChannelIdAndMessageId()` **before**
the expensive fetch/filter step, in both paths (handler checks explicitly;
scheduler inherits it via `EnqueueMatchingMessageUseCase`). Blocking test is
`isBlockingFailureReason()` (case-insensitive substring against
`BLOCKING_FAILURE_REASONS` in
`shared/deduplication/domain/constants/blocking-failure-reasons.ts`).

| Queue status                 | Action                                                                                   | Rationale                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No entry                     | Proceed to fetch/filter/match                                                            | First sight of this message                                                                                                                                                                                        |
| `PENDING`                    | **Skip** (debug: `already PENDING, skipping`)                                            | Already in queue awaiting publish                                                                                                                                                                                  |
| `PUBLISHED`                  | **Skip** (debug: `already PUBLISHED, skipping`)                                          | Already published successfully                                                                                                                                                                                     |
| `FAILED` + blocking reason   | **Skip** (debug: `has blocking failure (<reason>), skipping`)                            | Content itself is bad; retry would fail identically. Blocking patterns: `non-Latin character`, `Content violates policy` / `violates policy`, `Blacklist` / `blacklist`, `Honeypot` / `honeypot` / `scam` / `rug`. |
| `FAILED` + transient reason  | **Allow re-enqueue** (debug: `has non-blocking failure (<reason>), allowing re-enqueue`) | Content is valid; the failure was operational. Transient examples: `Expired: exceeded 24h in queue`, `Publisher not configured`, `Rate limit exceeded`, `LLM generation failed`.                                   |
| `FAILED` + null/empty reason | **Allow re-enqueue** (`isBlockingFailureReason(null)` is `false`)                        | No evidence of a content problem                                                                                                                                                                                   |

## Error Boundaries (No-Throw Guarantee)

- `ProcessCryptoNewsMessageHandler.handle()` wraps everything in
  try/catch, logs `Failed to process crypto-news message
<peerId>:<messageId>: <msg>` with stack, and returns. A single bad
  message can never crash the SSE stream; the fallback poller retries
  transient failures on its next tick.
- `EnqueueMatchingCronScheduler.tick()` guards overlap (`running` flag),
  skips silently when matching is disabled, logs-and-returns when
  `MatchingConfig` fails to load, catches per-message enqueue errors
  inside the loop, and records fetch failures to `MatchingHealthState`
  (`recordFetchSuccess` / `recordFetchFailure` / `recordEnqueued`).

## Source Map

| Fact in this doc                                                              | Verified in                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Dynamic interval 1-vs-5 min, `FETCH_LIMIT=50`, job name `crypto-news-polling` | `enqueue-matching-cron.scheduler.ts` `onApplicationBootstrap()`                                                                 |
| Dedup-before-fetch, window 10, 10_000ms threshold, never throws               | `process-crypto-news-message.handler.ts` `handle()` + `logLatency()`                                                            |
| Blocking patterns                                                             | `shared/deduplication/domain/constants/blocking-failure-reasons.ts` `BLOCKING_FAILURE_REASONS`                                  |
| Env defaults/ranges                                                           | `shared/common/config/app.config.ts` (`USE_SSE_CRYPTO_NEWS` default `true`, `CRYPTO_NEWS_POLLING_INTERVAL_MINUTES` default `5`) |
