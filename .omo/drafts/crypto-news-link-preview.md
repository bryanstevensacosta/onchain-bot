---
slug: crypto-news-link-preview
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/crypto-news-link-preview.md
approach: Extender el listener para detectar MessageMediaWebPage, extraer metadata + foto del preview, persistir en nuevas columnas, y mostrar en frontend.
---

# Draft: crypto-news-link-preview

## Findings (cited path:lines)

1. `node_modules/telegram/tl/api.d.ts:1558-1570` — `MessageMediaWebPage` existe con campo `webpage: Api.TypeWebPage`
2. `node_modules/telegram/tl/api.d.ts:6388-6425` — `WebPage` tiene: `url`, `displayUrl`, `type?`, `siteName?`, `title?`, `description?`, `photo?: Api.TypePhoto`, `embedUrl?`
3. `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:296-322` — `extractRawPhotoAttachment` solo mira `msg.media.photo`, no `msg.media.webpage.photo`
4. `apps/backend/src/telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity.ts:20-29` — `CryptoNewsMessageProps` no tiene campo link preview
5. `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity.ts:19-51` — TypeORM entity sin columnas de link preview

## Decisions (with rationale)

1. **Almacenar link preview en columnas separadas** (no tabla extra) — los datos son metadata acotada (url, title, description, siteName), no una relación 1:N.
2. **Descargar foto del preview** con el mismo `downloadMedia()` existente, reusando `extractMediaForMessage` — el `photo` de `WebPage` es `Api.TypePhoto`, mismo tipo que las fotos normales.
3. **Extraer en `extractRawPhotoAttachment`** actual, detectando `msg.media.webpage.photo` como fallback cuando `msg.media.photo` no existe.

## Scope IN

- Detectar `MessageMediaWebPage` en el listener
- Extraer `webpage.url`, `webpage.title`, `webpage.description`, `webpage.siteName`
- Descargar `webpage.photo` a disco (reusando `extractMediaForMessage`)
- Persistir en columnas `link_preview_*` en `crypto_news_messages`
- Exponer en API view
- Mostrar en frontend

## Scope OUT

- No modificar el pipeline KOL
- No cambiar la tabla `crypto_news_message_media` (reusar si hay foto)
- No agregar soporte para `embedUrl`, `embedType`, etc.

## Approval gate

status: awaiting-approval
