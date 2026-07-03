# telegram/ — Telegram Integration (3 Sub-Modules)

## OVERVIEW

Three Telegram integrations split for ToS compliance: MTProto listener (read-only, ingestion — covers KOL channels + crypto-news channels) and Bot API publisher (write, vip-calls) + ChainDexter bot (hybrid). Crypto-news is distinct from KOL: KOL feeds the alpha token pipeline (extraction→parsing→...), while crypto-news is opaque content (no token extraction) for general market intel. Never mix protocols in one adapter.

## STRUCTURE

| Sub-Module           | Protocol | Purpose                                                                              |
| -------------------- | -------- | ------------------------------------------------------------------------------------ |
| `ingestion/`         | MTProto  | Listens to KOL channels via MTProto, feeds raw messages to pipeline                  |
| `crypto-news/`       | MTProto  | Reads crypto-news channels, persists raw messages + media (photos) for the dashboard |
| `vip-calls-channel/` | Bot API  | Publishes approved tokens to VIP channel via Bot API                                 |
| `chain-dexter-bot/`  | Bot API  | Secondary bot with command handlers, configurable ingest (webhook/polling)           |

## WHERE TO LOOK

| Task                              | File/Location                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| Generate MTProto session          | `npm run telegram:gen-session` (root)                                                     |
| Find MTProto listener adapter     | `telegram/ingestion/api/mtproto/telegram-mtproto-listener.adapter.ts`                     |
| Find Bot API publisher            | `telegram/vip-calls-channel/infrastructure/senders/bot-api-telegram-publisher.adapter.ts` |
| Find event handler for publishing | `telegram/vip-calls-channel/infrastructure/event-bus/token-approved-publish.handler.ts`   |
| Add ChainDexter command           | `telegram/chain-dexter-bot/application/handlers/commands/`                                |
| Find bug-exploration tests        | `telegram/vip-calls-channel/infrastructure/event-bus/*-bug-exploration.spec.ts`           |
| Find crypto-news BC               | `telegram/ingestion/crypto-news/AGENTS.md` (L3 sub-module docs)                           |

## CODE MAP

| Symbol                            | Location                                                                                                         | Role                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `TelegramMtprotoListenerAdapter`  | `telegram/ingestion/api/mtproto/telegram-mtproto-listener.adapter.ts`                                            | MTProto listener, connects to KOL channels                                 |
| `BotApiTelegramPublisher`         | `telegram/vip-calls-channel/infrastructure/senders/bot-api-telegram-publisher.adapter.ts`                        | Bot API sender for VIP channel                                             |
| `KolIngestionOrchestratorUseCase` | `telegram/ingestion/application/kol-ingestion-orchestrator.use-case.ts`                                          | Orchestrates raw message flow (also referenced from kol/)                  |
| `vip-calls module`                | `telegram/vip-calls-channel/vip-calls.module.ts`                                                                 | Wires publishing pipeline                                                  |
| `chain-dexter-bot module`         | `telegram/chain-dexter-bot/chain-dexter-bot.module.ts`                                                           | Wires ChainDexter commands                                                 |
| `CryptoNewsMediaDownloader`       | `telegram/ingestion/crypto-news/application/ports/crypto-news-media-downloader.port.ts`                          | Port: downloads Telegram photos synchronously at ingestion                 |
| `MtprotoMediaDownloader`          | `telegram/ingestion/crypto-news/infrastructure/api/mtproto/mtproto-media-downloader.ts`                          | Adapter: FloodWait + sanitization + MIME detection                         |
| `CryptoNewsMessageMediaEntity`    | `telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity.ts` | TypeORM entity for the `crypto_news_message_media` table (L3 nested media) |

## CONVENTIONS

- **MTProto for reading**: Ingestion uses `telegram` npm package with MTProto. Session in `TELEGRAM_MTPROTO_SESSION` env var.
- **Bot API for writing**: Both vip-calls and ChainDexter use Bot API (separate tokens). Never use MTProto to publish.
- **Never share adapters between bots**: Each bot has its own adapter (vip-calls uses BotApiTelegramPublisher, ChainDexter uses ChainDexterBotAdapter).
- **Event-driven publishing**: vip-calls listens to `filters.token.approved`, publishes via Bot API, emits `publishing.telegram.published`.

## ANTI-PATTERNS

- **Never allow ticker=null in publish flow**: Invariant in vip-calls. The handler must reject before reaching the publisher.
- **Never query external providers in bug-exploration.spec.ts context**: These test files isolate invariants. External calls break the test's purpose.
- **Never "fix" bug-exploration.spec.ts files**: Files like `token-approved-publish-ticker-bug-exploration.spec.ts` encode future-fix invariants. They document expected behavior post-fix, not current bugs.
- **Never store Telegram media bytes inside container-only paths without a volume**: photos downloaded by the crypto-news listener persist in `uploads/crypto-news/media/...`. Without a mounted volume on `docker-compose.prod.yml`, every `build --no-cache` wipes them.

## UNIQUE STYLES

- **Dual-protocol split**: Read-only MTProto vs write-only Bot API, enforced at the adapter level.
- **Bug-exploration.spec.ts as living docs**: Tests in `vip-calls-channel/infrastructure/event-bus/` serve as executable documentation of future invariants.
- **Large preservation specs**: Some specs exceed 700 lines to capture edge cases.
- **Crypto-news has a nested media table (`crypto_news_message_media`)** with `@ManyToOne(onDelete: 'CASCADE')` so media rows are removed automatically when their parent message is deleted.
- **Media download is synchronous** — the filePath is resolved before the message persists because Telegram's `fileReference` expires within roughly an hour.

## COMMANDS

```bash
# Generate MTProto session string (required for ingestion)
npm run telegram:gen-session
```

## NOTES

- MTProto session is single source of truth. Regenerating loses all state.
- Bot API tokens configured in `AppConfig.publishing.telegram.vipCalls` and `.chainDexterBot`.
- ChainDexter ingest mode configured via `chainDexterBot.ingestMode` (webhook or polling).
- Test files at `vip-calls-channel/infrastructure/event-bus/*-bug-exploration.spec.ts` encode invariants, not bugs to fix.
