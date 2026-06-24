# Fix Market Snapshots + [object Object] in Tokens Explorer

## TL;DR

> **Quick Summary**: Regresión tras commit `1221f21` (consolidación `token/market-data` → `chain/explorer`) dejó `ChainExplorerModule` sin registrar en `AppModule`, causando que TODOS los endpoints de snapshots devuelvan 404. Fix de 1 línea + verificación end-to-end. Bug secundario del `[object Object]` ya está parcialmente resuelto en cambios uncommitted del usuario; se confirma y se añade defensive coding si persiste.

> **Deliverables**:
> - `apps/backend/src/app.module.ts` — agregar `ChainExplorerModule` a imports
> - Backend reiniciado y respondiendo 200 en `/token/market-data/snapshots/...`
> - Frontend en `/tokens` mostrando nombres de tokens, imágenes y razones legibles
> - Captura playwright como evidencia

> **Estimated Effort**: Short (15-20 min ejecución)
> **Parallel Execution**: NO (Backend fix es prerequisito de frontend verification)
> **Critical Path**: Task 1 (backend fix) → Task 2 (frontend verify + opcional defensive coding)

---

## Context

### Original Request (user)
> "Los market snapshots no están visibles, accede con mcp playwright http://localhost:5173/tokens"

### Interview Summary

**Key Discussions**:
- Alcance: Ambos bugs (snapshots + [object Object])
- Historia: Regresión reciente (antes funcionaba)
- Estrategia: Diagnosticar primero, planificar fix después
- Idioma: Español

**Research Findings**:
- Frontend: React 18 + Vite 5 + TanStack Query v5 + Tailwind 3 (puerto 5173, llama API directamente via `API_BASE_URL='http://localhost:3030'` — NO usa Vite proxy)
- Backend: NestJS 11 + TypeORM + Postgres (puerto 3030)
- Arquitectura hexagonal con 16 Bounded Contexts
- 306 tests backend pasando
- Frontend FSD: pages/ entities/ widgets/ features/ shared/
- Captura `.playwright-mcp/tokens-screenshot.png` muestra tokens con placeholder `+`, sin nombre/ticker/imagen, y `[object Object]` literal bajo REJECTED

### Diagnóstico (evidencia curl)

```
GET http://localhost:3030/token/market-data/snapshots/ethereum/0x345a...
→ 404 {"message":"Cannot GET /token/market-data/snapshots/ethereum/0x345a...","error":"Not Found","statusCode":404}

GET http://localhost:3030/token/market-data/snapshots/recent?limit=3
→ 404 (idem)

GET http://localhost:3030/token/token-gating/decisions/recent?limit=3
→ 200 [...] (funciona — confirma que solo el módulo de snapshots está roto)
```

**Causa raíz primaria**: `apps/backend/src/app.module.ts` NO importa `ChainExplorerModule`. La consolidación `1221f21` movió el `EnrichmentController` a `ChainExplorerModule` pero olvidó registrar ese módulo en `AppModule.imports`. Los demás endpoints funcionan porque sus módulos SÍ están importados.

**Causa raíz secundaria**: La página renderizaba `decision.reasons.join(', ')` (asumiendo `reasons: string[]`) cuando ahora la API retorna `reasons: {code, message}[]`. El usuario YA actualizó el código en cambios uncommitted (`r.message`) — debería funcionar tras refrescar la página. Si Vite no recargó, añadir defensive coding.

### Cambios uncommitted existentes (NO committear automáticamente, forman parte del fix)

- `apps/frontend/src/entities/filter-decision/model/types.ts` — `reasons: string[]` → `{code, message}[]`
- `apps/frontend/src/shared/realtime/events.ts` — mismo cambio
- `apps/frontend/src/pages/tokens-explorer/index.tsx` — usa `r.message`
- `apps/frontend/src/pages/token-detail/index.tsx` — image fallback

### Metis Review (self-review, agent no disponible en sesión)

**Gaps identificados (clasificados y resueltos)**:
- **MINOR (auto-resuelto)**: No hay test infrastructure para UI — usar Playwright via MCP como QA principal.
- **AMBIGUOUS (default aplicado)**: Si DB in-memory no tiene snapshots persistidos, endpoint retornará "data not found" (no 404 de ruta). Defensive QA: verificar con `?limit=3` en `/recent` que al menos retorna array.
- **AMBIGUOUS (default aplicado)**: Si `[object Object]` persiste tras fix backend + refresh, añadir guard `typeof r.message === 'string' ? r.message : String(r?.message ?? '')`. Riesgo: enmascara futuros bugs, pero el guard es defensivo y mantiene UI robusta.
- **CRITICAL (resuelto)**: Verificar que `ChainExplorerModule` no requiere imports adicionales que falten. Revisado: solo importa `ChainRegistryModule` (ya en app.module.ts). No hay dependencias circulares.
- **MINOR (auto-resuelto)**: QA debe incluir happy path (token con datos completos) + failure path (endpoint roto → ver cómo UI degrada).

---

## Work Objectives

### Core Objective
Restaurar la visibilidad de market snapshots en `/tokens` registrando el módulo faltante, y asegurar que las rejection reasons se rendericen correctamente (sin `[object Object]` literal).

### Concrete Deliverables
- `apps/backend/src/app.module.ts` modificado con `ChainExplorerModule` en imports
- Backend reiniciado y respondiendo HTTP 200 en `/token/market-data/snapshots/...`
- Frontend `/tokens` muestra nombres, tickers e imágenes de tokens (no solo placeholders)
- Frontend `/tokens` muestra razones de rechazo legibles (strings, no `[object Object]`)
- Captura `.sisyphus/evidence/task-2-tokens-page-fixed.png` confirmando fix visual

### Definition of Done
- [ ] `curl 'http://localhost:3030/token/market-data/snapshots/solana/<addr>'` responde 200 con JSON `TokenSnapshotView`
- [ ] Playwright abre `http://localhost:5173/tokens`, hace screenshot, verifica visualmente: tokens con imagen + nombre + ticker + razones legibles
- [ ] Backend log no muestra errores al registrar `ChainExplorerModule`

### Must Have
- Backend fix registrado
- Verificación curl + playwright exitosa
- Si bug 2 persiste tras Task 1: añadir defensive coding en el render de reasons

### Must NOT Have (Guardrails)
- NO refactorizar `DecisionRow` más allá del defensive coding
- NO cambiar el path del endpoint
- NO cambiar el mapper del backend
- NO committear cambios uncommitted del usuario automáticamente (van en este plan)
- NO tocar otras páginas
- NO añadir nuevos tests automatizados (no hay infrastructure; QA es por Playwright)
- NO añadir dependencias nuevas

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - Toda verificación es agent-executed.

### Test Decision
- **Infrastructure exists**: Backend SÍ (Jest, 306 tests). Frontend NO (sin vitest/jest configurados).
- **Automated tests**: NONE para este fix (no aplica TDD aquí; es bug de integration config + verificación visual)
- **Agent-Executed QA**: SIEMPRE — el ejecutor usa curl + Playwright MCP para verificar.

### QA Policy
Cada task incluye scenarios agent-executed. Evidence en `.sisyphus/evidence/task-{N}-*.{ext}`.

- **Backend**: `curl` directo a `http://localhost:3030/...` con asserts de status + JSON shape
- **Frontend**: Playwright MCP — navegar, screenshot, asserts sobre DOM

---

## Execution Strategy

### Parallel Execution Waves

Este es un fix de regresión pequeño y **secuencial por naturaleza** (backend fix es prerequisito de frontend verification). NO aplicar paralelización forzada.

```
Wave 1 (Backend Fix + Restart):
└── Task 1: Add ChainExplorerModule + restart + curl verify

Wave 2 (Frontend Verification + optional defensive coding):
└── Task 2: Playwright verify both bugs fixed; add defensive guard if needed

Wave FINAL (Audit):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA via playwright (unspecified-high)
└── F4: Scope fidelity check (deep)
```

---

## TODOs

<!-- Tasks inserted by Edit-append below -->

- [ ] 1. Registrar `ChainExplorerModule` en `AppModule.imports` + restart + curl verify

  **What to do**:
  - Editar `apps/backend/src/app.module.ts`
  - Agregar `import { ChainExplorerModule } from 'chain/explorer/chain-explorer.module';` después de la línea de `ChainRegistryModule` (línea ~12)
  - Agregar `ChainExplorerModule,` al array `imports` del `@Module({...})`, justo después de `ChainRegistryModule` (línea ~49)
  - Verificar visualmente que NO hay imports duplicados y que el orden es lógico
  - Matar el proceso backend si está corriendo: `pkill -f "nest start"` o equivalente
  - Reiniciar backend: `cd apps/backend && npm run start:dev` (o el script que uses; ver `apps/backend/package.json` scripts)
  - Esperar a que el log muestre "Nest application successfully started" o equivalente (timeout 30s)
  - `curl 'http://localhost:3030/token/market-data/snapshots/recent?limit=3'` y validar status 200 + array JSON
  - `curl 'http://localhost:3030/token/market-data/snapshots/solana/2axlesljzu1hsyyj5hueijph59tzybyb3j9qbt7ppump'` y validar 200 con JSON (puede ser 404 NOT_FOUND si no hay datos, pero NO route-not-found de NestJS)
  - `curl 'http://localhost:3030/token/token-gating/decisions/recent?limit=1'` y validar que SIGUE funcionando (regression check)

  **Must NOT do**:
  - NO agregar imports duplicados
  - NO cambiar el path `@Controller('token/market-data')` en el controller
  - NO modificar el `ChainExplorerModule` mismo
  - NO committear cambios del frontend en este task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Cambio mínimo (1 línea + restart), bajo riesgo, fix de config
  - **Skills**: []
    - Sin skills especiales; es un edit + shell restart + curl

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (única task de Wave 1)
  - **Blocks**: Task 2 (frontend verification depende del backend funcionando)
  - **Blocked By**: None (puede empezar inmediatamente)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `apps/backend/src/app.module.ts:42-58` — patrón actual de imports de módulos en `AppModule`. Replicar el orden (ChainRegistryModule ya está; agregar ChainExplorerModule después)

  **API/Type References** (contracts to implement against):
  - `apps/backend/src/chain/explorer/api/http/enrichment.controller.ts:8-9` — confirma `@Controller('token/market-data')` (path NO cambia)
  - `apps/frontend/src/entities/token-snapshot/model/types.ts:1-30` — `TokenSnapshotView` interface (lo que el frontend espera)

  **External References** (libraries and frameworks):
  - NestJS Module system: `https://docs.nestjs.com/modules` — recordatorio de que módulos NO registrados no se cargan

  **WHY Each Reference Matters**:
  - `app.module.ts:42-58`: el ejecutor debe ver el patrón existente de cómo se importan módulos hermanos (mismo style: import al top, agregar al array). NO inventar una sintaxis nueva.
  - `enrichment.controller.ts:8-9`: confirma que el controller ya tiene el path correcto. NO cambiar path; el fix es solo registrar el módulo.
  - `types.ts`: para que el ejecutor sepa qué shape validar en el curl response (campos como `priceUsd`, `imageUrls`, `name`).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Snapshot endpoint returns 200 after fix
    Tool: Bash (curl)
    Preconditions: Backend reiniciado con ChainExplorerModule registrado
    Steps:
      1. Ejecutar: curl -s -w "\n%{http_code}" 'http://localhost:3030/token/market-data/snapshots/recent?limit=3'
      2. Validar que el status code es 200 (no 404)
      3. Validar que el body es un array JSON (puede ser [])
      4. Validar que NO contiene "Cannot GET" (ese era el error de route-not-found)
    Expected Result: HTTP 200 + JSON array (posiblemente vacío)
    Failure Indicators: HTTP 404 con body `{"message":"Cannot GET /token/market-data/snapshots/...",...}` significa que el módulo SIGUE sin estar registrado
    Evidence: .sisyphus/evidence/task-1-snapshots-recent-200.txt

  Scenario: Snapshot endpoint with chain/address returns 200 or data-not-found (not route-not-found)
    Tool: Bash (curl)
    Preconditions: Backend reiniciado
    Steps:
      1. Ejecutar: curl -s -w "\n%{http_code}" 'http://localhost:3030/token/market-data/snapshots/solana/2axlesljzu1hsyyj5hueijph59tzybyb3j9qbt7ppump'
      2. Validar status code: debe ser 200 (con datos) o 404 con mensaje NOT_FOUND (sin datos)
      3. Si 404: el body debe ser `{"message":"...NOT_FOUND...","error":"...","statusCode":404}` — NO "Cannot GET"
    Expected Result: 200 con JSON TokenSnapshotView OR 404 NOT_FOUND (data)
    Failure Indicators: 404 con "Cannot GET" = módulo sigue sin registrar
    Evidence: .sisyphus/evidence/task-1-snapshot-by-token.txt

  Scenario: Regression check — filters endpoint still works
    Tool: Bash (curl)
    Preconditions: Backend reiniciado
    Steps:
      1. Ejecutar: curl -s 'http://localhost:3030/token/token-gating/decisions/recent?limit=1'
      2. Validar status 200 + array no vacío
    Expected Result: HTTP 200 con array de FilterDecisionView
    Failure Indicators: Si 404 = algo se rompió al agregar el nuevo módulo (no debería pasar, pero validar)
    Evidence: .sisyphus/evidence/task-1-filters-regression.txt

  Scenario: Backend log shows no DI errors
    Tool: Bash (read log file or use background log capture)
    Preconditions: Backend reiniciado en este task
    Steps:
      1. Capturar últimas 50 líneas del log backend (archivo `apps/backend/backend.log` o stdout si está en foreground)
      2. Buscar substrings: "Nest application successfully started", "Error", "Circular dependency"
      3. Validar presencia de "successfully started" y ausencia de "Error" o "Circular"
    Expected Result: Log muestra startup exitoso sin errores
    Failure Indicators: Cualquier "Error" o "Circular dependency" en el log
    Evidence: .sisyphus/evidence/task-1-backend-log.txt
  ```

  **Commit**: YES
  - Message: `fix(backend): register ChainExplorerModule in AppModule (restores /token/market-data/snapshots endpoints)`
  - Files: `apps/backend/src/app.module.ts`
  - Pre-commit: backend boot sin errores

---

- [ ] 2. Verificar fix en frontend via Playwright + añadir defensive coding si persiste [object Object]

  **What to do**:
  - Asegurar que backend está corriendo (verificar Task 1 curl OK)
  - Asegurar que frontend dev server está corriendo en `:5173` (si no, `cd apps/frontend && npm run dev`)
  - Usar Playwright MCP para navegar a `http://localhost:5173/tokens`
  - Esperar a que la página cargue completamente (esperar selector de tabs "All/Approved/Rejected")
  - Esperar ~3 segundos adicionales para que TanStack Query ejecute polling y cargue snapshots
  - Tomar screenshot full-page: `.sisyphus/evidence/task-2-tokens-page-fixed.png`
  - Capturar accessibility tree (similar a `.playwright-mcp/tokens-page.yml`) y guardar como `.sisyphus/evidence/task-2-tokens-accessibility.yml`
  - **Verificación Bug 1 (snapshots visibles)**:
    - En el accessibility tree, NO debería haber muchos elementos `img "placeholder"` (solo fallback si no hay imagen)
    - Debería haber elementos `img` con alt text de token name (e.g., "Wrapped Ether", "$WIF")
    - Debería haber elementos `generic` con texto de token name (no solo dirección truncada)
    - Al menos UN token en la lista debe tener imagen real Y nombre Y ticker visibles
  - **Verificación Bug 2 (reasons legibles)**:
    - En tokens con verdict REJECTED, NO debería aparecer el texto literal `[object Object]`
    - El span bajo REJECTED debería contener texto de razón (e.g., "Score 30 < 50 threshold", "SCORE_TOO_LOW: ..." o similar)
  - **Si Bug 2 persiste** (sigue apareciendo `[object Object]`):
    - Editar `apps/frontend/src/pages/tokens-explorer/index.tsx`
    - Reemplazar las líneas 101 y 103 (`decision.reasons.map((r) => r.message).join(', ')`) con guard defensivo:
      ```ts
      decision.reasons.map((r) => typeof r.message === 'string' ? r.message : String(r?.message ?? '')).join(', ')
      ```
    - Volver a tomar screenshot para confirmar fix
  - **Si Bug 1 persiste** (sigue sin snapshots):
    - Investigar: probablemente los repos in-memory están vacíos (DB está vacía al reiniciar). Para validar el FIX del módulo, ejecutar el endpoint via curl directamente (ya hecho en Task 1). El frontend puede mostrar placeholders si los repos están vacíos — eso es ESPERADO, no es bug.
    - En este caso, documentar en evidence que el fix del módulo está confirmado via curl pero los snapshots están vacíos en memoria.

  **Must NOT do**:
  - NO cambiar la lógica de polling/tanstack-query
  - NO añadir nuevas llamadas API
  - NO modificar los tipos
  - NO añadir componentes visuales nuevos
  - El defensive coding debe ser MÍNIMO y conservador (no más de 1-2 líneas)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requiere uso de Playwright MCP para verificación visual + decisión condicional sobre defensive coding
  - **Skills**: [playwright]
    - `playwright`: para automatizar browser, screenshot, accessibility tree

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (única task de Wave 2)
  - **Blocks**: Final Verification Wave (F1-F4)
  - **Blocked By**: Task 1 (backend debe estar funcionando)

  **References**:

  **Pattern References** (existing code to follow):
  - `apps/frontend/src/pages/tokens-explorer/index.tsx:96-105` — el span donde se renderiza reasons (target del defensive coding si aplica)

  **External References** (libraries and frameworks):
  - Playwright MCP usage: ver comando `/playwright` del entorno
  - Accessibility tree format: similar a `.playwright-mcp/tokens-page.yml` existente

  **WHY Each Reference Matters**:
  - `tokens-explorer/index.tsx:96-105`: target exacto del defensive coding si Bug 2 persiste. El ejecutor debe ver el código actual antes de modificarlo.
  - Playwright MCP: el ejecutor debe saber cómo tomar screenshots y accessibility tree. La estructura de los artifacts existentes (`.playwright-mcp/tokens-page.yml`) sirve como template.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Frontend page loads and shows tokens with snapshot data (happy path)
    Tool: Playwright (MCP) — browser_navigate + browser_snapshot + browser_take_screenshot
    Preconditions: Backend en :3030 + frontend en :5173 ambos corriendo
    Steps:
      1. browser_navigate('http://localhost:5173/tokens')
      2. Esperar 5 segundos para que la página cargue y TanStack Query ejecute
      3. browser_snapshot() para obtener accessibility tree
      4. browser_take_screenshot(filename='tokens-page-fixed.png', fullPage=true)
      5. En el accessibility tree, buscar tokens con imagen (no solo 'img "placeholder"')
      6. Buscar elementos generic con texto que NO sea solo dirección truncada (0x..., 2axles...)
    Expected Result: Al menos 1 token muestra: imagen real, nombre de token, ticker
    Failure Indicators: Todos los tokens muestran 'img "placeholder"' y solo dirección = Bug 1 persiste (puede ser por datos vacíos, ver siguiente scenario)
    Evidence: .sisyphus/evidence/task-2-tokens-page-fixed.png + .sisyphus/evidence/task-2-tokens-accessibility.yml

  Scenario: No [object Object] in rejected tokens
    Tool: Playwright (MCP) — grep accessibility tree or use page evaluate
    Preconditions: Page cargada
    Steps:
      1. En el accessibility tree (del paso anterior), buscar elementos con texto '[object Object]'
      2. Contar ocurrencias
      3. Si count > 0: Bug 2 persiste, aplicar defensive coding
    Expected Result: count('[object Object]') === 0
    Failure Indicators: Cualquier '[object Object]' significa que el render de reasons falla
    Evidence: conteo documentado en .sisyphus/evidence/task-2-no-object-object.txt

  Scenario: (Conditional) Verify defensive coding works if applied
    Tool: Playwright (MCP)
    Preconditions: Bug 2 detectado en scenario anterior; defensive coding aplicado
    Steps:
      1. Vite HMR debería recargar automáticamente
      2. Esperar 3 segundos
      3. browser_navigate('http://localhost:5173/tokens') (hard refresh)
      4. Esperar 5 segundos
      5. browser_snapshot()
      6. Buscar '[object Object]' en tree → debe ser 0
      7. Verificar que las reasons SÍ muestran algún texto (string vacío o mensaje)
    Expected Result: '[object Object]' ya no aparece; las reasons pueden mostrar string vacío o el mensaje extraído
    Failure Indicators: '[object Object]' sigue apareciendo = guard no funcionó
    Evidence: .sisyphus/evidence/task-2-defensive-coding-applied.png

  Scenario: Snapshots data is reachable via API (curl re-check before/after UI test)
    Tool: Bash (curl)
    Preconditions: Backend en :3030
    Steps:
      1. curl 'http://localhost:3030/token/market-data/snapshots/recent?limit=10'
      2. Si retorna array vacío []: documentar que DB está vacía (esperado en in-memory) y que el fix de módulo está OK
      3. Si retorna array con datos: validar que tienen 'name', 'imageUrls', 'priceUsd' (campos del type)
    Expected Result: Status 200 + array (puede ser [])
    Failure Indicators: 404 'Cannot GET' = el fix del Task 1 se perdió
    Evidence: .sisyphus/evidence/task-2-curl-recheck.txt
  ```

  **Commit**: YES (condicional)
  - Message (si defensive coding aplicado): `fix(frontend): defensive guard for decision.reasons rendering`
  - Files: `apps/frontend/src/pages/tokens-explorer/index.tsx`
  - Pre-commit: visual verification post-edit

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read plan end-to-end. Verificar:
  - `app.module.ts` contiene `ChainExplorerModule` en imports
  - Backend reiniciado responde 200 en `/token/market-data/snapshots/...`
  - Frontend `/tokens` muestra datos de snapshot (no placeholders)
  - Reasons se renderizan como strings (no `[object Object]`)
  - Evidence files existen en `.sisyphus/evidence/`
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  - `npm run build` (backend) pasa sin errores
  - Backend log no muestra errores de DI circular o missing providers
  - Si se añadió defensive coding: es minimal, no esconde bugs futuros
  - No hay `as any`, `@ts-ignore`, código comentado
  Output: `Build [PASS/FAIL] | Backend Boot [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ playwright)
  - Iniciar backend limpio (kill + restart)
  - `curl` al endpoint con dirección real
  - Playwright abre `http://localhost:5173/tokens`
  - Screenshot + asserts:
    - Al menos UN token muestra imagen real (no `+` placeholder)
    - Al menos UN token muestra nombre + ticker
    - Tokens REJECTED muestran razones legibles (no `[object Object]`)
  - Evidence: `.sisyphus/evidence/final-qa/`
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  - Diff: solo se modificaron archivos del scope (app.module.ts, opcional frontend tokens-explorer)
  - No hay contaminación cross-task
  - Cambios uncommitted del usuario se preservaron o consolidaron correctamente
  - No se introdujeron dependencias nuevas
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

**Decisión del usuario**: Consolidar todo en commits cohesivos (Recommended).

- **Commit 1 (preparación)**: `chore(frontend): align types and rendering for FilterDecisionView reasons shape`
  - Files: 
    - `apps/frontend/src/entities/filter-decision/model/types.ts`
    - `apps/frontend/src/shared/realtime/events.ts`
    - `apps/frontend/src/pages/tokens-explorer/index.tsx` (solo la parte de reasons rendering, no el image fallback)
    - `apps/frontend/src/pages/token-detail/index.tsx` (solo image fallback si aplica)
  - Pre-commit: `cd apps/frontend && npx tsc --noEmit` pasa

- **Commit 2 (fix principal)**: `fix(backend): register ChainExplorerModule in AppModule (restores /token/market-data/snapshots endpoints)`
  - File: `apps/backend/src/app.module.ts`
  - Pre-commit: backend reinicia sin errores + curl verifica 200 en snapshots endpoints

- **Commit 3 (defensive coding, condicional)**: `fix(frontend): defensive guard for decision.reasons rendering`
  - Solo si Task 2 detectó persistencia de `[object Object]` tras refresh
  - File: `apps/frontend/src/pages/tokens-explorer/index.tsx`
  - Pre-commit: visual verification post-edit

---

## Success Criteria

### Verification Commands
```bash
# Backend endpoint responds
curl 'http://localhost:3030/token/market-data/snapshots/solana/2axlesljzu1hsyyj5hueijph59tzybyb3j9qbt7ppump'
# Expected: 200 con JSON TokenSnapshotView (o 404 NOT_FOUND si no hay datos, pero NO route-not-found)

# Recent snapshots endpoint
curl 'http://localhost:3030/token/market-data/snapshots/recent?limit=3'
# Expected: 200 con array de TokenSnapshotView

# Build backend
cd apps/backend && npm run build
# Expected: sin errores
```

### Final Checklist
- [ ] `ChainExplorerModule` registrado en `AppModule.imports`
- [ ] Backend responde 200 en `/token/market-data/snapshots/...`
- [ ] Frontend `/tokens` muestra datos de snapshot (no placeholders)
- [ ] Reasons se renderizan correctamente (no `[object Object]`)
- [ ] No hay errores en backend log al boot
- [ ] Cambios uncommitted del usuario commiteados en commit cohesivo
