# crypto-news-keywords-per-source - Work Plan

## TL;DR (For humans)

**What you'll get:** Las keywords ahora pueden tener un **source** opcional. Si se lo asignas, solo aplica a mensajes de ESE canal. Sin source asignado, aplica a TODOS (comportamiento actual). Desde el frontend ves de un vistazo qué source tiene cada keyword.

**Effort:** Short (~5 archivos, 1 wave)
**Risk:** Low — additive, no rompe keywords existentes (todas son globales por defecto)

## Todos

- [ ] 1. Añadir `sourceChannelId` a Keyword + actualizar match + API + frontend
     What to do:
  - **Backend — entity**: `apps/backend/src/telegram/crypto-news-publisher/domain/entities/keyword.entity.ts`:
    - Añadir `sourceChannelId: string | null` a `KeywordProps`
    - En `create()`, aceptar `sourceChannelId?: string | null` (default null)
    - Añadir getter
    - En `matches(content: string)`, no cambiar — el match de contenido queda igual
  - **Backend — TypeORM entity**: `infrastructure/persistence/typeorm/entities/keyword.entity.ts`:
    - Añadir columna `source_channel_id` (VARCHAR(64), nullable)
  - **Backend — mapper**: `infrastructure/persistence/typeorm/mappers/keyword.mapper.ts`:
    - Mapear `sourceChannelId` en toEntity/toDomain
  - **Backend — handler**: `infrastructure/event-bus/crypto-news-message-ingested.handler.ts`:
    - En `handle()`, cambiar el filtro de keywords. Antes:
      ```ts
      const enabledKeywords = await this.keywordRepo.findEnabled();
      ```
      Después:
      ```ts
      const allKeywords = await this.keywordRepo.findEnabled();
      const candidates = allKeywords.filter(
        (kw) =>
          kw.sourceChannelId === null ||
          kw.sourceChannelId === event.payload.channelId,
      );
      ```
    - Usar `candidates` en vez de `enabledKeywords` para el match
  - **Backend — controller**: `api/http/keywords.controller.ts`:
    - En `create()` y `PATCH`, aceptar `sourceChannelId?: string | null`
    - En `toView()`, incluir el campo
  - **Backend — tests**: Actualizar `keyword.entity.spec.ts`, `crypto-news-message-ingested.handler.spec.ts`, `keywords.controller.spec.ts`
  - **Frontend — types**: `api/keywords-api.ts`:
    - Add `sourceChannelId?: string | null` a `KeywordView`, `CreateKeywordBody`, `UpdateKeywordBody`
  - **Frontend — UI**: `ui/keywords-manager.tsx`:
    - Cada keyword row muestra el source (badge: "Global" o el channel name del dropdown de sources)
    - El create/edit form tiene un "Source" dropdown: "All sources" (global) + lista de fuentes activas
  - **Frontend — tests**: actualizar fixtures + 1-2 tests nuevos

## Verification

- tsc clean
- jest crypto-news-publisher pasa
- eslint clean
- vitest crypto-news page pasa

## Commits

1. `feat(crypto-news-publisher): add per-source keyword scoping`
