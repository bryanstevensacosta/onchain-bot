# Fix KOL + Publishing route mismatches (✅ COMPLETE)

## TL;DR

> **Quick Summary**: La página `/kols` no muestra datos porque los 3 controllers KOL del backend están montados con prefijo `kol/...` cuando TODA la documentación y el frontend esperan `telegram-kol/...`. Adicionalmente, los endpoints `/telegram-publishing/...` consumidos por el frontend no existen en el backend — el controller real es `VipCallsController` en `/vip-calls/...`. Se arreglan ambos bugs consolidando publishing en vip-calls.
>
> **Deliverables**:
> - 3 controllers KOL con prefijo correcto (`telegram-kol/...`)
> - 1 ruta nueva `/vip-calls/calls/failed` en el controller existente
> - `endpoints.ts` del frontend apuntando publishing a `/vip-calls/...`
> - Alias `TelegramPublishingModule` eliminado, imports actualizados a `VipCallsModule`
> - Verificación visual con Playwright de /kols y Dashboard
>
> **Estimated Effort**: Short (~30 min ejecución)
> **Parallel Execution**: YES — 6 tareas independientes en Wave 1, 1 verificación en Wave 2
> **Critical Path**: Tasks 1-6 (parallel) → Task 7 (Playwright verify)

---

## Context

### Original Request
> "porque http://localhost:5173/kols no muestra datos? accede con playwright mcp y diagnostiquemos la causa"

### Diagnóstico confirmado con curl en vivo

| Endpoint llamado por frontend | Status | Endpoint que sí funciona |
|---|---|---|
| `GET /telegram-kol/identity/kols` | **404** | `GET /kol/identity/kols` → 200 |
| `GET /telegram-kol/reputation/kols` | **404** | `GET /kol/reputation/kols` → 200 |
| `GET /telegram-kol/reputation/kols/top?limit=10` | **404** | `GET /kol/reputation/kols/top?limit=10` → 200 |
| `GET /telegram-publishing/calls/published` | **404** | (no existe) `GET /vip-calls/calls/published` → 200 |

**Causa raíz**:
1. Los 3 controllers KOL declaran `@Controller('kol/...')` en su código, pero TODA la documentación (backend README sec. 4, ambos BC READMEs en `apps/backend/src/kol/{identity,reputation}/README.md`, frontend README sec. 3, y `kol-refactor.md`) y el frontend (`apps/frontend/src/shared/api/endpoints.ts`) usan `telegram-kol/...`. El comentario JSDoc del propio `kol.controller.ts:18-23` ya documenta las rutas correctas como `telegram-kol/...`, confirmando que el prefijo actual es un bug.
2. `apps/backend/src/telegram/publishing.module.ts` es literalmente `export { VipCallsModule as TelegramPublishingModule }` — un alias que no añade rutas. El controller real es `VipCallsController` en `@Controller('vip-calls')` con 2 endpoints GET (`calls/published`, `calls/recent`) y 1 POST (`publish`). El use case `VipCallsListPublishedUseCase` soporta `kind: 'published' | 'failed' | 'recent'`, pero solo `published` y `recent` tienen ruta HTTP.

`main.ts` no usa `setGlobalPrefix`, así que las rutas son literalmente el string del decorador.

### Interview Summary
**Key Decisions**:
- Alcance: KOL + publishing (ambos bugs)
- Test strategy: Fix + verificación manual con Playwright (no TDD, no nuevos tests automatizados)
- "publishing no debería existir, debería usar vip-calls" → consolidar, NO crear controller nuevo en `/telegram-publishing`
- "en shared debería estar lo que es compartido" → no añadir wrappers paralelos, no crear abstracciones especulativas

**Research Findings**:
- Consumidores reales verificados: `usePublished` (Dashboard KPI), `useFailed` (exportado pero no usado por ningún componente), `useTopKolReputation` + `useKolReputationMap` (KOLs page)
- Consumidores NO usados: `recent`, `publish`, `byToken` — se mantienen los primeros 2 en endpoints.ts, se elimina `byToken`
- 2 archivos importan el alias `TelegramPublishingModule`: `app.module.ts` y `dashboard/dashboard.module.ts`

---

## Work Objectives

### Core Objective
Restaurar el flujo de datos de la página `/kols` y de los KPIs de Dashboard (Published) corrigiendo el mismatch de prefijos en los controllers KOL y consolidando los endpoints de publishing en vip-calls.

### Concrete Deliverables
1. 3 archivos backend modificados (controllers KOL, 1 línea cada uno)
2. 1 archivo backend nuevo método añadido (`vip-calls.controller.ts`)
3. 1 archivo backend eliminado (`publishing.module.ts`)
4. 2 archivos backend modificados (cambiar import del alias)
5. 1 archivo frontend modificado (`endpoints.ts`)
6. Verificación visual con Playwright (screenshots + console errors)

### Definition of Done
- [ ] `curl http://localhost:3030/telegram-kol/identity/kols` → 200 con JSON array
- [ ] `curl http://localhost:3030/telegram-kol/reputation/kols` → 200
- [ ] `curl http://localhost:3030/telegram-kol/reputation/kols/top?limit=10` → 200
- [ ] `curl http://localhost:3030/vip-calls/calls/published` → 200
- [ ] `curl http://localhost:3030/vip-calls/calls/recent` → 200
- [ ] `curl http://localhost:3030/vip-calls/calls/failed` → 200
- [ ] `curl http://localhost:3030/vip-calls/publish -X POST` → 200/201 (route exists, behavior not exercised)
- [ ] Página `/kols` carga datos (no "No reputation data yet" como síntoma de error)
- [ ] Dashboard `/` muestra KPI 📤 Published sin 404 en console
- [ ] Console del browser sin errores 404 para `/telegram-kol/*` ni `/telegram-publishing/*`

### Must Have
- Las 6 correcciones de código aplicadas
- Backend levantado y respondiendo en los nuevos paths
- Frontend servible sin errores de runtime
- Verificación con Playwright ejecutada y screenshots guardados

### Must NOT Have (Guardrails — del feedback del usuario)
- **NO crear un nuevo controller** en `/telegram-publishing/...` (el usuario explícitamente dijo: "publishing no debería existir, debería usar vip-calls")
- **NO añadir el path `/telegram-publishing/`** en ningún sitio nuevo del backend
- **NO crear archivos "shared" especulativos** sin un duplicado real que justifique la abstracción
- **NO tocar el frontend para KOL** (los endpoints `telegram-kol/...` ya son lo que el frontend espera)
- **NO reescribir use cases ni refactorizar lógica de negocio** — solo cambios de routing/URLs
- **NO añadir nuevos tests automatizados** (decisión del usuario: fix + verificación manual)
- **NO hacer rebuilds manuales** del backend (NestJS --watch debe hot-reload automáticamente)

---

## Verification Strategy

> **Cero tests automatizados nuevos** (decisión del usuario). Toda la verificación es ejecución directa con curl + Playwright.
>
> El Sisyphus ejecutor DEBE capturar evidencia en cada paso.

### Curl smoke tests (después de cada cambio de controller)
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3030/telegram-kol/identity/kols
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3030/telegram-kol/reputation/kols
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3030/telegram-kol/reputation/kols/top?limit=10"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3030/vip-calls/calls/published
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3030/vip-calls/calls/recent
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3030/vip-calls/calls/failed
```

### Playwright verification (Task 7)
- Navegar a `http://localhost:5173/kols`
- Capturar screenshot → `.sisyphus/evidence/task-7-kols-page.png`
- Verificar que NO aparece el texto `"No reputation data yet"` (era el síntoma del error)
- Verificar que la console NO contiene errores con status 404
- Navegar a `http://localhost:5173/` (Dashboard)
- Capturar screenshot → `.sisyphus/evidence/task-7-dashboard.png`
- Verificar KPI "📤 Published" renderiza (valor puede ser 0, pero sin error en console)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (todos en paralelo — 6 tareas independientes, archivos distintos):
├── Task 1: KOL identity controller prefix
├── Task 2: KOL reputation controller prefix
├── Task 3: KOL stats controller prefix
├── Task 4: Frontend endpoints.ts — redirect publishing → vip-calls
├── Task 5: Add /vip-calls/calls/failed route
└── Task 6: Remove TelegramPublishingModule alias + update 2 imports

Wave 2 (verificación — depende de Wave 1):
└── Task 7: Playwright verification (curl smoke + browser visual + console)

Critical Path: Wave 1 (parallel) → Task 7 → done
Max Concurrent: 6 (Wave 1)
```

### Dependency Matrix

- **Task 1**: — — Wave 2
- **Task 2**: — — Wave 2
- **Task 3**: — — Wave 2
- **Task 4**: — — Wave 2
- **Task 5**: — — Wave 2
- **Task 6**: — — Wave 2
- **Task 7**: 1, 2, 3, 4, 5, 6 — (final)

All 6 implementation tasks are independent of each other (different files, no shared types). Task 7 verifies everything.

---

## TODOs

- [ ] 1. Fix KOL identity controller prefix

  **What to do**:
  - Edit `apps/backend/src/kol/identity/api/http/kol.controller.ts` línea 25
  - Cambiar `@Controller('kol/identity')` → `@Controller('telegram-kol/identity')`
  - Verificar con curl que responde 200 (NestJS --watch recarga automático)

  **Must NOT do**:
  - No tocar ningún use case
  - No cambiar las firmas de los métodos (Get, Post, Param, etc.)
  - No renombrar archivos ni carpetas
  - No tocar otros controllers

  **Recommended Agent Profile**:
  - **Category**: `quick` (cambio trivial de 1 línea, archivo único)
  - **Skills**: `[]`
  - **Reason**: Single-line string change en un controller, sin lógica de negocio. trivial-high por volumen pero quick por alcance.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (con Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References** (CRITICAL — Be Exhaustive):
  - **Pattern References**: `apps/backend/src/kol/identity/api/http/kol.controller.ts:18-24` (el comentario JSDoc del propio archivo YA documenta las rutas correctas como `telegram-kol/...`, es la prueba interna de que este prefijo es el intended)
  - **API/Type References**: `apps/frontend/src/shared/api/endpoints.ts:3` (el frontend espera `/telegram-kol/identity/kols`)
  - **Test References**: N/A (no TDD)
  - **External References**: N/A (NestJS standard)

  **Acceptance Criteria**:
  - [ ] `curl http://localhost:3030/telegram-kol/identity/kols` → 200, retorna JSON array
  - [ ] `curl http://localhost:3030/kol/identity/kols` → 404 (confirma que el path viejo ya no existe)
  - [ ] Console del browser en `/kols` no contiene errores 404 para `/telegram-kol/*`
  - [ ] No se rompe ningún test existente (`npm run test:backend` pasa)

  **Commit**: NO (commits agrupados al final del plan, ver Commit Strategy)

- [ ] 2. Fix KOL reputation controller prefix

  **What to do**:
  - Edit `apps/backend/src/kol/reputation/api/http/kol-reputation.controller.ts` línea 11
  - Cambiar `@Controller('kol/reputation')` → `@Controller('telegram-kol/reputation')`
  - Verificar con curl

  **Must NOT do**:
  - No tocar use cases
  - No cambiar firmas
  - No mover archivos

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (con Tasks 1, 3, 4, 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - **Pattern References**: `apps/backend/src/kol/reputation/api/http/kol-reputation.controller.ts:11`
  - **API/Type References**: `apps/frontend/src/shared/api/endpoints.ts:68-70` (rutas esperadas por el frontend)
  - **Test References**: N/A
  - **External References**: N/A

  **Acceptance Criteria**:
  - [ ] `curl http://localhost:3030/telegram-kol/reputation/kols` → 200
  - [ ] `curl "http://localhost:3030/telegram-kol/reputation/kols/top?limit=10"` → 200
  - [ ] `curl http://localhost:3030/kol/reputation/kols` → 404

  **Commit**: NO (agrupado al final)

- [ ] 3. Fix KOL stats controller prefix

  **What to do**:
  - Edit `apps/backend/src/kol/stats/api/http/kol-stats.controller.ts` línea 13
  - Cambiar `@Controller('kol/stats')` → `@Controller('telegram-kol/stats')`
  - Verificar con curl

  **Must NOT do**:
  - No tocar lógica
  - No añadir nuevos endpoints (este controller existe pero no es consumido por el frontend; es solo para consistencia de routing)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - **Pattern References**: `apps/backend/src/kol/stats/api/http/kol-stats.controller.ts:13`
  - **API/Type References**: N/A (frontend no consume stats endpoints actualmente)
  - **Test References**: N/A

  **Acceptance Criteria**:
  - [ ] `curl http://localhost:3030/telegram-kol/stats/kol-leaderboard` → 200
  - [ ] `curl http://localhost:3030/telegram-kol/stats/top-calls` → 200
  - [ ] `curl http://localhost:3030/telegram-kol/stats/roi-trends` → 200
  - [ ] `curl http://localhost:3030/telegram-kol/stats/alpha-callers` → 200
  - [ ] `curl http://localhost:3030/kol/stats/kol-leaderboard` → 404

  **Commit**: NO (agrupado al final)

- [ ] 4. Frontend endpoints.ts — redirect publishing → vip-calls

  **What to do**:
  - Edit `apps/frontend/src/shared/api/endpoints.ts`
  - Cambiar la sección `publishing` (líneas 9-16):
    - `published: '/telegram-publishing/calls/published'` → `'/vip-calls/calls/published'`
    - `failed: '/telegram-publishing/calls/failed'` → `'/vip-calls/calls/failed'`
    - `recent: '/telegram-publishing/calls/recent'` → `'/vip-calls/calls/recent'`
    - `byToken: (chain, address) => \`/telegram-publishing/calls/${chain}/${address}\`` → **ELIMINAR**
    - `publish: '/telegram-publishing/publish'` → `'/vip-calls/publish'`
  - Verificar que Vite hot-reload aplica los cambios

  **Must NOT do**:
  - No añadir un nuevo `telegram-publishing` endpoint
  - No crear un wrapper "shared" especulativo
  - No renombrar la key `publishing` (es consumida por `published-queries.ts`)
  - No tocar otras secciones de `endpoints.ts` (kols, reputation, etc. ya son correctas)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - **Pattern References**: `apps/backend/src/telegram/vip-calls-channel/api/http/vip-calls.controller.ts:5,12,19,30` (rutas reales que expone el backend)
  - **API/Type References**: `apps/frontend/src/entities/published-call/api/published-queries.ts:13-26` (consumidores: `fetchPublished`, `fetchFailed`)
  - **Test References**: N/A
  - **External References**: N/A

  **Acceptance Criteria**:
  - [ ] `endpoints.ts` línea `published` → `/vip-calls/calls/published`
  - [ ] `endpoints.ts` línea `failed` → `/vip-calls/calls/failed`
  - [ ] `endpoints.ts` línea `recent` → `/vip-calls/calls/recent`
  - [ ] `endpoints.ts` línea `publish` → `/vip-calls/publish`
  - [ ] `endpoints.ts` NO contiene key `byToken` en la sección `publishing`
  - [ ] El resto del archivo no cambia (kols, reputation, etc. intactos)
  - [ ] `npm run lint:frontend` pasa (no errores)

  **Commit**: NO (agrupado al final)

- [ ] 5. Add /vip-calls/calls/failed route

  **What to do**:
  - Edit `apps/backend/src/telegram/vip-calls-channel/api/http/vip-calls.controller.ts`
  - Añadir nuevo método después de `published()` (después de línea 28):
    ```ts
    @Get('calls/failed')
    public async failed(
      @Query('limit') limit?: string,
    ): Promise<VipCallsPublishOutput[]> {
      const parsed = limit ? parseInt(limit, 10) : 20;
      return this.listPublishedUseCase.execute({ kind: 'failed', limit: parsed });
    }
    ```
  - El use case ya soporta `kind: 'failed'` (verificado en `vip-calls-list-published.use-case.ts:6`)
  - Verificar con curl

  **Must NOT do**:
  - No modificar los métodos existentes (`publish`, `published`, `recent`)
  - No cambiar el `@Controller('vip-calls')` decorator
  - No crear un nuevo controller ni archivo

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - **Pattern References**: `apps/backend/src/telegram/vip-calls-channel/api/http/vip-calls.controller.ts:19-28` (estructura del método `published` que vamos a replicar para `failed`)
  - **API/Type References**: `apps/backend/src/telegram/vip-calls-channel/application/handlers/vip-calls-list-published.use-case.ts:6` (constata que `kind: 'failed'` está soportado en el type union)
  - **Test References**: N/A
  - **External References**: N/A

  **Acceptance Criteria**:
  - [ ] Método `failed()` añadido al controller, con mismo patrón que `published()`
  - [ ] `curl http://localhost:3030/vip-calls/calls/failed` → 200
  - [ ] `curl "http://localhost:3030/vip-calls/calls/failed?limit=10"` → 200
  - [ ] `npm run test:backend` pasa (no rompe tests existentes)

  **Commit**: NO (agrupado al final)

- [ ] 6. Remove TelegramPublishingModule alias + update imports

  **What to do**:
  - **Eliminar** el archivo `apps/backend/src/telegram/publishing.module.ts` (1 línea que solo es un alias)
  - **Editar** `apps/backend/src/app.module.ts`:
    - Línea 17: cambiar `import { TelegramPublishingModule } from 'telegram/publishing.module';` → `import { VipCallsModule } from 'telegram/vip-calls-channel/vip-calls.module';`
    - Línea 57: cambiar `TelegramPublishingModule,` → `VipCallsModule,`
  - **Editar** `apps/backend/src/dashboard/dashboard.module.ts`:
    - Línea 5: cambiar `import { TelegramPublishingModule } from 'telegram/publishing.module';` → `import { VipCallsModule } from 'telegram/vip-calls-channel/vip-calls.module';`
    - Línea 21: cambiar `TelegramPublishingModule,` → `VipCallsModule,`
  - Verificar con `grep -rn "TelegramPublishingModule\|publishing.module" apps/backend/src/` que no quedan referencias

  **Must NOT do**:
  - No renombrar la carpeta `vip-calls-channel` ni sus archivos
  - No mover lógica de vip-calls a otro sitio
  - No eliminar la carpeta `telegram/`
  - No añadir un nuevo "TelegramPublishingController" (el usuario explícitamente dijo que NO debe existir)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - **Pattern References**: `apps/backend/src/telegram/publishing.module.ts:1` (el archivo a eliminar)
  - **API/Type References**: `apps/backend/src/app.module.ts:17,57` y `apps/backend/src/dashboard/dashboard.module.ts:5,21` (sitios de import a actualizar)
  - **Test References**: N/A
  - **External References**: N/A

  **Acceptance Criteria**:
  - [ ] Archivo `publishing.module.ts` eliminado
  - [ ] `app.module.ts` importa `VipCallsModule` directamente, no el alias
  - [ ] `dashboard.module.ts` importa `VipCallsModule` directamente, no el alias
  - [ ] `grep -rn "TelegramPublishingModule" apps/backend/src/` → sin resultados
  - [ ] `grep -rn "publishing.module" apps/backend/src/` → sin resultados
  - [ ] Backend arranca sin errores (`npm run dev:backend` levanta NestJS OK)
  - [ ] Dashboard sigue funcionando (porque sigue importando el mismo módulo, ahora con nombre real)

  **Commit**: NO (agrupado al final)

- [ ] 7. Playwright verification (manual, no automated tests)

  **What to do**:
  - **Smoke tests con curl** (debe ejecutarse primero, rápido):
    ```bash
    for path in \
      "telegram-kol/identity/kols" \
      "telegram-kol/reputation/kols" \
      "telegram-kol/reputation/kols/top?limit=10" \
      "telegram-kol/stats/kol-leaderboard" \
      "vip-calls/calls/published" \
      "vip-calls/calls/recent" \
      "vip-calls/calls/failed"; do
      code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3030/$path")
      echo "$code $path"
    done
    ```
    Todos deben ser **200**.
  - **Playwright** con skill `/playwright`:
    1. `browser_navigate` a `http://localhost:5173/kols`
    2. `browser_console_messages` con `level: error` — verificar 0 errores 404 para `/telegram-kol/*` o `/telegram-publishing/*`
    3. `browser_snapshot` — capturar la estructura de la página
    4. `browser_take_screenshot` → guardar en `.sisyphus/evidence/task-7-kols-page.png`
    5. `browser_navigate` a `http://localhost:5173/`
    6. Repetir console + snapshot + screenshot → `.sisyphus/evidence/task-7-dashboard.png`
  - **Verificación final visual**:
    - En `/kols`: NO debe aparecer texto "No reputation data yet" (ese era el síntoma del bug)
    - En `/kols`: debe haber al menos 1 fila de KOL O el mensaje "No hay KOLs registrados" (este último es legítimo si la DB está vacía, pero la diferencia es que NO hay error 404)
    - En Dashboard: el KPI "📤 Published" debe renderizar un número (puede ser 0 si no hay datos)
    - Console de ambas páginas: 0 errores 404

  **Must NOT do**:
  - No escribir tests automatizados nuevos (decisión del usuario)
  - No usar curl con payloads que muten datos
  - No navegar a /ops ni ejecutar replays

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (verificación end-to-end con browser automation + análisis de evidencia)
  - **Skills**: `['playwright']`
  - **Reason**: Requiere navegación real, captura de console, screenshots, interpretación visual. Es el gate de "Definition of Done" — el usuario necesita ver evidencia, no solo "tests pass".

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Final (Wave 2)
  - **Blocks**: nada (es la última)
  - **Blocked By**: Tasks 1, 2, 3, 4, 5, 6

  **References**:
  - **Pattern References**: N/A (es verification)
  - **API/Type References**: N/A
  - **Test References**: N/A
  - **External References**: skill `/playwright` ya cargado

  **Acceptance Criteria**:
  - [ ] Output de los 7 curls con smoke test → todos `200`
  - [ ] `task-7-kols-page.png` capturado en `.sisyphus/evidence/`
  - [ ] `task-7-dashboard.png` capturado en `.sisyphus/evidence/`
  - [ ] `browser_console_messages` para `/kols` → sin errores 404 (puede haber otros errores no relacionados)
  - [ ] `browser_console_messages` para `/` → sin errores 404 para `/telegram-publishing/*` o `/telegram-kol/*`
  - [ ] El snapshot de `/kols` NO contiene el texto "No reputation data yet" (o si lo contiene, es legítimo: el backend devolvió `[]` para `useTopKolReputation`, lo cual es OK si no hay datos)
  - [ ] El snapshot de `/kols` muestra el header "🏆 KOL reputation leaderboard" con tabla

  **Commit**: NO (verificación, no código)

---

## Commit Strategy

Todos los commits al final, después de que Task 7 confirme que todo funciona. Conventional Commits agrupados por concern:

```bash
# Después de Task 7 OK
git add apps/backend/src/kol/{identity,reputation,stats}/api/http/*.controller.ts
git commit -m "fix(kol): align controller prefixes to telegram-kol/ per docs and frontend"

git add apps/backend/src/telegram/vip-calls-channel/api/http/vip-calls.controller.ts
git commit -m "feat(vip-calls): add GET /calls/failed route (use case already supports kind: 'failed')"

git add apps/backend/src/telegram/publishing.module.ts \
        apps/backend/src/app.module.ts \
        apps/backend/src/dashboard/dashboard.module.ts
git commit -m "refactor(backend): remove TelegramPublishingModule alias, import VipCallsModule directly"

git add apps/frontend/src/shared/api/endpoints.ts
git commit -m "fix(frontend): point publishing endpoints to vip-calls (consolidate, no telegram-publishing wrapper)"
```

---

## Success Criteria

### Verification Commands
```bash
# Curl smoke (todos deben ser 200)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3030/telegram-kol/identity/kols
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3030/telegram-kol/reputation/kols
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3030/telegram-kol/reputation/kols/top?limit=10"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3030/telegram-kol/stats/kol-leaderboard
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3030/vip-calls/calls/published
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3030/vip-calls/calls/recent
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3030/vip-calls/calls/failed

# Backend arranca
cd apps/backend && npm run start:dev  # debe levantar sin errores de import

# Frontend lint pasa
cd apps/frontend && npm run lint

# Backend tests siguen pasando
cd apps/backend && npm test
```

### Final Checklist
- [ ] 3 controllers KOL con `@Controller('telegram-kol/...')`
- [ ] 1 nueva ruta `@Get('calls/failed')` en vip-calls controller
- [ ] `publishing.module.ts` eliminado
- [ ] `app.module.ts` y `dashboard.module.ts` importan `VipCallsModule` directamente
- [ ] `endpoints.ts` publishing.* apunta a `/vip-calls/...`
- [ ] `byToken` eliminado de `endpoints.ts`
- [ ] Sin referencias a `TelegramPublishingModule` o `telegram-publishing` (paths) en el código
- [ ] Playwright muestra `/kols` con datos (no "No reputation data yet" como síntoma de error)
- [ ] Playwright muestra Dashboard con KPI Published sin errores 404 en console
- [ ] Screenshots guardados en `.sisyphus/evidence/task-7-*.png`
