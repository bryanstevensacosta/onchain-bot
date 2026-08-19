# phrase-registry-consolidation - Work Plan

## TL;DR (For humans)

**What you'll get:** Un sistema unificado de gestión de frases que impide:

- **Intra-table**: una misma frase duplicada dentro de keywords o dentro de blacklist (sin importar `sourceChannelIds`, `caseSensitive`, `matchMode`)
- **Cross-table**: una misma frase exista simultáneamente como keyword y como blacklist (considerando caseSensitive + matchMode)
  Con una UI consolidada y validación en backend.

**Why this approach:** Se mantiene la estructura de dos tablas existente (keywords + blacklist_phrases) agregando validación de conflicto intra-tabla y cruzada considerando settings, evitando migración de datos riesgosa. La UI se unifica progresivamente sin romper la experiencia actual.

**What it will NOT hacer:** No se consolidarán las tablas en una sola en esta fase (mantenemos dos tablas con validación cruzada). No se implementarán compuestos híbridos keyword+blacklist en esta fase (queda como fase 2 opcional).

**Effort:** Medium
**Risk:** Medium - cambios en lógica de matching pueden afectar comportamiento existente
**Decisions to sanity-check:** ¿Qué hacer cuando se detecta conflicto existente en DB? → auto-eliminar duplicados. **Intra-table**: misma frase (ignorando caseSensitive/matchMode/sourceChannelIds), mantener la más reciente. **Cross-table**: misma frase + mismo caseSensitive + mismo matchMode, mantener la más reciente.

Your next move: approve o high-accuracy review. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, medium risk, validar conflictos intra-tabla (misma frase en misma tabla ignorando settings) + cruzados keyword↔blacklist considerando caseSensitive+matchMode + UI unificada

## Scope

### Must have

1. **Validación intra-tabla en backend**: Al crear/actualizar un keyword o blacklist phrase, verificar que la frase NO exista ya en la **misma tabla**. Si "ETF" ya existe como keyword (sin importar `sourceChannelIds`, `caseSensitive` ni `matchMode`), rechazar el nuevo keyword duplicado con 409 Conflict. El usuario debe editar el existente en lugar de crear otro. Esto aplica a phrases simples (andGroupId = null); compounds se manejan en fase 2.
2. **Validación cruzada en backend**: Al crear/actualizar keyword o blacklist phrase, verificar que la misma frase NO exista en la otra tabla **con los mismos settings de caseSensitive Y matchMode**. Si "war" (caseSensitive=false, matchMode=exact) existe como keyword, entonces "war" (caseSensitive=false, matchMode=exact) NO puede existir como blacklist. Pero "War" (caseSensitive=true) o "war" (matchMode=substring) SÍ pueden existir.
3. **Compounds excluidos de validación en fase 1**: Las phrases compuestas (con andGroupId) no se validan contra conflictos en esta fase. Solo phrases simples (andGroupId = null). Los compounds híbridos (keyword + blacklist en mismo grupo) quedan para fase 2.
4. **UI unificada**: Un solo botón "Add Phrase" con dropdown para seleccionar tipo (Keyword/Blacklist)
5. **Búsqueda unificada**: Un solo search que busque en ambas tablas
6. **Mensajes de error claros**: Cuando usuario intenta crear frase que conflictúa (misma frase + mismo caseSensitive + mismo matchMode), mostrar mensaje explicativo
7. **Tests de validación**: Coverage para la nueva lógica de conflicto
8. **Migración de datos**: Script que elimine duplicados existentes (misma frase + mismo caseSensitive + mismo matchMode) manteniendo el más reciente

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO consolidar tablas en una sola (mantener keywords + blacklist_phrases separadas)
- NO implementar compuestos híbridos keyword+blacklist en esta fase
- NO romper la funcionalidad actual de matching
- NO eliminar datos existentes que no son duplicados exactos
- NO validar compounds (andGroupId != null) contra conflictos en esta fase (queda para fase 2)
- NO mergear `sourceChannelIds` automáticamente al detectar duplicado — rechazar con 409 y que el usuario edite manualmente

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + framework (Jest backend, Vitest frontend)
- Evidence: .omo/evidence/task-\*-phrase-registry-consolidation.{ts,tsx}

## Execution strategy

### Parallel execution waves

- Wave 1 (5 todos): Backend - validación cruzada + tests + migración
- Wave 2 (4 todos): Frontend - UI unificada
- Wave 3 (4 todos): Integración + búsqueda + tests e2e

### Dependency matrix

| Todo | Depends on | Blocks    | Can parallelize with |
| ---- | ---------- | --------- | -------------------- |
| T1   | -          | T2,T3,T12 | -                    |
| T2   | T1         | T4,T5     | -                    |
| T3   | T1         | T4,T5     | -                    |
| T4   | T2         | T6,T7     | T3                   |
| T5   | T3         | T6,T7     | T2                   |
| T6   | T4,T5      | T8,T9     | -                    |
| T7   | T4,T5      | T8,T9     | -                    |
| T8   | T6,T7      | T10       | -                    |
| T9   | T6,T7      | T10       | -                    |
| T10  | T8,T9      | T11       | -                    |
| T11  | T8,T9      | F1,F2     | -                    |
| T12  | T1         | F1,F2     | T2,T3                |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Crear servicio PhraseRegistry con validación de conflicto intra-tabla y cruzada
     What to do: Crear `PhraseRegistryService` en backend que valide:
     1. **Intra-table**: Al crear/actualizar una frase, verificar que NO exista ya en la **misma tabla** (misma frase, ignorando `caseSensitive`, `matchMode`, `sourceChannelIds`). Si "ETF" ya existe como keyword, rechazar cualquier nuevo keyword "ETF".
     2. **Cross-table**: Al crear/actualizar una frase, verificar que NO exista en la **otra tabla** con los mismos `caseSensitive` Y `matchMode`.
        Solo validar phrases simples (andGroupId = null). Compounds (andGroupId != null) excluidos en esta fase. Métodos:
     - `validateIntraTableKeyword(phrase)` — busca en `keyword.repository` por frase exacta
     - `validateIntraTableBlacklist(phrase)` — busca en `blacklist.repository` por frase exacta
     - `validateCrossTableKeyword(phrase, caseSensitive, matchMode)` — busca en blacklist con mismos settings
     - `validateCrossTableBlacklist(phrase, caseSensitive, matchMode)` — busca en keyword con mismos settings
     - `checkConflict(phrase, type, caseSensitive, matchMode)` — wrapper que ejecuta ambas validaciones
       Must NOT: No modificar la lógica de matching existente. Intra-table: misma frase = conflicto (ignorando settings). Cross-table: misma frase + mismo caseSensitive + mismo matchMode = conflicto. Solo phrases simples (andGroupId = null).
       Parallelization: Wave 1 | Blocked by: - | Blocks: T2,T3,T12
       References:
  - apps/backend/src/telegram/crypto-news-publisher/domain/entities/keyword.entity.ts:1-239
  - apps/backend/src/telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity.ts:1-223
  - apps/backend/src/telegram/crypto-news-publisher/application/ports/keyword.repository.ts
  - apps/backend/src/telegram/crypto-news-publisher/application/ports/blacklist-phrase.repository.ts
    Acceptance criteria:
  - `PhraseRegistryService` existe con métodos de validación intra-tabla y cruzada
  - Intra-table: misma frase en misma tabla = conflicto (ignorando caseSensitive/matchMode/sourceChannelIds)
  - Cross-table: misma frase + mismo caseSensitive + mismo matchMode en otra tabla = conflicto
  - Solo valida phrases simples (andGroupId = null), compounds excluidos
  - Tests unitarios pasan: `npm run test:backend -- --testPathPattern="phrase-registry"`
    QA scenarios:
  - **Intra-table**: crear keyword "ETF" cuando ya existe keyword "ETF" → throws DomainError
  - **Intra-table**: crear blacklist "war" cuando ya existe blacklist "war" → throws DomainError
  - **Intra-table**: crear keyword "ETF" cuando existe keyword "ETF" con diferente sourceChannelIds → throws DomainError (el caso real del bug)
  - **Intra-table compound**: crear compound (andGroupId != null) con misma frase que otro compound existente → OK (excluido en fase 1)
  - **Cross-table**: crear keyword "war" (caseSensitive=false, matchMode=exact) cuando existe blacklist "war" (caseSensitive=false, matchMode=exact) → throws DomainError
  - **Cross-table**: crear keyword "war" (caseSensitive=false, matchMode=exact) cuando existe blacklist "War" (caseSensitive=true, matchMode=exact) → OK (diferente caseSensitive)
  - **Cross-table**: crear keyword "war" (caseSensitive=false, matchMode=exact) cuando existe blacklist "war" (caseSensitive=false, matchMode=substring) → OK (diferente matchMode)
  - Evidence: .omo/evidence/t1-phrase-registry.spec.ts
    Commit: Y | feat(backend): add PhraseRegistryService for intra-table and cross-conflict validation

- [x] 2. Integrar validación en KeywordsController
     What to do: En POST /keywords y PATCH /keywords/:id, ejecutar:
     1. **Intra-table**: llamar a `PhraseRegistryService.validateIntraTableKeyword(phrase)` → si la frase ya existe en keywords, retornar 409
     2. **Cross-table**: llamar a `PhraseRegistryService.validateCrossTableKeyword(phrase, caseSensitive, matchMode)` → si existe en blacklist con mismos settings, retornar 409
        Usar transacción DB para evitar race conditions entre validación y save.
        Must NOT: No romper endpoints existentes (backward compatibility). El PATCH /keywords/:id debe excluir el propio registro de la validación intra-tabla (check `id !== currentId`).
        Parallelization: Wave 1 | Blocked by: T1 | Blocks: T4,T5
        References:
  - apps/backend/src/telegram/crypto-news-publisher/api/http/keywords.controller.ts:1-200
    Acceptance criteria:
  - POST /keywords con frase que ya existe en keywords → 409 (intra-table)
  - POST /keywords con frase que existe en blacklist (mismo caseSensitive + matchMode) → 409 (cross-table)
  - PATCH /keywords/:id cambiando frase a una que ya existe en keywords (distinto id) → 409
  - PATCH /keywords/:id con misma frase y mismo id → OK (update del mismo registro)
  - Validación y save están en la misma transacción DB
    QA scenarios:
  - Happy: POST /keywords con "ETF" cuando NO existe → 201 Created
  - **Failure intra**: POST /keywords con "ETF" cuando ya existe como keyword (cualquier sourceChannelIds) → 409 Conflict **(el caso real del bug)**
  - **Failure intra PATCH**: PATCH /keywords/:id cambiando phrase a "ETF" cuando ya existe otro keyword "ETF" (distinto id) → 409 Conflict
  - Failure cross: POST /keywords con "war" (caseSensitive=false, matchMode=exact) que existe en blacklist → 409 Conflict
  - Happy: PATCH mismo registro (mismo id, misma frase) → OK
    Commit: Y | fix(backend): add intra-table and cross-conflict validation to keywords endpoints

- [x] 3. Integrar validación en BlacklistController
     What to do: En POST /blacklist y PATCH /blacklist/:id, ejecutar:
     1. **Intra-table**: llamar a `PhraseRegistryService.validateIntraTableBlacklist(phrase)` → si la frase ya existe en blacklist, retornar 409
     2. **Cross-table**: llamar a `PhraseRegistryService.validateCrossTableBlacklist(phrase, caseSensitive, matchMode)` → si existe en keyword con mismos settings, retornar 409
        Usar transacción DB para evitar race conditions. PATCH debe excluir el propio registro de la validación intra-tabla.
        Must NOT: No romper endpoints existentes
        Parallelization: Wave 1 | Blocked by: T1 | Blocks: T4,T5
        References:
  - apps/backend/src/telegram/crypto-news-publisher/api/http/blacklist.controller.ts:1-200
    Acceptance criteria:
  - POST /blacklist con frase que ya existe en blacklist → 409 (intra-table)
  - POST /blacklist con frase que existe en keyword (mismo caseSensitive + matchMode) → 409 (cross-table)
  - PATCH con misma frase pero distinto id → 409
  - PATCH mismo registro → OK
  - Validación y save están en la misma transacción DB
    QA scenarios:
  - Happy: POST /blacklist con "nueva" → 201 Created
  - Failure intra: POST /blacklist con "war" cuando ya existe en blacklist → 409 Conflict
  - **Failure intra PATCH**: PATCH /blacklist/:id cambiando phrase a "war" cuando ya existe otro blacklist "war" (distinto id) → 409 Conflict
  - Failure cross: POST /blacklist con "war" (caseSensitive=false, matchMode=exact) que existe en keyword → 409 Conflict
    Commit: Y | fix(backend): add intra-table and cross-conflict validation to blacklist endpoints

- [x] 4. Actualizar tests de integración de keywords controller
     What to do: Agregar test cases para conflicto cruzado en keywords.controller.spec.ts, incluyendo casos con diferentes caseSensitive y matchMode
     Must NOT: No modificar tests existentes que pasan
     Parallelization: Wave 1 | Blocked by: T2 | Blocks: T6,T7
     References:
  - apps/backend/src/telegram/crypto-news-publisher/api/http/keywords.controller.spec.ts
    Acceptance criteria:
  - Nuevo test: "rejects duplicate phrase with blacklist (same caseSensitive + matchMode)"
  - Nuevo test: "allows phrase with different caseSensitive"
  - Nuevo test: "allows phrase with different matchMode"
  - npm run test:backend pasa
    QA scenarios:
  - Happy: todos los tests pasan
  - Failure: si hay test que falla, corregir o marcar como skipped
    Commit: Y | test(backend): add conflict validation tests to keywords controller

- [ ] 5. Actualizar tests de integración de blacklist controller
     What to do: Agregar test cases para conflicto cruzado en blacklist.controller.spec.ts, incluyendo casos con diferentes caseSensitive y matchMode
     Must NOT: No modificar tests existentes que pasan
     Parallelization: Wave 1 | Blocked by: T3 | Blocks: T6,T7
     References:
  - apps/backend/src/telegram/crypto-news-publisher/api/http/blacklist.controller.spec.ts
    Acceptance criteria:
  - Nuevo test: "rejects duplicate phrase with keyword (same caseSensitive + matchMode)"
  - npm run test:backend pasa
    QA scenarios:
  - Happy: todos los tests pasan
  - Failure: si hay test que falla, corregir o marcar como skipped
    Commit: Y | test(backend): add conflict validation tests to blacklist controller

- [ ] 6. Crear componente PhraseForm unificado en frontend
     What to do: Crear `PhraseForm` component que acepte prop `type: 'keyword' | 'blacklist'` y renderice el form apropiado. Incluir campos para caseSensitive y matchMode. Manejar modo simple vs compound internamente.
     Must NOT: No duplicar lógica de form existente
     Parallelization: Wave 2 | Blocked by: T2,T3 | Blocks: T7,T8
     References:
  - apps/frontend/src/features/crypto-news-publisher/ui/keywords-section.tsx
  - apps/frontend/src/features/crypto-news-publisher/ui/blacklist-manager.tsx
  - apps/frontend/src/features/crypto-news-publisher/ui/compound-group-modal.tsx
    Acceptance criteria:
  - PhraseForm component existe en features/crypto-news-publisher/ui
  - Renderiza correctamente para tipo keyword y blacklist
  - Incluye toggle para caseSensitive y dropdown para matchMode
    QA scenarios:
  - Happy: render con type="keyword" muestra campos de keyword incluyendo caseSensitive y matchMode
  - Failure: render con type="blacklist" muestra campos de blacklist
    Commit: Y | feat(frontend): create unified PhraseForm component

- [ ] 7. Actualizar UI de keywords-section con botón unificado
     What to do: Reemplazar los dos botones [Add Keyword] y [Add Compound Group] por un solo dropdown/button "Add Phrase" que permita elegir tipo.
     Must NOT: No perder funcionalidad existente de compound groups
     Parallelization: Wave 2 | Blocked by: T2,T3 | Blocks: T8
     References:
  - apps/frontend/src/features/crypto-news-publisher/ui/keywords-section.tsx
    Acceptance criteria:
  - Un solo botón visible para agregar phrases
  - Dropdown ofrece opciones: "Keyword (simple)", "Keyword (compound)", "Blacklist (simple)", "Blacklist (compound)"
    QA scenarios:
  - Happy: click en botón muestra dropdown con opciones
  - Failure: opciones no aparecen o no funcionan
    Commit: Y | refactor(frontend): unify add phrase buttons in keywords section

- [ ] 8. Actualizar UI de blacklist-manager con botón unificado
     What to do: Similar a T7 pero para blacklist-manager.tsx
     Must NOT: No perder funcionalidad existente
     Parallelization: Wave 2 | Blocked by: T2,T3 | Blocks: T8
     References:
  - apps/frontend/src/features/crypto-news-publisher/ui/blacklist-manager.tsx
    Acceptance criteria:
  - Un solo botón visible para agregar blacklist phrases
  - Dropdown ofrece opciones correctas
    QA scenarios:
  - Happy: igual que T7 pero para blacklist
    Commit: Y | refactor(frontend): unify add phrase buttons in blacklist section

- [ ] 9. Crear search unificado en crypto-news-page
     What to do: Crear un solo search input que busque en ambas tablas (keywords y blacklist) y muestre resultados categorizados.
     Must NOT: No romper searches existentes
     Parallelization: Wave 3 | Blocked by: T6,T7 | Blocks: T10
     References:
  - apps/frontend/src/pages/crypto-news/index.tsx
  - apps/frontend/src/features/crypto-news-publisher/api/keywords-api.ts
  - apps/frontend/src/features/crypto-news-publisher/api/blacklist-api.ts
    Acceptance criteria:
  - Search input existe y busca en ambos endpoints
  - Resultados se muestran categorizados por tipo (Keywords / Blacklist)
    QA scenarios:
  - Happy: buscar "war" muestra resultados de keywords y blacklist por separado
    Commit: Y | feat(frontend): add unified search for keywords and blacklist

- [ ] 10. Agregar endpoint GET /phrases/conflict-check en backend
      What to do: Endpoint que dado una frase, caseSensitive y matchMode retorne si existe como keyword, como blacklist, o en ambos. Crear un nuevo `PhrasesController` (no reutilizar KeywordsController ni BlacklistController).
      Must NOT: No exponer datos sensibles
      Parallelization: Wave 3 | Blocked by: T6,T7 | Blocks: T11
      References:
  - apps/backend/src/telegram/crypto-news-publisher/api/http/keywords.controller.ts (referencia para patrón)
    Acceptance criteria:
  - GET /phrases/conflict-check?phrase=war&caseSensitive=false&matchMode=exact retorna {keyword: boolean, blacklist: boolean}
  - Endpoint en nuevo controller o en existente de crypto-news-publisher
    QA scenarios:
  - Happy: endpoint retorna {keyword: boolean, blacklist: boolean}
    Commit: Y | feat(backend): add conflict check endpoint

- [ ] 11. Tests end-to-end de la flow completa
      What to do: Crear test e2e que cubra: crear keyword → intentar crear mismo blacklist con mismos settings → recibir error 409.
      Must NOT: No depende de datos externos
      Parallelization: Wave 3 | Blocked by: T10 | Blocks: F1,F2
      References:
  - apps/backend/test/\*.e2e-spec.ts
    Acceptance criteria:
  - Test pasa y cubre el flow completo
    QA scenarios:
  - Happy: e2e test pasa
    Commit: Y | test(e2e): add phrase conflict e2e test

- [ ] 12. Script de migración para eliminar duplicados existentes
      What to do: Crear script de backfill que elimine duplicados existentes en DB, en dos fases:
  1. **Intra-table**: dentro de keywords, misma frase (ignorando caseSensitive, matchMode, sourceChannelIds) → mantener la más reciente (por created_at), eliminar las demás. Dentro de blacklist_phrases, misma regla.
  1. **Cross-table**: misma frase + mismo caseSensitive + mismo matchMode entre keywords y blacklist → mantener la más reciente, eliminar la otra.
     Crear tabla backup antes de eliminar para poder rollback. El script debe reportar cuántos duplicados encontró y eliminó en cada categoría.
     Must NOT: No eliminar datos que no son duplicados exactos según las reglas definidas. No modificar compounds (andGroupId != null).
     Parallelization: Wave 1 | Blocked by: T1 | Blocks: F1,F2
     References:
  - apps/backend/scripts/backfills/ (ubicación de scripts similares)
  - apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/keyword.entity.ts
  - apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/blacklist-phrase.entity.ts
    Acceptance criteria:
  - Script encuentra duplicados intra-tabla: misma frase en keywords (ej: "ETF" dos veces con distintos sourceChannelIds)
  - Script encuentra duplicados cross-table: misma frase + mismo caseSensitive + mismo matchMode
  - Script elimina el más antiguo, mantiene el más reciente
  - Script crea tabla backup antes de eliminar (rollback mechanism)
  - Script es idempotente (puede correr múltiples veces)
  - Script reporta estadísticas: cuántos intra-table y cross-table encontró/eliminó
  - npm run test:backend pasa después de la migración
    QA scenarios:
  - **Intra-table**: keywords tienen "ETF" (sourceChannelIds={A,B}, created_at=viejo) y "ETF" (sourceChannelIds={}, created_at=nuevo) → elimina el viejo, conserva el nuevo **(el caso real del bug)**
  - Cross-table: keyword "war" y blacklist "war" con mismos settings → elimina el más antiguo
  - Happy: script corre sin errores en DB de test
  - Failure: si hay error, restaurar desde backup
    Commit: Y | chore(backend): add migration script to remove intra-table and cross-table phrase duplicates

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
  - Verificar que todos los todos completados están en el plan
  - Verificar que no hay scope creep
- [ ] F2. Code quality review
  - Lint pasa: npm run lint
  - Tests pasan: npm run test:backend && npm run test:frontend
- [ ] F3. Real manual QA
  - **Intra-table keyword**: crear keyword "ETF" → OK. Intentar crear otro keyword "ETF" (con distinto sourceChannelIds) → 409
  - **Intra-table blacklist**: crear blacklist "war" → OK. Intentar crear otro blacklist "war" → 409
  - **Cross-table**: crear keyword "test" (caseSensitive=false, matchMode=exact) → OK. Intentar crear blacklist "test" (caseSensitive=false, matchMode=exact) → 409
  - **Cross-table diff settings**: crear blacklist "test" (caseSensitive=true, matchMode=exact) → debe pasar (diferente caseSensitive)
  - **Cross-table diff matchMode**: crear keyword "war" (caseSensitive=false, matchMode=substring) → debe pasar (diferente matchMode)
- [ ] F4. Scope fidelity
  - Confirmar que NO se implementó consolidación de tablas
  - Confirmar que NO se implementó compuestos híbridos

## Commit strategy

- Commits atómicos por cada todo (ver columna Commit en cada todo)
- Mensajes siguen conventional commits: feat/fix/refactor/test/chore
- Scope: backend o frontend según corresponda

## Success criteria

1. **Intra-table**: Backend rechaza creación de keyword con frase que ya existe en keywords (cualquier sourceChannelIds) con 409 Conflict. Igual para blacklist.
2. **Cross-table**: Backend rechaza creación de keyword con frase existente en blacklist (mismo caseSensitive + matchMode) con 409 Conflict
3. Frontend tiene un solo botón "Add Phrase" con dropdown para elegir tipo
4. Search unificado busca en ambas tablas
5. Script de migración elimina duplicados existentes (intra-table y cross-table)
6. Todos los tests pasan (backend + frontend)
7. Lint pasa sin errores
8. Datos existentes no se alteran (excepto duplicados eliminados por migración)
