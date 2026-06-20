# Filters — Bounded Context

> Última compuerta antes de publicar: aplica un set de gates configurables (score mínimo, blacklist, honeypot sospecha, risk weight, completeness, chain) y decide APPROVED/REJECTED por token.

Forma parte de `src/ca/` y se monta vía `FiltersModule` (`filters.module.ts:23`).

---

## 1. Propósito

Este BC es el **gate final** del pipeline CA. Toma el score calculado por `scoring` + el contexto del classification, aplica N gates fail-fast, y emite `filters.token.approved` (al BC `publishing`) o `filters.token.rejected` (a ops/dashboards). Es el último punto donde un token "malo" puede ser descartado antes de tocar al usuario final.

Tres preguntas clave que el BC responde:

1. ¿Este token pasa los umbrales duros (score, risk, blacklist)?
2. ¿Está en una chain que soportamos para publicar?
3. ¿Qué razón(es) justifican aprobar o rechazar?

## 2. Responsabilidades del BC

| Responsabilidad | Dónde vive |
|---|---|
| Verdict APPROVED/REJECTED/PENDING | `domain/value-objects/filter-verdict.vo.ts:15` |
| `FilterReason` con código + mensaje | `domain/value-objects/filter-reason.vo.ts:24` |
| `FilterDecision` agregado | `domain/entities/filter-decision.entity.ts:37` |
| Aplicación de gates en orden fail-fast | `application/handlers/apply-filters.use-case.ts:70-159` |
| Default `FilterConfig` (umbrales) | `application/handlers/apply-filters.use-case.ts:21-27` |
| Lista de chains publicables | `application/handlers/apply-filters.use-case.ts:65-68` |
| Blacklist port (in-memory hardcoded + future external) | `domain/ports/blacklist.port.ts:10` |
| Orquestación HTTP (admin) | `api/http/filters.controller.ts` |
| Escucha de `scoring.token.scored` | `infrastructure/event-bus/token-scored.handler.ts:18` |
| Publicación de `filters.token.approved`/`filters.token.rejected` | `application/handlers/apply-filters.use-case.ts:156` |

**Fuera del scope:**

- Calcular el score (`scoring`).
- Detección real de honeypot (v1 es heurístico `score<10 && riskWeight>=80`).
- Publicación (`publishing`).

## 3. Límites transaccionales

- **Agregado raíz:** `FilterDecision` (`domain/entities/filter-decision.entity.ts:37`). Id compuesto `${chain}:${addressLowercased}` — idempotente.
- **Atomicidad local:** `save` + `publishAll` tras `commit()`. Mismo caveat (sin outbox).
- **Eventos:** emite `filters.token.approved` (`token-filtered.event.ts:23`) si `verdict=APPROVED`, o `filters.token.rejected` (`token-rejected.event.ts:28`) si `REJECTED`.
- **Concurrencia:** `Map` keyed por id compuesto, sin race conditions en el repo in-memory.

## 4. Lenguaje ubicuo

| Término | Definición | Referencia |
|---|---|---|
| `FilterVerdict` | VO `'APPROVED' \| 'REJECTED' \| 'PENDING'` | `domain/value-objects/filter-verdict.vo.ts:15` |
| `FilterReason` | VO `{ code, message }` con códigos estables | `domain/value-objects/filter-reason.vo.ts:24` |
| `FilterDecision` | Agregado chain+address+verdict+reasons+score+classification | `domain/entities/filter-decision.entity.ts:37` |
| `BlacklistPort` | Puerto outbound: isBlacklisted(chain, address) | `domain/ports/blacklist.port.ts:10` |
| `FilterConfig` | Umbrales configurables | `application/handlers/apply-filters.use-case.ts:13-19` |
| `DEFAULT_FILTER_CONFIG` | Defaults: `minScore=50`, `maxRiskWeight=100`, `minCompleteness=0.3`, `blockedClassifications=['SCAM','UNKNOWN']`, `enableBlacklist=true` | `application/handlers/apply-filters.use-case.ts:21-27` |
| `PUBLISHABLE_CHAINS` | `['ethereum', 'solana']` — otras chains no se publican en v1 | `application/handlers/apply-filters.use-case.ts:65-68` |
| `FilterReasonCode` | `'SCORE_TOO_LOW' \| 'CLASSIFICATION_BLOCKED' \| 'BLACKLISTED' \| 'HONEYPOT_SUSPECTED' \| 'RISK_WEIGHT_EXCEEDED' \| 'INSUFFICIENT_DATA' \| 'CHAIN_UNSUPPORTED'` | `domain/value-objects/filter-reason.vo.ts:3-10` |

## 5. API (HTTP — inbound)

Base path: `/ca/filters` (`api/http/filters.controller.ts:12`).

| Método | Ruta | Handler | Caso de uso |
|---|---|---|---|
| `POST` | `/ca/filters/apply` | `FiltersController.run` (`:20`) | `ApplyFiltersUseCase.execute` (`:70`) |
| `GET` | `/ca/filters/decisions/approved?limit=N` | `FiltersController.approved` (`:37`) | `ListFilterDecisionsUseCase.execute('approved', limit)` (`:25`) |
| `GET` | `/ca/filters/decisions/rejected?limit=N` | `FiltersController.rejected` (`:44`) | `ListFilterDecisionsUseCase.execute('rejected', limit)` |
| `GET` | `/ca/filters/decisions/recent?limit=N` | `FiltersController.recent` (`:51`) | `ListFilterDecisionsUseCase.execute('recent', limit)` |
| `GET` | `/ca/filters/decisions/:chain/:address` | `FiltersController.get` (`:58`) | `GetFilterDecisionUseCase.execute` (`:15`) |

`limit` defaults: `approved/rejected` = 20, `recent` = 10.

`POST /apply` valida con `class-validator` (`api/input/apply-filters.input.ts:40-71`): `chain`, `address`, `score` (0-100), `classification`, `riskWeight`, `snapshotCompleteness` (0-1); `config` opcional con `minScore`/`maxRiskWeight`/`minCompleteness`/`blockedClassifications[]`/`enableBlacklist`.

## 6. Objetos y modelado del dominio

### 6.1 Agregado `FilterDecision`

Archivo: `domain/entities/filter-decision.entity.ts:37`.

```
FilterDecision {
  readonly id: string;                  // `${chain}:${addressLowercased}`
  chain: ChainId;
  address: string;
  verdict: FilterVerdict;              // APPROVED si 0 reasons, REJECTED si ≥1
  score: number;
  classification: string;
  reasons: ReadonlyArray<FilterReason>;
  decidedAt: Date;
}
```

- `static create(input)` (`:45-63`) — valida `address` no vacío; verdict derivado de `reasons.length === 0`; id `${chain}:${addressLowercased()}`.
- `isApproved` (`:86-88`) — `verdict.isApproved()`.
- `emit()` (`:90-116`) — emite `TokenFilteredEvent` si approved o `TokenRejectedEvent` si rejected.
- `mutate(_event)` (`:118-120`) — no-op.

### 6.2 Value Objects

- `FilterVerdict` (`domain/value-objects/filter-verdict.vo.ts:15`)
  - Singletons `APPROVED`/`REJECTED`/`PENDING` (`:16-18`).
  - `fromString(raw)` (`:30-36`) — lanza `Error` plain (no `DomainError`) si inválido.
  - `isApproved()` (`:42-44`).
- `FilterReason` (`domain/value-objects/filter-reason.vo.ts:24`)
  - `create({ code, message })` (`:39-50`) — valida `code` ∈ set y `message.trim()` no vacío. Lanza `Error` plain (no `DomainError`).

### 6.3 Eventos

- `TokenFilteredEvent` (`domain/events/token-filtered.event.ts:7`) — `eventName = 'filters.token.approved'` (`:23`).
- `TokenRejectedEvent` (`domain/events/token-rejected.event.ts:7`) — `eventName = 'filters.token.rejected'` (`:28`); payload incluye `reasons[]`.

### 6.4 Puertos de dominio

- `BlacklistPort` (`domain/ports/blacklist.port.ts:10`) — `isBlacklisted(chain, address): Promise<{ blacklisted, reason }>`.

## 7. Puertos de aplicación

| Puerto | Archivo | Métodos |
|---|---|---|
| `FilterDecisionRepository` | `application/ports/filter-decision.repository.ts:4` | `save`, `findByChainAndAddress`, `findRecent`, `findApproved`, `findRejected` |
| `FiltersEventPublisher` | `application/ports/filters-event.publisher.ts:3` | `publish`, `publishAll` |

Mappers:

- `FilterDecisionMapper.toView` (`application/mappers/filter-decision.mapper.ts:14-26`) — convierte a view con `reasons[]` aplanados y `decidedAt.toISOString()`.

## 8. Infraestructura

### 8.1 Gates (en orden fail-fast)

Archivo: `application/handlers/apply-filters.use-case.ts:70-143`.

| # | Gate | Código | Condición |
|---|---|---|---|
| 1 | Score mínimo | `SCORE_TOO_LOW` | `score < minScore` (default 50) |
| 2 | Classification bloqueada | `CLASSIFICATION_BLOCKED` | `classification ∈ blockedClassifications` (default `['SCAM','UNKNOWN']`) |
| 3 | Blacklist | `BLACKLISTED` | `BlacklistPort.isBlacklisted().blacklisted === true` (si `enableBlacklist`) |
| 4 | Honeypot sospecha | `HONEYPOT_SUSPECTED` | `score < 10 && riskWeight >= 80` (heurística barata; real honeypot BC es future) |
| 5 | Risk weight excedido | `RISK_WEIGHT_EXCEEDED` | `riskWeight > maxRiskWeight` (default 100) |
| 6 | Datos insuficientes | `INSUFFICIENT_DATA` | `completeness < minCompleteness` (default 0.3) |
| 7 | Chain no soportada | `CHAIN_UNSUPPORTED` | `chain ∉ PUBLISHABLE_CHAINS` (`['ethereum','solana']`) |

> **Coincidencia de nombre:** el código `INSUFFICIENT_DATA` tiene typo (`INSUFFICIENT` sin segunda 'F' — debería ser `INSUFFICIENT_DATA` → debería ser `INSUFFICIENT_DATA`). Documentar para corregir antes de cualquier release público (es breaking change en consumers del evento).

### 8.2 `InMemoryBlacklistAdapter`

Archivo: `infrastructure/adapters/in-memory-blacklist.adapter.ts:11`.

- Hardcoded `HARDCODED` array (`:15-25`) con un ejemplo (`So11111...` Wrapped SOL con comentario "not actually blacklisted (example)" — es placeholder).
- `isBlacklisted(chain, address)` (`:38-46`) — lookup en `Map<key, reason>` con clave `${chain}:${address.toLowerCase()}`.
- v2 documentado: integrar GoPlus, Chainabuse.

### 8.3 `InMemoryFilterDecisionRepository`

Archivo: `infrastructure/repositories/in-memory-filter-decision.repository.ts:7`.

- `Map<string, FilterDecision>` con `MAX_ENTRIES = 500` (`:8`).
- `findApproved`/`findRejected` (`:40-58`) — filtra por `isApproved` y ordena por `decidedAt` desc.

### 8.4 `InProcessFiltersEventPublisher`

Archivo: `infrastructure/messaging/in-process-filters-event.publisher.ts:7`. Wrapper sobre `EventEmitter2`.

### 8.5 `TokenScoredHandler`

Archivo: `infrastructure/event-bus/token-scored.handler.ts:18`.

- `@OnEvent('scoring.token.scored', { async: true })` (`:23`).
- `riskWeight = 0` y `snapshotCompleteness = 1` (`:31-32`) — defaults porque el evento de scoring no carga esos campos. Para no romper event-driven path con el gate `INSUFFICIENT_DATA`.
- Try/catch que traga errores (`:35-40`).

## 9. Casos de uso

| Use case | Archivo | Comportamiento |
|---|---|---|
| `ApplyFiltersUseCase.execute` | `application/handlers/apply-filters.use-case.ts:70` | Construye `chain`; aplica gates en orden; si 0 reasons → APPROVED, si ≥1 → REJECTED; `save` → `decision.emit()` → `publishAll`. |
| `GetFilterDecisionUseCase.execute` | `application/handlers/get-filter-decision.use-case.ts:15` | `findByChainAndAddress`; lanza `DomainError(NOT_FOUND)` si null. |
| `ListFilterDecisionsUseCase.execute` | `application/handlers/list-filter-decisions.use-case.ts:15` | Valida `limit` (1..500); dispatch por `kind` (`approved`/`rejected`/`recent`); map. |

## 10. Flujo (happy path)

```
scoring.token.scored
        |
        v
TokenScoredHandler (event-bus)
        |  [riskWeight=0, completeness=1 defaults]
        v
ApplyFiltersUseCase.execute
        |
        +--> 7 gates en orden (fail-fast)
        |       si alguno falla: push FilterReason, sigue evaluando (acumula)
        |
        +--> FilterDecision.create(...)
        |       verdict = APPROVED si reasons.length === 0
        |                 REJECTED si ≥1
        |
        +--> FilterDecisionRepository.save
        |
        +--> decision.emit()
        |       APPROVED → TokenFilteredEvent   → 'filters.token.approved'
        |       REJECTED → TokenRejectedEvent    → 'filters.token.rejected'
        |
        +--> FiltersEventPublisher.publishAll
        |
        v
filters.token.approved  -->  Publishing BC
filters.token.rejected   -->  ops/dashboards
```

## 11. Wiring (NestJS DI)

Archivo: `filters.module.ts:23-40`.

| Token | Implementación |
|---|---|
| `BlacklistPort` | `InMemoryBlacklistAdapter` (`:30`) |
| `FilterDecisionRepository` | `InMemoryFilterDecisionRepository` (`:33`) |
| `FiltersEventPublisher` | `InProcessFiltersEventPublisher` (`:37`) |
| `ApplyFiltersUseCase` | self-provide (`:25`) |
| `GetFilterDecisionUseCase` | self-provide (`:26`) |
| `ListFilterDecisionsUseCase` | self-provide (`:27`) |
| `TokenScoredHandler` | self-provide (`:28`) |
| `FiltersController` | controller (`:24`) |

**Exports** (`:40`): `FilterDecisionRepository`, `FiltersEventPublisher`.

## 12. Errores de dominio

| `ErrorCode` | Dónde se lanza | Referencia |
|---|---|---|
| `VALIDATION` | `FilterDecision.create` — `address` vacío | `domain/entities/filter-decision.entity.ts:46-48` |
| `UNSUPPORTED_CHAIN` | `ChainId.fromString` (en `ApplyFiltersUseCase.execute`/`GetFilterDecisionUseCase.execute`) | `domain/value-objects/chain-id.vo.ts:51-57` (via dependency) |
| `NOT_FOUND` | `GetFilterDecisionUseCase.execute` | `application/handlers/get-filter-decision.use-case.ts:23-29` |
| `VALIDATION` | `ListFilterDecisionsUseCase.execute` — `limit` fuera de [1, 500] | `application/handlers/list-filter-decisions.use-case.ts:19-23` |

> **No-`DomainError`s:**
> - `FilterVerdict.fromString` lanza `Error` plain (`filter-verdict.vo.ts:33`).
> - `FilterReason.create` lanza `Error` plain (`filter-reason.vo.ts:44, 47`).
> - Conviene migrar para consistencia con el resto del BC.

## 13. Pruebas

Existentes (todas pasan con Jest):

- `application/handlers/apply-filters.use-case.spec.ts` — orquestación con fake `BlacklistPort`; cubre cada uno de los 7 gates (SCORE_TOO_LOW, CLASSIFICATION_BLOCKED, BLACKLISTED, HONEYPOT_SUSPECTED, RISK_WEIGHT_EXCEEDED, INSUFFICIENT_DATA, CHAIN_UNSUPPORTED); verifica que APPROVED se publica como `filters.token.approved` y REJECTED como `filters.token.rejected`.

**Gaps conocidos:**

- No hay spec de `FilterVerdict`/`FilterReason` validation.
- No hay spec de `InMemoryBlacklistAdapter`.
- No hay spec de `InMemoryFilterDecisionRepository`.
- No hay spec de `GetFilterDecisionUseCase`, `ListFilterDecisionsUseCase`.
- No hay spec de `TokenScoredHandler`.

## 14. Extensiones sugeridas

1. **Corregir typo** `INSUFFICIENT_DATA` → `INSUFFICIENT_DATA` (cambio breaking; documentar bien).
2. **Honeypot detection real** — sustituir la heurística `score<10 && riskWeight>=80` por una llamada a un `HoneypotDetectionPort` (GoPlus/Honeypot.is).
3. **Blacklist externa** — implementar `GoPlusBlacklistAdapter` y `ChainabuseBlacklistAdapter`. Multi-binding con `BLACKLIST_PORTS` Symbol análogo a `CHAIN_PROBERS`/`PROVIDERS`.
4. **Config dinámica** — hoy `DEFAULT_FILTER_CONFIG` es constante. Mover a `ConfigService` con env vars (`FILTERS_MIN_SCORE`, etc.) para tunear sin recompilar.
5. **Soporte para más chains** — ampliar `PUBLISHABLE_CHAINS` cuando chain-detection/enrichment empiecen a resolver `bsc`/`base`/`arbitrum`/`polygon`.
6. **Verdict `PENDING`** — hoy está definido pero no se usa. Diseñado para "honeypot simulation async" (un BC futuro corre simulación y emite evento que resuelve el verdict).
7. **Outbox pattern** — atomicidad save+publish.
8. **Persistencia real** — TypeORM/Prisma con índice `(chain, address)`.

## 15. Mapa rápido de archivos

```
src/ca/filters/
├── api/
│   ├── http/filters.controller.ts
│   └── input/apply-filters.input.ts
├── application/
│   ├── handlers/
│   │   ├── apply-filters.use-case.ts
│   │   ├── apply-filters.use-case.spec.ts
│   │   ├── get-filter-decision.use-case.ts
│   │   └── list-filter-decisions.use-case.ts
│   ├── mappers/filter-decision.mapper.ts
│   └── ports/
│       ├── filter-decision.repository.ts
│       └── filters-event.publisher.ts
├── domain/
│   ├── entities/filter-decision.entity.ts
│   ├── events/
│   │   ├── token-filtered.event.ts
│   │   └── token-rejected.event.ts
│   ├── ports/blacklist.port.ts
│   └── value-objects/
│       ├── filter-reason.vo.ts
│       └── filter-verdict.vo.ts
├── infrastructure/
│   ├── adapters/in-memory-blacklist.adapter.ts
│   ├── event-bus/
│   │   ├── token-scored.handler.ts
│   │   └── token-scored.handler.spec.ts
│   ├── messaging/in-process-filters-event.publisher.ts
│   └── repositories/in-memory-filter-decision.repository.ts
├── filters.module.ts
└── README.md
```
