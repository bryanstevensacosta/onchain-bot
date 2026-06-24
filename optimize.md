# optimize.md — Resource optimization log

> Documento vivo. Se actualiza en cada iteración con problema → solución →
> implementación → métricas before/after. Se usa como guía durante el refactor.

---

## Leyenda

- 🔴 pendiente
- 🟡 en curso
- ✅ hecho
- ⛔ cancelado / won't fix
- 💡 idea / backlog (sin plan aún)

## Cómo se itera

1. Elegir el siguiente ítem de **Pendientes**.
2. Mover a **En curso**, anotar el plan de solución.
3. Implementar.
4. Medir (antes/después) y archivar en **Hecho**.
5. Repetir.

---

## Auditoría inicial

Resumen de hallazgos de la primera pasada. Los IDs (`#1`, `#10`, etc.) son
estables para referenciar en commits y PRs.

### Seeds / DB persistence

- Los **KOL seeds persisten en Postgres** vía `KolSeeder` (`kol.seeder.ts:64-122`).
  Cada entrada se chequea con `findById` antes de insertar, así que no se
  duplican en boots sucesivos.
- **Pero** el seeder hace trabajo redundante cada boot (especialmente en
  warm starts): `findAll` adicional, backfill que itera todos los KOLs y
  puede llamar MTProto, metadata cache que reescribe JSON entero.

### Optimizaciones detectadas

| ID | Capa | Resumen | Impacto |
|----|------|---------|---------|
| #1 | backend | `getAverageReputation` hace N `findByKol` paralelos por cada token scoreado | alto (hot path) |
| #2 | backend | `EnqueueEvaluationJobs` llama `findPendingForCall` dentro del loop por horizon | medio |
| #3 | backend | `consumeStream` hace `findById` por cada mensaje entrante | alto (per-message) |
| #4 | backend | `backfillKol` hace `save(kol)` por cada mensaje | alto (per-message) |
| #5 | backend | Backfill de títulos en cada boot itera todos los KOLs y puede pegar a MTProto | medio (warm boots) |
| #6 | backend | Metadata cache rewrite del JSON completo por upsert (45 seeds → 45 writes) | medio |
| #7 | config | `DATABASE_SYNCHRONIZE=true` por default → DDL runtime en cada boot | medio |
| #8 | config | Scheduler cada 5 min por default puede sobre-disparar queries vacíos | bajo |
| #9 | backend | Market data fan-out: 4 HTTP calls incluso cuando 2 providers (Birdeye/Helius) son Solana-only | medio |
| #10 | frontend | `/kols` page: N × 2 queries (`useKol` + `useKolReputation`) por fila | alto (91 reqs/visita) |
| #11 | frontend | `KpiCards` pide 100 items cada 5-10s solo para contar | alto |
| #12 | frontend | `useEventStream` re-suscribe listener WS en cada render | medio |
| #13 | frontend | Polling sin pausa cuando la pestaña está oculta | bajo |
| #14 | backend | `ReputationModule` cablea `KolReputationRepository` siempre a la implementación in-memory; la `TypeOrmKolReputationRepository` se construye pero nunca se inyecta → reputación se pierde en cada restart aunque `DATABASE_ENABLED=true` | alto (corrupto) |

### IDs anteriores (seeds)

| ID | Capa | Resumen |
|----|------|---------|
| #A | backend seed | `KolSeeder` hace 45 `findById` secuenciales; debería ser 1 `findByIds([...])` |
| #B | backend seed | Auto-start hace `findAll` redundante tras el loop de seed |
| #C | backend seed | Backfill on-boot (descrito arriba como #5) |
| #D | backend seed | Metadata cache rewrite (descrito arriba como #6) |

---

## En curso

> Vacío. Siguiente: **#11** (KpiCards over-fetching).

---

## Hecho

### ✅ #10 — N+1 en `/kols` page

**Problema.** `pages/kols/index.tsx` renderizaba N filas, cada una con
`useKol(kolId)` + `useKolReputation(kolId)`. Con 45 KOLs seedeados:
- 1 request para `useKols()`
- 1 request para `useTopKolReputation(10)`
- 45 requests `useKol(kolId)` por fila (redundante, el list ya trae todo)
- 45 requests `useKolReputation(kolId)` por fila

**Total: ~92 requests por visita a la página.**

**Solución.**
- Backend: ya existía `GET /telegram-kol/reputation/kols` (sin uso).
  Cero cambios.
- Frontend: nuevo `fetchAllKolReputations()` + hook `useAllKolReputations`
  (polling 30 s, pausa en background) + helper `useKolReputationMap()` que
  devuelve un `Map<kolId, KolReputationView>` para lookup O(1).
- Página `/kols`: `KolRow` ahora recibe `kol` y `rep` como props; nada de
  queries por fila.

**Archivos tocados:**
- `apps/frontend/src/entities/kol-reputation/api/reputation-queries.ts`
- `apps/frontend/src/entities/kol-reputation/model/use-reputation.ts`
- `apps/frontend/src/entities/kol-reputation/index.ts`
- `apps/frontend/src/pages/kols/index.tsx`

**Resultado.** Requests por visita a `/kols`: 92 → **3** (kols list,
top-rep, all-reps). Polling cada 30 s en lugar de rafaga de 90 requests
cada vez que el componente remonta. `refetchIntervalInBackground: false`
para no pegar al backend con la pestaña oculta.

**Verificación.**
- `tsc --noEmit -p apps/frontend/tsconfig.json` → 0 errores
- `eslint src` → 0 errores (warnings preexistentes en `live-feed.tsx`, no
  relacionados)
- `npm test -w @alpha-meta-token-scanner/backend` → 280/280 passing

---

### ✅ #14 — Wiring roto de TypeORM reputation

**Problema.** `ReputationModule` declaraba `TypeOrmKolReputationRepository`
como provider pero el `KolReputationRepository` abstracto estaba cableado
con `useExisting: InMemoryKolReputationRepository`. Resultado: con
`DATABASE_ENABLED=true`, la reputación se seguía guardando **en memoria
y se perdía en cada restart** del backend, aunque existiera la entidad
Postgres. Era un bug silencioso de pérdida de datos.

**Solución.** Reemplazar `useExisting` por un factory idéntico al patrón
que ya usa `IdentityModule` para `KolRepository`:
- Inyecta `ConfigService` + las dos implementaciones.
- Devuelve `typeorm` si `DATABASE_ENABLED=true`, si no `inMemory`.

**Archivos tocados:**
- `apps/backend/src/kol/reputation/reputation.module.ts`

**Verificación.**
- `npm test -w @alpha-meta-token-scanner/backend` → 280/280 passing
- `eslint src` → 0 errores nuevos (warnings preexistentes en otros archivos)
- `tsc --noEmit` muestra errores preexistentes en spec files no tocados
  por este cambio (mock signatures); el `npm test` pasa porque jest es
  más permisivo.

---

### ✅ #1 — `getAverageReputation` N+1 (hot path scoring)

**Problema.** `ScoreTokenUseCase` se ejecuta por cada token scoreado y
llama a `DefaultKolReputationAdapter.getAverageReputation(kolIds)`. La
implementación hacía `Promise.all(kolIds.map((id) => this.getReputation(id)))`,
y cada `getReputation` hacía `await this.statsRepo.findByKol(kolId)`. Con
5 KOLs source = 5 round-trips a Postgres por token scoreado.

**Solución.**
- Añadido `findByIds(ids)` abstract a `KolReputationRepository`.
- Implementado en `InMemoryKolReputationRepository` (single Map scan) y
  en `TypeOrmKolReputationRepository` (`In([...ids])`).
- Refactor de `DefaultKolReputationAdapter.getAverageReputation`:
  1. Particionar KOLs con `KnownKolPort` (sincronía pura, sin DB).
     - KNOWN_BAD → 0.1
     - KNOWN_GOOD → score estático
     - resto → unresolved
  2. Una sola llamada `findByIds(unresolved)` para el bucket sin
     clasificar.
  3. Calcular promedio in-memory con Map<kolId, stats>.

**Archivos tocados:**
- `apps/backend/src/kol/reputation/application/ports/kol-reputation.repository.ts`
- `apps/backend/src/kol/reputation/infrastructure/repositories/in-memory-kol-reputation.repository.ts`
- `apps/backend/src/kol/reputation/infrastructure/persistence/typeorm/repositories/typeorm-kol-reputation.repository.ts`
- `apps/backend/src/token/scoring/infrastructure/adapters/default-kol-reputation.adapter.ts`
- `apps/backend/src/token/scoring/infrastructure/adapters/default-kol-reputation.adapter.spec.ts`

**Resultado.** DB queries por `getAverageReputation`: **N → 1** (o 0 si
todos los KOLs son KNOWN_GOOD/KNOWN_BAD). En el seed actual (45 KOLs) la
mayoría cae en el bucket "unknown" hasta que el recompute corra, así que
en práctica es N → 1 por token scoreado. Tests añadidos que validan:
- `findByIds` se llama exactamente 1 vez por `getAverageReputation`.
- KNOWN_GOOD/KNOWN_BAD no provocan DB hits.

**Verificación.**
- `npm test -w @alpha-meta-token-scanner/backend` → **282/282 passing**
  (280 originales + 2 nuevos)
- `eslint src` → 0 errores nuevos (mismos 10 warnings preexistentes)

---

## Pendientes (en orden propuesto)

1. ~~**#10 — N+1 en `/kols`**~~ ✅ hecho (ver arriba).
2. ~~**#14 — Wiring roto de TypeORM reputation**~~ ✅ hecho (ver arriba).
3. ~~**#1 — `getAverageReputation` N+1**~~ ✅ hecho (ver arriba).
4. **#11 — KpiCards over-fetching** (backend + frontend). Crear endpoint
   de counts agregados y reemplazar las 3 queries de 100 items.
5. **#2 — `EnqueueEvaluationJobs` N+1** (backend). Hoist
   `findPendingForCall` fuera del loop de horizons.
6. **#3, #4 — Per-message DB hits** (backend). Cachear kol activo en
   `consumeStream` y batch `save` en `backfillKol`.
7. **#A — Seed loop batch lookup** (backend). Añadir `findByIds` al
   `KolRepository` y reemplazar el loop secuencial en `KolSeeder`.
8. **#B — Seed auto-start sin `findAll` extra** (backend). Reusar la lista
   ya cargada en memoria.
9. **#5, #C — Backfill on-boot inteligente** (backend). Iterar solo los KOLs
   con título fallback + marcar `titleResolvedAt` para no re-checkar.
10. **#6, #D — Metadata cache rewrite** (backend). Append + flush periódico,
    o mover a columna en `KolEntity`. Decidir tras #5/#C.
11. **#7 — `DATABASE_SYNCHRONIZE` default off** (config). Cambio de
    `.env.example` y validación de flujos existentes.
12. **#9 — Market data fan-out filtrado por chain** (backend). Filtrar
    providers por capability antes de `Promise.allSettled`.
13. **#12 — `useEventStream` deps** (frontend). Quitar `handler` del array
    de deps o wrappear con `useCallback`.
14. **#8 — Scheduler cron configurable** (config). Ajustar default si se
    confirma que dispara queries vacíos.
15. **#13 — Polling pausa en background** (frontend). Añadir
    `refetchIntervalInBackground: false` donde aplique (parcialmente hecho
    en #10; auditar el resto).

---

## Backlog / ideas

- 💡 Backend: exponer `/dashboard/kpis` para reemplazar 3 endpoints del
  dashboard (#11). Devolver `{ activeKols, totalKols, totalCalls,
  approvedCount, rejectedCount, publishedCount }` en una sola query agregada.
- 💡 Backend: cachear `kol-reputation` lookups en memoria (LRU corto, ~30s)
  para el hot path de scoring. `kol-reputation` cambia raramente.
- 💡 Backend: `KolEntity` ya tiene `title` mutable; podríamos añadir
  `title_resolved_at timestamptz NULL` para que el backfill skippee los KOLs
  ya resueltos (apoya #5/#C).
- 💡 Frontend: WS reconnect con backoff exponencial explícito (ahora crece
  lineal hasta 30 s).
- 💡 Frontend: deduplicar suscripciones WS entre componentes que comparten
  evento (varios `useEventStream` para el mismo `WS_EVENTS.X` crean N
  listeners internos).

---

## Métricas antes/después

> Se va rellenando por cada ítem hecho.

| ID | Antes | Después | Notas |
|----|-------|---------|-------|
| #10 | 92 requests / visita a `/kols` | 3 requests / visita | Polling 30 s en background-paused. Aplicable a cualquier tabla con N+1. |
| #14 | reputación perdida en cada restart con DB on | persiste en Postgres cuando DB on | Bug silencioso de data-loss. Factory idéntico al patrón de `KolRepository`. |
| #1 | N queries por token scoreado (avg-rep) | 1 query (o 0 si todos KNOWN_*) | Hot path. Nuevo método `findByIds` en `KolReputationRepository`. 2 tests nuevos. |