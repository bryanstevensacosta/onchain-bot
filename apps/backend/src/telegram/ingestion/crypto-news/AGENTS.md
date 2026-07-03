# crypto-news/ — Crypto News Ingestion BC

## OVERVIEW

Crypto-news is a sub-BC of `telegram/ingestion` that listens to a curated list of crypto-news Telegram channels (different surface from KOL alpha channels) and persists incoming messages as raw, opaque news items. News content is intentionally **opaque to the alpha pipeline** — no extraction, no parsing, no token detection. The dashboard just renders title, body, timestamp, and downloaded photo attachments for human readers.

It coexists with the sibling KOL ingestion path in `telegram/ingestion/kol/` and reuses the same `TelegramMtprotoListenerAdapter` (MTProto), the same `FloodWaitHandlerService`, and the same MTProto session. The split exists because news channels produce different artefacts (mostly text + photos, occasionally videos) and run a different domain model — `CryptoNewsSource` (aggregate) + `CryptoNewsMessage` (record) + `CryptoNewsMedia` (VO), none of which is an alpha call.

Distinct from `telegram/vip-calls-channel` (which **publishes** approved token calls via Bot API) and from `telegram/ingestion/kol` (which feeds the extraction→parsing→... token pipeline). Crypto-news only writes; it never publishes. It is the read side of a Telegram-side mirror of curated news, served to the dashboard via the `/api/crypto-news/*` endpoints.

## STRUCTURE

Standard per-BC hexagonal layout (mandatory across the project).

```
crypto-news/
├── api/
│   └── http/
│       └── crypto-news.controller.ts            # GET /crypto-news/messages|sources|backfill|media
├── application/
│   ├── handlers/
│   │   ├── register-news-source.use-case.ts    # Upserts a CryptoNewsSource aggregate
│   │   └── store-news-message.use-case.ts      # Persists one ingested message (+ emits event)
│   └── ports/
│       ├── crypto-news-source.repository.ts    # Port for CryptoNewsSource
│       ├── crypto-news-message.repository.ts   # Port for CryptoNewsMessage + media lookup
│       ├── crypto-news-event.publisher.ts      # Port for domain event publishing
│       └── crypto-news-media-downloader.port.ts # Port for MTProto media download
├── domain/
│   ├── entities/
│   │   ├── crypto-news-source.entity.ts        # AggregateRoot, lifecycle ACTIVE/INACTIVE
│   │   └── crypto-news-message.entity.ts      # Plain record (no events from here)
│   ├── value-objects/
│   │   └── crypto-news-media.vo.ts             # VO: index, type, filePath, mimeType, fileSize
│   └── events/
│       ├── crypto-news-source-seeded.event.ts  # Emitted on source registration
│       └── crypto-news-message-ingested.event.ts # Emitted on message persist (metadata only)
├── infrastructure/
│   ├── api/mtproto/
│   │   └── mtproto-media-downloader.ts         # Adapter: downloadMedia + flood-wait retry
│   ├── persistence/typeorm/
│   │   ├── entities/
│   │   │   ├── crypto-news-source.entity.ts       # @Entity('crypto_news_sources')
│   │   │   ├── crypto-news-message.entity.ts      # @Entity('crypto_news_messages')
│   │   │   └── crypto-news-message-media.entity.ts # @Entity('crypto_news_message_media') [L3 nested]
│   │   ├── mappers/                                 # domain ⇄ ORM
│   │   └── repositories/                            # TypeOrm repos
│   ├── repositories/                              # In-memory repos (DATABASE_ENABLED=false)
│   ├── seeds/
│   │   └── crypto-news.seed.ts                   # Static fallback list of news channels
│   └── seeders/
│       └── crypto-news.seeder.ts                 # Idempotent bootstrap-time registration
└── crypto-news-ingestion.module.ts              # Wires ports, use cases, repos, downloader
```

## WHERE TO LOOK

| Task                                    | Location                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Find media downloader (port)            | `application/ports/crypto-news-media-downloader.port.ts`                          |
| Find media downloader (MTProto adapter) | `infrastructure/api/mtproto/mtproto-media-downloader.ts`                          |
| Find message store use case             | `application/handlers/store-news-message.use-case.ts`                             |
| Find source register use case           | `application/handlers/register-news-source.use-case.ts`                           |
| Find API controller                     | `api/http/crypto-news.controller.ts`                                              |
| Find seeder                             | `infrastructure/seeders/crypto-news.seeder.ts`                                    |
| Find static seed list                   | `infrastructure/seeds/crypto-news.seed.ts`                                        |
| Find source/message repo ports          | `application/ports/crypto-news-{source,message}.repository.ts`                    |
| Find domain event payload               | `domain/events/crypto-news-message-ingested.event.ts`                             |
| Find media persistence shape            | `infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity.ts` |
| Find NestJS module wiring               | `crypto-news-ingestion.module.ts`                                                 |

## CODE MAP

| Symbol                                | Type                               | Location                                                                             | Role                                                                               |
| ------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `CryptoNewsSource`                    | class (AggregateRoot)              | `domain/entities/crypto-news-source.entity.ts:34`                                    | Aggregate: ACTIVE/INACTIVE, holds channelId + handle + title                       |
| `CryptoNewsSourceLifecycleStatus`     | type                               | `domain/entities/crypto-news-source.entity.ts:12`                                    | `'ACTIVE' \| 'INACTIVE'` discriminator                                             |
| `CryptoNewsMessage`                   | class                              | `domain/entities/crypto-news-message.entity.ts:31`                                   | Plain record (no events, no invariants beyond create-time validation)              |
| `CryptoNewsMedia`                     | class (ValueObject)                | `domain/value-objects/crypto-news-media.vo.ts:29`                                    | Per-photo VO; carries `index`, `type: 'photo'`, `filePath`, `mimeType`, `fileSize` |
| `StoreNewsMessageUseCase`             | class                              | `application/handlers/store-news-message.use-case.ts:31`                             | Persists a message and emits `CryptoNewsMessageIngestedEvent` (no content)         |
| `RegisterNewsSourceUseCase`           | class                              | `application/handlers/register-news-source.use-case.ts`                              | Upserts a `CryptoNewsSource` aggregate                                             |
| `CryptoNewsMediaDownloader`           | abstract class                     | `application/ports/crypto-news-media-downloader.port.ts:35`                          | Outbound port: download one attachment, return `DownloadedMedia`                   |
| `DownloadedMedia`                     | interface                          | `application/ports/crypto-news-media-downloader.port.ts:11`                          | `{ filePath, mimeType, fileSize }` payload                                         |
| `MtprotoMediaDownloader`              | class                              | `infrastructure/api/mtproto/mtproto-media-downloader.ts:44`                          | Adapter: `client.downloadMedia` + flood-wait + fileReference refresh + 10MB cap    |
| `CryptoNewsMessageMediaEntity`        | class (@Entity)                    | `infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity.ts:34` | L3 nested table; FK CASCADE on parent message                                      |
| `CryptoNewsMessageIngestedEvent`      | class (DomainEvent)                | `domain/events/crypto-news-message-ingested.event.ts:14`                             | Metadata-only event; carries channelId/messageId/title/occurredAt                  |
| `CryptoNewsSourceSeededEvent`         | class (DomainEvent)                | `domain/events/crypto-news-source-seeded.event.ts`                                   | Emitted on source registration (registration fact, no state mutation)              |
| `CryptoNewsSeeder`                    | class                              | `infrastructure/seeders/crypto-news.seeder.ts:24`                                    | Idempotent bootstrap-time channel registration                                     |
| `CryptoNewsController`                | class (@Controller('crypto-news')) | `api/http/crypto-news.controller.ts:66`                                              | GET `/messages`, `/messages/:id`, `/sources`, `/backfill/:channelId`, `/media/:id` |
| `CryptoNewsIngestionModule`           | class (@Module)                    | `crypto-news-ingestion.module.ts:135`                                                | Wires ports, use cases, repos, downloader, controller                              |
| `InMemoryCryptoNewsMessageRepository` | class                              | `infrastructure/repositories/in-memory-crypto-news-message.repository.ts`            | Default repo (dev/tests, DATABASE_ENABLED=false)                                   |
| `InMemoryCryptoNewsSourceRepository`  | class                              | `infrastructure/repositories/in-memory-crypto-news-source.repository.ts`             | Default repo for sources                                                           |

## CONVENTIONS

- **News content is opaque**: no extraction, no parsing, no ticker/CA detection. Raw `content` is stored as-is in `crypto_news_messages.content` and only the dashboard reads it. Do not bolt token detection onto this BC.
- **Raw content never crosses the event bus** (fix-1, Bot Dev ToS §4.3): `StoreNewsMessageUseCase` writes `content` to the DB but the emitted `CryptoNewsMessageIngestedEvent` payload carries only metadata (`channelId`, `messageId`, `title`, `occurredAt`). Event consumers read the repo if they need body.
- **Media is downloaded synchronously at ingestion time**: Telegram's `fileReference` expires after ~1h. Every photo a listener observes is downloaded inside `TelegramMtprotoListenerAdapter` (in `telegram/ingestion/shared/`) before the message leaves the listener. No deferred download, no cron rehydration.
- **Channel-id sanitisation for path safety**: `MtprotoMediaDownloader` strips any character outside `[A-Za-z0-9_-]` from `channelId` before joining it into the on-disk path (defeats `@`/`.`/`/` path traversal).
- **Default to in-memory repo unless `DATABASE_ENABLED=true`**: the module wires TypeORM repos behind a `useFactory` that checks `app.database.enabled` at runtime; missing = in-memory. Tests force `true` via `jest.setup.ts`.
- **No NestJS module imports from `kol/`**: cross-BC dependencies (e.g. `RegisterKolUseCase`) are resolved through DI, not via `imports`. The note in `crypto-news-ingestion.module.ts:38-41` documents this contract.

## ANTI-PATTERNS

- **Never store raw Telegram text in event payloads** (fix-1). `CryptoNewsMessageIngestedEvent.toPayload()` strips `content` deliberately. Do not "improve" by re-adding it.
- **Never include `filePath`, `fileReference`, or any `TelegramMediaAttachment` field in event payloads.** These cross no boundaries — they exist on the listener side and on the persisted `CryptoNewsMedia` only.
- **Never bypass `FloodWaitHandlerService` for media downloads.** Every `client.downloadMedia()` call in `MtprotoMediaDownloader` is wrapped with `floodWaitHandler.withRetry('media-download', ...)`. Same wrap on the fileReference refresh path.
- **Never store media outside the configured `UPLOADS_ROOT`.** Resolve via `AppConfig.uploadsRoot`, falling back to `<cwd>/uploads`. Anything else breaks the Docker volume bind-mount and the prod-side cleanup story.
- **Never register a source without invoking `registerNewsSource.execute(...)`.** The aggregate emits `CryptoNewsSourceSeededEvent` from inside `CryptoNewsSource.create()`; bypassing the use case skips the event (and downstream observers).
- **Never mutate `lifecycleStatus`/`isActive` from outside the aggregate.** Use `source.activate()` / `source.deactivate()` — they keep both fields consistent.

## UNIQUE STYLES

- **Synchronous media download**: the file path is resolved **before** the message persists. This is the only place in the project where a Telegram attachment is materialised to disk on the ingestion hot path rather than lazily.
- **`TelegramMediaAttachment` carries post-download fields**: `fileReference`, `fileId`, `accessHash` are filled in by the shared listener after `MtprotoMediaDownloader.download()` returns. The port definition in `telegram/ingestion/shared/domain/ports/telegram-listener.port.ts` is the source of truth.
- **L3 nested media table with FK CASCADE**: `crypto_news_message_media` is a dedicated join table keyed on the parent message's UUID PK with `onDelete: 'CASCADE'` declared on `@ManyToOne` (not `@JoinColumn`, because TypeORM 0.3.30's `JoinColumnOptions` rejects `onDelete`). Deleting a parent message atomically removes its media rows in the DB; missing FK-level cascade was a known gap (G-7).
- **Idempotent seeder**: `CryptoNewsSeeder.seed()` activates pre-existing sources and skips CONFLICTs instead of throwing. Re-runs are safe; new channels appear without manual intervention.
- **Event payload split**: persisted shape vs. event shape are deliberately different. DB holds `content`; event omits it. This is the same fix-1 discipline as the KOL path, applied differently because news content is read-only (no further pipeline) yet still subject to ToS §4.3.

## COMMANDS

```bash
# Run apps/backend tests covering crypto-news
npm run test:backend -- --testPathPattern=crypto-news

# Generate MTProto session string (required before any telegram ingestion)
npm run telegram:gen-session

# Database migrations (idempotent)
npm run db:migrate

# Standalone backfill scripts (idempotent, date-prefixed)
ls apps/backend/scripts/backfills/   # 2026-06-26-* etc.
# Example: re-run the kol-title-handle resolve job if needed
npx ts-node apps/backend/scripts/backfills/2026-06-26-kol-title-handle-resolve.ts
```

The crypto-news BC has no dedicated CLI beyond the standard `start:dev` / `test:backend` workflows. On-demand backfill of one source's recent history is exposed via `GET /api/crypto-news/backfill/:channelId?limit=N` (max 100).

## NOTES

- **Production Docker volume caveat**: in the prod compose file the uploads directory is typically a Docker volume that does **not survive `docker compose build --no-cache`** without an explicit `volumes:` declaration in `docker-compose.prod.yml`. Photos go missing on full rebuilds; the API returns 404 (`Media file missing on disk`) rather than 500. Treat uploads as volatile across rebuilds.
- **File size cap**: `MAX_MEDIA_BYTES = 10 * 1024 * 1024` in `mtproto-media-downloader.ts:19`. Anything larger is logged + discarded without a write. Raise the cap with care — Telegram MTProto chunks return memory buffers.
- **Supported MIME types**: JPEG (`image/jpeg`), PNG (`image/png`), GIF (`image/gif`), WebP (`image/webp`). All others fall back to `application/octet-stream` and `.bin` extension; the API falls back to the file extension when serving. Detection is magic-byte sniffing on the first bytes of the downloaded buffer, not the Telegram-declared MIME.
- **Only photos for now**: `CryptoNewsMediaType = 'photo'` is the only allowed discriminator. Videos, stickers, voice notes, and document attachments are intentionally not modelled per plan scope guardrails.
- **Channel registration requires the session-user to already be a member.** The seeder auto-attempts `joinChannel(channelId)` on miss; failures show up as `Telegram channel ${channelId}` placeholder titles and increment `needsManualJoin`.
- **Ingestion toggles**: `app.ingestion.telegram.newsSeed.enabled` gates the seeder. Env-supplied channels (`app.ingestion.telegram.newsSeed.channels`) take precedence over the in-code list at `infrastructure/seeds/crypto-news.seed.ts`.
- **Coexists with KOL ingestion on the same MTProto client.** The shared `TelegramMtprotoListenerAdapter` subscribes to both KOL and crypto-news sources after both seeders complete (sequence is wired in `telegram/ingestion/shared/`).
