# Draft: Telegram Bot API para Publicación

## Requisitos (Confirmados)
- **MTProto**: Solo para lectura/ingestión (como está actualmente)
- **Bot Token**: Solo para envío al canal de output
- **Un solo canal**: OUTPUT_CHANNEL_ID en .env
- **No violar ToS**: Sin MTProto para envío

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