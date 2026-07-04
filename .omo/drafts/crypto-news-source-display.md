---
slug: crypto-news-source-display
status: approved
intent: clear
pending-action: write .omo/plans/crypto-news-source-display.md
approach: Frontend-only change: build a Map<channelId, source> from the already-fetched sources list, display handle ? title ? channelId, and add a Telegram post link. No backend changes.
---

# Draft: crypto-news-source-display

## Components (topology ledger)

| id  | outcome                                                                  | status | evidence                                                                    |
| --- | ------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------- |
| C1  | Frontend page crypto-news/index.tsx muestra handle/title + Telegram link | active | Browser snapshot confirms current state: channelId displayed as raw numeric |
| C2  | Vitest test para el nuevo rendering                                      | active | 3 tests existentes, se añaden 2 más                                         |

## Findings (cited path:lines)

1. `apps/frontend/src/pages/crypto-news/index.tsx:102` — raw `{msg.channelId}` displayed as text
2. `apps/frontend/src/pages/crypto-news/index.tsx:101-107` — metadata line: channelId · msg N · hace X
3. `apps/frontend/src/pages/crypto-news/index.tsx:12` — `sources.data` is already fetched and available
4. `apps/frontend/src/pages/crypto-news/index.tsx:74-78` — sources used in filter dropdown with `{s.title} ({s.channelId})`
5. `apps/frontend/src/entities/crypto-news/api/crypto-news-queries.ts:3-10` — `CryptoNewsMessage` interface has `channelId: string`
6. `apps/backend/src/telegram/ingestion/crypto-news/api/http/crypto-news.controller.ts:50-57` — `CryptoNewsSourceView` has `channelId`, `handle`, `title`
7. Telegram link format: `https://t.me/{handle}/{messageId}` (public) or `https://t.me/c/{channelId}/{messageId}` (private)

## Decisions (with rationale)

1. **Frontend-only**: no backend changes needed since sources are already fetched separately. Simplifies scope and avoids extra DB joins.
2. **Map lookup**: `useMemo(() => new Map(...))` over sources.data — no new state, no new API calls.
3. **Fallback chain**: `source.handle ?? source.title ?? channelId` — handle for public channels, title for private, raw ID as last resort.
4. **Link target**: `_blank` with `rel="noopener noreferrer"` — standard security pattern for external links.

## Scope IN

- Replace raw `channelId` text with `handle ?? title ?? channelId`
- Add `<a>` link to original Telegram post
- Vitest test for link rendering

## Scope OUT

- No backend changes
- No API changes
- No filter dropdown changes

## Momus review results

Momus emitió: **CONDITIONAL-APPROVE** con 3 issues principales (1 blocking):

1. **Blocking**: `useMemo` import no era explícito → ahora está como paso obligatorio en el plan
2. **Blocking**: handle con prefijo `@` → ahora se hace `.replace(/^@/, '')` en URL y display
3. **Medium**: sin test de fallback (source no encontrado) → ahora hay test explícito para eso

Todos corregidos en `.omo/plans/crypto-news-source-display.md`.

## Approval gate

status: approved
