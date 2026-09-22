# Telegram Feed (unified ingestion catalog + hot data)

> One table of sources, one table of messages, one API (`/api/feed/*`).
> Result of plan `.omo/plans/telegram-feed-unification.md` (items 1-10);
> companion ADR: `adr-kol-raw-text.md` (Q1-B: KOL raw text in DB + SSE).
> Every route below was verified against its controller decorator
> (`src/registry/api/http/sources.controller.ts`,
> `src/feed/api/http/feed.controller.ts`,
> `src/media/api/http/media.controller.ts`,
> `src/stream/api/http/*`). Do not cite paths from memory.

## Why one table

KOL channels and crypto-news channels have the same operational shape:
a Telegram channel id, an optional handle/title, an active flag, a lifecycle,
a last-ingested cursor. Two tables (`kols` in backend, `crypto_news_sources`
in ingestion) meant two registration paths, two polling loops, and a backend
HTTP round-trip (`BackendChannelProviderService`, deleted in item 7) on every
ingestion refresh. The unified catalog keeps one row per channel with a
`type` discriminator (`kol | crypto-news`) and lets the engine classify by
registry row instead of by table membership.

Tables (all owned by ingestion-telegram, `<base>_ingestion` DB):

| Table                         | PK                       | Discriminator      | Notes                                                                                                                                                             |
| ----------------------------- | ------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `telegram_feed_sources`       | `channel_id` varchar(64) | `type` varchar(16) | `handle` nullable, `title`, `is_active`, `lifecycle_status` default `ACTIVE`, `last_ingested_at` nullable (absorbed from backend `kols`), `added_at`/`updated_at` |
| `telegram_feed_messages`      | `id`                     | `type` varchar(16) | shape of `crypto_news_messages` + `type`; GIN index `idx_telegram_feed_messages_entities_gin USING GIN(message_entities)`; unique per channel+message             |
| `telegram_feed_message_media` | `id`                     | via parent FK      | same shape as before, `ON DELETE CASCADE` to messages; holds ONLY crypto-news rows (KOL never downloads, see policy)                                              |

Entity homes: `src/registry/infrastructure/persistence/typeorm/entities/telegram-feed-source.entity.ts`,
`src/feed/infrastructure/persistence/typeorm/entities/telegram-feed-message(.media).entity.ts`.

## Type policy (text always, media news-only)

- **Text: BOTH types.** KOL rows persist `content = raw.text` and SSE frames
  carry `payload.text` for KOL (Q1-B, see `adr-kol-raw-text.md`). The
  backend-internal ToS boundary is unchanged: raw text never crosses the
  backend event bus (fix-1, `KolMessageIngestedEvent` carries no text).
- **Media: crypto-news ONLY.** The MTProto adapter gate
  (`isCryptoNewsChannel`, now a branch on registry `type`) skips downloads
  for KOL, and the coordinator persists `media = []` for `type='kol'` as
  defense-in-depth. Media rows exist only for crypto-news messages.
- Raw text is NEVER written to disk logs (`[PAYLOAD-TRANSFORM-DEBUG]` logs
  shape only: lengths, never content).

## Route map

Source CRUD lives in `SourcesController` (`src/registry/`, `@Controller('api/feed')`):

| Method + path                                   | Result                                                                                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/feed/sources`                        | 201 registered / 409 duplicate / 400 invalid `channelId`; `type` defaults to `crypto-news`, pass `type: 'kol'` for KOL channels                                                        |
| `POST /api/feed/sources/batch`                  | 201 idempotent upsert by `channel_id` (created/updated/total); whole batch validated BEFORE any write, so a 400 leaves the table untouched; used by `scripts/backfill-kols-to-feed.ts` |
| `GET /api/feed/sources[?type=kol\|crypto-news]` | all sources incl. inactive; invalid `type` → 400                                                                                                                                       |
| `GET /api/feed/sources/active/ids[?type=]`      | channel-id strings only; the backend consumer path                                                                                                                                     |
| `PATCH /api/feed/sources/:channelId`            | update `title`/`handle` only (400 no fields, 404 unknown); there is NO endpoint for `last_ingested_at` — the backend orchestrator treats that write as a documented no-op              |
| `PATCH /api/feed/sources/:channelId/toggle`     | flip `isActive` blindly (404 unknown); no single-get endpoint, so callers fetch-then-toggle                                                                                            |
| `DELETE /api/feed/sources/:channelId`           | 200 `{success:true}` (404 unknown)                                                                                                                                                     |

Reads live in `FeedController` (`src/feed/`, `@Controller('api/feed')`):

| Method + path                                      | Result                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/feed/messages?limit=`                    | recent messages with media, wrapped `{timestamp,count,data}`, cap 200 (default 50) |
| `GET /api/feed/messages/channel/:channelId?limit=` | bare array for one channel, cap 200                                                |
| `GET /api/feed/stats`                              | `{totalMessages,totalSources,activeSources}`                                       |

Unchanged plumbing (NOT under `/api/feed/`):

| Method + path                                 | Owner                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/media/:channelId/:messageId/:index` | `src/media/` (`MediaController`); serves by glob, never trusts `file_path` for lookup |
| `GET /api/ingestion/stream`                   | `src/stream/` (SSE fan-out, 30 s heartbeat; lossy by design, no replay)               |

Hard cut, no aliases: the old `/api/crypto-news/*` routes return 404
(item 5). Backend `GET telegram-kol/identity/kols*` returns 501 with feed
hints (item 8); reads go through `FeedIdentityHttpClient`
(`GET /api/feed/sources?type=kol`).

## Ownership split

- **Ingestion owns** sources + messages + media (tables, files under
  `<UPLOADS_ROOT>/feed/media/`, retention janitor, SSE broadcast).
- **Backend owns** scoring, reputation, filters/keywords, publisher queue,
  publishing (Bot API). It reads identity via HTTP, never writes feed rows.
- **Frontend reads** feed directly
  (`GET /api/feed/messages`, media via `/api/media/...`).

## Retention (72 h, one janitor)

`CryptoNewsRetentionCleanupScheduler` (`src/retention/`, the ONLY code with
DELETE): daily `0 3 * * *` full pass + hourly disk-pressure check (>90 %
usage runs the aggressive 48 h cutoff, `AGGRESSIVE_CLEANUP_RETENTION_HOURS`).
Advisory lock `9_421_373`, clock `ingested_at` (arrival, never
`published_at`), batch 1000, orphan sweep
(`telegram_feed_message_media` rows without a parent message). Sources are
NEVER touched by the janitor (asserted in spec). Retention window env:
`INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS` (default 72; the 72 h window
is the invariant, effective prod value pending operator decision).
Dev caveat: with `synchronize:true` TypeORM drops the GIN index on every
boot; recreate with `CREATE INDEX IF NOT EXISTS ... USING GIN` after boot
(staging/prod use `synchronize:false` and keep it).

## Deploy law (ingestion-first, inviolable)

1. Deploy ingestion FIRST.
2. Verify `curl -sf http://localhost:3032/api/feed/sources` → 200 plus one
   SSE sample frame carrying text.
3. ONLY THEN deploy the backend (drops/migrations). Backend-first = silent
   blackout (empty channels, frozen reputation); legacy backend MTProto does
   not survive the `kols` DROP.
4. Parity gate lives in CI: `.github/workflows/deploy.yml` (~L231) curls
   `GET :3032/api/feed/sources` and aborts the backend deploy on failure;
   `scripts/smoke-prod.sh:62-65` checks the same path post-deploy.
   The backend-side gate: `USE_SSE_INGESTION=true` must hold in staging/prod
   before the `kols` DROP migration runs.
