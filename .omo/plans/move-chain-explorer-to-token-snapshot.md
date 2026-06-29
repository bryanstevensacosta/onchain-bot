# move-chain-explorer-to-token-snapshot - Work Plan

## TL;DR (For humans)

**What you'll get:** El BC de snapshots (market data) se mueve de `chain/explorer` a `token/snapshot`. Es un refactor puramente organizacional — cero cambios de lógica. El módulo se renombra de `ChainExplorerModule` a `SnapshotModule`. Los endpoints y eventos siguen funcionando exactamente igual.

**Why this approach:** El nombre `chain/explorer` no comunica lo que contiene (snapshots de market data). Los consumidores están en `token/`. Mover a `token/snapshot` alinea el código con el dominio: el agregado raíz se llama `TokenSnapshot`, la tabla es `token_snapshots`, el frontend lo llama `token-snapshot`. Todo en un solo lugar, con nombre auto-explicativo.

**What it will NOT do:** No cambia endpoints API, no cambia eventos, no cambia lógica de negocio, no toca frontend, no toca base de datos, no agrega ni quita funcionalidad.

**Effort:** Short (refactor puro, < 1h de ejecución)
**Risk:** Low — son cambios de paths y nombres. Los tests existentes validan que nada se rompió.
**Decisions to sanity-check:** TokenImage se incluye dentro de `token/snapshot/` (no se separa). El nombre interno de los eventos (`enrichment.token.*`) no cambia.

Your next move: Revisar el plan detallado y decidir si ejecutarlo ahora o pasar por una revisión de alta precisión.

---

> TL;DR (machine): Short / Low — mover chain/explorer → token/snapshot. ~25 archivos movidos, imports actualizados en ~17 archivos externos, módulo renombrado. Build + tests + curl verify.

## Scope
### Must have
- Mover ~25 archivos de `chain/explorer/` a `token/snapshot/`
- Renombrar `ChainExplorerModule` → `SnapshotModule`
- Renombrar `chain-explorer.module.ts` → `snapshot.module.ts`
- Renombrar `chain-explorer.tokens.ts` → `snapshot.tokens.ts`
- Actualizar todos los imports internos (dentro de archivos movidos)
- Actualizar todos los imports externos (~17 archivos en 6 BCs)
- Build exitoso (`npm run build`)
- Tests existentes pasan (`npm test`)

### Must NOT have (guardrails)
- NO cambiar lógica de negocio en ningún archivo
- NO cambiar nombres de eventos (`enrichment.token.enriched`, `enrichment.token.failed`)
- NO cambiar paths de endpoints API (`/token/market-data/...`)
- NO cambiar el contrato de `TokenSnapshotView` (frontend depende de él)
- NO cambiar exports del módulo (`MARKET_DATA_PROVIDERS`, `TokenSnapshotRepository`, `EnrichmentEventPublisher`)
- NO modificar frontend
- NO modificar base de datos
- NO agregar dependencias nuevas

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- **Test decision:** tests-after (el refactor no cambia lógica; los tests existentes validan)
- **Framework:** Jest (306 tests backend existentes)
- **Evidence:** `.omo/evidence/task-*-move-chain-explorer-to-token-snapshot.*`

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

- [ ] 1. Crear estructura de directorios destino + git mv de todos los archivos de chain/explorer a token/snapshot + renombrar archivos clave

  **What to do:**
  1. Crear toda la estructura hexagonal destino bajo `apps/backend/src/token/snapshot/`:
     ```
     token/snapshot/
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
  2. `git mv apps/backend/src/chain/explorer/* apps/backend/src/token/snapshot/` para CADA subdirectorio
  3. Renombrar archivos clave:
     - `token/snapshot/chain-explorer.module.ts` → `token/snapshot/snapshot.module.ts`
     - `token/snapshot/chain-explorer.tokens.ts` → `token/snapshot/snapshot.tokens.ts`
  4. NO borrar `chain/explorer/` todavía (git mv lo hace automático)
  5. Verificar que no quedan archivos en `chain/explorer/`:
     ```bash
     ls apps/backend/src/chain/explorer/
     # → debe dar "ls: .../chain/explorer/: No such file or directory" o directory vacío
     ```

  **Must NOT do:**
  - NO modificar ningún contenido de archivos en este task (solo mv + rename de archivo)
  - NO borrar manualmente nada — git mv se encarga

  **Parallelization:** Wave 1 | Blocked by: none | Blocks: Task 2, 3

  **References:**
  - Lista completa de archivos a mover: `.omo/drafts/move-chain-explorer-to-token-snapshot.md` sección "Archivos a mover (~25)"
  - Estructura hexagonal destino: `apps/backend/src/token/classification/` (misma estructura que tienen otros BCs)
  - `apps/backend/src/chain/explorer/chain-explorer.module.ts` → se renombra a `snapshot.module.ts`
  - `apps/backend/src/chain/explorer/chain-explorer.tokens.ts` → se renombra a `snapshot.tokens.ts`

  **Acceptance criteria:**
  ```bash
  # El directorio chain/explorer ya no existe
  test ! -d apps/backend/src/chain/explorer

  # El directorio token/snapshot existe con toda la estructura
  test -f apps/backend/src/token/snapshot/snapshot.module.ts
  test -f apps/backend/src/token/snapshot/snapshot.tokens.ts
  test -f apps/backend/src/token/snapshot/domain/entities/token-snapshot.entity.ts
  test -f apps/backend/src/token/snapshot/application/handlers/enrich-token.use-case.ts
  test -f apps/backend/src/token/snapshot/infrastructure/providers/dexscreener.adapter.ts
  test -f apps/backend/src/token/snapshot/api/http/enrichment.controller.ts
  
  # Verificar count (~25 archivos)
  find apps/backend/src/token/snapshot -name '*.ts' | wc -l
  # → >= 25
  ```

  **QA scenarios:**
  - Happy: directorios creados, archivos mv correctos, count archivos OK → `.omo/evidence/task-1-files-moved.txt`
  - Failure: archivo faltante o mal ubicado → `.omo/evidence/task-1-missing-files.txt`

  **Commit:** YES | `refactor(backend): move chain/explorer to token/snapshot (filesystem)`

---

- [ ] 2. Reemplazar imports internos (dentro de archivos movidos): `chain/explorer` → `token/snapshot` + renombrar clase del módulo

  **What to do:**
  1. En todos los archivos `.ts` dentro de `apps/backend/src/token/snapshot/`, reemplazar `chain/explorer` → `token/snapshot`:
     ```bash
     find apps/backend/src/token/snapshot -name '*.ts' -exec sed -i '' 's|chain/explorer|token/snapshot|g' {} +
     ```
  2. En la raíz del módulo: renombrar la clase:
     - En `token/snapshot/snapshot.module.ts`: `ChainExplorerModule` → `SnapshotModule`
     - En `token/snapshot/snapshot.tokens.ts`: no hay clase que renombrar (exporta `MARKET_DATA_PROVIDERS` Symbol), queda igual
  3. NO tocar archivos fuera de `token/snapshot/` en este task

  **Must NOT do:**
  - NO modificar archivos fuera de `apps/backend/src/token/snapshot/`
  - NO cambiar nombres de eventos, exports, o símbolos — solo paths y clase del módulo

  **Parallelization:** Wave 1 | Blocked by: Task 1 | Blocks: none (puede correr en paralelo con Task 3)

  **References:**
  - Archivos destino: todos los `.ts` bajo `apps/backend/src/token/snapshot/`
  - Sólo se reemplaza `chain/explorer` (path prefix en imports) → `token/snapshot`
  - `token/snapshot/snapshot.module.ts` línea con `class ChainExplorerModule` → `class SnapshotModule`

  **Acceptance criteria:**
  ```bash
  # No queda ninguna referencia a chain/explorer DENTRO de los archivos movidos
  grep -r 'chain/explorer' apps/backend/src/token/snapshot --include='*.ts' | wc -l
  # → 0

  # La clase del módulo se renombró
  grep -r 'class SnapshotModule' apps/backend/src/token/snapshot/snapshot.module.ts
  # → debe encontrar la línea

  # No hay referencias a la clase vieja
  grep -r 'ChainExplorerModule' apps/backend/src/token/snapshot --include='*.ts' | wc -l
  # → 0
  ```

  **QA scenarios:**
  - Happy: greps confirman 0 ocurrencias de `chain/explorer` dentro de `token/snapshot/` → `.omo/evidence/task-2-internal-imports-fixed.txt`
  - Failure: grep encuentra cadenas sin reemplazar → `.omo/evidence/task-2-internal-imports-failed.txt`

  **Commit:** NO (se consolida con Task 3 en un solo commit)

---

- [ ] 3. Reemplazar imports externos + referencias al módulo en archivos fuera de token/snapshot/

  **What to do:**
  1. Actualizar path prefixes en todos los archivos `.ts` del proyecto (excepto los ya movidos):
     ```bash
     find apps/backend/src -name '*.ts' -not -path '*/token/snapshot/*' -exec sed -i '' 's|chain/explorer|token/snapshot|g' {} +
     ```
  2. Actualizar referencias al archivo de módulo renombrado:
     ```bash
     find apps/backend/src -name '*.ts' -not -path '*/token/snapshot/*' -exec sed -i '' 's|chain-explorer\.module|snapshot.module|g' {} +
     ```
  3. Actualizar referencias al archivo de tokens renombrado:
     ```bash
     find apps/backend/src -name '*.ts' -not -path '*/token/snapshot/*' -exec sed -i '' 's|chain-explorer\.tokens|snapshot.tokens|g' {} +
     ```
  4. Actualizar nombre de la clase del módulo en importaciones externas:
     ```bash
     find apps/backend/src -name '*.ts' -not -path '*/token/snapshot/*' -exec sed -i '' 's|ChainExplorerModule|SnapshotModule|g' {} +
     ```
  5. Archivos afectados (confirmar con grep después):
     - `apps/backend/src/app.module.ts` — import + module name in imports array
     - `apps/backend/src/telegram/chain-dexter-bot/chain-dexter-bot.module.ts`
     - `apps/backend/src/telegram/chain-dexter-bot/application/token-scan.service.ts`
     - `apps/backend/src/telegram/chain-dexter-bot/application/handlers/token-scan.pipeline.ts`
     - `apps/backend/src/telegram/vip-calls-channel/vip-calls.module.ts`
     - `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/token-approved-publish.handler.ts`
     - `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/*.spec.ts` (x6)
     - `apps/backend/src/token/token-gating/application/handlers/reprocess-rejected-token.use-case.ts`
     - `apps/backend/src/token/token-gating/application/handlers/verify-rejected-token.use-case.ts`
     - `apps/backend/src/token/token-gating/application/handlers/verify-rejected-token.use-case.spec.ts`
     - `apps/backend/src/token/classification/infrastructure/event-bus/token-enriched.handler.ts`
     - `apps/backend/src/token/classification/infrastructure/event-bus/token-enriched.handler.spec.ts`
     - `apps/backend/src/shared/common/persistence/database.module.ts`
     - `apps/backend/src/settings/application/services/settings-presets.service.ts`
     - `apps/backend/src/settings/infrastructure/persistence/typeorm/entities/settings-preset.entity.ts`
     - `apps/backend/src/dashboard/application/handlers/get-dashboard-kpis.use-case.ts`
     - `apps/backend/src/dashboard/infrastructure/repositories/in-memory-dashboard-kpis-cache.repository.ts`

  **Must NOT do:**
  - NO modificar archivos dentro de `token/snapshot/` (ya fueron actualizados en Task 2)
  - NO cambiar nada que no sea un import path, nombre de archivo, o nombre de clase de módulo
  - NO tocar archivos no-TypeScript (md, json, sql, etc.)

  **Parallelization:** Wave 1 | Blocked by: Task 1 | Blocks: Task 4

  **References:**
  - Lista completa de archivos externos: `.omo/drafts/move-chain-explorer-to-token-snapshot.md` sección "Archivos a modificar"
  - Patrón de import: `from 'chain/explorer/...'` → `from 'token/snapshot/...'`
  - Patrón de módulo: `ChainExplorerModule` → `SnapshotModule`

  **Acceptance criteria:**
  ```bash
  # No queda ninguna referencia a chain/explorer en todo el proyecto
  grep -r 'chain/explorer' apps/backend/src --include='*.ts' | wc -l
  # → 0

  # No queda ninguna referencia a ChainExplorerModule
  grep -r 'ChainExplorerModule' apps/backend/src --include='*.ts' | wc -l
  # → 0

  # SnapshotModule aparece en los archivos correctos
  grep -r 'SnapshotModule' apps/backend/src --include='*.ts'
  # → debe mostrar app.module.ts, vip-calls.module.ts, chain-dexter-bot.module.ts, snapshot.module.ts
  ```

  **QA scenarios:**
  - Happy: 0 ocurrencias de cadenas viejas en todo el proyecto → `.omo/evidence/task-3-external-imports-fixed.txt`
  - Failure: grep encuentra referencias sin migrar → `.omo/evidence/task-3-external-imports-failed.txt`

  **Commit:** YES (consolidado con Task 2) | `refactor(backend): move chain/explorer to token/snapshot (imports + module rename)`

---

### Wave 2 — Verificación

- [ ] 4. Build backend + ejecutar test suite + curl verify

  **What to do:**
  1. Construir el backend:
     ```bash
     cd apps/backend && npm run build
     ```
  2. Si hay errores de compilación, listarlos y resolver:
     - El error más probable: algún import mal reemplazado (e.g., `chain-explorer.module`→`snapshot.module` en algún archivo que no se actualizó)
     - Buscar: `grep -r 'chain/explorer' apps/backend/src --include='*.ts'` para encontrar rezagados
  3. Una vez que build pase, ejecutar tests:
     ```bash
     cd apps/backend && npm test 2>&1
     ```
  4. Verificar que los 306+ tests existentes sigan pasando (ninguno debe fallar porque solo movimos archivos)
  5. Si el backend corre (requiere DB o modo in-memory), verificar endpoints:
     ```bash
     # Endpoint de snapshots recientes
     curl -s -w "\n%{http_code}" 'http://localhost:3030/token/market-data/snapshots/recent?limit=3'
     # → debe responder 200 (puede ser array vacío si no hay datos)
     
     # Endpoint de enrichment
     curl -s -w "\n%{http_code}" -X POST 'http://localhost:3030/token/market-data/enrich' \
       -H 'Content-Type: application/json' \
       -d '{"chain":"ethereum","address":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"}'
     # → debe responder 200 (o error de provider, no 404 de ruta)
     ```

  **Must NOT do:**
  - NO cambiar lógica de negocio
  - NO modificar tests
  - NO agregar nuevos archivos

  **Parallelization:** Wave 2 | Blocked by: Task 3 | Blocks: none

  **References:**
  - `apps/backend/package.json` — scripts `build` y `test`
  - `apps/backend/tsconfig.json` — paths alias (verificar que `token/snapshot/` sea accesible; no debería requerir cambios si ya existe `token/*` en paths)

  **Acceptance criteria:**
  ```bash
  # Build exitoso
  cd apps/backend && npm run build 2>&1 | tail -5
  # → debe terminar sin errores (exit code 0)

  # Tests pasan
  cd apps/backend && npm test 2>&1 | tail -10
  # → debe mostrar "Tests: 306 passed, 306 total" (o similar, sin failures)

  # Curl endpoints responden (si backend está corriendo)
  # Si no se puede iniciar backend, al menos el build TypeScript debe compilar sin errores
  ```

  **QA scenarios:**
  - Happy: build exitoso → `.omo/evidence/task-4-build-success.txt`
  - Happy: tests pasan → `.omo/evidence/task-4-tests-pass.txt`
  - Failure: build falla → capturar error, identificar import mal reemplazado, reportar en `.omo/evidence/task-4-build-failed.txt`
  - Failure: tests fallan → capturar salida en `.omo/evidence/task-4-tests-failed.txt`

  **Commit:** NO (ya commiteado en Task 3)

---

- [ ] 5. Verificación final: Lint + limpieza de directorio viejo

  **What to do:**
  1. Ejecutar lint:
     ```bash
     cd apps/backend && npm run lint 2>&1
     ```
  2. Verificar que el directorio `chain/explorer/` no existe (git mv + commit lo eliminó)
  3. Verificar que no hay imports absolutos rotos buscando cualquier referencia a ruta inexistente:
     ```bash
     # Esto no debe encontrar nada
     grep -r 'chain/explorer' apps/ --include='*.ts'
     ```
  4. Si todo OK, hacer un commit final consolidando cualquier fix menor

  **Must NOT do:**
  - NO reintroducir referencias a `chain/explorer`

  **Parallelization:** Wave 2 | Blocked by: Task 4 | Blocks: none

  **References:**
  - `apps/backend/package.json` — script `lint`

  **Acceptance criteria:**
  ```bash
  # Lint pasa
  cd apps/backend && npm run lint 2>&1 | tail -5
  # → exit code 0

  # No hay rastro de chain/explorer
  grep -r 'chain/explorer' apps/ --include='*.ts' | wc -l
  # → 0
  
  ls apps/backend/src/chain/explorer/ 2>&1
  # → "No such file or directory"
  ```

  **QA scenarios:**
  - Happy: lint OK, sin referencias viejas → `.omo/evidence/task-5-lint-clean.txt`
  - Failure: lint errores → `.omo/evidence/task-5-lint-failed.txt`

  **Commit:** YES (si hay fixes) | `chore(backend): cleanup chain/explorer references after migration`

---

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] **F1. Plan compliance audit** — `oracle`
  - Read plan end-to-end. Verificar:
    - `chain/explorer/` ya no existe
    - `token/snapshot/` tiene todos los archivos con imports correctos
    - `ChainExplorerModule` reemplazado por `SnapshotModule` en todos lados
    - Build + tests pasan
    - No hay referencias residuales a `chain/explorer` en imports
  - Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] **F2. Code quality review** — `unspecified-high`
  - `npm run build` pasa sin errores
  - `npm test` pasa (306+ tests)
  - No hay `as any`, `@ts-ignore`, código comentado
  - Todos los imports usan paths absolutos correctos (`token/snapshot/...`)
  - Output: `Build [PASS/FAIL] | Tests [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] **F3. Real manual QA** — `unspecified-high`
  - Verificar que `chain/explorer` no existe en filesystem
  - Verificar que `token/snapshot/` tiene la estructura hexagonal completa
  - Verificar que los endpoints responden (si backend puede iniciarse)
  - Si no se puede iniciar backend, validar que TypeScript compila sin errores
  - Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] **F4. Scope fidelity** — `deep`
  - Diff: solo se modificaron imports y paths de archivos
  - No hay cambios de lógica de negocio
  - No hay contaminación cross-task
  - Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

## Commit strategy

Se recomienda consolidar en **2 commits cohesivos**:

1. **Commit 1 (filesystem)**: `refactor(backend): move chain/explorer to token/snapshot (filesystem)`
   - Files: todos los archivos movidos + renombrados
   - Pre-commit: estructura `token/snapshot/` completa, `chain/explorer/` eliminado

2. **Commit 2 (imports + rename)**: `refactor(backend): move chain/explorer to token/snapshot (imports + module rename)`
   - Files: todos los archivos con imports actualizados (internos + externos)
   - Pre-commit: `grep -r 'chain/explorer' apps/backend/src --include='*.ts'` = 0 ocurrencias
   - Pre-commit: `npm run build` exitoso

3. **Commit 3 (opcional, solo si hay fixes)**: `chore(backend): cleanup chain/explorer references after migration`
   - Si Task 5 encuentra residuos

## Success criteria

### Verification commands
```bash
# 1. Directorio viejo no existe
test ! -d apps/backend/src/chain/explorer

# 2. Directorio nuevo existe con módulo
test -f apps/backend/src/token/snapshot/snapshot.module.ts

# 3. No hay referencias residuales a chain/explorer
grep -r 'chain/explorer' apps/ --include='*.ts' && echo "FOUND" || echo "CLEAN"

# 4. Build compila
cd apps/backend && npm run build

# 5. Tests pasan
cd apps/backend && npm test
```

### Final checklist
- [ ] `chain/explorer/` eliminado del filesystem
- [ ] `token/snapshot/` tiene todos los archivos (~25+)
- [ ] `ChainExplorerModule` → `SnapshotModule` en todos lados
- [ ] Todos los imports actualizados (0 referencias a `chain/explorer`)
- [ ] Build exitoso
- [ ] Tests pasan (306+)
- [ ] Endpoints de snapshots responden 200
- [ ] Frontend funciona (no se tocó, verify manual si aplica)
