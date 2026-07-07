---
slug: crypto-news-keywords-per-source
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/crypto-news-keywords-per-source.md
approach: Extender Keyword entity con channelId opcional (null = global). Filtrar en handler. UI fuente dropdown.
---

# Draft: crypto-news-keywords-per-source

## Findings

1. `Keyword` entity en `domain/entities/keyword.entity.ts:23` — Props no tiene `channelId`
2. `TypeOrmKeywordEntity` en `infrastructure/persistence/typeorm/entities/keyword.entity.ts:10` — sin columna
3. `CryptoNewsMessageIngestedHandler` línea 77-80 — usa `keywords.find((kw) => kw.matches(...))` — no filtra por source
4. Frontend `keywords-manager.tsx` — no renderiza source

## Decisions

1. **`channelId: string | null`** — null = aplica a todos los sources (global). Un string = solo ese source.
2. **Match lógico**: un keyword global (`channelId === null`) matchea cualquier mensaje. Uno de source específico solo matchea mensajes de ese channelId.
3. **La UI de sources** ya existe en el sidebar del publisher — se reusa el dropdown de sources.

## Scope IN

- Columna `source_channel_id` en `crypto_news_publisher_keywords`
- Handler match con filtro de channelId
- KeywordsController acepta `channelId` en body
- Frontend: dropdown de source + tag en cada row

## Scope OUT

- NO cambiar PromptTemplate o LlmConfig
- NO cambiar queue entry ni cron publisher
