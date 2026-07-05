# crypto-news-layout-consistency - Work Plan

## TL;DR (For humans)

**What you'll get:** Todos los posts de crypto-news se ven iguales, ordenados, como si fuera un chat de Telegram. Sin saltos raros, sin fotos que aparecen centradas o desordenadas. Layout fijo: burbuja oscura con esquinas redondeadas → fotos (si hay) → texto → link preview (si hay).

**Why this approach:** El layout actual tiene demasiada lógica dinámica: la grilla de fotos checkea aspect ratio onLoad y cambia el layout en medio del render (causa reflow), el link preview filtra la primera imagen, etc. Un layout fijo y predecible elimina toda esa complejidad y da consistencia.

**What it will NOT do:** No toca backend. No toca datos. Solo cambia cómo se ve la página.

**Effort:** Short (1 archivo, ~30 líneas)
**Risk:** Low — cambios puramente visuales en el frontend

## Scope

### Must have

- Layout fijo para todos los articles: fotos → texto → link preview
- Grilla de fotos SIN detección de aspect ratio (siempre `grid-cols-1 sm:grid-cols-2` para 2+, `grid-cols-1` para 1)
- Eliminar `CryptoNewsMediaGrid` y su lógica de aspect ratio
- Link preview foto solo dentro del card, no en la grilla
- Responsive: mobile 1 col, desktop 2 col para 2+ fotos

### Must NOT have

- NO cambiar backend
- NO cambiar tests existentes
- NO cambiar la metadata line, filter, stats

## Verification strategy

- Vitest: 6 existing tests must pass
- Playwright: verificar layout consistente

## Todos

- [ ] 1. Reemplazar `CryptoNewsMediaGrid` + link preview filter por layout inline fijo
     What to do / Must NOT do:
  - **Archivo:** `apps/frontend/src/pages/crypto-news/index.tsx`
  - **Eliminar** `import { useCallback, useRef, useState } from 'react'` de la línea 1 y poner solo `import { useState } from 'react'` (useCallback y useRef solo se usaban en CryptoNewsMediaGrid)
  - **Eliminar** la función `CryptoNewsMediaGrid` completa (desde `function CryptoNewsMediaGrid(` hasta su `}` de cierre)
  - **Reemplazar** el bloque actual (con su respectiva importación de `useCallback`, `useRef`, y función `CryptoNewsMediaGrid`) por un layout inline sin detección de aspect ratio:
    ```tsx
    {
      msg.media && msg.media.length > 0 && (
        <div
          className={`mt-3 grid gap-1 ${
            msg.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {msg.media.map((m, i) => (
            <img
              key={m.id}
              src={m.url}
              alt={`${msg.title ?? 'image'} ${i + 1}`}
              className="h-auto w-full rounded object-contain"
              loading="lazy"
            />
          ))}
        </div>
      );
    }
    ```
    - **1 foto → `grid-cols-1`**: ocupa el mismo ancho de columna que si hubiera 2, sin estirarse.
    - **2+ fotos → `grid-cols-2`**: siempre 2 columnas, sin responsive breakpoint. En mobile las columnas se encogen naturalmente.
    - **`object-contain`**: la imagen se muestra completa, sin recortes.
    - **Nunca se filtra ninguna imagen**. Todas las fotos (directas + link preview) se muestran en la grilla.
    - Imágenes rectangulares se cortan con `object-cover` para llenar el espacio.
    - No hay detección de aspect ratio ni reflow visual.
    - **Eliminar** `import { useCallback, useRef, useState } from 'react'` y poner solo `import { useState } from 'react'` (useCallback y useRef solo se usaban en CryptoNewsMediaGrid)
    - **Eliminar** la función `CryptoNewsMediaGrid` completa.
  - **Reemplazar** el link preview card para usar `msg.media[0]` solo si `msg.media.length > 0`:
    ```tsx
    {
      msg.linkPreviewUrl && (
        <a
          href={msg.linkPreviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block rounded border border-slate-700 bg-slate-800 p-3 hover:border-slate-500 transition-colors"
        >
          {msg.media && msg.media.length > 0 && (
            <img
              src={msg.media[0].url}
              alt=""
              className="mb-2 h-auto w-full max-h-48 rounded object-cover"
              loading="lazy"
            />
          )}
          {msg.linkPreviewTitle && (
            <h4 className="text-sm font-semibold text-slate-100">
              {msg.linkPreviewTitle}
            </h4>
          )}
          {msg.linkPreviewDescription && (
            <p className="mt-1 text-xs text-slate-400 line-clamp-2">
              {msg.linkPreviewDescription}
            </p>
          )}
          {msg.linkPreviewSiteName && (
            <p className="mt-1 text-xs text-slate-500">
              {msg.linkPreviewSiteName}
            </p>
          )}
        </a>
      );
    }
    ```
  - **NO modificar** la metadata line, el filter, los tests
    References:
  - `apps/frontend/src/pages/crypto-news/index.tsx` — archivo completo
  - Línea actual donde está CryptoNewsMediaGrid (~142-149)
  - Línea actual del link preview (~155-184)
  - Función CryptoNewsMediaGrid (actual ~161-212)
  - `apps/frontend/src/pages/crypto-news/__tests__/crypto-news-page.test.tsx` — tests

## Final verification wave

- [ ] F1. TypeScript compila: `cd apps/frontend && npx tsc --noEmit`
- [ ] F2. Tests: `cd apps/frontend && npx vitest run src/pages/crypto-news/__tests__/`
- [ ] F3. Playwright: verificar layout consistente

## Commit strategy

1. `fix(frontend): consistent crypto-news layout - remove dynamic image grid`

## Success criteria

- [ ] Todos los posts tienen el mismo layout: fotos → texto → link preview
- [ ] No hay detección de aspect ratio ni reflow visual
- [ ] Las fotos se muestran en 1 col (mobile) o 2 col (desktop) según cantidad
- [ ] La foto del link preview aparece en la grilla de fotos Y en el card (no se filtra)
- [ ] 6 tests existentes pasan
