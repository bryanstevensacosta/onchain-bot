# crypto-news-source-display - Work Plan

## TL;DR (For humans)

**What you'll get:** En lugar de "4466661332" en cada noticia, verás el nombre del canal (handle público con enlace, o nombre del canal privado) y un link que lleva directamente al post original en Telegram. Cero cambios en el backend — solo frontend.

**Why this approach:** La data de los sources (handle, title) ya se carga en la página de crypto-news para el filtro dropdown. No necesitamos tocar el backend ni hacer joins extra. Es solo mapear el `channelId` con el source correspondiente y renderizar el nombre + un `<a>` link.

**What it will NOT do:** No cambia el backend, no cambia la API, no cambia el filtro dropdown. El link se abre en nueva pestaña (estándar de seguridad).

**Effort:** Quick (~20 líneas, 1 archivo, 1 commit)
**Risk:** Low — cambio puramente aditivo en el frontend, no afecta backend ni pipelines
**Decisions to sanity-check:** Formato del display (con/sin @), orden de fallback (handle > title > channelId)

Your next move: approve and implement. Full execution detail follows below.

---

> TL;DR (machine): Quick | Low risk | 1 file modified, 2 Vitest tests added

## Scope

### Must have

- Reemplazar `{msg.channelId}` por `{source.handle ?? source.title ?? channelId}` usando un Map<channelId, source> desde `sources.data`
- Añadir `<a href="https://t.me/{handle}/{messageId}">` para canales públicos
- Añadir `<a href="https://t.me/c/{channelId}/{messageId}">` para canales privados (sin handle)
- Los links se abren con `target="_blank" rel="noopener noreferrer"`
- Vitest test: verificar link rendering + display name

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO modificar el backend
- NO modificar la API (`CryptoNewsMessageView` o `CryptoNewsSourceView`)
- NO modificar el filter dropdown
- NO cambiar la consulta de datos (solo el rendering)
- NO añadir nuevos hooks/queries/queries de TanStack Query

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after — se modifican tests existentes + 2 nuevos
- Evidence: `.omo/evidence/crypto-news-source-display/`
- Playwright snapshot confirmando que el texto cambió y los links existen

## Execution strategy

### Parallel execution waves

Wave 1: Frontend + tests (1 todo, sin dependencias externas)

### Dependency matrix

| Todo                             | Depends on                             | Blocks | Can parallelize with |
| -------------------------------- | -------------------------------------- | ------ | -------------------- |
| T1. Frontend handle/link + tests | T7-T8 de crypto-news-images (ya hecho) | —      | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Mostrar handle/title del source + link al post original en Telegram
     What to do / Must NOT do:
  - **ÚNICO ARCHIVO:** `apps/frontend/src/pages/crypto-news/index.tsx`
  - **NO modificar** el filter dropdown existente (líneas 74-78) — debe seguir mostrando `s.title ({s.channelId})`
  - **NO modificar** el loading/error state existente (líneas 86-94)
  - **NO añadir nuevas queries/hooks** — solo usa `sources.data` y `messages.data` que ya existen en el componente

  ### Cambio 1: Importar `useMemo` de React
  - La línea 1 actual es: `import { useState } from 'react';`
  - **CAMBIAR A:** `import { useMemo, useState } from 'react';`
  - Este paso es OBLIGATORIO y explícito.

  ### Cambio 2: Añadir lookup map antes del return
  - Antes del `return (` (línea 20 aprox), añadir:
    ```tsx
    const sourceByChannelId = useMemo(
      () => new Map((sources.data ?? []).map((s) => [s.channelId, s])),
      [sources.data],
    );
    ```

  ### Cambio 3: Reemplazar `{msg.channelId}` por link con handle/title
  - **LOCALIZAR** la línea que contiene `<span className="font-mono">{msg.channelId}</span>` (dentro del bucle de `filteredMessages.map`, alrededor de línea 102)
  - NO usar números de línea fijos — buscar por el texto exacto `<span className="font-mono">{msg.channelId}</span>` usando un edit tool con `oldString`
  - **REEMPLAZAR** todo el `<span>...</span>` por:
    ```tsx
    <a
      href={
        source?.handle
          ? `https://t.me/${source.handle.replace(/^@/, '')}/${msg.messageId}`
          : `https://t.me/c/${msg.channelId}/${msg.messageId}`
      }
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-blue-400 hover:text-blue-300 underline"
    >
      {source?.handle?.replace(/^@/, '') ?? source?.title ?? msg.channelId}
    </a>
    ```
  - **ANTES** de esta línea (dentro del bucle), añadir:
    ```tsx
    const source = sourceByChannelId.get(msg.channelId);
    const displayName =
      source?.handle?.replace(/^@/, '') ?? source?.title ?? msg.channelId;
    const cleanHandle = source?.handle?.replace(/^@/, '') ?? null;
    const telegramUrl = cleanHandle
      ? `https://t.me/${cleanHandle}/${msg.messageId}`
      : `https://t.me/c/${msg.channelId}/${msg.messageId}`;
    ```
  - **IMPORTANTE**: `handle` puede contener `@` (ej: `@WatcherGuru`). Siempre hacer `replace(/^@/, '')` antes de usar en URL o display. Esto previene URLs inválidas como `https://t.me/@WatcherGuru/5`.

  ### Cambio 4: Verificar filter dropdown intacto
  - Después del cambio, CONFIRMAR que las líneas del `<select>` con `s.title ({s.channelId})` NO se modificaron accidentalmente.

  ### Cambio 5: Actualizar test Vitest
  - **LEER** el archivo de test existente completo antes de editarlo
  - **OBSERVAR** que los mocks existentes usan `channelId: 'WatcherGuru'` (no numérico) y `handle: '@WatcherGuru'` (con @)
  - **NO** eliminar tests existentes
  - **AÑADIR** 3 nuevos tests (usar la misma estructura de mock del archivo existente):
    1. **`source con handle`**: mock source con `channelId='123', handle='test-handle', title='Test'` + mock message con `channelId='123', messageId=5` → verificar: `<a href="https://t.me/test-handle/5">test-handle</a>`
    2. **`source sin handle (privado)`**: mock source con `channelId='123', handle=null, title='Test Channel'` + mock message con `channelId='123'` → verificar: `<a href="https://t.me/c/123/5">Test Channel</a>`
    3. **`source no encontrado (fallback)`**: mock message solo sin sources → verificar: muestra `msg.channelId` como texto (fallback)

  ### Verificación post-cambio:
  - `cd apps/frontend && npx tsc --noEmit` → exit 0
  - `cd apps/frontend && npx vitest run src/pages/crypto-news/__tests__/ --reporter=verbose` → todos los tests pasan (3 nuevos + 3 existentes = 6)
  - `cd apps/frontend && npx eslint src/pages/crypto-news/` → sin errores
  - PLAYWRIGHT: abrir `/crypto-news`, verificar que los nombres de canal se renderizan como links azules subrayados y los filtros dropdown siguen funcionando

  Parallelization: Wave 1 | Blocked by: — | Blocks: —
  References (executor has NO interview context - be exhaustive):
  - `apps/frontend/src/pages/crypto-news/index.tsx:1` — import: `import { useState } from 'react'` (cambiar a `import { useMemo, useState } from 'react'`)
  - `apps/frontend/src/pages/crypto-news/index.tsx:96-130` — bucle de messages con el `<span>` a reemplazar
  - `apps/frontend/src/pages/crypto-news/index.tsx:74-78` — filter dropdown (NO modificar)
  - `apps/frontend/src/pages/crypto-news/index.tsx:12` — `useCryptoNewsSources()` hook
  - Test file: `apps/frontend/src/pages/crypto-news/__tests__/crypto-news-page.test.tsx` (leer completo ANTES de editar)
  - `apps/frontend/src/entities/crypto-news/api/crypto-news-queries.ts:3-15` — interfaces `CryptoNewsMessage` y `CryptoNewsMediaView`
  - Telegram URL format: `https://t.me/{handle}/{messageId}` (public) / `https://t.me/c/{channelId}/{messageId}` (private)
  - Tailwind classes: `text-blue-400 hover:text-blue-300 underline`
  - React `useMemo` docs
  - `.omo/evidence/` — crear directorio si no existe para depositar evidencia
    Acceptance criteria (agent-executable):
  - El `<span className="font-mono">{msg.channelId}</span>` ya NO existe en el archivo
  - El `<a>` de reemplazo tiene `target="_blank" rel="noopener noreferrer"` y clase `text-blue-400 hover:text-blue-300 underline`
  - URL construida con `.replace(/^@/, '')` — nunca produce `https://t.me/@handle/...`
  - `useMemo` importado de React (línea 1)
  - Vitest: 6 tests pasan (3 originales + 3 nuevos)
  - TypeScript: `cd apps/frontend && npx tsc --noEmit` → exit 0
  - ESLint: `cd apps/frontend && npx eslint src/pages/crypto-news/` → sin errores
  - Filter dropdown (líneas 74-78) sigue mostrando `s.title ({s.channelId})` — verificar por inspección
  - Evidence: `.omo/evidence/task-1-crypto-news-source-display.md` creado con resumen de tests + captura de Playwright
    QA scenarios: happy + failure, Evidence `.omo/evidence/task-1-crypto-news-source-display.md`
  - Happy (vitest): source con handle → link público `https://t.me/test-handle/5` sin `@` en URL
  - Happy (vitest): source sin handle → link privado `https://t.me/c/123/5` + display title "Test Channel"
  - Happy (vitest): source no encontrado en map → display `msg.channelId` raw (fallback sin link)
  - Happy (playwright): abrir `/crypto-news`, verificar que hay `<a>` links en los articles y el filter dropdown sigue funcionando con los mismos options
  - Failure: mock vacío (no sources, no messages) → sin crash, solo "No messages yet"
    Commit: Y | `feat(frontend): show source handle/title and Telegram link in crypto-news page`

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — verificar que el cambio es solo frontend, no hay backend tocado
- [ ] F2. Code quality — TypeScript + ESLint + Vitest pasan
- [ ] F3. Real manual QA — Playwright abre /crypto-news, verifica link rendering
- [ ] F4. Scope fidelity — NO backend changes, NO API changes, NO filter changes

## Commit strategy

1. `feat(frontend): show source handle/title and Telegram link in crypto-news page`

## Success criteria

- [ ] Cada mensaje muestra `handle ?? title ?? channelId` en vez del channelId numérico
- [ ] Cada nombre es un link clickable al post original de Telegram
- [ ] Canales públicos: link formato `https://t.me/{handle}/{messageId}`
- [ ] Canales privados: link formato `https://t.me/c/{channelId}/{messageId}`
- [ ] Vitest tests pasan (5/5)
- [ ] TypeScript compila sin errores
- [ ] ESLint pasa
- [ ] Sin cambios en backend
