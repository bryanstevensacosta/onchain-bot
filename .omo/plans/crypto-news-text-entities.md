# crypto-news-text-entities - Work Plan

## TL;DR (For humans)

**What you'll get:** Los enlaces, negritas, cursivas y demás formato de los mensajes de Telegram se van a ver correctamente en el dashboard. Por ejemplo, "News | Markets | YouTube" serán links clickeables en vez de texto plano.

**Why this approach:** Telegram ya manda `msg.entities` con toda la metadata de formato (offset, length, type, url). Solo hay que extraerlos, persistirlos como JSON, y parsearlos en el frontend.

**Effort:** Medium (~10 archivos, 2 waves)
**Risk:** Low — cambios aditivos, no rompen nada existente

## Todos

- [ ] 1. Backend: extraer entities en el listener (el adapter, no el port) y persistir
     What to do / Must NOT do:
  - **CORRECCIÓN CRÍTICA**: `TelegramRawMessage` en `telegram-listener.port.ts:76-81` YA TIENE el campo `entities`. El gap real está en el **ADAPTER** que nunca extrae `msg.entities`.
  - **Telegram-mtproto-listener.adapter.ts**: En los 3 paths (polling line:163-176, events line:208-213, backfill line:228-234), donde se construye el `TelegramRawMessage`, añadir:
    ```ts
    entities: (msg.entities ?? []).map((e: {
      offset: number;
      length: number;
      className?: string;
      url?: string;
    }) => ({
      offset: e.offset,
      length: e.length,
      // Normalizar className de Telegram a type estable
      // (evitar acoplar frontend a nombres internos de Telegram)
      type: normalizeEntityType(e.className),
      ...(e.url ? { url: e.url } : {}),
    })),
    ```
    Y añadir función helper `normalizeEntityType`:
    ```ts
    private normalizeEntityType(className?: string): string {
      const map: Record<string, string> = {
        MessageEntityUrl: 'url',
        MessageEntityTextUrl: 'text_url',
        MessageEntityBold: 'bold',
        MessageEntityItalic: 'italic',
        MessageEntityCode: 'code',
        MessageEntityPre: 'pre',
        MessageEntityStrike: 'strike',
        MessageEntityUnderline: 'underline',
        MessageEntitySpoiler: 'spoiler',
        MessageEntityMention: 'mention',
        MessageEntityHashtag: 'hashtag',
        MessageEntityCashtag: 'cashtag',
      };
      return map[className ?? ''] ?? 'unknown';
    }
    ```
  - **IngestionCoordinator**: Los entities YA están en `raw.entities` (el port ya lo tiene). Solo hay que verificar que `IngestionCoordinator.route()` pase los entities. Mirar la línea ~125 de `ingestion-coordinator.service.ts` y verificar que `raw.entities` se pase al `StoreNewsMessageUseCase.execute()`. Si no, añadirlo.
  - **StoreNewsMessageUseCase**: Aceptar `entities?: ReadonlyArray<{offset: number; length: number; type: string; url?: string | null}>` opcional en input. `JSON.stringify()` antes de pasar al dominio.
  - **Domain entity** (`crypto-news-message.entity.ts`):
    - Añadir `formattingEntities: string | null` a Props (JSON string)
    - Añadir getter. En `create()`, aceptar opcional y `JSON.stringify`
    - Default `null` en `create()` input
  - **TypeORM entity**: Añadir columna `message_entities` (TEXT, nullable)
  - **Mapper**: Mapear bidireccionalmente
  - **In-memory repo**: El `Map<string, CryptoNewsMessage>` almacena la entidad de dominio completa. Como `formattingEntities` es parte de la entidad de dominio, se guarda automáticamente. Solo verificar que `findById`, `findRecent`, `findByChannelId` retornan el campo sin error.
  - **Controller**: Exponer como `formattingEntities: any[] | null` en view. Parsear JSON con try/catch:
    ```ts
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
    ```
  - NO modificar el pipeline de KOL
  - NO modificar fotos/media/link previews
  - NO hardcodear className de Telegram en el frontend (usar `type` normalizado)

- [ ] 2. Frontend: parsear y renderizar entities
     What to do / Must NOT do:
  - **Types** (`crypto-news-queries.ts`): Añadir:
    ```ts
    readonly formattingEntities?: ReadonlyArray<{
      offset: number;
      length: number;
      type: string;
      url?: string | null;
    }>;
    ```
  - **Parser** en `shared/lib/render-telegram-entities.ts` (FSD: shared/lib/ para utilidades cross-cutting):
    Crear función `renderFormattedText(content: string, entities?: ...): React.ReactNode` que:
    1. Si no hay entities, retorna `content` como texto plano (`<>{content}</>`)
    2. Si hay entities, las ordena por `offset`, itera sobre el texto y wrappea cada segmento:
       - `url` → `<a href={segmento} target="_blank">{segmento}</a>`
       - `text_url` → `<a href={url} target="_blank">{segmento}</a>`
       - `bold` → `<strong>{segmento}</strong>`
       - `italic` → `<em>{segmento}</em>`
       - `code` → `<code>{segmento}</code>`
       - `pre` → `<pre>{segmento}</pre>`
       - `strike` → `<del>{segmento}</del>`
       - `underline` → `<u>{segmento}</u>`
       - `spoiler` → `<span className="spoiler">{segmento}</span>`
       - `mention` → `<span className="text-blue-400">{segmento}</span>`
       - otros → `{segmento}` (texto plano)
    3. NO usar `dangerouslySetInnerHTML`. Todo debe ser JSX nativo.
    4. Si el texto está truncado (500 chars), acortar entities que excedan el límite.
  - **Spoiler CSS**: Añadir en `apps/frontend/src/app/styles/index.css` o global:
    ```css
    .spoiler {
      background: #333;
      border-radius: 2px;
      cursor: pointer;
      filter: blur(4px);
      transition: filter 0.2s;
    }
    .spoiler:hover,
    .spoiler:focus {
      filter: none;
    }
    ```
  - **Render**: Reemplazar `{msg.content}` por `{renderFormattedText(msg.content, msg.formattingEntities)}` en el `<p>` de content (línea 159). Conservar `whitespace-pre-wrap` en el contenedor.
  - **Tests**: Añadir `formattingEntities: undefined` a los mocks existentes en `crypto-news-page.test.tsx` (para no romper tests). Añadir 2 nuevos tests para el parser:
    1. Texto con entity `text_url` → verificar que se renderiza `<a href="url">`
    2. Texto sin entities → verificar que se renderiza texto plano sin `<a>`
  - NO modificar el layout existente (metadata, imágenes, link preview card)
  - NO eliminar `whitespace-pre-wrap` del contenedor del texto
    References:
  - Telegram entity types: `MessageEntityUrl`, `MessageEntityTextUrl`, `MessageEntityBold`, `MessageEntityItalic`, `MessageEntityCode`, `MessageEntityStrike`, `MessageEntityUnderline`, `MessageEntitySpoiler`
  - `node_modules/telegram/tl/api.d.ts:7143-7393` — todas las entity classes

## Final verification wave

- [ ] F1. TypeScript compila backend + frontend
- [ ] F2. Tests pasan:
  - Backend: `cd apps/backend && npx jest crypto-news --no-coverage` (58 tests)
  - Frontend: `cd apps/frontend && npx vitest run src/pages/crypto-news/__tests__/` (6+ tests)
- [ ] F3. Playwright: verificar en mensaje de cointelegraph que "News | Markets | YouTube" son `<a>` links con `href` correcto
- [ ] F4. Verificar que bold, italic, code se renderizan con tags correctos (si hay mensajes con esos formatos)
- [ ] F5. Spoiler CSS existe y no rompe otros estilos

## Commit strategy

1. `feat(crypto-news): extract and persist Telegram message formatting entities`
2. `feat(frontend): render Telegram message entities (bold, links, etc.)`
