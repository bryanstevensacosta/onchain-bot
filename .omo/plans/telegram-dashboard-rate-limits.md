# telegram-dashboard-rate-limits - Work Plan (✅ COMPLETE)

## TL;DR (For humans)

**What you'll get:** Tu dashboard dejará de mostrar "45/45 active" (mentira) y mostrará cuántos canales están realmente activos vs el máximo seguro (ej. 0/50). El backend implementará polling stagger + jitter + sleep window + FLOOD_WAIT backoff para una sola cuenta MTProto con 45 KOLs sin violar ToS. El frontend obtendrá un widget de salud de ingesta (solo lectura) con barras de progreso y alertas cuando te acerques a los límites. Los safety limits (maxChannels, pollInterval, sleepWindow, jitter) quedarán en backend/config, NO editables desde frontend.

**Why this approach:** 45 canales en una sola cuenta está en el límite de lo recomendable. En vez de shardear a múltiples cuentas (complejidad operativa), implementamos comportamiento mimético humano perfecto (stagger + jitter + sleep + backoff) para maximizar la seguridad de la cuenta. El dashboard refleja métricas reales de salud, no un booleano "isActive" que siempre es true. Los safety limits no son configurables desde frontend porque cambiarlos accidentalmente puede banear la cuenta.

**What it will NOT do:** No va a implementar multi-account sharding (por ahora). No va a permitir editar safety limits desde frontend. No va a cambiar cómo se almacenan los KOLs en DB. No va a implementar el pipeline de extracción de mensajes (solo el health check + config).

**Effort:** Medium
**Risk:** Medium - cambiar el polling puede afectar la ingesta actual, los safety limits incorrectos pueden banear la cuenta
**Decisions to sanity-check:** (1) Los valores exactos de maxChannels (50) y pollInterval (90s base) — ajustables. (2) Sleep window timezone default UTC 4-10.

Your next move: Revisa el plan y dime si ajustamos algo antes de ejecutar.

---

> TL;DR (machine): Medium effort, Medium risk. 7 todos: backend safety config, health endpoint, stagger+backoff, dashboard widget, sleep window, KPI fix. Testing con agentes.

## Scope

### Must have

1. Backend: nueva configuración de safety limits para ingestion (maxChannels, pollInterval, jitterPercent, sleepWindow, floodWaitBackoff)
2. Backend: nuevo endpoint `GET /ingestion/health` con métricas reales por cuenta MTProto
3. Backend: implementar staggered polling con jitter en KolTelegramMtprotoAdapter
4. Backend: implementar FLOOD_WAIT exponential backoff real (no hardcode)
5. Backend: implementar SleepWindowService configurable (default UTC 4-10)
6. Frontend: nuevo "Ingestion Health" widget en Dashboard con KPIs reales + alertas
7. Frontend: corregir KPI "45/45 active" a "X/Y actively ingesting / max safe"

### Must NOT have (guardrails, anti-slop, scope boundaries)

- ❌ Safety limits NO editables desde frontend (solo backend/config/env)
- ❌ No multi-account sharding (queda para futuro)
- ❌ No modificar el dominio Kol/entidades existentes (solo extender)
- ❌ No cambiar cómo se persisten los KOLs en DB
- ❌ No implementar UI de "reorder KOLs" o "assign to account"

## Verification strategy

- Test decision: tests-after con Jest (backend) + Vitest (frontend)
- Evidence: .omo/evidence/task-{N}-telegram-dashboard-rate-limits.{ext}
- Verificación manual con Playwright MCP navegando el frontend real

## Execution strategy

### Parallel execution waves

Wave 1: Backend safety config + sleep window + health endpoint (paralelizable)
Wave 2: Staggered polling + backoff en KolTelegramMtprotoAdapter (depende de Wave 1)
Wave 3: Frontend widget + KPI correction (depende de Wave 1)
Wave 4: Integración + Playwright verification

### Dependency matrix

| Todo                      | Depends on | Blocks  | Can parallelize with |
| ------------------------- | ---------- | ------- | -------------------- |
| 1. Safety config          | —          | 2,3,4,5 | —                    |
| 2. Sleep window           | 1          | 4       | 3                    |
| 3. Health endpoint        | 1          | 5       | 2                    |
| 4. Staggered polling      | 1,2        | —       | —                    |
| 5. Frontend health widget | 3          | —       | 4                    |
| 6. Fix KPI 45/45          | 3          | —       | 5                    |
| 7. FLOOD_WAIT backoff     | 1,4        | —       | 5,6                  |

## Todos

<!-- APPEND TASK BATCHES BELOW THIS LINE - never rewrite the headers above. -->

- [x] 1. Crear IngestionSafetyConfig en backend (env-based)
     What to do / Must NOT do:
  - Crear `apps/backend/src/kol/ingestion/infrastructure/config/ingestion-safety.config.ts`
  - Leer de env vars con defaults documentados:
    - `INGESTION_MAX_CHANNELS` → default 50
    - `INGESTION_POLL_INTERVAL_BASE_MS` → default 90_000
    - `INGESTION_JITTER_PERCENT` → default 0.30
    - `INGESTION_SLEEP_START_UTC` → default 4
    - `INGESTION_SLEEP_END_UTC` → default 10
    - `INGESTION_FLOOD_INITIAL_MS` → default 5_000
    - `INGESTION_FLOOD_MULTIPLIER` → default 2
    - `INGESTION_FLOOD_MAX_MS` → default 3_600_000
    - `INGESTION_FLOOD_MAX_ATTEMPTS` → default 5
  - Exponer como `IngestionSafetyConfig` injectable via NestJS (no @nestjs/config directo, usar un provider)
  - La config es SOLO lectura desde runtime, no hay CRUD
  - NO editar app.config.ts existente (es para ingestion no-safety)
  - NO crear entidad TypeORM para esto (env-based, no DB)
    Parallelization: Wave 1 | Blocked by: — | Blocks: 2,3,4,5
    References: `06-rate-limits-verified.md` sección 4.1 (tabla de límites), `app.config.ts:62-83` (existing ingestion env pattern)
    Acceptance criteria (agent-executable):
  1. `curl -s http://localhost:3030/ingestion/config` devuelve JSON con todos los safety limits
  2. Los defaults coinciden con la tabla de referencias
     QA scenarios: happy: GET /ingestion/config returns all fields; failure: missing env var falls back to default
     Commit: Y | feat(ingestion): add IngestionSafetyConfig env-based provider

- [x] 2. Implementar SleepWindowService configurable
     What to do / Must NOT do:
  - Crear `apps/backend/src/kol/ingestion/infrastructure/services/sleep-window.service.ts`
  - Configurable via IngestionSafetyConfig (sleepStartUtc, sleepEndUtc)
  - Default: UTC 4:00-10:00 (12am-6am AST)
  - Método `isAsleep(): boolean`
  - Método `getNextWakeTime(): Date | null`
  - Método `rotateWindow()` con ±30min random cada día para evitar patrón fijo
  - NO acoplarlo al dominio Kol (es infraestructura pura)
    Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4
    References: `06-rate-limits-verified.md` sección 4.3 (SleepWindowService code), draft
    Acceptance criteria (agent-executable):
  1. Test: cuando UTC hour está en [4,10), `isAsleep()` = true
  2. Test: cuando UTC hour está fuera, `isAsleep()` = false
  3. Test: `rotateWindow()` cambia la ventana ±30min
     QA scenarios: unit tests con mock clock; integration: inject en adapter y verificar que pause polling
     Commit: Y | feat(ingestion): add SleepWindowService with AST default (UTC 4-10)

- [x] 3. Crear endpoint GET /ingestion/health con métricas reales
     What to do / Must NOT do:
  - Crear `apps/backend/src/kol/ingestion/api/http/ingestion-health.controller.ts`
  - Endpoint: `GET /ingestion/health` → IngestionHealthDto
  - Métricas a exponer:
    - `activeChannels`: channels actualmente siendo polled (vía KolListenerPort/KolTelegramMtprotoAdapter)
    - `totalSeededChannels`: count from KolRepository.findAll()
    - `maxSafeChannels`: from IngestionSafetyConfig
    - `floodWaitCount24h`: contador acumulado de FLOOD_WAIT errors (nuevo FloodWaitCounter)
    - `floodWaitMaxSeconds24h`: máximo wait en últimas 24h
    - `lastPollAt`: timestamp del último poll exitoso
    - `isSleeping`: from SleepWindowService
    - `sleepWindowStart`: hora UTC
    - `sleepWindowEnd`: hora UTC
    - `pollIntervalMs`: de IngestionSafetyConfig
  - Crear `FloodWaitCounter` (in-memory, simple array de timestamps con TTL 24h)
  - Inyectar en KolTelegramMtprotoAdapter: incrementar contador en cada FloodWaitError
  - NO exponer datos sensibles (api keys, sessions)
  - NO crear tabla en DB (métricas in-memory con TTL)
    Parallelization: Wave 1 | Blocked by: 1 | Blocks: 5,6
    References: `dashboard.controller.ts` (pattern), `dashboard-kpis.port.ts` (pattern), `06-rate-limits-verified.md` sección 5 (Prometheus metrics)
    Acceptance criteria (agent-executable):
  1. `curl -s http://localhost:3030/ingestion/health` devuelve JSON con todos los campos
  2. `activeChannels <= maxSafeChannels` siempre
     QA scenarios: happy: full response; partial: si el adapter no está iniciado, activeChannels=0
     Commit: Y | feat(ingestion): add GET /ingestion/health endpoint with real-time metrics

- [x] 4. Implementar staggered polling con jitter en KolTelegramMtprotoAdapter
     What to do / Must NOT do:
  - Modificar `apps/backend/src/kol/ingestion/api/mtproto/kol-telegram-mtproto.adapter.ts`
  - Reemplazar polling actual (si existe) con staggered + jitter:
    - NO hacer `Promise.all` sobre todos los channels
    - Calcular delay para cada channel: `(pollIntervalMs / activeChannels) * index + jitter`
    - Cada poll individual: `client.getMessages(peer, {limit: 1})` (solo último mensaje)
  - Integrar SleepWindowService: si `isAsleep()`, saltar el ciclo
  - Integrar con FloodWaitCounter (de todo 3)
  - Mantener el `subscribe()` async iterable que devuelve RawKolMessage
  - NO cambiar la interfaz KolListenerPort (subscribe/backfill/disconnect/resolveKolMetadata)
  - NO eliminar el backfill existente (solo modificar el live polling)
    Parallelization: Wave 2 | Blocked by: 1,2 | Blocks: 7
    References: `kol-telegram-mtproto.adapter.ts` (todo el archivo), `kol-listener.port.ts` (interfaz), gramJS `client.getMessages()`
    Acceptance criteria (agent-executable):
  1. Test: con 3 channels mock, los polls se espacian (no simultáneos)
  2. Test: con jitter 30%, los intervalos varían entre 63-117% del base
  3. Test: durante sleep window, no se hacen polls
     QA scenarios: unit: mock gramJS client y verificar patrón de llamadas; manual: ejecutar y ver console.log de delays
     Commit: Y | feat(ingestion): implement staggered polling with jitter + sleep window

- [x] 5. Frontend: widget "Telegram Ingestion Health" en Dashboard
     What to do / Must NOT do:
  - Crear `apps/frontend/src/widgets/ingestion-health/` con:
    - `api/ingestion-health-queries.ts`: fetch + query key
    - `model/types.ts`: IngestionHealth type
    - `ui/ingestion-health-widget.tsx`: el widget visual
  - El widget muestra:
    - Barra de progreso: `activeChannels / maxSafeChannels` con color:
      - Verde: < 70%
      - Naranja: 70-90%
      - Rojo: > 90%
    - "FLOOD_WAIT (24h): N" con alerta si > 5
    - "Sleep: 🌙 activo / ☀️ despierto"
    - "Poll interval: XXs con ±30% jitter"
    - "Último poll: hace Xs"
  - El widget es SOLO LECTURA: no hay botones de editar configuración
  - Agregar al dashboard layout (junto a KpiCards existentes)
  - Crear endpoint proxy si no existe CORS directo a backend
  - NO modificar KpiCards existente
  - NO crear página separada (es un widget dentro del dashboard)
  - NO permitir editar los valores
    Parallelization: Wave 3 | Blocked by: 3 | Blocks: —
    References: `kpi-cards.tsx` (pattern), `dashboard-queries.ts` (pattern), `dashboard/index.tsx` (layout)
    Acceptance criteria (agent-executable):
  1. Playwright: navegar a `/` y ver el nuevo widget con datos reales
  2. Playwright: barra de progreso visible con color correcto
     QA scenarios: happy: widget carga con datos; error: si /ingestion/health falla, mostrar estado "offline"
     Commit: Y | feat(frontend): add IngestionHealth widget with channel usage bar and alerts

- [x] 6. Frontend: corregir KPI "45/45 active"
     What to do / Must NOT do:
  - Modificar `apps/frontend/src/widgets/kpi-cards/ui/kpi-cards.tsx`
  - En vez de `activeKols/totalKols` desde useDashboardKpis:
    - Obtener `activeChannels` y `maxSafeChannels` desde el nuevo health endpoint
    - Mostrar: `📡 Canales: {activeChannels}/{maxSafeChannels}` con tooltip
    - Tooltip: "Canales siendo ingeridos / Máximo seguro. Seed: {totalSeededChannels} KOLs registrados"
  - Si el health endpoint no responde, fallback a los KPI viejos
  - NO eliminar las otras KPI cards (canonical calls, approval rate, published)
    Parallelization: Wave 3 | Blocked by: 3 | Blocks: —
    References: `kpi-cards.tsx` (todo el archivo), `use-dashboard-kpis.ts` (data fetching)
    Acceptance criteria (agent-executable):
  1. Playwright: dashboard muestra "0/50" o similar (no "45/45")
  2. Playwright: tooltip aparece al hover
     QA scenarios: happy: health endpoint ok → muestra ratios reales; fallback: health endpoint caído → muestra KPI old
     Commit: Y | fix(frontend): replace activeKols/totalKols with ingestion health ratio

- [x] 7. Implementar FLOOD_WAIT exponential backoff real
     What to do / Must NOT do:
  - Crear `apps/backend/src/kol/ingestion/infrastructure/services/flood-wait-handler.service.ts`
  - Implementar el patrón de `withFloodWaitRetry()` del draft
  - Configurable via IngestionSafetyConfig (initialMs, multiplier, maxMs, maxAttempts)
  - Registrar en FloodWaitCounter cada FLOOD_WAIT recibido
  - Si se exceden maxAttempts: loggear error + pausar la cuenta por 1h
  - Si una cuenta está pausada: `isPaused(): boolean` + no hacer polling
  - NO reintentar si el error no es FloodWaitError
  - NO implementar auto-unpause (requiere decisión manual o timeout)
    Parallelization: Wave 2 | Blocked by: 1,4 | Blocks: —
    References: `06-rate-limits-verified.md` sección 4.2 (código de backoff), gramJS FloodWaitError
    Acceptance criteria (agent-executable):
  1. Test: FloodWaitError de 10s → espera max(10s, backoffMs)
  2. Test: tras 5 intentos fallidos → isPaused() = true
  3. Test: error no-FloodWait → NO reintentar, propagar error
     QA scenarios: unit: mock gramJS; integration: simular FloodWaitError y verificar pausa
     Commit: Y | feat(ingestion): add FloodWaitHandler with exponential backoff and auto-pause

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE.

- [x] F1. Playwright QA: navegar dashboard, live, kols — verify new widget shows real data
      (✓ Dashboard KPI muestra "0/50", Ingestion Health widget con channels/flood/sleep/poll)
- [x] F2. Backend API contract: curl GET /ingestion/health + GET /ingestion/config — verify all fields
      (✓ /ingestion/health: 10 campos con valores reales; ✓ /ingestion/config: 8 campos con defaults)
- [x] F3. Test suite: run backend + frontend tests — verify all pass
      (frontend 90 tests ✓; backend 6 pre-existing failures en data-provider/ no relacionados)
- [x] F4. Rate limit doc update: actualizar `06-rate-limits-verified.md` con los valores finales implementados y la decisión de 1 cuenta con 45 canales
      (✓ maxChannels=50, staggered polling en vez de sharding, sleep window UTC 4-10, paths actualizados kol/ingestion → telegram/ingestion)

## Commit strategy

- Todo 1 → feat: safety config
- Todo 2 → feat: sleep window
- Todo 3 → feat: health endpoint
- Todo 4 → feat: staggered polling
- Todo 5 → feat: frontend health widget
- Todo 6 → fix: frontend KPI
- Todo 7 → feat: flood wait backoff

## Success criteria

1. Dashboard muestra canales activos / máx seguro (ej: 0/50) con barra de progreso
2. No hay polls simultáneos — cada channel tiene delay stagger + jitter
3. Sleep window funciona (12am-6am AST = UTC 4-10) sin polls durante el sueño
4. FLOOD_WAIT errors tienen backoff exponencial y pausan la cuenta si excede intentos
5. GET /ingestion/health devuelve todas las métricas en tiempo real
6. Tests unitarios pasan para sleep window, backoff, y staggered polling
