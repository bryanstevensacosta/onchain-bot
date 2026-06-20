# Parsing — Bounded Context

> Convierte el texto crudo de un mensaje y los candidatos extraídos en un `TokenCall` estructurado (contrato primario, ticker, nombre, métricas USD, chart, confidence).

Forma parte de `src/discovery/` y se monta vía `ParsingModule` (`parsing.module.ts:22`).

---

## 1. Propósito

Este BC estructura la información de un alpha-call a partir de dos entradas: (1) los candidatos crudos producidos por `extraction` (CAs, tickers, URLs) y (2) el texto del mensaje. Produce un agregado `TokenCall` con un contrato primario seleccionado, métricas numéricas opcionales y un score de confianza heurístico.

Tres preguntas clave que el BC resuelve:

1. ¿Cuál es el contrato primario del call cuando hay varias CAs?
2. ¿Qué métricas (MC, LP, FDV, holders) están explícitamente en el mensaje y a qué valor USD?
3. ¿Qué tan confiable es el call según completitud de campos?

## 2. Responsabilidades del BC

| Responsabilidad | Dónde vive |
|---|---|
| Patrón regex de ticker explícito (`$XYZ`) y etiquetado (`Ticker: …`) | `infrastructure/adapters/heuristic-parser.adapter.ts:33-35` |
| Patrón regex de nombre etiquetado (`Name:`, `Token Name:`) | `infrastructure/adapters/heuristic-parser.adapter.ts:37-38` |
| Patrón regex de métricas (MC/LP/FDV/Holders) | `infrastructure/adapters/heuristic-parser.adapter.ts:40-47` |
| Parseo de shorthand USD (`180K`, `1.2M`, `2.5B`) | `domain/value-objects/usd.vo.ts:39-56` |
| Selección del contrato primario | `domain/value-objects/parsed-contract.vo.ts:20-30` |
| Ensamblado del agregado `TokenCall` + cálculo de confidence | `domain/entities/token-call.entity.ts:40-87, 145-161` |
| Orquestación HTTP (admin) | `application/handlers/parse-from-candidates.use-case.ts:27` |
| Escucha de eventos upstream | `infrastructure/event-bus/candidates-extracted.handler.ts:18` |
| Publicación de `parsing.call.parsed` | `application/handlers/parse-from-candidates.use-case.ts:54` |

**Fuera del scope:**

- Resolver si el contrato está en EVM/Solana o en qué chain específica vive (`chain-detection`).
- Validar que el ticker realmente corresponde al contrato (`normalization`).
- Calcular métricas reales on-chain (MC, holders) — esto es solo parsing del texto (`enrichment`).
- Scoring o filtrado (`scoring`, `filters`).
- Decidir si el call es accionable (`trading`).

## 3. Límites transaccionales

- **Agregado raíz:** `TokenCall` (`domain/entities/token-call.entity.ts:32`). Id compuesto `${channelId}:${messageId}`.
- **Atomicidad local:** `save` + `publishAll` tras `commit()`. Mismo caveat que `extraction` — sin outbox.
- **Eventos:** emite `parsing.call.parsed` (`domain/events/call-parsed.event.ts:40`).
- **Concurrencia:** `Map` keyed por id compuesto, sin race conditions.
- **Sin event sourcing:** `mutate(_event)` vacío (`:140-142`). El agregado es puro data.

## 4. Lenguaje ubicuo

| Término | Definición | Referencia |
|---|---|---|
| `TokenCall` | Agregado que representa un alpha-call estructurado | `domain/entities/token-call.entity.ts:32` |
| `ParsedContract` | VO con la CA primaria (`addresses[0]`) | `domain/value-objects/parsed-contract.vo.ts:15` |
| `TokenMetrics` | VO con MC, LP, FDV, holders (todos `number \| null`) | `domain/value-objects/token-metrics.vo.ts:16` |
| `Usd` | VO con `amount: number`, soporta shorthand K/M/B | `domain/value-objects/usd.vo.ts:15` |
| `ParserPort` | Puerto outbound para parsear texto → campos estructurados | `domain/ports/parser.port.ts:21` |
| `ParsingEventPublisher` | Puerto outbound para emitir eventos | `application/ports/parsing-event.publisher.ts:6` |
| `TokenCallRepository` | Puerto outbound de persistencia | `application/ports/token-call.repository.ts:6` |
| `CallParsedEvent` | Evento de dominio emitido tras un parse exitoso | `domain/events/call-parsed.event.ts:8` |
| `confidence` | Heurística 0..1 basada en completitud de campos | `domain/entities/token-call.entity.ts:145-161` |

## 5. API (HTTP — inbound)

Base path: `/ca/parsing` (`api/http/parsing.controller.ts:14`).

| Método | Ruta | Handler | Caso de uso |
|---|---|---|---|
| `POST` | `/ca/parsing/parse` | `ParsingController.run` (`:22`) | `ParseFromCandidatesUseCase.execute` (`:34`) |
| `GET` | `/ca/parsing/calls/recent?limit=N` | `ParsingController.recent` (`:38`) | `GetRecentCallsUseCase.execute` (`:13`) |
| `GET` | `/ca/parsing/calls/:channelId/:messageId` | `ParsingController.get` (`:44`) | `GetTokenCallUseCase.execute` (`:13`) |

`limit` por defecto `10`, máximo `500` (`application/handlers/get-recent-calls.use-case.ts:14`).

`POST /parse` valida con `class-validator` (`api/input/parse.input.ts:21`): `channelId`, `messageId` int positivo, `occurredAt` Date, `text`, `contractAddresses: ContractAddressInput[]`. El controller reconstruye `ContractAddress` VOs desde el input (`:24-28`).

## 6. Objetos y modelado del dominio

### 6.1 Agregado `TokenCall`

Archivo: `domain/entities/token-call.entity.ts:32`.

```
TokenCall {
  readonly id: string;                 // `${channelId}:${messageId}`
  channelId: string;
  messageId: number;
  occurredAt: Date;
  rawText: string;
  contract: ParsedContract;            // CA primaria
  ticker: string | null;
  name: string | null;
  metrics: TokenMetrics;
  chart: string | null;
  confidence: number;                  // 0..1
}
```

- `static create(input)` (`:40-87`) — valida `channelId` no vacío, `messageId` int ≥ 0, **rechaza si `contractAddresses.length === 0`** con `NO_CONTRACT_ADDRESS`. Construye `ParsedContract` con la primera CA y calcula `confidence` con `computeConfidence`.
- `computeConfidence` (`:145-161`) — suma:
  - CA única: `+0.4`; múltiples: `+0.2`.
  - `ticker` presente: `+0.15`.
  - `metrics.completeness * 0.35` (0 a 0.35).
  - `name` presente: `+0.1`.
  - Cap a `1.0`, redondeo a 2 decimales.
- `emitCallParsed()` (`:120-138`) — aplica `CallParsedEvent` con campos aplanados (incluye `metrics.{marketCapUsd, liquidityUsd, fdvUsd, holders}`).
- `mutate(_event)` (`:140-142`) — no-op.

### 6.2 Value Objects

- `ParsedContract` (`domain/value-objects/parsed-contract.vo.ts:15`)
  - `fromAddresses(addresses)` (`:20-30`) — toma `addresses[0]`. Lanza `NO_CONTRACT_ADDRESS` si el array está vacío.
- `TokenMetrics` (`domain/value-objects/token-metrics.vo.ts:16`)
  - `empty()` (`:21-28`) — todos los campos `null`.
  - `create(props)` (`:30-32`) — factory directo.
  - `completeness` (`:47-56`) — getter que cuenta campos no-null sobre el total (4). Rango [0, 1].
- `Usd` (`domain/value-objects/usd.vo.ts:15`)
  - `fromNumber(raw)` (`:20-29`) — exige `Number.isFinite && raw >= 0`.
  - `fromShorthand(raw)` (`:39-56`) — strip `[$,\s]`, regex `^([\d.]+)([KkMmBb])?$`, multiplicadores `K=1e3`, `M=1e6`, `B=1e9`. Devuelve `null` si no match (NO lanza).

### 6.3 Eventos

- `CallParsedEvent` (`domain/events/call-parsed.event.ts:8`)
  - `eventName = 'parsing.call.parsed'` (`:40`).
  - `aggregateId = ${channelId}:${messageId}` (`:40`).
  - Payload aplanado (`:9-23`): `contractAddress`, `contractChainHint`, `ticker`, `name`, `marketCapUsd`, `liquidityUsd`, `fdvUsd`, `holders`, `chart`, `confidence`.
  - `toPayload()` (`:44-49`) — `occurredAt` a ISO string; resto shallow-spread.

### 6.4 Puertos de dominio

- `ParserPort` (`domain/ports/parser.port.ts:21`) — `parse(input): Promise<ParsedCallFields>`. NO decide CA primaria; eso es responsabilidad del agregado.

## 7. Puertos de aplicación

| Puerto | Archivo | Métodos |
|---|---|---|
| `ParsingEventPublisher` | `application/ports/parsing-event.publisher.ts:6` | `publish(event)`, `publishAll(events)` (secuencial) |
| `TokenCallRepository` | `application/ports/token-call.repository.ts:6` | `save`, `findByChannelAndMessage`, `findRecent` |

Mappers:

- `TokenCallMapper.toView` (`application/mappers/token-call.mapper.ts:27-47`) — convierte `TokenCall` → `TokenCallView` con `occurredAt.toISOString()` y `metrics` aplanado.

## 8. Infraestructura

### 8.1 `HeuristicParserAdapter`

Archivo: `infrastructure/adapters/heuristic-parser.adapter.ts:30`. Implementación v1.

- Patrones regex hardcodeados (no config):
  - `TICKER_EXPLICIT` (`:33`) — `\$([A-Z]{2,10})\b`.
  - `TICKER_LABELED` (`:34-35`) — `ticker|symbol|coin` seguido de `[:=]` y ticker.
  - `NAME_LABELED` (`:37-38`) — `name|token name` seguido de `[:=]` y valor que termina en delimitadores (`|`, `\n`, `;`, `ca`, `mc`, etc.).
  - `MC_PATTERN` (`:40-41`), `LP_PATTERN` (`:42-43`), `FDV_PATTERN` (`:44-45`), `HOLDERS_PATTERN` (`:46-47`) — cada uno captura `([\d.,]+)\s*([KkMmBb])?`.
  - `CHART_HOSTS` (`:49-50`) — `dexscreener|geckoterminal|dextools|birdeye|poocoin|honeypot\.is`.
  - `URL_PATTERN` (`:51`) — `https?://[^\s<>")']+`.
- `parse` (`:53-61`) — síncrono (envuelto en `Promise.resolve`).
- `extractTicker` (`:63-69`) — explícito gana sobre etiquetado.
- `extractMetrics` (`:78-94`) — log `debug` si todas las métricas son null.
- `extractChart` (`:112-119`) — itera URLs y devuelve la primera que matchee `CHART_HOSTS`.

### 8.2 `InProcessParsingEventPublisher`

Archivo: `infrastructure/messaging/in-process-parsing-event.publisher.ts:12`. Equivalente al de `extraction`: usa `EventEmitter2`, log `debug`.

### 8.3 `InMemoryTokenCallRepository`

Archivo: `infrastructure/repositories/in-memory-token-call.repository.ts:10`. Mismo patrón FIFO con `MAX_ENTRIES = 1000` (`:11`).

### 8.4 `CandidatesExtractedHandler`

Archivo: `infrastructure/event-bus/candidates-extracted.handler.ts:18`.

- `@OnEvent('extraction.candidates.extracted', { async: true })` (`:23`).
- Reconstruye `ContractAddress` VOs desde el payload aplanado (`:25-29`).
- Skip silencioso si `addresses.length === 0` — son mensajes sin CA (chat, no alpha calls) (`:31-36`).
- Try/catch que **absorbe `NO_CONTRACT_ADDRESS` explícitamente** (`:47-52`) y loggea otros errores sin propagar (`:53-56`).

## 9. Casos de uso

| Use case | Archivo | Comportamiento |
|---|---|---|
| `ParseFromCandidatesUseCase.execute` | `application/handlers/parse-from-candidates.use-case.ts:34` | Llama parser, construye `TokenCall` (puede lanzar `NO_CONTRACT_ADDRESS`), `save` → `emitCallParsed` → `publishAll` → devuelve `TokenCallView`. |
| `GetTokenCallUseCase.execute` | `application/handlers/get-token-call.use-case.ts:13` | Busca por id compuesto; lanza `DomainError(NO_PARSED_CALL)` si no existe. |
| `GetRecentCallsUseCase.execute` | `application/handlers/get-recent-calls.use-case.ts:13` | Valida `limit` (1..500); `findRecent` → mapea a view. |

## 10. Flujo (happy path)

```
extraction.candidates.extracted
        |
        v
CandidatesExtractedHandler (event-bus)
        |  [skip si addresses.length === 0]
        v
ParseFromCandidatesUseCase.execute
        |
        +--> ParserPort.parse (heuristic adapter)
        |
        +--> TokenCall.create
        |       [NO_CONTRACT_ADDRESS si vacío]
        |
        +--> TokenCallRepository.save
        |
        +--> TokenCall.emitCallParsed
        |
        +--> ParsingEventPublisher.publishAll  (EventEmitter2)
        |
        v
parsing.call.parsed  -->  Normalization / ChainDetection / Enrichment
```

## 11. Wiring (NestJS DI)

Archivo: `parsing.module.ts:22-37`.

| Token | Implementación |
|---|---|
| `ParserPort` | `HeuristicParserAdapter` (`:29`) |
| `ParsingEventPublisher` | `InProcessParsingEventPublisher` (`:32`) |
| `TokenCallRepository` | `InMemoryTokenCallRepository` (`:34`) |
| `ParseFromCandidatesUseCase` | self-provide (`:25`) |
| `GetTokenCallUseCase` | self-provide (`:26`) |
| `GetRecentCallsUseCase` | self-provide (`:27`) |
| `CandidatesExtractedHandler` | self-provide (`:28`) |
| `ParsingController` | controller (`:23`) |

**Exports** (`:36`): `ParserPort`, `ParsingEventPublisher`, `TokenCallRepository`.

## 12. Errores de dominio

| `ErrorCode` | Dónde se lanza | Referencia |
|---|---|---|
| `VALIDATION` | `TokenCall.create` — `channelId` vacío o `messageId` inválido | `domain/entities/token-call.entity.ts:51-58` |
| `NO_CONTRACT_ADDRESS` | `TokenCall.create` — `contractAddresses` vacío | `domain/entities/token-call.entity.ts:60-66` |
| `NO_CONTRACT_ADDRESS` | `ParsedContract.fromAddresses` — array vacío | `domain/value-objects/parsed-contract.vo.ts:23-28` |
| `VALIDATION` | `Usd.fromNumber` — no finito o negativo | `domain/value-objects/usd.vo.ts:21-27` |
| `NO_PARSED_CALL` | `GetTokenCallUseCase.execute` | `application/handlers/get-token-call.use-case.ts:22-27` |
| `VALIDATION` | `GetRecentCallsUseCase.execute` — `limit` fuera de [1, 500] | `application/handlers/get-recent-calls.use-case.ts:14-18` |

> Nota: `Usd.fromShorthand` NO lanza — devuelve `null` cuando el formato no matchea (`:39-44`). El adapter traduce `null` a `null` en `TokenMetrics`.

## 13. Pruebas

Existentes (todas pasan con Jest):

- `infrastructure/adapters/heuristic-parser.adapter.spec.ts` — 16+ specs cubriendo ticker/nombre/MC/LP/FDV/holders/chart + alpha call realista end-to-end.
- `application/handlers/parse-from-candidates.use-case.spec.ts` — orquesta parser → save → publish; verifica `NO_CONTRACT_ADDRESS`, confidence, selección de CA primaria.
- `infrastructure/event-bus/candidates-extracted.handler.spec.ts` — reconstrucción de VOs, skip sin CAs, absorción de `NO_CONTRACT_ADDRESS`, error swallowing.

**Gaps conocidos:**

- No hay spec de `GetTokenCallUseCase` ni `GetRecentCallsUseCase` (cubierto por analogía con `GetExtractionResultUseCase` specs).
- No hay spec de `InMemoryTokenCallRepository`.
- No hay spec de `InProcessParsingEventPublisher`.

## 14. Extensiones sugeridas

1. **LLM fallback adapter** — implementar `LlmParserAdapter` y una estrategia híbrida (`HybridParserAdapter`) que use heurística primero y llame al LLM cuando `confidence < 0.5`. Documentado como v2 en `parsing.module.ts:21`.
2. **Persistencia real** — sustituir `InMemoryTokenCallRepository` por TypeORM/Prisma con índice `(channelId, messageId)`.
3. **Confidence auto-tuning** — correlacionar `confidence` con outcomes reales de `trading` para recalibrar pesos en `computeConfidence`.
4. **Soporte multi-call por mensaje** — actualmente múltiples CAs colapsan a un solo `TokenCall` con la primera como primaria. Considerar emitir un `TokenCall` por CA o agregar `secondaryContracts` al VO.
5. **Outbox pattern** — para atomicidad save+publish, igual que en `extraction`.

## 15. Mapa rápido de archivos

```
src/discovery/parsing/
├── api/
│   ├── http/parsing.controller.ts
│   └── input/parse.input.ts
├── application/
│   ├── handlers/
│   │   ├── parse-from-candidates.use-case.ts
│   │   └── parse-from-candidates.use-case.spec.ts
│   ├── mappers/token-call.mapper.ts
│   └── ports/
│       ├── parsing-event.publisher.ts
│       └── token-call.repository.ts
├── domain/
│   ├── entities/token-call.entity.ts
│   ├── events/call-parsed.event.ts
│   ├── ports/parser.port.ts
│   └── value-objects/
│       ├── parsed-contract.vo.ts
│       ├── token-metrics.vo.ts
│       └── usd.vo.ts
├── infrastructure/
│   ├── adapters/
│   │   ├── heuristic-parser.adapter.ts
│   │   └── heuristic-parser.adapter.spec.ts
│   ├── event-bus/
│   │   ├── candidates-extracted.handler.ts
│   │   └── candidates-extracted.handler.spec.ts
│   ├── messaging/in-process-parsing-event.publisher.ts
│   └── repositories/in-memory-token-call.repository.ts
├── parsing.module.ts
└── README.md
```
