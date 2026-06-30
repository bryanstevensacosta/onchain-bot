# telegram/ — Telegram Integration (3 Sub-Modules)

## OVERVIEW

Three Telegram integrations with a critical split for ToS compliance: MTProto listener (read-only, ingestion) and Bot API publisher (write, vip-calls) + ChainDexter bot (hybrid). Never mix protocols in one adapter.

## STRUCTURE

| Sub-Module | Protocol | Purpose |
|------------|----------|---------|
| `ingestion/` | MTProto | Listens to KOL channels via MTProto, feeds raw messages to pipeline |
| `vip-calls-channel/` | Bot API | Publishes approved tokens to VIP channel via Bot API |
| `chain-dexter-bot/` | Bot API | Secondary bot with command handlers, configurable ingest (webhook/polling) |

## WHERE TO LOOK

| Task | File/Location |
|------|----------------|
| Generate MTProto session | `npm run telegram:gen-session` (root) |
| Find MTProto listener adapter | `telegram/ingestion/api/mtproto/telegram-mtproto-listener.adapter.ts` |
| Find Bot API publisher | `telegram/vip-calls-channel/infrastructure/senders/bot-api-telegram-publisher.adapter.ts` |
| Find event handler for publishing | `telegram/vip-calls-channel/infrastructure/event-bus/token-approved-publish.handler.ts` |
| Add ChainDexter command | `telegram/chain-dexter-bot/application/handlers/commands/` |
| Find bug-exploration tests | `telegram/vip-calls-channel/infrastructure/event-bus/*-bug-exploration.spec.ts` |

## CODE MAP

| Symbol | Location | Role |
|--------|----------|------|
| `TelegramMtprotoListenerAdapter` | `telegram/ingestion/api/mtproto/telegram-mtproto-listener.adapter.ts` | MTProto listener, connects to KOL channels |
| `BotApiTelegramPublisher` | `telegram/vip-calls-channel/infrastructure/senders/bot-api-telegram-publisher.adapter.ts` | Bot API sender for VIP channel |
| `KolIngestionOrchestratorUseCase` | `telegram/ingestion/application/kol-ingestion-orchestrator.use-case.ts` | Orchestrates raw message flow (also referenced from kol/) |
| `vip-calls module` | `telegram/vip-calls-channel/vip-calls.module.ts` | Wires publishing pipeline |
| `chain-dexter-bot module` | `telegram/chain-dexter-bot/chain-dexter-bot.module.ts` | Wires ChainDexter commands |

## CONVENTIONS

- **MTProto for reading**: Ingestion uses `telegram` npm package with MTProto. Session in `TELEGRAM_MTPROTO_SESSION` env var.
- **Bot API for writing**: Both vip-calls and ChainDexter use Bot API (separate tokens). Never use MTProto to publish.
- **Never share adapters between bots**: Each bot has its own adapter (vip-calls uses BotApiTelegramPublisher, ChainDexter uses ChainDexterBotAdapter).
- **Event-driven publishing**: vip-calls listens to `filters.token.approved`, publishes via Bot API, emits `publishing.telegram.published`.

## ANTI-PATTERNS

- **Never allow ticker=null in publish flow**: Invariant in vip-calls. The handler must reject before reaching the publisher.
- **Never query external providers in bug-exploration.spec.ts context**: These test files isolate invariants. External calls break the test's purpose.
- **Never "fix" bug-exploration.spec.ts files**: Files like `token-approved-publish-ticker-bug-exploration.spec.ts` encode future-fix invariants. They document expected behavior post-fix, not current bugs.

## UNIQUE STYLES

- **Dual-protocol split**: Read-only MTProto vs write-only Bot API, enforced at the adapter level.
- **Bug-exploration.spec.ts as living docs**: Tests in `vip-calls-channel/infrastructure/event-bus/` serve as executable documentation of future invariants.
- **Large preservation specs**: Some specs exceed 700 lines to capture edge cases.

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