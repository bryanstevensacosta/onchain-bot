# Plan: Reprocamiento de Tokens REJECTED

**Fecha**: 2026-06-23
**Estado**: Implementación
**Alcance**: A (backend reprocess) + B (frontend panel) + C (observabilidad)

---

## Contexto

El pipeline rechaza tokens con `verdict=REJECTED` cuando alguno de los 7 gates falla.
Algunos rechazos son genuinos (BLACKLISTED, CHAIN_UNSUPPORTED, SCAM) y otros son
**artefactos de fallas transitorias en las APIs de enrichment** (DexScreener, Birdeye,
Helius, GeckoTerminal). En estos últimos casos el `snapshotCompleteness` queda < 0.3
y dispara `INSUFFICIENT_DATA`, o los datos quedan en null y disparan `SCORE_TOO_LOW`.

Hoy no hay forma de distinguir desde la BD cuál fue cuál, ni de reprocesar.

## Decisiones de diseño

| Decisión | Elección |
|---|---|
| Estrategia de reproceso | **Reutilizar event bus**: forzar re-enrich → el bus dispara classify→score→filters (idempotente por id compuesto) |
| Razones excluidas del batch | **Filtro configurable** `?retryableOnly=true` (default `true`) excluye `BLACKLISTED` y `CHAIN_UNSUPPORTED` |
| Surface de endpoints | **Tabla + 3 endpoints**: `GET /decisions/rejected/verify` (diagnóstico), `POST /reprocess/rejected` (batch), `POST /reprocess/:chain/:address` (single) |
| Rate limit batch | Pool de 5 workers concurrentes + delay de 200ms entre calls |
| Verdict flip | Si REJECTED→APPROVED, publica automáticamente por Telegram |
| Persistencia | TypeORM `synchronize:true` ya activo — solo agregar `@Column` |

## Mapa de archivos a tocar

### C: Observabilidad (persistir errores por provider)
- `chain/explorer/domain/entities/token-snapshot.entity.ts` — agregar campos `providerErrors` y `snapshotCompleteness`
- `chain/explorer/infrastructure/persistence/typeorm/entities/token-snapshot.entity.ts` — agregar columnas `provider_errors jsonb`, `completeness real`
- `chain/explorer/infrastructure/persistence/typeorm/mappers/token-snapshot.mapper.ts` — mapear ambos campos
- `chain/explorer/application/mappers/token-snapshot.mapper.ts` — incluir en `TokenSnapshotView`
- `chain/explorer/application/handlers/enrich-token.use-case.ts` — calcular `snapshotCompleteness` y pasar `providerErrors` al entity

### A: Reprocess use cases (backend)
- `token/token-gating/application/handlers/reprocess-rejected-token.use-case.ts` (NUEVO)
- `token/token-gating/application/handlers/verify-rejected-token.use-case.ts` (NUEVO)
- `token/token-gating/application/handlers/list-rejected-with-diagnostics.use-case.ts` (NUEVO)
- `token/token-gating/application/ports/filter-decision.repository.ts` — añadir `findRetryableRejected(reasonCodes)` y `findRejectedAfter(before)`
- `token/token-gating/application/mappers/filter-decision.mapper.ts` — extender view con `diagnostics?`
- `token/token-gating/api/http/filters.controller.ts` — 3 nuevos endpoints
- `token/token-gating/filters.module.ts` — registrar nuevos use cases
- `token/token-gating/domain/value-objects/filter-reason.vo.ts` — añadir helper `RETRYABLE_CODES` constant

### A: Tests
- `token/token-gating/application/handlers/reprocess-rejected-token.use-case.spec.ts` (NUEVO)
- `token/token-gating/application/handlers/verify-rejected-token.use-case.spec.ts` (NUEVO)
- `chain/explorer/application/handlers/enrich-token.use-case.spec.ts` — añadir test para completeness y providerErrors

### B: Frontend
- `apps/frontend/src/features/reprocess-rejected/` (NUEVO directorio FSD)
  - `api/reprocess-client.ts` — fetch helpers para los 3 endpoints
  - `ui/rejected-table.tsx` — tabla con columnas: chain, address, score, classification, reasons, diagnostics, actions
  - `ui/reprocess-button.tsx` — botón por fila + botón batch
- `apps/frontend/src/entities/filter-decision/model/use-rejected-with-diagnostics.ts` (NUEVO) — query hook con polling
- `apps/frontend/src/pages/ops-rejected.tsx` (NUEVO) — página `/ops/rejected`
- `apps/frontend/src/app/router/routes.tsx` — registrar la nueva ruta
- `apps/frontend/src/app/layouts/root-layout.tsx` — añadir link en el nav
- `apps/frontend/src/shared/api/endpoints.ts` — añadir las 3 nuevas rutas

---

## Fases de implementación

### Fase 1: C — Persistir providerErrors y completeness (15 min)

Es el prerequisite porque sin esto A no puede diagnosticar.

1. Agregar columnas en `TokenSnapshotEntity` TypeORM (jsonb para errors, real para completeness).
2. Extender `TokenSnapshot` domain entity con los 2 campos.
3. En `EnrichTokenUseCase.execute`, calcular `snapshotCompleteness = nonNull / total` y pasar `providerErrors` al crear el snapshot.
4. Actualizar mappers (TypeORM ↔ domain ↔ view).
5. Tests del use case enrichment (añadir 1 test).

### Fase 2: A — Use cases de reproceso (45 min)

1. `verify-rejected-token.use-case.ts` — toma un `FilterDecision`, busca su `TokenSnapshot`, devuelve diagnóstico `{ retryable, snapshotCompleteness, providerErrors, retryableReasons[], blockedReasons[] }` SIN tocar BD.
2. `list-rejected-with-diagnostics.use-case.ts` — combina `findRejected` con `verify` para cada uno.
3. `reprocess-rejected-token.use-case.ts`:
   - Llama `EnrichTokenUseCase.execute({ force: true })` para refetch fresco.
   - El snapshot nuevo emite `enrichment.token.enriched` → el bus dispara `TokenEnrichedHandler` → `ClassifyTokenUseCase` → `TokenClassifiedEvent` → `TokenClassifiedHandler` → `ScoreTokenUseCase` → `TokenScoredEvent` → `TokenScoredHandler` → `ApplyFiltersUseCase`.
   - Devuelve la nueva `FilterDecisionView`.
   - Si la nueva verdict es APPROVED, el handler ya emite `filters.token.approved` → publishing BC lo procesa automáticamente (cumple contrato del usuario).
4. Pool de concurrencia (5 workers) + delay (200ms) con `Promise.all` mapeado con throttling manual (sin libs nuevas).
5. Tests de los 3 use cases con fakes (sin Redis/DB).

### Fase 3: A — HTTP endpoints + DI (15 min)

1. En `FiltersController` añadir:
   - `GET decisions/rejected/verify?limit=N&retryableOnly=true`
   - `POST reprocess/rejected` body: `{ limit?: number, retryableOnly?: boolean, addresses?: Array<{chain, address}> }`
   - `POST reprocess/:chain/:address`
2. En `filters.module.ts`, registrar las nuevas deps:
   - Inyectar `EnrichTokenUseCase` del BC chain/explorer (exportado)
   - Registrar los nuevos use cases
3. Verificar que `FiltersModule` ya importa o tiene acceso a `EnrichmentModule`.

### Fase 4: B — Frontend (45 min)

1. Crear `apps/frontend/src/features/reprocess-rejected/` con la estructura FSD estándar.
2. `reprocess-client.ts` con funciones `verifyRejected`, `reprocessRejected`, `reprocessOne`.
3. `rejected-table.tsx` que muestra: chain badge, address truncada, score gauge, classification, reasons como badges, diagnostics inline ("3/4 providers failed, completeness 0.25"), botón reprocess.
4. `use-rejected-with-diagnostics.ts` con `useQuery` polling 10s.
5. `pages/ops-rejected.tsx` con la tabla + botón batch arriba.
6. Registrar ruta en `routes.tsx` y link en `root-layout.tsx`.
7. Añadir endpoints en `endpoints.ts`.

### Fase 5: Verificación (10 min)

1. `npm run lint:backend`
2. `npm run test:backend`
3. `npm run build:backend`
4. `npm run lint:frontend`
5. `npm run build:frontend`
6. `lsp_diagnostics` sobre archivos modificados

---

## Riesgos identificados

| Severidad | Riesgo | Mitigación |
|---|---|---|
| HIGH | El `TokenScoredHandler` (token-gating) hardcodea `riskWeight=0, snapshotCompleteness=1`. Si re-enrichamos y el bus se dispara, el path event-driven **bypasea** INSUFFICIENT_DATA y RISK_WEIGHT_EXCEEDED silenciosamente. | **Fix colateral**: cambiar el handler para leer los campos reales del snapshot. Marcar como `tech debt` resuelto. |
| HIGH | Si el enrichment nuevo emite `enrichment.token.failed` (todos los providers fallan), NO se emite `enrichment.token.enriched` → no se dispara classify. | El use case de reproceso debe detectar esto y devolver `failed` con diagnóstico, no seguir al `score/filter`. |
| MEDIUM | El pool de concurrencia en `reprocess-rejected.use-case` reusa el mismo Nest injector → si los 5 workers emiten events al bus simultáneamente, podrían procesarse en orden no determinista. | Aceptable: los handlers ya son idempotentes y stateless. Documentar. |
| MEDIUM | `TypeORM synchronize:true` agrega columnas nuevas — pero si hay datos existentes, el campo será null. | Aceptable: el código defensivo ya trata `providerErrors` como opcional (`?`). |
| LOW | El frontend polling cada 10s sobre una lista grande puede ser ruidoso | El backend limita a `limit=50` por default. |

---

## Out of scope (NO se hace en este plan)

- Outbox pattern para atomicidad save+publish
- Reemplazar `InMemoryBlacklistAdapter` con GoPlus/Chainabuse
- Migrar `FilterReasonCode.INSUFFICIENT_DATA` → corrección de typo
- Convertir blacklist+chain a datos configurables
- Soporte de más chains publicables
- Honeypot detection real (v2 con simulación)