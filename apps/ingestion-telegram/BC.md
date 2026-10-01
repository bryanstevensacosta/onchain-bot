# Ingestion-Telegram Bounded Contexts (BC.md)

Plain-words guide to what each area of `apps/ingestion-telegram/src/` does,
how it does it, which HTTP doors it owns, and which classes matter.
Companion docs: `DB.md` (databases and tables), `AGENTS.md` (how to work here),
`CHANGELOG.md` (what changed). All in English.

> Every file path below was cross-checked against the tree. The `kol` /
> `crypto-news` kind names are preserved on the wire and in the database even
> though files, table names, and disk folders were renamed from `crypto-news`
> to `feed`.

## 1. Core — the Telegram ear plus the sorting desk (`src/core/`)

In plain words: this is the ear on Telegram plus the sorting desk. It listens
to Telegram channels, saves what it hears, and shouts each message onward so
the backend of the same environment can pick it up.

What it does and how:

- Startup and channel list —
  `apps/ingestion-telegram/src/core/core.module.ts`: on boot it reads the
  watched channels from its own local database (active rows only), starts the
  Telegram listener exactly once, then re-reads the list every 5 minutes. New
  channels are picked up without a restart; each message is labeled `kol`
  (trading tip) or `crypto-news` (general news) from that same list.
- Listening to Telegram, two ways —
  `apps/ingestion-telegram/src/core/api/mtproto/telegram-mtproto-listener.adapter.ts`:
  (a) instant alerts whenever a new message arrives, and (b) a safety sweep on
  a timer asking Telegram for the last 50 messages per channel after the last
  saved bookmark. Both paths drop findings into an internal waiting line.
- Sorting desk (routing) —
  `apps/ingestion-telegram/src/core/application/coordinators/message-persistence.coordinator.ts`:
  for every message it checks "have I seen this before?", saves it, builds a
  broadcast card, and hands it to the live broadcast service. One bad message
  is logged and skipped; it never crashes the listener. News channels keep
  text and photos; tip channels are saved as raw text with no photo rows.
  The card also carries the source row's `handle` plus `avatarUrl` and
  `sourceUrl` (read-only lookup, fail-open to nulls — consumers keep
  filtering on `messageType` only).
- Photo downloading (news only) —
  `apps/ingestion-telegram/src/core/application/services/telegram-media-extractor.service.ts`:
  downloads photos and videos for news channels at ingestion time; tip
  channels never download media.
- Duplicate protection —
  `apps/ingestion-telegram/src/core/application/services/deduplication.service.ts`:
  an in-memory notebook of "channel + message number already routed" stops
  double delivery; a permanent database check survives restarts.
- Single login keeper —
  `apps/ingestion-telegram/src/core/infrastructure/services/telegram-client-manager.service.ts`:
  owns the one Telegram login session (one per environment; a second session
  with the same credentials gets kicked off Telegram).
- Address translator —
  `apps/ingestion-telegram/src/core/infrastructure/services/telegram-peer-resolver.ts`:
  turns a channel name (`@name`) or numeric id (`-100...`) into the address
  Telegram understands, plus join-channel and channel-info lookups.
- Bookmark keeper —
  `apps/ingestion-telegram/src/core/infrastructure/services/last-seen-manager.service.ts`:
  the highest message number seen per channel, kept in memory and persisted
  to Redis under `ingestion:lastSeen:{channel}` so restarts resume where they
  left off.
- Politeness guards —
  `apps/ingestion-telegram/src/core/infrastructure/services/flood-wait-handler.service.ts`
  plus
  `apps/ingestion-telegram/src/core/infrastructure/services/flood-wait-counter.service.ts`:
  when Telegram says "slow down" (FLOOD_WAIT), wait with growing backoff and
  count events in a 24-hour window; after repeated hits, pause for an hour.
- Night-shift clock —
  `apps/ingestion-telegram/src/core/infrastructure/services/sleep-window.service.ts`:
  a nightly quiet window (defaults 04:00–08:00 UTC) during which the safety
  sweep pauses; instant alerts still flow.
- Waiting line —
  `apps/ingestion-telegram/src/core/infrastructure/services/message-queue.ts`:
  the simple in-memory queue between "heard it" and "sorted it".
- Anti-ban knobs —
  `apps/ingestion-telegram/src/core/infrastructure/config/ingestion-safety.config.ts`
  (defaults overridable via `config/ingestion.config.json`): max channels per
  sweep (50), sweep rhythm (base 90 seconds plus jitter), quiet window, and
  slow-down backoff.
- Wiring — `apps/ingestion-telegram/src/core/shared.module.ts`: declares all
  of the above as shared building blocks so the rest of the service can use
  them without circular imports.

APIs: no public HTTP API here (HTTP lives in feed, registry, stream, media,
health, and metrics). Internal contract
`apps/ingestion-telegram/src/core/ports/telegram-listener.port.ts`:
`TelegramListenerPort` (abstract class = the promised abilities) with
`subscribe` (start listening), `backfill` (always refuses),
`disconnect` (stop), `updateSubscribedChannels` (swap the watched list),
`resolveChannelMetadata` (channel info), `joinChannel` (join a channel).

Classes and technical names (plain explanations):

- `TelegramMtprotoListenerAdapter` (the Telegram ear): implements the port
  above using the GramJS Telegram client. Input: `subscribe(channelIds)`.
  Output: raw message items (`TelegramRawMessage`: channel id, message
  number, raw text, date, optional formatting/media/album/link-preview).
- `MessagePersistenceCoordinator` (the sorting desk): input
  `route(raw, messageType)` with `'kol'` or `'crypto-news'`. Steps: duplicate
  check, advance bookmark, save rows, build broadcast card, hand to broadcast.
  Output: a `MessagePayload` event of type `message:telegram`.
- `MessagePayload` / `MediaPayload` / `EntityPayload`
  (`apps/ingestion-telegram/src/core/domain/types/message-payload.ts`): the
  broadcast card shapes — ids, date, raw text, file cards with download URLs,
  formatting details, plus the additive source display fields `handle`,
  `avatarUrl`, `sourceUrl` (central todo 12; unknown fields must be ignored
  by consumers).
- `DeduplicationService` (duplicate notebook), `CoreModule` (the foreman:
  reads channels, starts the listener once, classifies, forwards),
  `SharedModule` (global wiring box), `TelegramClientManager` (single login
  keeper), `TelegramPeerResolver` (address translator), `LastSeenManager`
  (bookmark keeper), `FloodWaitHandlerService` (polite retry),
  `FloodWaitCounterService` (slow-down tally), `SleepWindowService`
  (night-shift clock), `MessageQueue` (waiting line), `IngestionSafetyConfig`
  (anti-ban knobs).

## 2. Feed — the stored read-model (`src/feed/`)

In plain words: this folder is the feed's memory and its reading desk — it
keeps every ingested message exactly as it arrived and hands recent ones back
to backends and dashboards. It does NOT listen to Telegram, download media,
own channel registration, or clean up old rows.

What it does and how:

- Something else hears Telegram; this folder files it away. The listener and
  coordinator call the saver in
  `apps/ingestion-telegram/src/feed/infrastructure/persistence/typeorm/repositories/telegram-feed-message.repository.ts`
  (`save()`); attached photo rows are stored together with the message. Before
  saving, the caller checks `findByChannelAndMessageId()` — duplicates are
  skipped.
- Reads come back newest-first with photos attached. `findRecent` (optionally
  narrowed to `kol` or `crypto-news` at the database level) and
  `findByChannelId` sort by `published_at` descending and always include media.
- The HTTP desk
  (`apps/ingestion-telegram/src/feed/api/http/feed.controller.ts`) serves
  three reads. It never edits content: it rewrites each media row's disk path
  into a public download URL and converts the stored formatting column into a
  frontend-friendly `formattingEntities` array.
- Two message kinds share one table (`type` = `kol` | `crypto-news`).
  Omitting `?type=` returns a mixed list; an unknown value is rejected with a
  400 naming the two valid values.
- Old clients keep working: the controller answers both `/api/feed/*` and
  legacy `/api/crypto-news/*` prefixes.

HTTP APIs (served by `FeedController`; needs the API key when one is set):

| Method + path                                             | Input                                                                                                                                                                                                                 | Output                                                                                                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/feed/messages` — newest messages                | `limit` (optional, default 50, cap 200); `type` (optional `kol` \| `crypto-news`; anything else → 400); `cursor` (optional opaque page cursor from the previous `nextCursor`; omit for the first page; invalid → 400) | `{ timestamp, count, data, nextCursor }` (`nextCursor: null` on the last page) with `media[]` (`id`, `index`, `type`, `url`, `mimeType`, `fileSize`) and `formattingEntities` |
| `GET /api/feed/messages/channel/:channelId` — one channel | `channelId` path; `limit` (optional, default 50, cap 200)                                                                                                                                                             | Bare array of the same shaped items                                                                                                                                           |
| `GET /api/feed/stats` — stored-feed counts                | none                                                                                                                                                                                                                  | `{ totalMessages, totalSources, activeSources }` (source counts come from the registry)                                                                                       |

Media download URLs look like `/ingestion-api/media/{channelId}/{messageId}/{index}`
(the frontend proxies that prefix to this service's `/api/media`).

Classes and technical names (plain explanations):

- `FeedController` — the HTTP reading desk (three reads plus the private
  `transformMessageForApi()` reshaper).
- `TelegramFeedMessageRepository` — the librarian: `findRecent(limit, type?)`,
  `findRecentPaged(limit, type?, cursor?)` (keyset pagination: `publishedAt`
  DESC + `id` DESC tie-break, `limit + 1` probe, opaque `nextCursor`, `null`
  at the end; no offsets),
  `findByChannelId()`, `findByChannelAndMessageId()` (duplicate check),
  `save()` (photos saved together), `count()`, `countByChannelId()`.
- `TelegramFeedMessageEntity` — the shape of one stored message row
  (`apps/ingestion-telegram/src/feed/infrastructure/persistence/typeorm/entities/telegram-feed-message.entity.ts`).
- `TelegramFeedMessageMediaEntity` — the shape of one photo/video row
  (`apps/ingestion-telegram/src/feed/infrastructure/persistence/typeorm/entities/telegram-feed-message-media.entity.ts`).
- `parseMessageEntities()` / `parseMessageTypeFilter()` / `VALID_MESSAGE_TYPES`
  — tolerant formatting reader, `type` query validator, and the
  `['kol', 'crypto-news']` constant.
- `encodeFeedCursor()` / `decodeFeedCursor()` / `FeedCursor`
  (`apps/ingestion-telegram/src/feed/feed-cursor.ts`) — opaque keyset cursor
  (base64url `{publishedAt, id}` of the page anchor; malformed input → 400).
  History reads only; the SSE realtime path is untouched.

## 3. Registry — the channel catalog (`src/registry/`)

In plain words: the reception desk for "which Telegram channels do we listen
to?" Everything else (listener, polling loop, media saver) asks this desk for
the watch-list. This is the SOLE OWNER of the `telegram_feed_sources` table.

What it does and how:

- Register one channel: the controller
  (`apps/ingestion-telegram/src/registry/api/http/sources.controller.ts`)
  receives the request; the use-case
  (`apps/ingestion-telegram/src/registry/application/use-cases/register-news-source.use-case.ts`)
  cleans the channel number to the `-100...` shape, looks the title up from
  Telegram when missing (rejection with 400 when unresolvable), rejects
  duplicates with 409, and creates the row switched on (default kind
  `crypto-news`). Every new channel of EITHER kind triggers a profile-photo
  fetch in the background (never blocks registration). The public link
  `https://t.me/<handle>` is stored in the `url` column (NULL without a
  handle) and recomputed whenever the handle changes.
- Bulk import: `executeBatch` accepts up to 500 channels; the whole batch is
  validated BEFORE anything is written, and re-runs are safe (idempotent).
- Listing: the repository
  (`apps/ingestion-telegram/src/registry/infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository.ts`)
  answers "active channels" (both switches on, optional kind filter). Reads
  are fail-open (empty/false/null on DB trouble); writes raise errors.
- Day-to-day management: rename (title/handle), flip the on/off switch
  (toggle), delete. Unknown channels get 404.
- Subscription slimming (P58): this catalog keeps SUBSCRIPTION state
  (`channel_id`/`type`/`is_active`/`lifecycle_status`/`last_ingested_at`).
  Identity (`handle`/`title`/`url`/`avatar_*`/`entity_kind`/`is_bot`) is
  owned by `metadata/` (`telegram_channel_metadata`, same channel id);
  these columns are deprecated dual-write mirrors (register/batch/PATCH
  mirror into metadata via `MetadataService.adoptRegistryRow`; deleted
  after staging is green). Feed/stream/media/core read identity from
  metadata, never from local copies.

HTTP APIs (served by `SourcesController` under BOTH `/api/feed` and
`/api/crypto-news`; needs the API key when one is set):

| Method + path                                           | Input                                                                                                       | Output                                                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/feed/sources` — register one channel         | `channelId` (required), `title`/`handle` (optional), `type` (`kol` \| `crypto-news`, default `crypto-news`) | 201 + source view (`channelId`, `handle`, `title`, `type`, `isActive`, `lifecycleStatus`, `addedAt`, `avatarUrl`, `url`) |
| `POST /api/feed/sources/batch` — bulk add/update        | `sources` array (1–500 items)                                                                               | 201 + `{ created, updated, total, results[] }`                                                                           |
| `GET /api/feed/sources[?type=]` — list all              | Optional `type` filter                                                                                      | Array of full rows newest-first (each with `avatarUrl` + `url`)                                                          |
| `GET /api/feed/sources/active/ids[?type=]` — watch-list | Optional `type` filter                                                                                      | Array of channel-id strings                                                                                              |
| `PATCH /api/feed/sources/:channelId` — rename           | `{ title?, handle? }`                                                                                       | 200 + updated source view                                                                                                |
| `PATCH /api/feed/sources/:channelId/toggle` — on/off    | none                                                                                                        | 200 + `{ channelId, isActive, avatarUrl }`                                                                               |
| `DELETE /api/feed/sources/:channelId` — remove          | none                                                                                                        | 200 + `{ success: true }`                                                                                                |

Classes and technical names (plain explanations):

- `SourcesController` — the front desk (validates `?type=`, maps "not found"
  to 404).
- `RegisterNewsSourceUseCase` — the clerk (number cleanup, `-100` prefix,
  title lookup, duplicate refusal, bulk validate-first).
- `TelegramFeedSourceRepository` — the librarian (`findAllActive`,
  `findAllActiveWithTypes`, `findAll`, `isActiveFeedChannel`,
  `findByChannelId`, `create`, `save`, `delete`).
- `TelegramFeedSourceEntity` — the blueprint of one catalog row
  (`apps/ingestion-telegram/src/registry/infrastructure/persistence/typeorm/entities/telegram-feed-source.entity.ts`).
- `TelegramFeedSourceType` — the allowed-kind label (`'kol' | 'crypto-news'`).
- `normalizeChannelId` / `parseTypeFilter` — tiny helpers (number shape,
  query validation).

## 4. Stream — the live loudspeaker (`src/stream/`)

In plain words: after a message is saved, this part shouts it out live to
whoever is listening (its own backend, over a stream that stays open), plus
an "I am alive" ping every 30 seconds. Disconnect and you miss what was
shouted in between — no replay (lossy by design). Touches NO database tables.

What it does and how (`apps/ingestion-telegram/src/stream/stream.module.ts`
wires config + timer + service + controller):

- A listener opens
  `GET /api/ingestion/stream`
  (`apps/ingestion-telegram/src/stream/api/http/sse-stream.controller.ts`).
  No login, no parameters — the server assigns an internal id. The response
  stays open; cleanup runs on close/error.
- The service
  (`apps/ingestion-telegram/src/stream/application/services/stream.service.ts`)
  writes SSE headers, stores the connection in an in-memory list, and sends a
  `connection:established` greeting.
- Each Telegram message is shouted once per listener (`broadcast` method). No
  per-backend filtering here — each backend filters on its side.
- Heartbeat (`sendHeartbeat`, default every 30 s) sends `health:ping` with
  timestamp, uptime, and client count.
- Timing knobs
  (`apps/ingestion-telegram/src/stream/stream.config.ts`): heartbeat interval
  (default 30 s), reconnect initial/max delay hints for the backend client.

HTTP API:

- `GET /api/ingestion/stream` — open `text/event-stream` response. First
  `event: connection:established` (`{clientId, timestamp, message}`), then per
  message `event: message:telegram` (carries `handle`/`avatarUrl`/`sourceUrl`
  next to `messageType` since central todo 12), plus `health:ping` on the heartbeat.
  Needs the API key when one is set. No history, no `Last-Event-ID`, no
  per-backend filtering.

Classes and technical names (plain explanations):

- `StreamModule` — the wiring box (lends `StreamService` to the app).
- `streamConfig` / `StreamConfig` — the three timing knobs with safe defaults.
- `StreamService` — the loudspeaker (guest list, greetings, shouts, pings,
  cleanup).
- `SSEEvent` — one shout envelope (`type` + JSON `data`).
- `SSEClient` — one guest entry (id, open stream, connect time).
- `SSEStreamController` — the open door.

## 5. Retention — the janitor with a disk guard (`src/retention/`)

In plain words: once a day (3 AM) plus an hourly disk-watch, the janitor
throws away messages and photos older than 24 hours so the database and disk
do not grow forever. It only DELETES; it never creates or edits content.
Channel profile photos are never touched.

What it does and how:

- Two clocks trigger it
  (`apps/ingestion-telegram/src/retention/infrastructure/scheduling/feed-retention-cleanup.scheduler.ts`):
  daily cleanup (cron `0 3 * * *`); hourly disk check — above 90% full runs
  `aggressiveCleanup()` (48-hour window), above 80% runs the normal cleanup
  early.
- One janitor at a time: a `running` flag plus a Postgres advisory lock
  (`9_421_373`) so two instances never clean at once.
- The window: explicit override, else at least 1 hour, else the configured
  `feedMediaRetentionHours` (env
  `INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS`, default 24), measured on
  `ingested_at` (never `published_at`).
- Pass 1 — media files + rows (`processMediaBatch`, 1000 rows at a time):
  delete the file, then the row; already-gone files still delete the row;
  permission failures keep the row and count an error.
- Pass 2 — old messages (`processMessageBatch`): direct SQL delete in batches
  of 1000; leftover media rows fall away via cascade.
- Pass 3 — orphan media rows; pass 4 — orphan files under
  `uploads/feed-media/` (older than 24 h, skipping `*.tmp`; the avatar folder
  is never entered).
- The disk guard
  (`apps/ingestion-telegram/src/retention/infrastructure/scheduling/disk-monitor.service.ts`,
  `DiskMonitorService`): reports disk fullness percent and folder sizes;
  failures raise `DiskMonitorError`, which the scheduler logs and survives.
- Wiring (`apps/ingestion-telegram/src/retention/retention.module.ts`):
  shared services + avatars + the two feed tables + sources/feed HTTP doors.

HTTP API: none (clock-triggered only). Output is deleted files/rows plus one
summary log line per tick.

Classes and technical names (plain explanations):

- `RetentionModule` — the janitor's wiring box.
- `FeedRetentionCleanupScheduler` — the janitor itself.
- `INGESTION_RETENTION_ADVISORY_LOCK_ID` (`9_421_373`) — the "only one
  janitor" token (different from the backend's old `7_421_372`).
- `AGGRESSIVE_CLEANUP_RETENTION_HOURS` (`48`) — the shorter window under disk
  pressure.
- `DiskMonitorService` — the disk guard; `DiskMonitorError` — the
  "could not check the disk" error.
- `DISK_WARN_THRESHOLD_PERCENT` (`80`) /
  `DISK_CRITICAL_THRESHOLD_PERCENT` (`90`) — the two fullness lines.

## 6. Media — feed photo/video download and serving (`src/feed-media/`)

In plain words: saves the photos and videos attached to news messages and
hands them back over HTTP. Owns no database table (other layers write the
rows); produces files and file paths. The directory moved from `src/media/`
to `src/feed-media/` in the 2026-09-27 unification; the class names
(`MediaModule`, `MediaController`, `MediaDownloaderService`,
`FeedPathBuilder`) were deliberately kept — renaming them changes no runtime
behavior and would widen the DI/spec blast radius for nothing.

What it does and how:

- Download
  (`apps/ingestion-telegram/src/feed-media/application/services/media-downloader.service.ts`):
  when a news message arrives with a photo or video, downloads it immediately
  (Telegram file links expire after ~1 hour) to
  `uploads/feed-media/{channelId}/{messageId}_{index}.{ext}`. Photos become
  `.jpg`; video extensions come from a mime map (fallback `.bin`).
  Telegram slow-down pauses are retried with backoff. KOL messages never
  download.
- Path rules
  (`apps/ingestion-telegram/src/feed-media/infrastructure/feed-path-builder.ts`):
  builds, parses, and validates paths; sanitizes channel ids and blocks
  path-traversal; rewrites both legacy prefixes (`crypto-news/media` and
  `feed/media`) to `feed-media` for old rows.
- Serve
  (`apps/ingestion-telegram/src/feed-media/api/http/media.controller.ts`):
  `GET /api/media/:channelId/:messageId/:index` streams the file with 1-year
  cache headers. Finds the file by `{messageId}_{index}.*` glob — never reads
  the stored `file_path`. Looks in the unified home first, then falls back to
  the legacy segments (`feed/media/`, `crypto-news/media/`), logging one
  `media:serve:fallback` warn line per fallback hit so the rollout tail stays
  visible. Bad ids → 400, missing → 404. Public (keyless).
- Wiring (`apps/ingestion-telegram/src/feed-media/media.module.ts`): registers the
  controller; the downloader is provided globally by `SharedModule`.

Classes and technical names (plain explanations):

- `MediaModule` — wiring box (controller; downloader comes from the global
  `SharedModule`).
- `MediaController extends BaseMediaHttpServer` — the HTTP waiter (validates,
  finds by pattern, streams with cache headers).
- `MediaDownloaderService extends BaseTelegramMediaDownloader` — the saver
  (`download(client, channelId, messageId, index, media)` → `{filePath,
mimeType, fileSize}`).
- `FeedPathBuilder extends BaseMediaPathBuilder` — the address book
  (`buildMediaPath`, `getMediaDirectory`, `parseMediaPath`,
  `rewriteMediaFilePathPrefix`).
- `DownloadedMedia` — the `{filePath, mimeType, fileSize}` receipt.

## 7. Avatar — channel profile photos (`src/avatar/`)

In plain words: saves each channel's small profile picture once, hands it
back over HTTP, and is deliberately permanent — the 24-hour janitor never
touches it. Since central todo 12 this covers channels of EVERY kind
(news included, not just tips), files are named with the handle, and a
backfill endpoint catches up rows registered before avatars existed.

What it does and how:

- Fetch-once
  (`apps/ingestion-telegram/src/avatar/kol-avatar.service.ts`): when ANY
  source is registered, downloads the channel's profile photo exactly once (a
  stored file means "already fetched"). The ONLY re-downloads are the explicit
  manual refresh and the backfill below. No periodic loop. Telegram/DB trouble
  never throws: a miss serves a placeholder and retries later via refresh.
- File names (`apps/ingestion-telegram/src/avatar/avatar.constants.ts`):
  `{channelId}__{handle}.jpg` once the handle is known, legacy bare
  `{channelId}.jpg` otherwise. Old files are renamed lazily (and colliding
  pairs deduped to one file) without ever re-downloading; serving finds any
  variant.
- Backfill: `POST /api/kol-avatar/backfill` walks every source row and
  fetches only the ones with no file (serialized, never throws; returns
  `{checked, fetched, cached, placeholder}`).
- Telegram fetch
  (`apps/ingestion-telegram/src/avatar/mtproto-avatar-photo.adapter.ts`):
  resolves the channel and calls `downloadProfilePhoto` inside the flood-wait
  guard. Any failure → `null` + warn log.
- Serve (`apps/ingestion-telegram/src/avatar/kol-avatar.controller.ts`):
  `GET /api/kol-avatar/:channelId` returns the stored `.jpg` (1-year cache)
  or an inline grey `?` placeholder SVG (1-hour cache, HTTP 200) when no photo
  was ever fetched. Never 404s. `POST /api/kol-avatar/:channelId/refresh`
  (optional `?handle=` to name the file) forces one guarded re-download
  (needs the API key when one is set).
- Every row of `GET /api/feed/sources` carries
  `avatarUrl: /api/kol-avatar/:channelId` (built by `kolAvatarUrlFor` in
  `apps/ingestion-telegram/src/avatar/avatar.constants.ts`) — always servable —
  plus `url: https://t.me/<handle>` (NULL without a handle).
- Wiring (`apps/ingestion-telegram/src/avatar/avatar.module.ts`, imported by
  `RetentionModule`): controller + service + photo-port binding; reuses
  `SharedModule` (no own MTProto client or limiter).
- DEPRECATED (P58): ownership moved to `metadata/` (§10). These three
  routes keep serving identical bytes but now carry `Deprecation: true` +
  `Sunset` + `Link: </api/metadata/:channelId/avatar>;
rel='successor-version'` headers (the only behavior change). Deletion
  after staging is green — new callers use `GET
/api/metadata/:channelId/avatar`.

Classes and technical names (plain explanations):

- `AvatarModule` — wiring box.
- `KolAvatarService` — the librarian (`fetchOnce`, `refresh`,
  `hasAvatar`/`avatarFilePath`/`avatarDir`/`avatarUrlFor`; statuses
  `KolAvatarFetchStatus = 'fetched' | 'cached' | 'placeholder'`).
- `KolAvatarPhotoPort` — the plug interface
  (`apps/ingestion-telegram/src/avatar/kol-avatar-photo.port.ts`):
  `fetchChannelPhoto(channelId)` → photo bytes or "no photo", never throws.
- `MtprotoAvatarPhotoAdapter extends KolAvatarPhotoPort` — the Telegram hands.
- `KolAvatarController` — the HTTP waiter (photo or placeholder; refresh →
  201 outcome).
- Constants/helpers (`avatar.constants.ts`): `KOL_AVATAR_DIR_NAME`
  (`'avatar'`), `KOL_AVATAR_FILE_EXTENSION` (`'.jpg'`), content types,
  placeholder SVG, `kolAvatarUrlFor`, `sanitizeAvatarChannelId`.

## 8. Shared foundation — locks, settings, toolbox (`src/shared/`)

In plain words: the building's infrastructure — front-door locks, the settings
binder, the logbook desk, the shared toolbox, and the mail-sorting table.
None of them handle Telegram messages directly; they serve the parts that do.

- Front-door locks (`src/shared/common/auth/`): `ApiKeyGuard`
  (`apps/ingestion-telegram/src/shared/common/auth/api-key.guard.ts`) — when
  `INGESTION_API_KEY` is set, sensitive requests need it in the `x-api-key`
  header (legacy `?apiKey=` still works, deprecated) or get 401; unset means
  warn-once and allow-all (dev convenience). Public doors: the three health
  probes, `GET /api/media/*`, single-photo avatar reads. `RateLimitGuard`
  (`apps/ingestion-telegram/src/shared/common/auth/rate-limit.guard.ts`) —
  two buckets per visitor (60/min protected+writes, 300/min photo reads; 429
  with retry headers). In-memory counters by design. `access-audit.ts`
  (`apps/ingestion-telegram/src/shared/common/auth/access-audit.ts`) — one
  structured log line per allow/deny (`stripQueryForAudit` /
  `buildAccessAuditLine`); the query string is always cut before logging so
  keys never reach log files.
- Settings binder
  (`apps/ingestion-telegram/src/shared/common/config/app.config.ts`):
  `appConfig` (registered as `'app'`) gathers env vars, fills gaps from
  `config/ingestion.config.json`, validates shapes. Highlights: the Telegram
  login triple, the port rule (`INGESTION_PORT` > `INGESTION_API_PORT` >
  `PORT` > `3031`), Redis, uploads root, anti-ban knobs, database toggle, the
  72-hour retention window, the optional API key, `TRUST_PROXY`, baked-in
  `IMAGE_REVISION`.
- Fast-memory helper
  (`apps/ingestion-telegram/src/shared/common/cache/redis.service.ts`):
  `RedisService` — lazy Redis connection with reconnect backoff and a circuit
  breaker (5 failures → quiet empty answers, recovery probe every 60 s). Owns
  no keys itself; the read bookmarks pass through it.
- Logbook desk (`src/shared/common/logging/`):
  `StructuredLoggerService`
  (`apps/ingestion-telegram/src/shared/common/logging/structured-logger.service.ts`)
  writes JSON (Pino) lines with an `event` name: `message:received`,
  `sse:client:connected/disconnected`, `flood_wait:detected`,
  `media:download:success/failed`, `mtproto:connection:changed`,
  `auth:access:decision`, `service:started/shutdown`.
- Shared toolbox (`src/shared/media/`): reusable photo/file blocks —
  `BaseMediaPathBuilder` (scrubbed paths that cannot escape uploads root),
  `BaseFileSystemAdapter` (write/read/stream/stat/exists/delete/find),
  `BaseMediaHttpServer` (file streaming with cache headers + ready-made
  404/400/500 answers), `BaseTelegramMediaDownloader` (fixed 7-step
  fetch recipe), `BaseMediaRetentionPolicy` (walk-and-delete template),
  `MimeTypeResolver` (mime ↔ extension both ways), `PathSanitizer`
  (id/filename scrubbing, traversal checks).
- Mail-sorting table (`src/shared/transformation/`): turns a raw
  GramJS message into a clean `TransformedMessage` via a fixed 4-step recipe
  (pull text → pull media metadata → normalize markers → copy link-preview
  card). `FeedTextExtractor` / `KolTextExtractor` (4-source text cascade),
  `TelegramMediaExtractor` (video-first photo picker; webpage previews
  skipped), `TelegramEntityNormalizer` (Telegram class names → plain strings),
  `FeedMessageTransformer` / `KolMessageTransformer` (assemblers).

## 9. Health, metrics, debug

- Fire-alarm panel (`src/health/`): `HealthController`
  (`apps/ingestion-telegram/src/health/api/http/health.controller.ts`, wired
  by `apps/ingestion-telegram/src/health/health.module.ts`) answers
  `GET /api/health` (full status: `ok` only when Telegram is connected AND
  authorized, else `degraded`; HTTP 200/503), `GET /api/health/ready`
  (readiness + listener count), `GET /api/health/live` (liveness + uptime),
  `GET /api/health/channels` (watch-list peek, API key). No inputs.
- Gauges on the wall (`src/metrics/`): `MetricsService`
  (`apps/ingestion-telegram/src/metrics/metrics.service.ts`, wired by
  `apps/ingestion-telegram/src/metrics/metrics.module.ts`, exposed by
  `apps/ingestion-telegram/src/metrics/api/http/metrics.controller.ts` at
  `GET /metrics`, API key) defines 13 Prometheus instruments. Honest caveat:
  nothing currently feeds most of them, so most read 0 — the endpoint works,
  the numbers are mostly idle. Recipes in `src/metrics/README.md`.
- Inspection window (`src/debug/`): `DebugTelegramController`
  (`apps/ingestion-telegram/src/debug/debug-telegram.controller.ts`) —
  `GET /debug/telegram/message/:channelId/:messageId` fetches ONE live message
  from Telegram and shows its text fields, media summary, markers, and album
  id (API key; debug only, not for monitoring).

## 10. Metadata — channel identity per id (`src/metadata/`)

In plain words: one identity card per Telegram channel. It stores what
`client.getEntity(id)` knows about each id — kind, handle, photo, public
link, type — plus the permanent profile photo, and hands both out over
HTTP. It absorbed the avatar area (§7, now a deprecated shim with
identical bytes). The registry (§3) keeps only subscription state
(active/type) and mirrors identity here on every write.

What it does and how:

- Identity card (`apps/ingestion-telegram/src/metadata/channel-metadata.entity.ts`):
  one row per Telegram id in `telegram_channel_metadata` — `channel_id`
  (key), `peer_type` (`user|chat|channel`, NULL when unresolved),
  `kind` (`channel|supergroup|group|user|bot|unknown`), `title`,
  `first_name`/`last_name` (user rows), `handle` + `usernames`, `about`,
  `is_bot`/`verified`/`is_scam`/`is_fake`, `participants_count`,
  `avatar_path`/`avatar_updated_at` + photo change-detection refs,
  `fetch_status` (`ok|min|miss|flood`). The `phone` column (user rows)
  is stored but NEVER exposed: excluded from every repository read
  (`select: false`), absent from every view and log, with no index.
- Taxonomy (`apps/ingestion-telegram/src/metadata/metadata-kind.ts`):
  `classifyMetadataKind` (GramJS `className` + `bot` flag, no title
  heuristics), `peerTypeForKind` (fine → coarse projection),
  `isSubscribableMetadataKind` (channels/groups only; users/bots/unknown
  rejected with an explicit error).
- Photo fetch-serve, absorbed from avatar
  (`apps/ingestion-telegram/src/metadata/metadata.service.ts` +
  `mtproto-metadata-photo.adapter.ts` via `metadata-photo.port.ts`):
  fetch-once per id (a stored file means "already fetched"), explicit
  refresh only, no periodic loop; one serialized promise tail + the shared
  flood-wait guard (`metadata-photo` label, P29 reuse); legacy bare +
  `@handle`-qualified filenames with single-file dedupe; MTProto miss →
  placeholder, never a throw. Bookkeeping writes the metadata row and
  mirrors the registry row (dual-write).
- Registry mirror entry: `MetadataService.adoptRegistryRow(channelId,
fields)` — called by register/batch/PATCH (fire-and-forget,
  best-effort). Existing rows merge; a NULL mirror never clears a stored
  phone. `backfillMissing` adopts every registry row and fetches only
  missing photos.
- Read-only consumers: feed/stream/media/core project through
  `ChannelMetadataView` (never `phone`, never disk paths) or
  `MetadataRepository` reads. The SSE enrichment looks metadata up first
  and falls back to the registry mirror.

HTTP APIs (served by `MetadataController` at `/api/metadata`; POSTs need
the API key when one is set):

| Method + path                                     | Input               | Output                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/metadata/:channelId` — identity         | none                | 200 + identity view (`channelId`, `peerType`, `kind`, `title`, names, `handle`, `usernames`, `about`, flags, `participantsCount`, `url`, `avatarUrl`, `fetchStatus`); never `phone`. 404 unknown |
| `GET /api/metadata/:channelId/avatar` — photo     | none                | Canonical avatar serve (successor of `GET /api/kol-avatar/:channelId`): stored `.jpg` (1-year cache) or placeholder SVG (200); 400 hostile id                                                    |
| `POST /api/metadata/:channelId/refresh` — refresh | Optional `?handle=` | 201 + fresh identity view (re-resolve + photo re-fetch)                                                                                                                                          |
| `POST /api/metadata/backfill` — catch-up          | none                | 201 + `{ checked, fetched, cached, placeholder }`                                                                                                                                                |

Classes and technical names (plain explanations):

- `MetadataModule` — wiring box (imports `SharedModule`; imported by
  `RetentionModule` + `AppModule`).
- `MetadataService` — the librarian (identity resolve/refresh/mirror +
  avatar fetch-serve; statuses `MetadataAvatarStatus = 'fetched' |
'cached' | 'placeholder'`).
- `MetadataRepository` — the shelf (`findByChannelId`, `findAll`,
  `create`, `save`; fail-open reads; `phone` excluded by the entity).
- `MetadataPhotoPort` — the plug interface
  (`apps/ingestion-telegram/src/metadata/metadata-photo.port.ts`):
  `fetchChannelPhoto(channelId)` → photo bytes or "no photo", never throws.
- `MtprotoMetadataPhotoAdapter extends MetadataPhotoPort` — the Telegram hands.
- `MetadataController` — the HTTP waiter.
- Constants/helpers (`metadata.constants.ts`): single-owner re-exports of
  the avatar constants, `metadataAvatarUrlFor`,
  `avatarDeprecationHeaders` (`Deprecation`/`Sunset`/`Link`).
