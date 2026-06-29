# move-chain-explorer-to-token-enrichment - Work Plan

## TL;DR (For humans)

**What you'll get:** El BC de enrichment (market data) se mueve de `chain/explorer` a `token/enrichment`. Refactor puramente organizacional — cero cambios de lógica. El módulo se renombra de `ChainExplorerModule` a `EnrichmentModule`. Los endpoints, eventos y contratos siguen igual.

**Why this approach:** `token/enrichment` describe la **capacidad del BC** (enriquecer tokens con market data), no solo el artifacto (snapshot). Esto escala a futuros casos de uso: bots de Telegram que necesiten enrich but no snapshot, dashboards con polling frecuente, batch jobs de enrichment. El nombre `chain/explorer` era confuso y los consumidores están en `token/`.

**What it will NOT do:** No cambia endpoints API, eventos, lógica, frontend, ni base de datos. El aggregate root `TokenSnapshot` mantiene su nombre (es el output del proceso).

**Effort:** Short
**Risk:** Low — cambios mecánicos de paths + nombres. 306 tests validan.
**Decisions to sanity-check:** El BC se llama "enrichment" (proceso), el dato dentro se llama "snapshot" (artifacto). TokenImage se incluye sin separar.

Your next move: Revisar el plan y decidir si ejecutarlo o pasar por high-accuracy review primero.

---

> TL;DR (machine): Short / Low — mover chain/explorer → token/enrichment. ~49 archivos movidos, imports actualizados en ~17 archivos externos, módulo renombrado. Build + tests + curl verify.

## Scope
### Must have
- Mover ~49 archivos de `chain/explorer/` a `token/enrichment/`
- Renombrar `ChainExplorerModule` → `EnrichmentModule`
- Renombrar `chain-explorer.module.ts` → `enrichment.module.ts`
- Renombrar `chain-explorer.tokens.ts` → `enrichment.tokens.ts`
- Actualizar todos los imports internos y externos
- Build exitoso + tests pasan

### Must NOT have (guardrails)
- NO cambiar lógica de negocio
- NO cambiar eventos (`enrichment.token.enriched`, `enrichment.token.failed`)
- NO cambiar paths de endpoints (`/token/market-data/...`)
- NO cambiar `TokenSnapshotView` (frontend depende de él)
- NO cambiar exports del módulo (`MARKET_DATA_PROVIDERS`, `TokenSnapshotRepository`, `EnrichmentEventPublisher`)
- NO modificar frontend, DB, ni agregar dependencias

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after (los 306 tests validan que nada se rompió)
- Framework: Jest
- Evidence: `.omo/evidence/task-*-move-chain-explorer-to-token-enrichment.*`

## Execution strategy
### Parallel execution waves

| Wave | Tasks | Descripción |
|------|-------|-------------|
| Wave 1 | 1, 2, 3 | Filesystem move + import rewrite (secuenciales) |
| Wave 2 | 4, 5 | Build + test + lint verification |

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | — | 2, 3 | — |
| 2 | 1 | — | 3 (pero secuencial es más simple) |
| 3 | 1 | 4 | 2 (pero secuencial es más simple) |
| 4 | 3 | 5 | — |
| 5 | 4 | — | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

### Wave 1 — Filesystem move + rename

- [x] 1. Crear estructura de directorios destino + git mv de todos los archivos de chain/explorer a token/enrichment + renombrar archivos clave

  **What to do:**
  1. Crear toda la estructura hexagonal destino bajo `apps/backend/src/token/enrichment/`:
     ```
     token/enrichment/
     ├── api/http/
     ├── api/input/
     ├── application/handlers/
     ├── application/mappers/
     ├── application/ports/
     ├── application/services/
     ├── domain/entities/
     ├── domain/events/
     ├── domain/ports/
     ├── domain/value-objects/
     ├── infrastructure/event-bus/
     ├── infrastructure/messaging/
     ├── infrastructure/persistence/typeorm/entities/
     ├── infrastructure/persistence/typeorm/mappers/
     ├── infrastructure/persistence/typeorm/repositories/
     ├── infrastructure/providers/
     ├── infrastructure/repositories/
     └── infrastructure/fetchers/
     ```
  2. `git mv apps/backend/src/chain/explorer/* apps/backend/src/token/enrichment/` para CADA subdirectorio
  3. Renombrar archivos clave:
     - `token/enrichment/chain-explorer.module.ts` → `token/enrichment/enrichment.module.ts`
     - `token/enrichment/chain-explorer.tokens.ts` → `token/enrichment/enrichment.tokens.ts`
  4. NO borrar `chain/explorer/` (git mv lo hace automático)
  5. Verificar:
     ```bash
     ls apps/backend/src/chain/explorer/ 2>&1  # → No such file or directory
     find apps/backend/src/token/enrichment -name '*.ts' | wc -l  # → >= 25
     ```

  **Must NOT do:**
  - NO modificar contenido de archivos en este task
  - NO borrar manualmente nada

  **Parallelization:** Wave 1 | Blocked by: none | Blocks: Task 2, 3

  **References:**
  - Lista archivos: `.omo/drafts/move-chain-explorer-to-token-enrichment.md`
  - Estructura hexagonal referencia: `apps/backend/src/token/classification/`
  - `apps/backend/src/chain/explorer/chain-explorer.module.ts` → `enrichment.module.ts`
  - `apps/backend/src/chain/explorer/chain-explorer.tokens.ts` → `enrichment.tokens.ts`

  **Acceptance criteria:**
  ```bash
  test ! -d apps/backend/src/chain/explorer
  test -f apps/backend/src/token/enrichment/enrichment.module.ts
  test -f apps/backend/src/token/enrichment/enrichment.tokens.ts
  test -f apps/backend/src/token/enrichment/domain/entities/token-snapshot.entity.ts
  test -f apps/backend/src/token/enrichment/application/handlers/enrich-token.use-case.ts
  find apps/backend/src/token/enrichment -name '*.ts' | wc -l  # >= 30
  ```

  **QA scenarios:**
  - Happy: archivos mv correctos → `.omo/evidence/task-1-files-moved.txt`
  - Failure: archivo faltante → `.omo/evidence/task-1-missing-files.txt`

  **Commit:** YES | `refactor(backend): move chain/explorer to token/enrichment (filesystem)`

---

- [x] 2. Reemplazar imports internos (dentro de archivos movidos): `chain/explorer` → `token/enrichment` + renombrar clase del módulo

  **What to do:**
  1. En todos los `.ts` dentro de `apps/backend/src/token/enrichment/`:
     ```bash
     find apps/backend/src/token/enrichment -name '*.ts' -exec sed -i '' 's|chain/explorer|token/enrichment|g' {} +
     ```
  2. Renombrar referencias al archivo de tokens renombrado dentro de `token/enrichment/`:
     ```bash
     find apps/backend/src/token/enrichment -name '*.ts' -exec sed -i '' 's|chain-explorer\.tokens|enrichment.tokens|g' {} +
     ```
     Esto afecta 2 archivos: `enrichment.module.ts` (import absoluto) y `enrich-token.use-case.ts` (import relativo `../../chain-explorer.tokens`).
  3. Renombrar la clase del módulo:
     - En `token/enrichment/enrichment.module.ts`: `class ChainExplorerModule` → `class EnrichmentModule`
     - En `token/enrichment/enrichment.tokens.ts`: no hay clase (exporta `MARKET_DATA_PROVIDERS`), queda igual

  **Must NOT do:**
  - NO tocar archivos fuera de `token/enrichment/`
  - NO cambiar eventos, exports, símbolos

  **Parallelization:** Wave 1 | Blocked by: Task 1 | Blocks: none

  **References:**
  - Todos los `.ts` bajo `apps/backend/src/token/enrichment/`
  - `token/enrichment/enrichment.module.ts` → `class EnrichmentModule`

  **Acceptance criteria:**
  ```bash
  grep -r 'chain/explorer' apps/backend/src/token/enrichment --include='*.ts' | wc -l  # → 0
  grep -r 'chain-explorer\.tokens' apps/backend/src/token/enrichment --include='*.ts' | wc -l  # → 0
  grep 'class EnrichmentModule' apps/backend/src/token/enrichment/enrichment.module.ts  # → found
  grep -r 'ChainExplorerModule' apps/backend/src/token/enrichment --include='*.ts' | wc -l  # → 0
  ```

  **QA scenarios:**
  - Happy: 0 ocurrencias `chain/explorer` en `token/enrichment/` → `.omo/evidence/task-2-internal-imports-fixed.txt`
  - Failure: grep encuentra residuos → `.omo/evidence/task-2-internal-imports-failed.txt`

  **Commit:** NO (consolidado con Task 3)

---

- [x] 3. Reemplazar imports externos + referencias al módulo en archivos fuera de token/enrichment/

  **What to do:**
  1. Path prefixes (todos los `.ts` fuera de `token/enrichment/`):
     ```bash
     find apps/backend/src -name '*.ts' -not -path '*/token/enrichment/*' \
       -exec sed -i '' 's|chain/explorer|token/enrichment|g' {} +
     ```
  2. Referencias al archivo de módulo renombrado:
     ```bash
     find apps/backend/src -name '*.ts' -not -path '*/token/enrichment/*' \
       -exec sed -i '' 's|chain-explorer\.module|enrichment.module|g' {} +
     ```
  3. Referencias al archivo de tokens renombrado:
     ```bash
     find apps/backend/src -name '*.ts' -not -path '*/token/enrichment/*' \
       -exec sed -i '' 's|chain-explorer\.tokens|enrichment.tokens|g' {} +
     ```
  4. Nombre de clase del módulo:
     ```bash
     find apps/backend/src -name '*.ts' -not -path '*/token/enrichment/*' \
       -exec sed -i '' 's|ChainExplorerModule|EnrichmentModule|g' {} +
     ```
  5. Archivos afectados (confirmar):
     - `apps/backend/src/app.module.ts`
     - `apps/backend/src/telegram/chain-dexter-bot/chain-dexter-bot.module.ts`
     - `apps/backend/src/telegram/chain-dexter-bot/application/token-scan.service.ts`
     - `apps/backend/src/telegram/chain-dexter-bot/application/handlers/token-scan.pipeline.ts`
     - `apps/backend/src/telegram/vip-calls-channel/vip-calls.module.ts`
     - `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/token-approved-publish.handler.ts`
     - `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/*.spec.ts` (x5: `*-bug-exploration.spec.ts`, `*-preservation.spec.ts`, `*.handler.spec.ts`, `*-ticker-bug-exploration.spec.ts`, `ticker-null-bug-exploration.spec.ts`)
     - `apps/backend/src/token/token-gating/application/handlers/reprocess-rejected-token.use-case.ts`
     - `apps/backend/src/token/token-gating/application/handlers/verify-rejected-token.use-case.ts`
     - `apps/backend/src/token/token-gating/application/handlers/verify-rejected-token.use-case.spec.ts`
     - `apps/backend/src/token/classification/infrastructure/event-bus/token-enriched.handler.ts`
     - `apps/backend/src/token/classification/infrastructure/event-bus/token-enriched.handler.spec.ts`
     - `apps/backend/src/shared/common/persistence/database.module.ts`

  **Must NOT do:**
  - NO modificar archivos dentro de `token/enrichment/`
  - NO cambiar nada que no sea import path, nombre de archivo, o clase de módulo

  **Parallelization:** Wave 1 | Blocked by: Task 1 | Blocks: Task 4

  **References:**
  - Archivos externos listados arriba
  - Reemplazos: `chain/explorer`→`token/enrichment`, `chain-explorer.module`→`enrichment.module`, `chain-explorer.tokens`→`enrichment.tokens`, `ChainExplorerModule`→`EnrichmentModule`

  **Acceptance criteria:**
  ```bash
  grep -r 'chain/explorer' apps/backend/src --include='*.ts' | wc -l  # → 0
  grep -r 'ChainExplorerModule' apps/backend/src --include='*.ts' | wc -l  # → 0
  grep -r 'EnrichmentModule' apps/backend/src --include='*.ts'
  # → app.module.ts, vip-calls.module.ts, chain-dexter-bot.module.ts, enrichment.module.ts
  ```

  **QA scenarios:**
  - Happy: 0 ocurrencias viejas → `.omo/evidence/task-3-external-imports-fixed.txt`
  - Failure: grep encuentra residuos → `.omo/evidence/task-3-external-imports-failed.txt`

  **Commit:** YES (consolidado con Task 2) | `refactor(backend): move chain/explorer to token/enrichment (imports + module rename)`

---

### Wave 2 — Verificación

- [x] 4. Build backend + ejecutar test suite + curl verify

  **What to do:**
  1. Build:
     ```bash
     cd apps/backend && npm run build
     ```
  2. Si errores: buscar imports rezagados con `grep -r 'chain/explorer' apps/backend/src --include='*.ts'`
  3. Tests:
     ```bash
     cd apps/backend && npm test 2>&1
     ```
  4. Si backend puede correr, verificar endpoints:
     ```bash
     curl -s -w "\n%{http_code}" 'http://localhost:3030/token/market-data/snapshots/recent?limit=3'
     curl -s -w "\n%{http_code}" -X POST 'http://localhost:3030/token/market-data/enrich' \
       -H 'Content-Type: application/json' \
       -d '{"chain":"ethereum","address":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"}'
     ```

  **Must NOT do:**
  - NO cambiar lógica, tests, ni agregar archivos

  **Parallelization:** Wave 2 | Blocked by: Task 3 | Blocks: none

  **References:**
  - `apps/backend/package.json` — scripts build/test

  **Acceptance criteria:**
  ```bash
  cd apps/backend && npm run build 2>&1 | tail -3  # → exit 0
  cd apps/backend && npm test 2>&1 | tail -5       # → "306 passed, 306 total"
  ```

  **QA scenarios:**
  - Happy: build OK → `.omo/evidence/task-4-build-success.txt`
  - Happy: tests pass → `.omo/evidence/task-4-tests-pass.txt`
  - Failure: build/tests fallan → `.omo/evidence/task-4-build-failed.txt`

  **Commit:** NO (ya commiteado en Task 3)

---

- [x] 5. Verificación final: Lint + limpieza de referencias

  **What to do:**
  1. Lint:
     ```bash
     cd apps/backend && npm run lint 2>&1
     ```
  2. Verificar `chain/explorer/` no existe:
     ```bash
     ls apps/backend/src/chain/explorer/ 2>&1  # → No such file or directory
     ```
  3. Verificar 0 referencias a `chain/explorer` en todo el proyecto:
     ```bash
     grep -r 'chain/explorer' apps/ --include='*.ts'
     ```

  **Must NOT do:**
  - NO reintroducir referencias viejas

  **Parallelization:** Wave 2 | Blocked by: Task 4 | Blocks: none

  **References:**
  - `apps/backend/package.json` — script lint

  **Acceptance criteria:**
  ```bash
  cd apps/backend && npm run lint 2>&1 | tail -3  # → exit 0
  grep -r 'chain/explorer' apps/ --include='*.ts' | wc -l  # → 0
  ```

  **QA scenarios:**
  - Happy: lint OK, sin residuos → `.omo/evidence/task-5-lint-clean.txt`
  - Failure: lint errores → `.omo/evidence/task-5-lint-failed.txt`

  **Commit:** YES (si hay fixes) | `chore(backend): cleanup chain/explorer references after migration`

---

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] **F1. Plan compliance audit** — `oracle`
  - `chain/explorer/` ya no existe
  - `token/enrichment/` tiene todos los archivos con imports correctos
  - `ChainExplorerModule` → `EnrichmentModule` en todos lados
  - Build + tests pasan
  - 0 referencias residuales a `chain/explorer`
  - Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT`

- [x] **F2. Code quality review** — `unspecified-high`
  - Build pasa, tests pasan
  - Sin `as any`, `@ts-ignore`, código comentado
  - Imports usan `token/enrichment/...`
  - Output: `Build [PASS/FAIL] | Tests [PASS/FAIL] | VERDICT`

- [x] **F3. Real manual QA** — `unspecified-high`
  - Verificar estructura `token/enrichment/` completa
  - Verificar endpoints responden
  - Output: `Scenarios [N/N pass] | VERDICT`

- [x] **F4. Scope fidelity** — `deep`
  - Diff: solo imports y paths, cero lógica cambiada
  - Output: `Contamination [CLEAN/N issues] | VERDICT`

## Commit strategy

**2 commits cohesivos:**

1. `refactor(backend): move chain/explorer to token/enrichment (filesystem)`
   - Files: todos los archivos movidos + renombrados
   - Pre-commit: `token/enrichment/` completo, `chain/explorer/` eliminado

2. `refactor(backend): move chain/explorer to token/enrichment (imports + module rename)`
   - Files: todos los archivos con imports actualizados
   - Pre-commit: `grep -r 'chain/explorer' apps/backend/src --include='*.ts'` = 0
   - Pre-commit: `npm run build` exitoso

3. (Opcional) `chore(backend): cleanup chain/explorer references after migration`

## Success criteria

### Verification commands
```bash
test ! -d apps/backend/src/chain/explorer
test -f apps/backend/src/token/enrichment/enrichment.module.ts
grep -r 'chain/explorer' apps/ --include='*.ts' && echo "FOUND" || echo "CLEAN"
cd apps/backend && npm run build
cd apps/backend && npm test
```

### Final checklist
- [ ] `chain/explorer/` eliminado
- [ ] `token/enrichment/` con ~49+ archivos
- [ ] `ChainExplorerModule` → `EnrichmentModule` en todos lados
- [ ] 0 referencias a `chain/explorer` en imports
- [ ] Build exitoso
- [ ] Tests pasan (306+)
- [ ] Endpoints responden 200
