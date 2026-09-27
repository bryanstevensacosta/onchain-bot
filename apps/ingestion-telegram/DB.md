# Ingestion-Telegram Databases (DB.md)

Plain-words reference for the databases owned by `apps/ingestion-telegram`.
Companion docs: `BC.md` (what each area does), `AGENTS.md` (how to work here),
`CHANGELOG.md` (what changed). All in English.

> Source of truth for code: the entity files under `src/*/infrastructure/`
> and the migrations under `src/shared/common/persistence/migrations/`.
> This file summarizes them in plain words; it never replaces reading them.

## 1. One database per environment

Each ingestion-telegram instance reads and writes ONLY its own database.
The backend never writes these tables; it only reads them through this
service's HTTP API. The frontend reads them directly too.

| Environment | Instance name                | Database name (TARGET, post-rename) |
| ----------- | ---------------------------- | ----------------------------------- |
| Dev local   | `ingestion-telegram`         | `onchain_bot_ingestion`             |
| Staging     | `ingestion-telegram-staging` | `onchain_bot_staging_ingestion`     |
| Prod        | `ingestion-telegram`         | `onchain_bot_ingestion`             |

Rules that never change:

- Same table names in every environment; only the database name differs.
- Staging starts EMPTY by design (no prod mirror, no seed).
- Live Oracle databases keep their pre-rename names until the DB-rename
  runbook (`.omo/runbooks/rename-onchain-bot-db.md`, phase 3) executes.
- One MTProto login session per instance; never share credentials between
  environments (sharing causes `AUTH_KEY_DUPLICATED`).

## 2. The three tables

### 2a. `telegram_feed_sources` — the channel address book

One row per watched Telegram channel. This service is the SOLE OWNER
(reads and writes). Registration happens only here.

Entity:
`apps/ingestion-telegram/src/registry/infrastructure/persistence/typeorm/entities/telegram-feed-source.entity.ts`

| Column (database name) | Plain meaning                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `channel_id`           | The Telegram channel identity (primary key, e.g. `-100...`). One row per channel.                    |
| `handle`               | The public `@name` of the channel, if known (optional).                                              |
| `title`                | The human-readable channel name (required; auto-looked-up from Telegram when missing).               |
| `type`                 | The KIND of channel: `kol` (expert tips) or `crypto-news` (news).                                    |
| `is_active`            | The on/off switch. Only `true` rows are listened to.                                                 |
| `lifecycle_status`     | Second on/off label: `ACTIVE` or `INACTIVE`. Watched means BOTH switches on.                         |
| `last_ingested_at`     | When a message was last saved from this channel (empty if none yet).                                 |
| `avatar_path`          | Where the channel's saved profile photo file lives (bookkeeping note; the file itself is the truth). |
| `avatar_updated_at`    | When that profile photo was last refreshed.                                                          |
| `added_at`             | When this row was first added (automatic).                                                           |
| `updated_at`           | When this row was last changed (automatic).                                                          |

Who touches it:

- Registry OWNS it (writes via `RegisterNewsSourceUseCase`,
  reads via `TelegramFeedSourceRepository`).
- Core READS it (startup channel list + 5-minute refresh of active rows).
- Health READS it read-only (counts channels for `GET /api/health`).
- Feed READS it read-only (source counts for `GET /api/feed/stats`).
- Avatar writes `avatar_path` / `avatar_updated_at` only (best-effort bookkeeping).

### 2b. `telegram_feed_messages` — saved Telegram messages

One row per ingested message, stored RAW (no content filters, no transforms).
Renamed from `crypto_news_messages` (rows preserved, no copy).

Entity:
`apps/ingestion-telegram/src/feed/infrastructure/persistence/typeorm/entities/telegram-feed-message.entity.ts`

| Column (database name)     | Plain meaning                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `id`                       | The row's own unique id (uuid, primary key).                                                     |
| `channel_id`               | Which Telegram channel the message came from. Unique together with `message_id` (no duplicates). |
| `message_id`               | The message number inside that Telegram channel.                                                 |
| `type`                     | The KIND of message: `kol` or `crypto-news`.                                                     |
| `title`                    | Optional headline (may be empty).                                                                |
| `content`                  | The full RAW message text, exactly as received.                                                  |
| `published_at`             | When the message was posted on Telegram (NOT the deletion clock).                                |
| `ingested_at`              | When THIS service saved it. THE deletion clock for the 72-hour janitor.                          |
| `link_preview_url`         | Optional link-preview URL attached to the message.                                               |
| `link_preview_title`       | Optional link-preview title.                                                                     |
| `link_preview_description` | Optional link-preview description.                                                               |
| `link_preview_site_name`   | Optional link-preview site name.                                                                 |
| `message_entities`         | Formatting notes (links, mentions, hashtags) as a JSON list.                                     |
| `grouped_id`               | Album id shared by photos sent together as one album (may be empty).                             |

Who touches it:

- Core WRITES it (via `MessagePersistenceCoordinator.persistFeedMessage`;
  duplicates skipped when channel + message number already exists).
- Feed OWNS the table shape and serves reads (`TelegramFeedMessageRepository`).
- Retention DELETES old rows (`ingested_at` older than the window, batches of 1000).
- Stream touches NO rows (in-memory clients only).

### 2c. `telegram_feed_message_media` — photo/video index

One row per downloaded attachment (typically 0–3 per message).
Renamed from `crypto_news_message_media`. Deleting a parent message row
deletes its media rows automatically (database cascade).

Entity:
`apps/ingestion-telegram/src/feed/infrastructure/persistence/typeorm/entities/telegram-feed-message-media.entity.ts`

| Column (database name) | Plain meaning                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`                   | The row's own unique id (uuid, primary key).                                                                |
| `message_id`           | Which message this file belongs to (points at `telegram_feed_messages.id`; cascade delete).                 |
| `media_index`          | Position inside the message's album (0 = first).                                                            |
| `type`                 | The KIND of attachment: `photo`, `video`, or `webpage` (link preview).                                      |
| `file_path`            | Where the downloaded file lives on disk. The janitor is the ONLY reader; serving re-finds files by pattern. |
| `mime_type`            | The file kind detected from its bytes (may be empty).                                                       |
| `file_size`            | The file size in bytes (may be empty if the download never finished).                                       |
| `created_at`           | When this row was created (automatic).                                                                      |

Who touches it:

- Core WRITES it (news channels only; tip channels never get rows).
- Feed serves reads (rewrites disk paths into public download URLs).
- Retention DELETES expired rows (deletes the file first, then the row).
- Media produces the files; it owns no table.

## 3. State that is NOT in Postgres

- Read bookmarks: Redis keys `ingestion:lastSeen:{channel}` hold the highest
  message number seen per channel (managed by
  `apps/ingestion-telegram/src/core/infrastructure/services/last-seen-manager.service.ts`).
  Without them, a restart re-announces up to 50 old messages per channel.
- Stream clients: in-memory list inside the running process (gone on restart;
  consumers reconnect).
- Rate-limit counters: in-memory per address (lost on restart, by design).
- Files on disk (per environment, janitor-managed except avatars):
  - `{UPLOADS_ROOT}/feed/media/{channelId}/{messageId}_{index}.{ext}` — message photos/videos (72-hour janitor).
  - `{UPLOADS_ROOT}/avatar/{channelId}.jpg` — channel profile photos (permanent, janitor-excluded).

## 4. Schema history (migrations)

`apps/ingestion-telegram/src/shared/common/persistence/migrations/`
holds 7 versioned scripts; `apps/ingestion-telegram/src/shared/common/persistence/data-source.ts`
names the 3 live tables. Removed tables (do not look for them):
`backfill_messages` (replay feature dropped),
`channel_content_filter_configs` (filters moved to the backend),
pre-rename `crypto_news_sources` residual (dropped).
`crypto_news_messages` / `crypto_news_message_media` were RENAMES, not
deletions — data carried over to the `telegram_feed_*` names.
