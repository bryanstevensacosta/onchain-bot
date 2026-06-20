# Analytics — Bounded Context

> Evalúa el outcome real de cada call (¿la alpha-call dio resultado?) y agrega reputación por canal de Telegram basada en el histórico. Incluye un sistema de background jobs que re-evalúa calls a 24h/7d/30d.

Forma parte de `src/ca/` y se monta vía `AnalyticsModule` (`analytics.module.ts:43`).

---

## 1. Propósito

Este BC mide, retrospectivamente, si los calls publicados rindieron bien. Usa datos en vivo (DexScreener) para comparar el MC al momento del call contra el MC actual, clasifica el outcome (`STRONG`/`GOOD`/`NEUTRAL`/`POOR`/`FAILED`), y agrega stats por canal para que `scoring` pueda usar reputación histórica real en lugar de defaults estáticos.

Tres preguntas clave que el BC responde:

1. ¿Este call terminó en STRONG/GOOD/NEUTRAL/POOR/FAILED?
2. ¿Cuál es la reputación agregada del canal que hizo el call?
3. ¿Cuánta confianza tenemos en esa reputación (cuántos calls medidos)?

**Inputs:**

- HTTP: `POST /ca/analytics/evaluate` para evaluar manualmente.
- HTTP: `POST /ca/analytics/jobs/enqueue` para encolar jobs explícitamente.
- Evento: `scoring.token.scored` (token scored → encolar jobs para 24h/7d/30d).

**Outputs:**

- HTTP: `ChannelReputationStatsView` / `CallEvaluationJobView`.
- Background: tick cada 5 min procesa due jobs via `@nestjs/schedule`.
- **No emite `DomainEvent`**: es un BC terminal.

---

## 2. Responsabilidades del BC

| Responsabilidad | Dónde vive |
|---|---|
| Outcome discreto + peso (`weight()`) | `domain/value-objects/outcome.vo.ts:20` |
| `CallPerformance` VO por (channel, token) | `domain/value-objects/call-performance.vo.ts:21` |
| `ChannelReputationStats` VO con score + confidence | `domain/value-objects/channel-reputation-stats.vo.ts:32` |
| `EvaluationHorizonVo` (24H/7D/30D) + `firesAt()` | `domain/value-objects/evaluation-horizon.vo.ts:18` |
| `CallEvaluationJob` aggregate con lifecycle PENDING/IN_PROGRESS/COMPLETED/FAILED | `domain/entities/call-evaluation-job.entity.ts:43` |
| Función pura `recomputeStats` | `application/handlers/evaluate-call-performance.use-case.ts:75-137` |
| Orquestación evaluate + recompute stats | `application/handlers/evaluate-call-performance.use-case.ts:36-64` |
| Encolar jobs (idempotente por call+horizon) | `application/handlers/enqueue-evaluation-jobs.use-case.ts:28-67` |
| Procesar due jobs (PENDING → IN_PROGRESS → COMPLETED/FAILED) | `application/handlers/process-due-evaluation-jobs.use-case.ts:31-83` |
| Cron tick via `@nestjs/schedule` | `infrastructure/scheduling/background-evaluation.scheduler.ts:48-76` |
| Escucha de `scoring.token.scored` | `infrastructure/event-bus/token-scored.handler.ts:32-61` |
| DexScreenerAdapter como `PerformanceEvaluatorPort` | `infrastructure/adapters/dexscreener-performance-evaluator.adapter.ts:41` |

**Fuera del scope:**

- Categorización de tokens (`classification`).
- Scoring final del token (`scoring`) — solo calcula reputación de canal.
- Honeypot detection real — `isHoneypot` se deja `null` en v1 (`dexscreener-performance-evaluator.adapter.ts:83`).

---

## 3. Límites transaccionales

- **Dos agregados / VOs:**
  - `CallPerformance` (VO) — sin eventos, sin lifecycle. Persiste como `${channelId}:${tokenId}`.
  - `CallEvaluationJob` (AggregateRoot) — emite eventos vía `commit()` aunque v1 no los usa.
  - `ChannelReputationStats` (VO) — materialización agregada de las perfs.
- **Idempotencia:**
  - `CallPerformance` re-evaluado sobrescribe (`in-memory-call-performance.repository.ts:13`).
  - `CallEvaluationJob` id compuesto `${channelId}:${chain}:${address}:${horizon}:${callTimestampMs}` (`call-evaluation-job.entity.ts:84-90`).
- **Atomicidad local:** `performanceRepo.save` + recompute + `statsRepo.save` (no transaccional — drift posible).
- **Job lifecycle:** `PENDING → IN_PROGRESS → COMPLETED | FAILED` (`process-due-evaluation-jobs.use-case.ts:39-72`). Jobs fallidos no se reintentan automáticamente.
- **Sin eventos publicados:** Analytics no emite `DomainEvent` al bus. Es terminal en la pipeline CA.

---

## 4. Lenguaje ubicuo

| Término | Definición | Referencia |
|---|---|---|
| `Outcome` | VO `'STRONG' \| 'GOOD' \| 'NEUTRAL' \| 'POOR' \| 'FAILED'` con `weight()` | `domain/value-objects/outcome.vo.ts:20` |
| `CallPerformance` | VO de evaluación: outcome + mcAtCall + athMultiple + timestamps | `domain/value-objects/call-performance.vo.ts:21` |
| `ChannelReputationStats` | VO agregado: score + counts por outcome + avgAthMultiple + confidence | `domain/value-objects/channel-reputation-stats.vo.ts:32` |
| `ConfidenceLevel` | `'LOW' \| 'MEDIUM' \| 'HIGH' \| 'VERY_HIGH'` (basado en `totalCalls`) | `domain/value-objects/channel-reputation-stats.vo.ts:3`, buckets en `recomputeStats` `:119-123` |
| `EvaluationHorizonVo` | VO `'24H' \| '7D' \| '30D'` con `hours()` y `firesAt()` | `domain/value-objects/evaluation-horizon.vo.ts:18` |
| `JobStatusValue` | `'PENDING' \| 'IN_PROGRESS' \| 'COMPLETED' \| 'FAILED'` | `domain/entities/call-evaluation-job.entity.ts:7` |
| `CallEvaluationJob` | Aggregate con lifecycle + `markInProgress/markCompleted/markFailed` | `domain/entities/call-evaluation-job.entity.ts:43` |
| `PerformanceEvaluatorPort` | Puerto outbound: fetch current market data + outcome | `domain/ports/performance-evaluator.port.ts:27` |
| `PerformanceEvaluation` | Resultado del port: athMultiple, mcAtCall, mcNow, isHoneypot, isRugged, outcome | `domain/ports/performance-evaluator.port.ts:10-17` |
| `recomputeStats(channelId, perfs)` | Función pura: perfs → `ChannelReputationStats` | `application/handlers/evaluate-call-performance.use-case.ts:75-137` |
| `successRate` / `failureRate` | `(strong+good)/total` y `failed/total` | `domain/value-objects/channel-reputation-stats.vo.ts:111-121` |
| `isTrusted` / `isSuspicious` | `score >= 0.7` y `score <= 0.3` (con `confidence !== 'LOW'`) | `domain/value-objects/channel-reputation-stats.vo.ts:104-109` |

---

## 5. API (HTTP — inbound)

Base path: `/ca/analytics` (`api/http/analytics.controller.ts:24`).

| Método | Ruta | Handler | Caso de uso |
|---|---|---|---|
| `POST` | `/ca/analytics/evaluate` | `evaluateCall` (`:38-51`) | `EvaluateCallPerformanceUseCase.execute` (`:36`) + `GetChannelReputationUseCase` |
| `POST` | `/ca/analytics/recompute/:channelId` | `recomputeChannel` (`:53-60`) | `RecomputeChannelStatsUseCase.execute` (`:22`) |
| `GET` | `/ca/analytics/channels/top?limit&minConfidence` | `topChannels` (`:62-67`) | `GetTopReputedChannelsUseCase.execute` (`:67`) |
| `GET` | `/ca/analytics/channels` | `listAllChannels` (`:69-72`) | `ListAllChannelReputationsUseCase.execute` (`:84`) |
| `GET` | `/ca/analytics/channels/:channelId` | `getChannel` (`:74-79`) | `GetChannelReputationUseCase.execute` (`:54`) |
| `POST` | `/ca/analytics/jobs/enqueue` | `enqueueJob` (`:81-93`) | `EnqueueEvaluationJobsUseCase.execute` (`:28`) |
| `GET` | `/ca/analytics/jobs/:id` | `getJob` (`:95-98`) | `GetEvaluationJobUseCase.execute` (`:13`) |
| `POST` | `/ca/analytics/evaluate-due` | `evaluateDue` (`:100-108`) | `ProcessDueEvaluationJobsUseCase.execute(50)` (`:31`) |
| `POST` | `/ca/analytics/scheduler/tick` | `tickScheduler` (`:110-114`) | `BackgroundEvaluationScheduler.tick()` (`:92`) |

`limit` por defecto `20` (`analytics.controller.ts:66`), `minConfidence` opcional.

**Inputs** (`api/input/`):

```ts
// analytics.input.ts:12
class EvaluateCallInputDto {
  channelId!: string;
  chain!: string;
  address!: string;
  mcAtCall?: number | null;
  callTimestamp!: Date;
}

// analytics.input.ts:34
class GetTopChannelsQueryDto {
  limit?: number;       // 1..500
  minConfidence?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
}

// enqueue-jobs.input.ts:10
class EnqueueJobsInputDto {
  channelId!: string;
  chain!: string;
  address!: string;
  callTimestamp!: Date;
  mcAtCall?: number | null;
}
```

---

## 6. Objetos y modelado del dominio

### 6.1 VOs principales

#### `Outcome` (`domain/value-objects/outcome.vo.ts:20`)

- Singletons `STRONG`/`GOOD`/`NEUTRAL`/`POOR`/`FAILED` (`:21-25`).
- `fromString(raw)` (`:39-47`) — `toUpperCase`, valida set (`:41-46`).
- `weight()` (`:53-66`): `STRONG=1.0`, `GOOD=0.5`, `NEUTRAL=0`, `POOR=-0.3`, `FAILED=-0.8`.

#### `EvaluationHorizonVo` (`domain/value-objects/evaluation-horizon.vo.ts:18`)

- Singletons `H24`/`D7`/`D30` (`:19-21`).
- `hours()` (`:55-57`) — `24`/`168`/`720`.
- `firesAt(callTimestamp)` (`:63-65`) — `callTimestamp + hours*3600*1000 ms`.
- `fromString(raw)` (`:33-41`) — valida set.
- `defaultHorizons()` (`:43-49`) — retorna los tres.

#### `CallPerformance` (`domain/value-objects/call-performance.vo.ts:21`)

- `create(input)` (`:26-51`) — valida `channelId` no vacío (`:35-37`), `tokenId` no vacío (`:38-40`), `athMultiple >= 0` si no null (`:41-46`). `evaluatedAt` default `new Date()`.
- `isSuccessful()` (`:75-80`) — `STRONG || GOOD`.

#### `ChannelReputationStats` (`domain/value-objects/channel-reputation-stats.vo.ts:32`)

- `fromValues(input)` (`:37-54`) — factory con `lastEvaluatedAt = new Date()` por default.
- `empty(channelId)` (`:56-69`) — stats neutras (score=0.5, confidence=LOW) para canales sin data.
- `isTrusted` (`:104-106`) — `score >= 0.7 && confidence !== 'LOW'`.
- `isSuspicious` (`:107-109`) — `score <= 0.3 && confidence !== 'LOW'`.
- `successRate` (`:111-116`) / `failureRate` (`:118-121`) — ratios sobre `totalCalls`.

### 6.2 Aggregate `CallEvaluationJob` (`domain/entities/call-evaluation-job.entity.ts:43`)

```
CallEvaluationJob {
  readonly id: string;                  // ${channelId}:${chain}:${address}:${horizon}:${callTimestampMs}
  channelId: string;
  chain: ChainId;
  address: string;                      // lowercased
  horizon: EvaluationHorizonVo;
  callTimestamp: Date;
  mcAtCall: number | null;
  status: JobStatusValue;
  attempts: number;
  lastError: string | null;
  scheduledAt: Date;                    // firesAt(callTimestamp)
  completedAt: Date | null;
}
```

Métodos:

- `static enqueue(input)` (`:51-70`) — valida `channelId` no vacío (`:52-54`), construye `id` vía `buildId`.
- `static buildId(input)` (`:77-91`) — `${channelId.toLowerCase()}:${chain}:${address.toLowerCase()}:${horizon}:${callTimestampMs}`.
- `isDue` (`:126-131`) — `status === 'PENDING' && Date.now() >= scheduledAt`.
- `isTerminal` (`:132-134`) — `COMPLETED || FAILED`.
- `markInProgress()` (`:136-148`) — `PENDING → IN_PROGRESS`, `attempts++`. Lanza `VALIDATION` si no es `PENDING`.
- `markCompleted()` (`:150-157`) — `→ COMPLETED`, set `completedAt`, limpia `lastError`.
- `markFailed(error)` (`:159-166`) — `→ FAILED`, set `completedAt` + `lastError`.
- `mutate(_event)` (`:168-170`) — no-op.

### 6.3 Función pura `recomputeStats` (`evaluate-call-performance.use-case.ts:75-137`)

```
score = clamp(0.5 + avgOutcomeWeight * 0.5, 0, 1)        // :114-116
        redondeado a 2 decimales
confidence:
  totalCalls >= 50  → VERY_HIGH                            // :120
  totalCalls >= 20  → HIGH                                 // :121
  totalCalls >= 5   → MEDIUM                               // :122
  else              → LOW                                   // :123
avgAthMultiple = mean(non-null athMultiple) o null
```

Cada outcome contribute +/-0..0.5 al score (weights van de -0.8 a 1.0).

### 6.4 Puertos de dominio

- `PerformanceEvaluatorPort` (`domain/ports/performance-evaluator.port.ts:27`) — `evaluateCall(input): Promise<PerformanceEvaluation>` (`:28-30`).

### 6.5 Eventos

- **Ninguno.** Analytics no emite `DomainEvent`. Es terminal en la pipeline CA.

---

## 7. Puertos de aplicación

| Puerto | Archivo | Métodos |
|---|---|---|
| `CallPerformanceRepository` | `application/ports/call-performance.repository.ts:3` | `save`, `findByChannel`, `findByToken`, `findAll` |
| `ChannelReputationStatsRepository` | `application/ports/channel-reputation-stats.repository.ts:3` | `save`, `findByChannel`, `findAll`, `findTop(limit, minConfidence?)` |
| `CallEvaluationJobRepository` | `application/ports/call-evaluation-job.repository.ts:3` | `save`, `findById`, `findDue`, `findPendingForCall`, `count` |

Mappers:

- `ChannelReputationStatsMapper.toView` (`channel-reputation-queries.use-case.ts:25-47`) — incluye `successRate`/`failureRate` redondeados a 2 decimales (`:38-39`), `isTrusted`/`isSuspicious` derivados y `lastEvaluatedAt.toISOString()` (`:44`).
- `CallEvaluationJobMapper.toView` (`application/mappers/call-evaluation-job.mapper.ts:22-39`) — incluye `horizon.hours()` (`:30`) y serializa fechas a ISO.

---

## 8. Infraestructura

### 8.1 `DexScreenerPerformanceEvaluatorAdapter`

Archivo: `infrastructure/adapters/dexscreener-performance-evaluator.adapter.ts:41`.

- Endpoint: `GET https://api.dexscreener.com/latest/dex/tokens/{address}` (`:45-46, 53`).
- `evaluateCall(input)` (`:48-100`):
  1. Si no hay pairs → `outcome: 'NEUTRAL'`, todo null (`:56-65`).
  2. `best = pairs.reduce(max by marketCap)` (`:68-70`).
  3. `mcNow = marketCap ?? fdv` (`:72`).
  4. `athMultiple = computeAthMultiple(input, pair)` (`:73, 103-113`) — **v1 simplification**: `currentPrice / 1.0` (asume precio en call-time = 1.0). Documentado como future work (integrar price history endpoint).
  5. `isRugged = mcNow < mcAtCall * 0.1` (`:74-75`).
  6. `classifyOutcome(athMultiple, isRugged)` (`:77, 115-125`):
     - `isRugged` → `FAILED`
     - `athMultiple === null` → `NEUTRAL`
     - `>= 5` → `STRONG`, `>= 2` → `GOOD`, `>= 0.5` → `NEUTRAL`, else → `POOR`
- En error HTTP → log debug (`:88-90`), devuelve `NEUTRAL` con todo null (`:91-99`).

### 8.2 `InMemoryCallPerformanceRepository`

Archivo: `infrastructure/repositories/in-memory-call-performance.repository.ts:6`.

- `Map<string, CallPerformance>` con clave `${channelId}:${tokenId}` (`:8-9`).
- `MAX_ENTRIES = 10_000` (`:7`) — el más grande de los repos de analytics porque acumula histórico.
- `findByChannel`/`findByToken`/`findAll` filtran linealmente (`O(N)`).
- LRU eviction en `save` (`:14-20`).

### 8.3 `InMemoryChannelReputationStatsRepository`

Archivo: `infrastructure/repositories/in-memory-channel-reputation-stats.repository.ts:6`.

- `Map<string, ChannelReputationStats>` con `MAX_ENTRIES = 5000` (`:7`).
- `findAll` ordena por `score` desc (`:33`).
- `findTop` (`:36-52`) — `confidenceOrder` map inline (`:41-46`), filtra `confidenceOrder[s.confidence] >= minOrder`, sort por `score` desc, slice `limit`.

### 8.4 `InMemoryCallEvaluationJobRepository`

Archivo: `infrastructure/repositories/in-memory-call-evaluation-job.repository.ts:6`.

- `Map<string, CallEvaluationJob>` con `MAX_ENTRIES = 50_000` (`:7`) — el más grande del BC.
- `findById` (`:22-25`).
- `findDue(now, limit)` (`:27-37`) — filtra `status === 'PENDING' && scheduledAt <= now`, sort asc por `scheduledAt`, slice `limit`.
- `findPendingForCall(channelId, chain, address, callTimestamp)` (`:39-56`) — para idempotencia de enqueue.
- `count` (`:58-61`).

### 8.5 `BackgroundEvaluationScheduler`

Archivo: `infrastructure/scheduling/background-evaluation.scheduler.ts:34`.

- `@Injectable()` con lifecycle (`OnModuleInit`/`:48-76` + `OnModuleDestroy`/`:78-86`).
- Registra cron job en `@nestjs/schedule` con `SchedulerRegistry` (`:70-71`).
- Config desde `app.analytics.scheduler*`:
  - `schedulerEnabled` (default `true`)
  - `schedulerCron` (default `'*/5 * * * *'` — cada 5 minutos)
  - `schedulerBatchSize` (default `50`)
- `tick()` (`:92-108`) — manual, llama `processDue.execute(batchSize)`. Errores se loggean sin propagar (`:102-107`).

### 8.6 `TokenScoredHandler`

Archivo: `infrastructure/event-bus/token-scored.handler.ts:23`.

- `@OnEvent('scoring.token.scored', { async: true })` (`:32`).
- Skip si `classification === 'SCAM' || 'UNKNOWN'` (`:34-39`).
- Skip si `score < 50` (`:40-42`).
- Enqueue con `channelId: 'pipeline'` (sintético — el evento no trae channelId, `:48`).
- `mcAtCall: null` (no disponible en el evento, `:52`).
- Horizons desde `app.evaluationHorizonsHours` (default `[24, 168, 720]`) o `EvaluationHorizonVo.defaultHorizons()` (`:44-46, 63-74`).

> **Acoplamiento con `scoring`:** el handler importa `TokenScoredEvent` de `ca/scoring/domain/events/token-scored.event` (`:4`).

---

## 9. Casos de uso

| Use case | Archivo | Comportamiento |
|---|---|---|
| `EvaluateCallPerformanceUseCase.execute` | `application/handlers/evaluate-call-performance.use-case.ts:36-64` | `tokenId = ${chain}:${address.toLowerCase()}` (`:39`); `evaluator.evaluateCall` (`:40-46`); `CallPerformance.create` (`:48-55`); `performanceRepo.save` (`:57`); `findByChannel` (`:59`) → `recomputeStats` (`:60`) → `statsRepo.save` (`:61`); devuelve `stats`. |
| `RecomputeChannelStatsUseCase.execute` | `application/handlers/recompute-channel-stats.use-case.ts:22-29` | `findByChannel(perfs)`; `recomputeStats`; `save`. |
| `GetChannelReputationUseCase.execute` | `application/handlers/channel-reputation-queries.use-case.ts:54-59` | `findByChannel` → si null, `ChannelReputationStats.empty(channelId)` (no lanza NOT_FOUND). |
| `GetTopReputedChannelsUseCase.execute` | `application/handlers/channel-reputation-queries.use-case.ts:67-76` | Valida `limit` (1..500). **Lanza `Error` plain** si inválido (`:71-73`). `findTop(limit, minConfidence?)`. |
| `ListAllChannelReputationsUseCase.execute` | `application/handlers/channel-reputation-queries.use-case.ts:84-87` | `findAll` → mapea a view. |
| `EnqueueEvaluationJobsUseCase.execute` | `application/handlers/enqueue-evaluation-jobs.use-case.ts:28-67` | Horizons default si no se pasan (`EvaluationHorizonVo.defaultHorizons()`, `:32`). Por cada horizon: `findPendingForCall` para idempotencia (`:36-50`); si no existe, `CallEvaluationJob.enqueue` + `save`. |
| `ProcessDueEvaluationJobsUseCase.execute` | `application/handlers/process-due-evaluation-jobs.use-case.ts:31-83` | `findDue(now, 50)`; por cada job: `markInProgress` + save (`:41-42`) → `evaluate.execute` (`:44-50`) → `markCompleted` + save (`:52-53`). En error: `markFailed(error)` + save (`:60-67`). Retorna `{ processed, succeeded, failed, skipped }`. |
| `GetEvaluationJobUseCase.execute` | `application/handlers/get-evaluation-job.use-case.ts:13-23` | `findById`; lanza `DomainError(NOT_FOUND)` si null (`:15-21`). |

---

## 10. Flujo (happy path)

```
scoring.token.scored (classification != SCAM/UNKNOWN, score >= 50)
        |
        v
TokenScoredHandler (event-bus)
        |
        v
EnqueueEvaluationJobsUseCase.execute  (idempotente por call+horizon)
        |
        +--> por cada horizon (24H, 7D, 30D):
        |       findPendingForCall (idempotencia)
        |       CallEvaluationJob.enqueue  → scheduledAt = callTimestamp + horizon.hours
        |       CallEvaluationJobRepository.save
        |
        v
[CallEvaluationJob: PENDING, scheduledAt futuro]


[cron tick cada 5 min]
BackgroundEvaluationScheduler.tick
        |
        v
ProcessDueEvaluationJobsUseCase.execute(50)
        |
        +--> findDue(now, 50)  → jobs PENDING con scheduledAt <= now
        |
        +--> por cada job:
        |       markInProgress + save
        |       EvaluateCallPerformanceUseCase.execute
        |         |--> evaluator.evaluateCall (DexScreener HTTP)
        |         |--> CallPerformance.create + save
        |         |--> recomputeStats(channelId, perfs) → ChannelReputationStats + save
        |       markCompleted + save
        |
        v
ChannelReputationStatsView  -->  HTTP response  -->  Consumidores: Scoring BC (vía AnalyticsModule)
```

> **Manual override:** `POST /ca/analytics/evaluate-due` invoca `ProcessDueEvaluationJobsUseCase.execute(50)` directamente. `POST /ca/analytics/scheduler/tick` ejecuta un tick manual.

---

## 11. Wiring (NestJS DI)

Archivo: `analytics.module.ts:43-80`.

| Token | Implementación |
|---|---|
| `AnalyticsController` | controller (`:45`) |
| `EvaluateCallPerformanceUseCase` | self-provide (`:47`) |
| `RecomputeChannelStatsUseCase` | self-provide (`:48`) |
| `GetChannelReputationUseCase` | self-provide (`:49`) |
| `GetTopReputedChannelsUseCase` | self-provide (`:50`) |
| `ListAllChannelReputationsUseCase` | self-provide (`:51`) |
| `EnqueueEvaluationJobsUseCase` | self-provide (`:52`) |
| `ProcessDueEvaluationJobsUseCase` | self-provide (`:53`) |
| `GetEvaluationJobUseCase` | self-provide (`:54`) |
| `BackgroundEvaluationScheduler` | self-provide (`:55`) |
| `TokenScoredHandler` | self-provide (`:56`) |
| `ChannelReputationStatsRepository` | `InMemoryChannelReputationStatsRepository` (`:57-60`) |
| `CallPerformanceRepository` | `InMemoryCallPerformanceRepository` (`:61-64`) |
| `CallEvaluationJobRepository` | `InMemoryCallEvaluationJobRepository` (`:65-68`) |
| `PerformanceEvaluatorPort` | `DexScreenerPerformanceEvaluatorAdapter` (`:69-72`) |

**Exports** (`:74-78`): `ChannelReputationStatsRepository`, `CallPerformanceRepository`, `CallEvaluationJobRepository`. Otros BCs (e.g. `scoring`) pueden consumirlos.

> **Acoplamiento entre BCs:** múltiples archivos importan `ChainId` de `ca/chain-detection` (e.g. `call-evaluation-job.entity.ts:4`). `TokenScoredHandler` importa `TokenScoredEvent` de `ca/scoring`.

### 11.1 Configuración (env vars)

Definidas en `analytics.module.ts:37-41` y consumidas por `BackgroundEvaluationScheduler` (`:49-52`) + `TokenScoredHandler` (`:44-45`):

| Variable | Default | Uso |
|---|---|---|
| `ANALYTICS_SCHEDULER_ENABLED` | `true` | Habilita/deshabilita el cron |
| `ANALYTICS_SCHEDULER_CRON` | `*/5 * * * *` | Expresión cron del scheduler |
| `ANALYTICS_SCHEDULER_BATCH_SIZE` | `50` | Jobs a procesar por tick |
| `ANALYTICS_EVALUATION_HORIZONS_HOURS` | `24,168,720` | Horizons a encolar |

---

## 12. Errores de dominio

| `ErrorCode` | Dónde se lanza | Referencia |
|---|---|---|
| `VALIDATION` | `CallPerformance.create` — `channelId`/`tokenId` vacío | `domain/value-objects/call-performance.vo.ts:35-40` |
| `VALIDATION` | `CallPerformance.create` — `athMultiple < 0` | `domain/value-objects/call-performance.vo.ts:41-46` |
| `VALIDATION` | `Outcome.fromString` — valor fuera del set | `domain/value-objects/outcome.vo.ts:41-46` |
| `VALIDATION` | `EvaluationHorizonVo.fromString` — valor fuera del set | `domain/value-objects/evaluation-horizon.vo.ts:35-39` |
| `VALIDATION` | `CallEvaluationJob.enqueue` — `channelId` vacío | `domain/entities/call-evaluation-job.entity.ts:52-54` |
| `VALIDATION` | `CallEvaluationJob.markInProgress` — status != PENDING | `domain/entities/call-evaluation-job.entity.ts:137-142` |
| `NOT_FOUND` | `GetEvaluationJobUseCase.execute` | `application/handlers/get-evaluation-job.use-case.ts:15-21` |

> **No-`DomainError`s:**
> - `GetTopReputedChannelsUseCase.execute` lanza `Error('Invalid limit')` (`channel-reputation-queries.use-case.ts:72`). Conviene migrar a `DomainError(VALIDATION)`.
> - `ChannelReputationStats.fromValues` no valida rangos (score > 1, totalCalls negativo). Asume confianza en el caller (`recomputeStats` está bien, pero un caller externo podría romper invariantes).
> - `DexScreenerPerformanceEvaluatorAdapter.evaluateCall` traga excepciones HTTP (`:87-99`) — no propaga errores de transporte.

---

## 13. Pruebas

Existentes (todas pasan con Jest):

- `application/handlers/evaluate-call-performance.use-case.spec.ts` — 8 tests de la función pura `recomputeStats`: empty defaults, perfect channel (score 1.0), failing channel (score ≤ 0.2), confidence buckets (LOW/MEDIUM/HIGH/VERY_HIGH), avg ATH multiple, skip null ATH, counts por outcome, mixed outcomes.
- `application/handlers/scheduling-use-cases.spec.ts` — 9 tests: EnqueueEvaluationJobsUseCase (4: default 3 horizons, custom horizons, idempotencia, scheduledAt math) + ProcessDueEvaluationJobsUseCase (4: success, fail marks FAILED, no procesa futuro, batch size limit) + recompute integration (1).
- `domain/entities/call-evaluation-job.entity.spec.ts` — 12 tests: EvaluationHorizonVo (singletons, hours, firesAt, fromString, defaultHorizons) + CallEvaluationJob (enqueue, empty channelId, buildId determinístico/diferente por horizon, isDue true/false, markInProgress, markInProgress throws on non-PENDING, markCompleted, markFailed, isTerminal).
- `infrastructure/scheduling/background-evaluation.scheduler.spec.ts` — 5 tests: onModuleInit registers cron, skip cuando disabled, tick delega con batchSize, onModuleDestroy stops cron, tick maneja errores.

**Gaps conocidos:**

- No hay spec de `ChannelReputationStats.isTrusted`/`isSuspicious`/`successRate`/`failureRate` como métodos aislados (cubierto por transitividad).
- No hay spec de `Outcome.weight()` como función aislada.
- No hay spec de `RecomputeChannelStatsUseCase` aislado.
- No hay spec de `DexScreenerPerformanceEvaluatorAdapter` (requeriría mock de axios).
- No hay spec de los repos in-memory.
- No hay spec de `GetTopReputedChannelsUseCase` ni `ListAllChannelReputationsUseCase` ni `GetChannelReputationUseCase` (queries HTTP).

---

## 14. Extensiones sugeridas

1. **Honeypot detection real** — sustituir `null` en `isHoneypot` por una llamada a GoPlus/Honeypot.is. Añadir `HoneypotDetectorPort` (`dexscreener-performance-evaluator.adapter.ts:83`).
2. **Precio histórico real** — integrar DexScreener price history endpoint o CoinGecko historical. Eliminar la simplificación `callPrice = 1.0` (`:111`).
3. **Outbox pattern** — atomicidad `performanceRepo.save` + recompute + `statsRepo.save` + job mark.
4. **Persistencia real** — TypeORM/Prisma con índices en `channelId`, `tokenId`, `(channelId, tokenId)`, `(scheduledAt, status)`.
5. **Migrar `Error` → `DomainError`** en `GetTopReputedChannelsUseCase.execute` (`:72`).
6. **Retry de jobs FAILED** — actualmente `ProcessDueEvaluationJobsUseCase` no reintenta (`:55-71`). Añadir backoff exponencial.
7. **Tests E2E** del controller HTTP con `supertest` (no presentes).
8. **ChannelId real en `TokenScoredHandler`** — hoy usa `'pipeline'` sintético (`:48`). El evento `scoring.token.scored` debería llevar `channelId` desde `parsing`.

---

## 15. Mapa rápido de archivos

```
src/ca/analytics/
├── api/
│   ├── http/analytics.controller.ts
│   └── input/
│       ├── analytics.input.ts
│       └── enqueue-jobs.input.ts
├── application/
│   ├── handlers/
│   │   ├── channel-reputation-queries.use-case.ts
│   │   ├── enqueue-evaluation-jobs.use-case.ts
│   │   ├── evaluate-call-performance.use-case.ts
│   │   ├── evaluate-call-performance.use-case.spec.ts
│   │   ├── get-evaluation-job.use-case.ts
│   │   ├── process-due-evaluation-jobs.use-case.ts
│   │   ├── recompute-channel-stats.use-case.ts
│   │   └── scheduling-use-cases.spec.ts
│   ├── mappers/call-evaluation-job.mapper.ts
│   └── ports/
│       ├── call-evaluation-job.repository.ts
│       ├── call-performance.repository.ts
│       └── channel-reputation-stats.repository.ts
├── domain/
│   ├── entities/
│   │   ├── call-evaluation-job.entity.ts
│   │   └── call-evaluation-job.entity.spec.ts
│   ├── ports/performance-evaluator.port.ts
│   └── value-objects/
│       ├── call-performance.vo.ts
│       ├── channel-reputation-stats.vo.ts
│       ├── evaluation-horizon.vo.ts
│       └── outcome.vo.ts
├── infrastructure/
│   ├── adapters/dexscreener-performance-evaluator.adapter.ts
│   ├── event-bus/token-scored.handler.ts
│   ├── repositories/
│   │   ├── in-memory-call-evaluation-job.repository.ts
│   │   ├── in-memory-call-performance.repository.ts
│   │   └── in-memory-channel-reputation-stats.repository.ts
│   └── scheduling/
│       ├── background-evaluation.scheduler.ts
│       └── background-evaluation.scheduler.spec.ts
├── analytics.module.ts
└── README.md
```