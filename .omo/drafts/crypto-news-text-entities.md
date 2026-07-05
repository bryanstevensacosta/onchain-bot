---
slug: crypto-news-text-entities
status: approved
intent: clear
pending-action: write .omo/plans/crypto-news-text-entities.md
approach: Extraer msg.entities del listener, persistir como JSON en DB, renderizar en frontend con parser que convierte entities en tags HTML/JSX.
---

# Draft: crypto-news-text-entities

## Findings

1. `node_modules/telegram/tl/custom/message.d.ts:265-267` — `entities?: any` en CustomMessage
2. Telegram entities tienen: `offset` (int), `length` (int), `className` (string como "MessageEntityUrl"), y para `MessageEntityTextUrl` además `url` (string)
3. `apps/backend/src/telegram/ingestion/shared/domain/ports/telegram-listener.port.ts` — TelegramRawMessage sin campo entities
4. `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:161-236` — el listener extrae `msg.id`, `msg.message`, `msg.date` pero no `msg.entities`
5. Cointelegraph msg 70833: texto "News | Markets | YouTube" con entities MessageEntityTextUrl para cada link

## Decisions

1. **Almacenar entities como JSON** en columna `message_entities` tipo TEXT nullable en `crypto_news_messages`
2. **Parser frontend**: función que toma texto + entities y retorna React nodes (fragmentos con <a>, <strong>, <em>, etc.)
3. **Backend**: extraer entities en el listener como array de `{offset, length, type, url?}`, pasarlos por toda la cadena hasta la API

## Scope IN

- Extraer msg.entities en el listener (polling + events + backfill)
- Persistir en DB como JSON
- Exponer en API view
- Renderizar en frontend con parser

## Scope OUT

- No modificar el pipeline KOL
- No agregar nuevos tipos de entidades no soportadas por Telegram
