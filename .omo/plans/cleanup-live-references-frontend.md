# cleanup-live-references-frontend - Work Plan (✅ COMPLETE)

## TL;DR (For humans)

**What you'll get:** El nav link "Live" desaparece del header del Dashboard. La ruta `/live` (que solo redirigía a `/tokens`) se elimina. El README y AGENTS.md del frontend se actualizan. El widget LiveFeed sigue funcionando dentro del Dashboard como siempre.

**Why this approach:** Es la Opción A que elegiste explícitamente. Mínimo cambio, máximo impacto — se elimina el zombie `/live` sin tocar la funcionalidad real del LiveFeed.

**What it will NOT do:** No elimina el widget LiveFeed ni su import en el Dashboard. No toca nada del backend. No cambia WebSocket events ni shared/realtime.

**Effort:** Quick
**Risk:** Low — cambios localizados en 4 archivos, sin lógica nueva.
**Decisions to sanity-check:** Se añadió `apps/frontend/AGENTS.md` al scope por recomendación de Metis (también documentaba `/live`).

Your next move: `$start-work`. Full execution detail follows below.

---

> TL;DR (machine): Quick | Low | 4 files edited in frontend: remove nav link, remove route, update README, update AGENTS.md

## Scope

### Must have

1. `apps/frontend/src/app/layouts/root-layout.tsx` — eliminar `{ to: '/live', label: 'Live' }` del array NAV
2. `apps/frontend/src/app/router/routes.tsx` — eliminar `{ path: 'live', element: <Navigate to="/tokens" replace /> }`
3. `apps/frontend/README.md` — eliminar la línea de la tabla de rutas que documenta `/live` y cualquier otra mención de `/live` como página separada
4. `apps/frontend/AGENTS.md` — eliminar línea "Live route — /live redirects to /tokens. No separate live page exists."

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO eliminar ni modificar `apps/frontend/src/widgets/live-feed/` (el componente LiveFeed)
- NO eliminar `import { LiveFeed }` ni `<LiveFeed />` en `dashboard/index.tsx`
- NO tocar ningún archivo en `apps/backend/`
- NO modificar `shared/realtime/` ni eventos WebSocket
- NO modificar tipos, interfaces, barrel exports ni nada en `entities/` o `features/`
- NO renombrar archivos ni carpetas

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: none (no logic changes, just removal of dead code/docs)
- Evidence: .omo/evidence/verify-cleanup-live-references-frontend.txt

## Execution strategy

### Parallel execution waves

Wave 1 (single wave — todos son independientes): los 4 cambios pueden ejecutarse en paralelo o secuencialmente.

### Dependency matrix

| Todo                | Depends on | Blocks | Can parallelize with |
| ------------------- | ---------- | ------ | -------------------- |
| 1. Remove nav link  | —          | —      | 2, 3, 4              |
| 2. Remove route     | —          | —      | 1, 3, 4              |
| 3. Update README    | —          | —      | 1, 2, 4              |
| 4. Update AGENTS.md | —          | —      | 1, 2, 3              |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Eliminar nav link "Live" del header
     What to do / Must NOT do: Editar `apps/frontend/src/app/layouts/root-layout.tsx`, eliminar la línea `{ to: '/live', label: 'Live' },` del array `NAV`. No tocar nada más en el archivo. NO eliminar la coma del elemento anterior.
     Parallelization: Wave 1 | Blocked by: — | Blocks: —
     References: `apps/frontend/src/app/layouts/root-layout.tsx:5`
     Acceptance criteria (agent-executable): `grep "{ to: '/live', label: 'Live' }" apps/frontend/src/app/layouts/root-layout.tsx` retorna exit code 1 (no encontrado). El array NAV tiene exactamente 4 elementos: Dashboard, Tokens, KOLs, Ops.
     QA scenarios (name the exact tool + invocation):
  - Happy: `grep -c "to: '/'" apps/frontend/src/app/layouts/root-layout.tsx` → 1 (Dashboard), `grep -c "to: '/tokens'"` → 1, `grep -c "to: '/kols'"` → 1, `grep -c "to: '/ops'"` → 1, `grep -c "live"` → 0
  - Failure: la edición crea un syntax error → `npx tsc --noEmit -p apps/frontend/tsconfig.json` no debe reportar errores
    Commit: N (se agrupa con los demás en un solo commit)

- [x] 2. Eliminar ruta zombie `/live` del router
     What to do / Must NOT do: Editar `apps/frontend/src/app/router/routes.tsx`, eliminar la línea `{ path: 'live', element: <Navigate to="/tokens" replace /> },` del array de children. No tocar nada más.
     Parallelization: Wave 1 | Blocked by: — | Blocks: —
     References: `apps/frontend/src/app/router/routes.tsx:19`
     Acceptance criteria (agent-executable): `grep "path: 'live'" apps/frontend/src/app/router/routes.tsx` retorna exit code 1.
     QA scenarios:
  - Happy: `grep -c "path:" apps/frontend/src/app/router/routes.tsx` → 5 (index, tokens, tokens/:chain/:address, kols, ops)
  - Failure: syntax error → `npx tsc --noEmit -p apps/frontend/tsconfig.json` no debe reportar errores
    Commit: N

- [x] 3. Actualizar frontend README
     What to do / Must NOT do: Editar `apps/frontend/README.md`:
     a. En la tabla de rutas (sección 1), eliminar la fila `| /live | Live Feed | Feed completo de eventos... |`
     b. Eliminar cualquier otra mención de `/live` como página independiente
     c. Si la intro de la sección 1 dice "6 páginas", cambiar a "5 páginas"
     d. En la sección "Tiempo real (Socket.IO)" NO eliminar la mención de LiveFeed (sigue existiendo)
     Parallelization: Wave 1 | Blocked by: — | Blocks: —
     References: `apps/frontend/README.md` — sección 1 (tabla de rutas), sección 4 (Tiempo real)
     Acceptance criteria (agent-executable): `grep "/live" apps/frontend/README.md` retorna exit code 1.
     QA scenarios:
  - Happy: verificar que el README menciona "5 páginas" en vez de "6", y que LiveFeed sigue documentado en la sección de Tiempo real
  - Failure: se eliminó accidentalmente la mención de LiveFeed en la sección 4 → `grep "LiveFeed" apps/frontend/README.md` debe retornar matches
    Commit: N

- [x] 4. Actualizar frontend AGENTS.md
     What to do / Must NOT do: Editar `apps/frontend/AGENTS.md` — eliminar la línea `- **Live route** — \`/live\` redirects to \`/tokens\`. No separate live page exists.`Parallelization: Wave 1 | Blocked by: — | Blocks: —
References:`apps/frontend/AGENTS.md:106`Acceptance criteria (agent-executable):`grep -i "live route" apps/frontend/AGENTS.md` retorna exit code 1.
     QA scenarios:
  - Happy: la línea ya no aparece en AGENTS.md
  - Failure: se eliminó más de lo necesario → verificar que el resto del archivo está intacto (especialmente la sección de NOTES)
    Commit: N

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit — verificado: 4 cambios del scope IN ejecutados (NAV, routes, README, AGENTS.md)
- [x] F2. Code quality review — `tsc --noEmit` limpio; lint solo error pre-existente en `endpoints.ts` (no relacionado con este plan)
- [x] F3. Real manual QA — verificado por inspección de archivos: NAV array tiene 4 entradas (sin '/live'), routes.tsx no contiene '/live', LiveFeed widget intacto en dashboard/index.tsx. Commit 7a60cdd incluye los 4 archivos de scope.
- [x] F4. Scope fidelity — `grep` confirma que `/live` solo aparece en `widgets/live-feed/` y `dashboard/index.tsx` (esperado — LiveFeed widget preservado). Backend intacto.

## Commit strategy

Commit único al final, después de que todos los F-checks pasen:

```
chore(frontend): remove zombie /live route and nav link

- Remove "Live" nav link from header layout
- Remove /live → /tokens redirect route
- Update README and AGENTS.md to remove /live documentation
- LiveFeed widget preserved in Dashboard
```

## Success criteria

- El nav link "Live" ya no aparece en el header del Dashboard
- La URL `/live` ya no existe (da 404 o cae en el layout vacío)
- El widget LiveFeed sigue funcionando en el Dashboard
- README y AGENTS.md ya no mencionan `/live`
- TypeScript compila sin errores
- Linting pasa sin errores
