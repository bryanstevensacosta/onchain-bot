# Crypto-News Schema Ownership (Split 2026-09-08)

> Status: reality doc. Every claim below is verified against the code and
> migrations cited in each section. If a claim lacks a pointer, treat it as
> suspect and grep `src/` before trusting it.

## Overview

Crypto-news storage is split across two Postgres databases owned by two
different services. There are **no cross-DB foreign keys by design**: a FK
cannot span two databases, and adding one would recouple the split. Backend
code that references a crypto-news channel therefore stores the channel id
as an **opaque varchar** and validates source existence as **warn-only**
(log + proceed, never throw).

Related docs (sibling tasks own them; linked by path only):

- `docs/architecture/crypto-news-dual-path.md`
- `docs/configuration/CRYPTO_NEWS_ENV_REFERENCE.md`
- `docs/guides/ADD_CRYPTO_NEWS_SOURCE.md`

## Which tables live in which DB

### Ingestion-telegram DB (`<base>_ingestion`) — the owner

The ONLY home of these 3 tables since the split of 2026-09-08:

| Table                       | Holds                                                                |
| --------------------------- | -------------------------------------------------------------------- |
| `crypto_news_sources`       | Channel registry (`channel_id` PK, handle, title, lifecycle)         |
| `crypto_news_messages`      | RAW message content (unfiltered text + metadata)                     |
| `crypto_news_message_media` | Media rows (`message_id` FK → `crypto_news_messages.id`, file paths) |

Ingestion-telegram reads/writes all three and runs the 72h retention janitor
(`CryptoNewsRetentionCleanupScheduler`, advisory lock `9_421_373`). Baseline
migration: `1788844970659-BaselineIngestionSchema` in
`apps/ingestion-telegram/src/shared/common/persistence/migrations/`.

### Backend DB — owns ZERO crypto-news tables

`PERSISTED_ENTITIES`
(`apps/backend/src/shared/common/persistence/entities.ts`) contains no
`CryptoNewsSource` / `CryptoNewsMessage` / `CryptoNewsMessageMedia` entity.
The backend keeps only its own working tables:

| Table                            | Role, and why it is FK-less                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `channel_content_filter_configs` | Per-channel regex filters. `channel_id` is an opaque varchar — the JOIN to `crypto_news_sources` was removed in the split (see below).    |
| `crypto_news_publisher_queue`    | Publish queue. `channel_id`/`message_id` are opaque content-snapshot coordinates; `imagePath`/`imagePaths` are path strings, never bytes. |

## Why no cross-DB FKs

1. **Impossible**: `crypto_news_sources` lives in `<base>_ingestion`, filters
   and queue live in the backend DB. Postgres cannot enforce a FK across
   databases.
2. **Undesirable**: a FK (or even a soft JOIN assumption) would recouple the
   services the split decoupled — ingestion-telegram must start and run
   independently as the single source of truth for all environments
   (dev/staging/prod read it over HTTP/SSE).
3. **Handled in code, not schema**: filter use-cases validate source
   existence as warn-only —
   `create-filter.use-case.ts:45-48` logs `Creating filter for channel ...
without source existence check` and proceeds;
   `list-filters.use-case.ts:21-46` documents `The channel is NOT validated
against crypto-news sources` and warns when a channel has no filters.
   Orphan rules for unknown channels are kept; matching simply yields no
   filters for them.

## Migration context

- `1815000000000-CreateChannelContentFilterConfigs.ts` — created the filter
  table (with a `channel_id` FK of its era).
- `1860000000001-DropIngestionOwnedCryptoNewsTables.ts` — the split: drops
  BOTH historical filter-FK names (synchronize-era
  `FK_f4d53649fee70f18bbc88502673` + `1815000000000`-era
  `fk_channel_content_filter_configs_channel_id`) and the 3 tables
  (media → messages → sources) on staging/prod. `down()` recreates the
  tables but DELIBERATELY does not re-add either filter FK —
  `channel_id` stays an opaque varchar.
- Never re-add a `@ManyToOne` / FK from `ChannelContentFilterConfigEntity`
  or `PublisherQueueEntity` to a crypto-news table. If a future reader is
  tempted, this doc is the reason not to.

## Scope note: READMEs stay Spanish

Roughly 90% of remaining Spanish text in the repo lives in `*.md` files
(per-provider READMEs, BC READMEs, backend/frontend READMEs). Translating
them is out of scope for this task (disproportionate churn, no behavior or
clarity gain for code readers). Only `.ts` source comments and the string
literals flagged by the acceptance grep were translated to English; `.md`
files were intentionally left untouched.
