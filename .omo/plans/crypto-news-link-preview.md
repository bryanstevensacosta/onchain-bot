# crypto-news-link-preview - Work Plan

## TL;DR (For humans)

**What you'll get:** Cuando un post de Telegram contiene un link (ej. una noticia de Cointelegraph), la preview del link (título, descripción e imagen) se va a mostrar en el dashboard de crypto-news, no solo el texto crudo del mensaje. La imagen del preview se descarga igual que las fotos normales.

**Why this approach:** Telegram ya devuelve la metadata del link preview (`WebPage` con `url`, `title`, `description`, `photo`) dentro de `MessageMediaWebPage`. El listener actual ignora este tipo de media porque solo mira `MessageMediaPhoto`. La solución es detectar ambos tipos y extraer la información.

**What it will NOT do:** No afecta al pipeline KOL. No agrega tablas nuevas (usa columnas en la tabla existente). La imagen del preview se descarga al mismo directorio que las fotos normales usando el mismo `downloadMedia()`.

**Effort:** Medium (~8 archivos, 1 backend wave + 1 frontend wave)
**Risk:** Low — cambios aditivos, no rompen nada existente
**Decisions to sanity-check:** Columnas en tabla existente vs tabla separada (elegimos columnas).

## Scope

### Must have

- Detectar `msg.media.webpage` en `extractRawPhotoAttachment`
- Extraer `url`, `title`, `description`, `siteName` de `WebPage`
- Descargar `webpage.photo` a disco (reusando `extractMediaForMessage`)
- Añadir columnas `link_preview_url`, `link_preview_title`, `link_preview_description`, `link_preview_site_name` a `crypto_news_messages`
- Extender `CryptoNewsMessageProps`, mapper, TypeORM entity, API view
- Mostrar link preview en frontend (card con título, descripción, imagen opcional)

### Must NOT have

- NO modificar el pipeline KOL
- NO crear tabla extra (columnas en la tabla existente)
- NO extraer `embedUrl`, `embedType`, `embedWidth`, `embedHeight` (scope futuro)
- NO modificar el flujo de mensajes sin link preview
- NO modificar el `CryptoNewsMediaGrid` (la foto del preview se maneja igual)

## Verification strategy

- Test decision: tests-after
- Evidence: `.omo/evidence/crypto-news-link-preview/`
- QA: Vitest backend (3 new tests) + Vitest frontend (2 new tests)

## Execution strategy

### Parallel execution waves

Wave 1 (backend): Listener extraction + persistence + API
Wave 2 (frontend): Types + rendering

### Dependency matrix

| Todo                                                        | Depends on | Blocks |
| ----------------------------------------------------------- | ---------- | ------ |
| T1. Listener: detectar MessageMediaWebPage y extraer data   | —          | T2     |
| T2. Persistencia: columnas link_preview + mapper + API view | T1         | T3     |
| T3. Frontend: mostrar link preview                          | T2         | —      |

## Todos

- [ ] 1. Detectar `MessageMediaWebPage` en el listener y extraer metadata + foto
     What to do / Must NOT do:
  - **Archivo:** `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts`
  - En `extractRawPhotoAttachment` (alrededor de linea 296-322):
    - Después del check de `msg.media.photo`, añadir un segundo check:
      ```ts
      // También buscar link preview (MessageMediaWebPage → webpage.photo)
      const webpage = (media as { webpage?: unknown }).webpage;
      if (webpage && typeof webpage === 'object') {
        const wp = webpage as {
          url?: string;
          title?: string;
          description?: string;
          siteName?: string;
          photo?: unknown;
        };
        // Si hay una foto en el webpage, extraerla como TelegramMediaAttachment
        if (wp.photo) {
          const photoAttach = this.extractRawPhotoAttachment({
            photo: wp.photo,
          } as unknown as { photo: unknown });
          if (photoAttach) {
            return {
              ...photoAttach,
              webpageUrl: wp.url ?? null,
              webpageTitle: wp.title ?? null,
              webpageDescription: wp.description ?? null,
              webpageSiteName: wp.siteName ?? null,
            };
          }
        }
      }
      ```
    - Esto significa que `TelegramMediaAttachment` necesita nuevos campos opcionales para la metadata del webpage. Extender la interfaz en `telegram-listener.port.ts`:
      ```ts
      readonly webpageUrl?: string | null;
      readonly webpageTitle?: string | null;
      readonly webpageDescription?: string | null;
      readonly webpageSiteName?: string | null;
      ```
    - Estos campos son opcionales y solo se pueblan cuando hay un link preview.
  - NO modificar el flujo existente de `msg.media.photo` (fotos normales)
  - NO modificar `extractMediaForMessage` — reusa el mismo path de descarga a disco
  - NO modificar el backfill (los previews viejos no tienen media descargable)
    References:
  - `node_modules/telegram/tl/api.d.ts:1558-1570` — MessageMediaWebPage
  - `node_modules/telegram/tl/api.d.ts:6388-6425` — WebPage fields
  - `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:296-322` — extractRawPhotoAttachment

- [ ] 2. Persistir link preview en DB + exponer en API
     What to do / Must NOT do:
  - **Domain entity** (`crypto-news-message.entity.ts`):
    - Añadir a `CryptoNewsMessageProps`:
      ```ts
      readonly linkPreviewUrl: string | null;
      readonly linkPreviewTitle: string | null;
      readonly linkPreviewDescription: string | null;
      readonly linkPreviewSiteName: string | null;
      ```
    - En `create()`, aceptar estos campos como opcionales (todos default `null`)
    - Añadir getters correspondientes
  - **TypeORM entity** (`infrastructure/persistence/typeorm/entities/crypto-news-message.entity.ts`):
    - Añadir columnas:
      ```ts
      @Column({ name: 'link_preview_url', type: 'text', nullable: true })
      linkPreviewUrl!: string | null;
      @Column({ name: 'link_preview_title', type: 'text', nullable: true })
      linkPreviewTitle!: string | null;
      @Column({ name: 'link_preview_description', type: 'text', nullable: true })
      linkPreviewDescription!: string | null;
      @Column({ name: 'link_preview_site_name', type: 'varchar', length: 128, nullable: true })
      linkPreviewSiteName!: string | null;
      ```
  - **Mapper** (`crypto-news-message.mapper.ts`):
    - Mapear los 4 campos en `toEntity()` y `toDomain()`
  - **Controller** (`crypto-news.controller.ts`):
    - Añadir a `CryptoNewsMessageView`:
      ```ts
      readonly linkPreviewUrl: string | null;
      readonly linkPreviewTitle: string | null;
      readonly linkPreviewDescription: string | null;
      readonly linkPreviewSiteName: string | null;
      ```
    - Mapear en `toView()` o donde se construye la view
  - NO crear tabla separada
  - NO modificar `CryptoNewsMessageMediaEntity`
    References:
  - `apps/backend/src/telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity.ts:20-29`
  - `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity.ts:19-51`
  - `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/mappers/crypto-news-message.mapper.ts`
  - `apps/backend/src/telegram/ingestion/crypto-news/api/http/crypto-news.controller.ts:39-48`

- [ ] 3. Mostrar link preview en el frontend
     What to do / Must NOT do:
  - **Types** (`apps/frontend/src/entities/crypto-news/api/crypto-news-queries.ts`):
    - Añadir a `CryptoNewsMessage`:
      ```ts
      readonly linkPreviewUrl: string | null;
      readonly linkPreviewTitle: string | null;
      readonly linkPreviewDescription: string | null;
      readonly linkPreviewSiteName: string | null;
      ```
  - **Render** (`apps/frontend/src/pages/crypto-news/index.tsx`):
    - Después del `<p>` de content y antes del cierre del `</article>`, añadir:
      ```tsx
      {
        msg.linkPreviewUrl && (
          <a
            href={msg.linkPreviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block rounded border border-slate-700 bg-slate-800 p-3 hover:border-slate-500 transition-colors"
          >
            {msg.media?.length > 0 && (
              <img
                src={msg.media[0].url}
                alt=""
                className="h-auto w-full max-h-48 rounded object-cover mb-2"
                loading="lazy"
              />
            )}
            {msg.linkPreviewTitle && (
              <h4 className="text-sm font-semibold text-slate-100">
                {msg.linkPreviewTitle}
              </h4>
            )}
            {msg.linkPreviewDescription && (
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                {msg.linkPreviewDescription}
              </p>
            )}
            <span className="text-xs text-blue-400 mt-1 block">
              {msg.linkPreviewUrl}
            </span>
          </a>
        );
      }
      ```
    - **Importante**: la foto del preview se descarga al mismo directorio que las fotos normales y se expone via el mismo `media[]` array. Por lo tanto `msg.media[0].url` funciona si hay foto de preview (es la primera foto del array).
  - NO modificar el media grid ni el rendering de fotos existentes
  - NO modificar el orden de article (img arriba, texto abajo, preview abajo del todo)
    References:
  - `apps/frontend/src/entities/crypto-news/api/crypto-news-queries.ts:11-18`
  - `apps/frontend/src/pages/crypto-news/index.tsx:142-155`

## Final verification wave

- [ ] F1. TypeScript compila backend + frontend
- [ ] F2. Tests pasan (backend crypto-news + frontend crypto-news page)
- [ ] F3. Playwright: verificar que link preview se renderiza
- [ ] F4. Scope fidelity: NO cambios en KOL, NO tablas extra

## Commit strategy

1. `feat(crypto-news): ingest link preview from MessageMediaWebPage`
2. `feat(crypto-news): persist link preview metadata in DB + expose via API`
3. `feat(frontend): render link preview card in crypto-news page`

## Success criteria

- [ ] Mensaje con URL + link preview muestra título, descripción, imagen y URL en el frontend
- [ ] Mensaje sin link preview se renderiza exactamente igual que antes
- [ ] Foto del preview se descarga a disco (reusando downloadMedia)
- [ ] Columnas `link_preview_*` se persisten en DB
- [ ] Todos los tests existentes siguen pasando
