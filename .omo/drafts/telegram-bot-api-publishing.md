# Draft: Telegram Bot API para Publicación

> **Status: done** — adapter fue implementado en una sesión previa. Draft retenido para trazabilidad.

## Evidence

| Component | Path | Lines |
|---|---|---|
| Bot API adapter | `apps/backend/src/telegram/vip-calls-channel/infrastructure/senders/bot-api-telegram-publisher.adapter.ts` | 256 |
| Module wiring | `apps/backend/src/telegram/vip-calls-channel/vip-calls.module.ts:11,44` (VipCallsBotApiPublisherAdapter, `provide: TelegramPublisherPort, useClass: VipCallsBotApiPublisherAdapter`) | — |
| Config: bot token | `apps/backend/src/shared/common/config/app.config.ts` (`botToken: process.env.TELEGRAM_BOT_TOKEN ?? ''`) | — |
| Config: channel ID | `apps/backend/src/shared/common/config/app.config.ts` (`outputChannel: process.env.PUBLISHING_TELEGRAM_OUTPUT_CHANNEL ?? process.env.VIP_CALLS_OUTPUT_CHANNEL ?? ''`) | — |
| Env file | `apps/backend/.env` has `VIP_CALLS_OUTPUT_CHANNEL=-1004485692803` (matches plan's "Channel ID: 4485692803" prefixed with `-100` per Bot API convention) | — |
| Mtproto in publishing path | **0 hits** — `grep -rln "MtprotoPublishing" apps/backend/src/telegram` returns nothing. MTProto only used in `kol/ingestion/api/mtproto/` for ingestion, never for publishing. | — |

## Implementation details

The adapter implements:
- `sendMessage(chatId, text, imageUrl?)` — public API used by `VipCallsPublishUseCase`
- `sendWithPhoto(chatId, text, imageUrl)` — sends photo with caption (Telegram Bot API `sendPhoto`)
- `splitMessage(text)` — splits long messages at 4096 char Telegram limit
- `sendChunk(chatId, chunk)` / `sendPhotoChunk(chatId, caption, imageUrl)` — low-level HTTP calls
- Token resolution: reads `TELEGRAM_BOT_TOKEN` from ConfigService
- Channel resolution: reads `PUBLISHING_TELEGRAM_OUTPUT_CHANNEL` (with `VIP_CALLS_OUTPUT_CHANNEL` fallback)

ToS compliance: no MTProto calls in publishing path. MTProto is exclusively in `kol/ingestion/` for listening to source channels (allowed by Telegram ToS).

## Known gaps (not in original scope)

- No unit specs for `BotApiTelegramPublisherAdapter` (256 lines, untested in isolation). Coverage comes indirectly via integration tests once a real channel is wired.
- No specs for `VipCallsPublishUseCase` either — full module lacks test coverage. Out of scope for this draft; tracked separately.

## Original Requirements (all met)

- **MTProto**: Solo para lectura/ingestión ✅ (unchanged in `kol/ingestion/`)
- **Bot Token**: Solo para envío al canal de output ✅
- **Un solo canal**: OUTPUT_CHANNEL_ID en .env ✅
- **No violar ToS**: Sin MTProto para envío ✅ (verified by grep)

## Decisiones Técnicas
- Crear `BotApiTelegramPublisherAdapter` nuevo adapter HTTP
- Usar `TELEGRAM_BOT_TOKEN` existente en `.env`
- Channel ID configurable via `PUBLISHING_TELEGRAM_OUTPUT_CHANNEL`
- Eliminar o desactivar `MtprotoPublishingAdapter` para publicación

## Scope
- INCLUDE: Nuevo adapter Bot API, config de canal, wiring en módulo
- EXCLUDE: Cambios en MTProto para ingestion (ya funciona)

## Canal de Output
- **Channel ID**: 4485692803 (usar como -1004485692803 para API)
- **Bot Token**: TELEGRAM_BOT_TOKEN ya configurado

## Próximos Pasos
1. Crear BotApiTelegramPublisherAdapter (HTTP)
2. Configurar canal en app.config.ts
3. Actualizar publishing.module.ts para usar Bot API
4. Testear publicación