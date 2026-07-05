# crypto-news-media-viewer - Work Plan

## TL;DR (For humans)

**What you'll get:** Al hacer clic en una imagen se abre en una nueva pestaña a tamaño completo. Preparación para futuros videos.

**What it will NOT do:** No es un lightbox modal (se abre en nueva pestaña). No incluye soporte de video todavía (requiere backend).

## Todos

- [ ] 1. Envolver `<img>` en `<a>` para abrir a tamaño completo
     What to do:
  - **ÚNICO ARCHIVO:** `apps/frontend/src/pages/crypto-news/index.tsx`
  - Encontrar el bloque actual (líneas ~176-184):
    ```tsx
    <img
      key={m.id}
      src={m.url}
      alt={`${msg.title ?? 'image'} ${i + 1}`}
      className="h-auto w-full max-h-56 rounded object-contain"
      loading="lazy"
    />
    ```
  - Reemplazar por:
    ```tsx
    <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer">
      <img
        src={m.url}
        alt={`${msg.title ?? 'image'} ${i + 1}`}
        className="h-auto w-full max-h-56 rounded object-contain cursor-pointer transition-opacity hover:opacity-80"
        loading="lazy"
      />
    </a>
    ```
  - NOTA: el `key` se mueve del `<img>` al `<a>` para mantener React keys correctas
  - `cursor-pointer` + `hover:opacity-80` para dar feedback visual de clickeable
  - `target="_blank"` abre en nueva pestaña
  - NO modificar otros elementos (metadata, link preview, etc.)
  - Tests: añadir `groupedId: undefined` a fixtures si faltan
  - Verificar: `cd apps/frontend && npx tsc --noEmit` y `npx vitest run src/pages/crypto-news/__tests__/`

- [ ] 2. (Opcional/Futuro) Soporte de video
  - **Backend**: en `extractRawPhotoAttachment`, también detectar `MessageMediaDocument` con `mimeType.startsWith('video/')` y extraer igual que una foto (fileId, accessHash, fileReference)
  - **Frontend**: renderizar `<video src={url} controls className="w-full rounded" />` en lugar de `<img>` cuando `m.type === 'video'`
  - Requiere cambiar `CryptoNewsMedia.type` de `'photo'` literal a `'photo' | 'video'`
  - Scope futuro, no incluido en este plan

## Verification

- Playwright: hacer clic en una imagen, verificar que se abre `target=_blank`
- Tests: 8 tests existentes pasan

## Commit

1. `feat(frontend): open crypto-news images in new tab at full resolution`
