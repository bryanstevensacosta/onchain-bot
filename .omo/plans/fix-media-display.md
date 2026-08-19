# fix-media-display - Work Plan

## TL;DR (For humans)

**What you'll get:**

- Blocked Posts: al hacer click en una fila, el modal muestra las imágenes/videos del post
- Videos: los archivos `.bin` (videos de Telegram) ahora se renderizan con `<video>` en lugar de `<img>`

**Why this approach:** El DetailsModal ya existe y se reutiliza en Queue y Blocked Posts. Solo hay que agregar la sección de media con soporte para videos.

**What it will NOT do:** No modifica el backend, no cambia cómo se descargan los medios.

**Effort:** Quick (1 tarea)
**Risk:** Low

---

## Scope

### Must have

- Agregar sección de media al DetailsModal (renderiza imágenes)
- Detectar archivos de video (`.bin`, `.mp4`) y usar `<video>` en lugar de `<img>`

### Must NOT have

- No modificar backend
- No cambiar la lógica de descarga de medios

## Verification strategy

- Test decision: tests-after (verificar compila)
- Evidence: .omo/evidence/task-1-media-display.md

## Execution strategy

- Un solo wave

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| ---- | ---------- | ------ | -------------------- |
| 1    | -          | -      | -                    |

## Todos

- [ ] 1. Agregar sección de media al DetailsModal con soporte para videos
     What to do: En queue-view.tsx, después de la sección "Raw input" y antes de "Generated output", agregar:
  - Check para entry.imagePaths.length > 0
  - Renderizar cada media: si es video (path endsWith .bin/.mp4 o contiene video\_/document) usar <video>, si no <img>
    Must NOT do: No duplicar código - solo agregar al DetailsModal existente
    Parallelization: Wave 1 | Blocked by: - | Blocks: -
    References:
  - apps/frontend/src/features/crypto-news-publisher/ui/queue-view.tsx:60-216 (DetailsModal)
  - apps/frontend/src/features/crypto-news-publisher/ui/queue-view.tsx:262-276 (media en QueueRow como referencia)
    Acceptance criteria:
  - npm run lint:frontend pasa
  - Blocked posts muestran media en el modal
  - Videos (.bin) se renderizan con controls
    QA: verificar que el modal de un blocked post con video muestre el reproductor
    Commit: Y | fix(frontend): agregar soporte de videos y media a DetailsModal

## Final verification wave

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review - lint pasa
- [ ] F3. Real manual QA - verificar videos en blocked posts

## Commit strategy

Un solo commit: fix(frontend): agregar soporte de videos y media a DetailsModal

## Success criteria

- npm run lint:frontend pasa
- Blocked Posts modal muestra imágenes
- Videos (.bin) se renderizan con reproductor
