# Scoring — Bounded Context

> Combina classification + métricas de mercado + buzz + reputación de canal en un único score 0..100 con desglose de factores, que será la entrada principal de `filters`.

Forma parte de `src/discovery/` y se monta vía `ScoringModule` (`scoring.module.ts:28`).

---

## 1. Propósito

Este BC es el **cerebro de decisión** del pipeline discovery. Toma todo lo producido aguas arriba (classification con risk signals, métricas del token, número de canales que lo mencionaron, reputación de esos canales) y produce un único `score` 0..100 con un `breakdown` que explica cada factor. La salida alimenta directamente a `filters` (gate) y `publishing` (tier).

Tres preguntas clave que el BC resuelve:

1. ¿Qué score 0..100 merece este token combinando todos los factores?
2. ¿Qué factores positivos/negativos contribuyen al score (para explicabilidad)?
3. ¿Es STRONG/DECENT/NEUTRAL/RISKY/AVOID (tier)?

## 2. Responsabilidades del BC

| Responsabilidad | Dónde vive |
|---|---|
| Score 0..100 con `tier()` 5-buckets | `domain/value-objects/score.vo.ts:18` |
| `ChannelReputation` VO (per-channel 0..1) | `domain/value-objects/channel-reputation.vo.ts:20` |
| `TokenScore` agregado con breakdown | `domain/entities/token-score.entity.ts:47` |
| Look-up de reputación de canales | `domain/ports/channel-reputation.port.ts:14` |
| Fórmula heurística con bonos/penalidades/multiplicador | `application/handlers/score-token.use-case.ts:56-112` |
| Bonos: liquidity, holders, MC, volume, buzz | `application/handlers/score-token.use-case.ts:114-281` |
| Penalidades: signals por severidad | `application/handlers/score-token.use-case.ts:283-317` |
| Multiplicador por reputación promedio | `application/handlers/score-token.use-case.ts:319-328` |
| Cap por classification (SCAM→5, UNKNOWN→20) | `application/handlers/score-token.use-case.ts:330-334` |
| Orquestación HTTP (admin) | `api/http/scoring.controller.ts` |
| Escucha de `classification.token.classified` | `infrastructure/event-bus/token-classified.handler.ts:15` |
| Publicación de `scoring.token.scored` | `application/handlers/score-token.use-case.ts:109` |

**Fuera del scope:**

- Categorizar tokens (`classification`).
- Aplicar gates duros (`filters`).
- Publicar (`publishing`).
- Calcular reputación (eso es `analytics`). Aquí solo se consulta vía port.

## 3. Límites transaccionales

- **Agregado raíz:** `TokenScore` (`domain/entities/token-score.entity.ts:47`). Id compuesto `${chain}:${addressLowercased}` — idempotente.
- **Atomicidad local:** `save` + `publishAll` tras `commit()`. Mismo caveat (sin outbox).
- **Eventos:** emite `scoring.token.scored` (`domain/events/token-scored.event.ts:37`).
- **Concurrencia:** `Map` keyed por id compuesto.
- **Cross-BC dependency:** `imports: [AnalyticsModule]` (`scoring.module.ts:29`). En v1 el `DefaultChannelReputationAdapter` es estático; cuando se prefiera reputación real, este BC accederá a `ChannelReputationStatsRepository` de Analytics.

## 4. Lenguaje ubicuo

| Término | Definición | Referencia |
|---|---|---|
| `Score` | VO 0..100 con `tier()` | `domain/value-objects/score.vo.ts:18` |
| `Score.tier()` | `'STRONG' \| 'DECENT' \| 'NEUTRAL' \| 'RISKY' \| 'AVOID'` (rangos 80/60/40/20) | `domain/value-objects/score.vo.ts:38-44` |
| `ChannelReputation` | VO per-channel `score 0..1` con `mentionCount` | `domain/value-objects/channel-reputation.vo.ts:20` |
| `ChannelReputation.unknown(channelId)` | Default `score=0.5`, `mentionCount=0` | `domain/value-objects/channel-reputation.vo.ts:47-49` |
| `TokenScore` | Agregado score + breakdown + classification + source/mention counts + avg reputation | `domain/entities/token-score.entity.ts:47` |
| `ScoreBreakdownItem` | `{ factor, delta, note }` — explica cada contribución | `domain/entities/token-score.entity.ts:8-12` |
| `ChannelReputationPort` | Puerto outbound: `getReputation(channelId)`, `getAverageReputation(channelIds)` | `domain/ports/channel-reputation.port.ts:14` |
| `avgChannelReputation` | Promedio 0..1 de los canales fuente (input al multiplicador) | `domain/entities/token-score.entity.ts:34, 96-98` |
| `reputationMultiplier(avg)` | `0.5 → 1.0`, `0.9 → 1.12`, `1.0 → 1.15` (lineal en 0.5..1.5 mapeado a 0.85..1.15) | `application/handlers/score-token.use-case.ts:319-328` |
| `classificationCap(classification)` | `SCAM → 5`, `UNKNOWN → 20`, else `100` | `application/handlers/score-token.use-case.ts:330-334` |

## 5. API (HTTP — inbound)

Base path: `/ca/scoring` (`api/http/scoring.controller.ts:9`).

| Método | Ruta | Handler | Caso de uso |
|---|---|---|---|
| `POST` | `/ca/scoring/score` | `ScoringController.run` (`:18`) | `ScoreTokenUseCase.execute` (`:56`) |
| `GET` | `/ca/scoring/tokens/top?limit&minScore` | `ScoringController.top` (`:35`) | `GetTopScoresUseCase.execute(limit, minScore)` (`:17`) |
| `GET` | `/ca/scoring/tokens/recent?limit=N` | `ScoringController.recent` (`:46`) | `ListTokenScoresUseCase.execute(limit)` (`:13`) |
| `GET` | `/ca/scoring/tokens/:chain/:address` | `ScoringController.get` (`:54`) | `GetTokenScoreUseCase.execute` (`:15`) |

`limit` defaults: `top` = 20, `recent` = 10. `minScore` default = 70.

`POST /score` valida con `class-validator` (`api/input/score-token.input.ts:25-72`): `chain`, `address`, `classification`, `signals: SignalInput[]` requeridos; resto opcional (`liquidityUsd`, `marketCapUsd`, `volume24hUsd`, `holders`, `sourceCount`, `mentionCount`, `sourceChannelIds`).

## 6. Objetos y modelado del dominio

### 6.1 Agregado `TokenScore`

Archivo: `domain/entities/token-score.entity.ts:47`.

```
TokenScore {
  readonly id: string;                  // `${chain}:${addressLowercased}`
  chain: ChainId;
  address: string;
  score: Score;                          // 0..100
  breakdown: ReadonlyArray<ScoreBreakdownItem>;
  classification: string;
  sourceCount: number;
  mentionCount: number;
  avgChannelReputation: number;         // 0..1
  scoredAt: Date;
}
```

- `static create(input)` (`:55-73`) — valida `address` no vacío; id compuesto; freezea breakdown items.
- `tier` (`:102-104`) — `score.tier()`.
- `positiveFactors` / `negativeFactors` (`:106-112`) — filtra breakdown por signo de `delta`.
- `emitScored()` (`:114-129`) — emite `TokenScoredEvent` con breakdown aplanado.
- `mutate(_event)` (`:131-133`) — no-op.

### 6.2 Value Objects

- `Score` (`domain/value-objects/score.vo.ts:18`)
  - `fromNumber(raw)` (`:23-32`) — valida `Number.isFinite && 0..100`; redondea a entero.
  - `tier()` (`:38-44`).
- `ChannelReputation` (`domain/value-objects/channel-reputation.vo.ts:20`)
  - `create({ channelId, score, mentionCount? })` (`:25-45`) — valida `channelId` no vacío y `score 0..1`.
  - `unknown(channelId)` (`:47-49`) — default 0.5.
  - `isTrusted` (`score >= 0.7`) / `isSuspicious` (`score <= 0.3`) (`:61-67`).

### 6.3 Eventos

- `TokenScoredEvent` (`domain/events/token-scored.event.ts:7`) — `eventName = 'scoring.token.scored'` (`:37`); payload incluye `breakdown[]`.

### 6.4 Puertos de dominio

- `ChannelReputationPort` (`domain/ports/channel-reputation.port.ts:14`) — `getReputation(channelId)`, `getAverageReputation(channelIds)`. Implementado por `DefaultChannelReputationAdapter` (estático). Cuando se prefiera reputación histórica real, añadir `AnalyticsChannelReputationAdapter` y usar multi-binding o selección por config.

## 7. Fórmula de scoring

Archivo: `application/handlers/score-token.use-case.ts:56-112`.

```
score = 50  (base)

+ liquidityBonus(liq)            # ≥50k:+20, ≥10k:+10, ≥1k:+5, <1k:-10
+ holdersBonus(holders)          # ≥1000:+15, ≥100:+8, ≥10:+3, 0:-10
+ marketCapBonus(mc)             # ≥1M:+10, ≥100k:+5, ≥10k:+2
+ volumeBonus(vol)               # ≥50k:+5, ≥10k:+2
+ buzzBonus(sources, mentions)   # 3+ sources:+10, 2 sources:+5
                                # 5+ mentions:+5, 2+ mentions:+2
- signalPenalties(signals)       # CRITICAL:-15, HIGH:-8, MEDIUM:-4, LOW:-1

× reputationMultiplier(avgRep)   # 0.5→1.0, 0.9→1.12, 1.0→1.15

cap = classificationCap(cls)     # SCAM:5, UNKNOWN:20, else:100
if score > cap: score = cap
clamp score to [0, 100]
```

> Cada bono/penalidad emite un `ScoreBreakdownItem` con `factor`, `delta`, `note` — la suma de deltas no siempre es exacta al score final por el orden de operaciones (multiplicador aplica después, cap aplica al final).

## 8. Puertos de aplicación

| Puerto | Archivo | Métodos |
|---|---|---|
| `TokenScoreRepository` | `application/ports/token-score.repository.ts:4` | `save`, `findByChainAndAddress`, `findRecent`, `findTopScores(limit, minScore)` |
| `ScoringEventPublisher` | `application/ports/scoring-event.publisher.ts:3` | `publish`, `publishAll` |

Mappers:

- `TokenScoreMapper.toView` (`application/mappers/token-score.mapper.ts:23-38`) — view con `tier` derivado y `scoredAt.toISOString()`.

## 9. Infraestructura

### 9.1 `DefaultChannelReputationAdapter`

Archivo: `infrastructure/adapters/default-channel-reputation.adapter.ts` (con spec en `.spec.ts`).

- Lista hardcoded de canales "known good" (e.g., SpyDefi con score 0.9).
- `getReputation(channelId)` → `ChannelReputation.unknown(channelId)` si no está en la lista.
- `getAverageReputation(channelIds)` → promedio de las reputations.

### 9.2 `InMemoryTokenScoreRepository`

Archivo: `infrastructure/repositories/in-memory-token-score.repository.ts:7`.

- `Map<string, TokenScore>` con `MAX_ENTRIES = 500` (`:8`).
- `findTopScores` (`:38-47`) — filtra por `score.value >= minScore`, sort desc, slice.

### 9.3 `InProcessScoringEventPublisher`

Archivo: `infrastructure/messaging/in-process-scoring-event.publisher.ts:7`. Wrapper sobre `EventEmitter2`.

### 9.4 `TokenClassifiedHandler`

Archivo: `infrastructure/event-bus/token-classified.handler.ts:15`.

- `@OnEvent('classification.token.classified', { async: true })` (`:20`).
- `liquidityUsd`/`marketCapUsd`/`volume24hUsd`/`holders` → `null` (`:28-31`) — el evento de classification no los carga (vendrían de enrichment, pero classification los descarta).
- `sourceCount`/`mentionCount` → 1 (defaults).
- `sourceChannelIds` → `[]` → `avgReputation = 0.5` (neutral, multiplicador = 1.0).
- Try/catch que traga errores (`:36-41`).

> **Importante:** la path event-driven pierde los datos de mercado y canales. La controller path es necesaria para scoring preciso. Documentar en ops que `POST /ca/scoring/score` es la fuente canónica.

## 10. Casos de uso

| Use case | Archivo | Comportamiento |
|---|---|---|
| `ScoreTokenUseCase.execute` | `application/handlers/score-token.use-case.ts:56` | Calcula score con bonos + signal penalties; `getAverageReputation`; aplica multiplicador + cap; clamp; `TokenScore.create`; `save` → `emitScored` → `publishAll`. |
| `GetTokenScoreUseCase.execute` | `application/handlers/get-token-score.use-case.ts:15` | `findByChainAndAddress`; lanza `DomainError(NOT_FOUND)` si null. |
| `ListTokenScoresUseCase.execute` | `application/handlers/list-token-scores.use-case.ts:13` | Valida `limit` (1..500); `findRecent` → mapea a view. |
| `GetTopScoresUseCase.execute` | `application/handlers/get-top-scores.use-case.ts:17` | Valida `limit` (1..500) y `minScore` (0..100); `findTopScores` → mapea a view. |

## 11. Flujo (happy path)

```
classification.token.classified
        |
        v
TokenClassifiedHandler (event-bus)
        |  [datos de mercado perdidos → null]
        v
ScoreTokenUseCase.execute
        |
        +--> base = 50
        |
        +--> bonos por liquidity/holders/mc/volume/buzz
        +--> penalidades por signals
        |
        +--> ChannelReputationPort.getAverageReputation(channelIds)
        +--> reputationMultiplier(avgRep)
        |
        +--> classificationCap (SCAM→5, UNKNOWN→20)
        +--> clamp [0, 100]
        |
        +--> TokenScore.create(...)
        |
        +--> TokenScoreRepository.save
        |
        +--> TokenScore.emitScored
        |
        +--> ScoringEventPublisher.publishAll  (EventEmitter2)
        |
        v
scoring.token.scored  -->  Filters (siguiente)
```

## 12. Wiring (NestJS DI)

Archivo: `scoring.module.ts:28-48`.

| Token | Implementación |
|---|---|
| `ChannelReputationPort` | `DefaultChannelReputationAdapter` (`:39`) |
| `TokenScoreRepository` | `InMemoryTokenScoreRepository` (`:41`) |
| `ScoringEventPublisher` | `InProcessScoringEventPublisher` (`:45`) |
| `ScoreTokenUseCase` | self-provide (`:32`) |
| `GetTokenScoreUseCase` | self-provide (`:33`) |
| `ListTokenScoresUseCase` | self-provide (`:34`) |
| `GetTopScoresUseCase` | self-provide (`:35`) |
| `TokenClassifiedHandler` | self-provide (`:36`) |
| `ScoringController` | controller (`:30`) |

**Imports** (`:29`): `AnalyticsModule` (preparado para usar reputación histórica real; no usado en v1 porque `DefaultChannelReputationAdapter` no consulta Analytics).

**Exports** (`:47`): `TokenScoreRepository`, `ScoringEventPublisher`.

> **Acoplamiento a `chain-detection`:** el agregado importa `ChainId` de `ca/chain-detection/domain/value-objects/chain-id.vo` (`token-score.entity.ts:4`).

## 13. Errores de dominio

| `ErrorCode` | Dónde se lanza | Referencia |
|---|---|---|
| `VALIDATION` | `TokenScore.create` — `address` vacío | `domain/entities/token-score.entity.ts:56-58` |
| `VALIDATION` | `Score.fromNumber` — fuera de [0, 100] o no finito | `domain/value-objects/score.vo.ts:24-30` |
| `VALIDATION` | `ChannelReputation.create` — `channelId` vacío o `score` fuera de [0, 1] | `domain/value-objects/channel-reputation.vo.ts:30-39` |
| `UNSUPPORTED_CHAIN` | `ChainId.fromString` (en `ScoreTokenUseCase.execute`) | `domain/value-objects/chain-id.vo.ts:51-57` (via dependency) |
| `NOT_FOUND` | `GetTokenScoreUseCase.execute` | `application/handlers/get-token-score.use-case.ts:23-29` |
| `VALIDATION` | `ListTokenScoresUseCase.execute` — `limit` fuera de [1, 500] | `application/handlers/list-token-scores.use-case.ts:14-18` |
| `VALIDATION` | `GetTopScoresUseCase.execute` — `limit` fuera de [1, 500] o `minScore` fuera de [0, 100] | `application/handlers/get-top-scores.use-case.ts:17-28` |

## 14. Pruebas

Existentes (todas pasan con Jest):

- `application/handlers/score-token.use-case.spec.ts` — orquestación con fake `ChannelReputationPort`; verifica bonos (liquidity/holders/mc/volume/buzz), penalidades (signals por severidad), multiplicador, cap por classification, orden de operaciones (base → bonuses → penalties → mult → cap → clamp).
- `infrastructure/adapters/default-channel-reputation.adapter.spec.ts` — `getReputation`/`getAverageReputation` con canales conocidos y desconocidos.
- `infrastructure/event-bus/token-classified.handler.spec.ts` — suscripción y traducción del evento a `ScoreTokenInput` (con campos null/default).

**Gaps conocidos:**

- No hay spec de `Score.tier()` ni de `ChannelReputation.isTrusted`/`isSuspicious`.
- No hay spec de `InMemoryTokenScoreRepository` ni de `InProcessScoringEventPublisher`.
- No hay spec de `GetTokenScoreUseCase`/`ListTokenScoresUseCase`/`GetTopScoresUseCase`.

## 15. Extensiones sugeridas

1. **Reputación real desde Analytics** — implementar `AnalyticsChannelReputationAdapter` que use `ChannelReputationStatsRepository` de `AnalyticsModule` (ya importado). Multi-binding con `CHANNEL_REPUTATIONS` Symbol, similar a `CHAIN_PROBERS`.
2. **ML scoring** — entrenar sobre histórico de `CallPerformance` (analytics) + features actuales como input a un modelo supervisado.
3. **Score tunable por tier** — permitir que la fórmula sea configurable (e.g., `SCORING_LIQUIDITY_WEIGHT=0.25`) vía `ConfigService`.
4. **Composite score cross-BC** — combinar este score con datos de `chain-detection` confidence o `enrichment` completeness.
5. **Outbox pattern** — atomicidad save+publish.
6. **Persistencia real** — TypeORM/Prisma con índice `(chain, address)`.
7. **Enriquecer el evento** — incluir `chainDetectionConfidence` y `enrichmentCompleteness` en `TokenScoredEvent` payload para que `filters` los use sin tener que re-buscar.
8. **Reescalar signal penalties** — la diferencia entre `CRITICAL:-15` y `HIGH:-8` puede ser muy pequeña en la práctica. Considerar `-25/-15/-8/-2`.

## 16. Mapa rápido de archivos

```
src/discovery/scoring/
├── api/
│   ├── http/scoring.controller.ts
│   └── input/score-token.input.ts
├── application/
│   ├── handlers/
│   │   ├── get-token-score.use-case.ts
│   │   ├── get-top-scores.use-case.ts
│   │   ├── list-token-scores.use-case.ts
│   │   ├── score-token.use-case.ts
│   │   └── score-token.use-case.spec.ts
│   ├── mappers/token-score.mapper.ts
│   └── ports/
│       ├── scoring-event.publisher.ts
│       └── token-score.repository.ts
├── domain/
│   ├── entities/token-score.entity.ts
│   ├── events/token-scored.event.ts
│   ├── ports/channel-reputation.port.ts
│   └── value-objects/
│       ├── channel-reputation.vo.ts
│       └── score.vo.ts
├── infrastructure/
│   ├── adapters/
│   │   ├── default-channel-reputation.adapter.ts
│   │   └── default-channel-reputation.adapter.spec.ts
│   ├── event-bus/
│   │   ├── token-classified.handler.ts
│   │   └── token-classified.handler.spec.ts
│   ├── messaging/in-process-scoring-event.publisher.ts
│   └── repositories/in-memory-token-score.repository.ts
├── scoring.module.ts
└── README.md
```
