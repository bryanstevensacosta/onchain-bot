# SpyDefi Core — Bounded Contexts Overview

> Este documento es el **mapa canónico** de los 14 Bounded Contexts que componen el core de SpyDefi. Es la fuente de verdad para entender qué hace cada BC, qué eventos publica/consume y cómo se conectan entre sí. El README de cada BC complementa este mapa con el detalle interno.

## Pipeline `ca` (contract analysis)

```
telegram/ingestion
        │ MessageIngested
        ▼
token/intake/extraction
        │ CandidatesExtracted
        ▼
token/intake/parsing
        │ TokenCallParsed
        ▼
token/normalization
        │ NormalizedCallExtracted
        ├─────────────────────────────┐
        ▼                             ▼
chain/detection                 token/market-data/enrichment
        │ ChainDetected                │ TokenSnapshotTaken
        └──────────────┬───────────────┘
                       ▼
              token/classification
                       │ TokenClassified
                       ▼
                  token/scoring
                       │ CallScored
                       ▼
                 token/honeypot
                       │ HoneypotChecked
                       ▼
              token/token-gating/filters
                       │ CallApproved | CallRejected
                       ▼
              telegram/publishing
                       │ CallPublished
                       ▼
              token/call-tracking ─────► token/channel-reputation
                       (background)              (background)
```

`shared` no es un BC, provee primitivas DDD, errores y config.

---

## 1. `telegram/ingestion`

| Atributo | Valor |
|---|---|
| Ruta | `src/telegram/ingestion/` |
| Responsabilidad | Suscribirse a canales de Telegram monitorizados y emitir un `MessageIngested` por cada mensaje nuevo. |
| Publica | `MessageIngested` |
| Consume | — |
| Adaptadores | `telegram-mtproto.listener` (cliente `telegram` MTProto), repos in-memory de `TelegramChannel` |
| Agregado raíz | `TelegramChannel` |
| VOs clave | `ChannelUsername`, `ChannelId`, `MessageId` |

## 2. `token/intake/extraction`

| Atributo | Valor |
|---|---|
| Ruta | `src/token/intake/extraction/` |
| Responsabilidad | Sacar candidatos crudos (CAs, tickers, URLs) del texto de un mensaje sin reglas de negocio semánticas. |
| Publica | `CandidatesExtracted` |
| Consume | `MessageIngested` |
| Adaptadores | `regex-extractor.adapter`, `InMemoryRawCandidateRepository` |
| Agregado raíz | `RawCandidateBatch` |
| VOs clave | `RawContractAddress`, `RawTicker`, `RawUrl` |

## 3. `token/intake/parsing`

| Atributo | Valor |
|---|---|
| Ruta | `src/token/intake/parsing/` |
| Responsabilidad | Combinar texto + candidatos en un `TokenCall` estructurado (contrato primario, ticker, métricas USD del texto, confidence heurístico). |
| Publica | `TokenCallParsed` |
| Consume | `CandidatesExtracted` |
| Adaptadores | `InMemoryTokenCallRepository` |
| Agregado raíz | `TokenCall` |
| VOs clave | `CallId`, `Ticker`, `CallConfidence` |

## 4. `token/normalization`

| Atributo | Valor |
|---|---|
| Ruta | `src/token/normalization/` |
| Responsabilidad | Dedup menciones del mismo `(chain, address)` a lo largo de múltiples canales/mensajes y emitir una entrada canónica. |
| Publica | `NormalizedCallExtracted` |
| Consume | `TokenCallParsed` |
| Adaptadores | `InMemoryNormalizedCallRepository` |
| Agregado raíz | `NormalizedCall` |
| VOs clave | `AddressKey` (`(chain, address)`) |

## 5. `chain/detection`

| Atributo | Valor |
|---|---|
| Ruta | `src/chain/detection/` |
| Responsabilidad | Determinar en qué chain vive una dirección, sondeando múltiples chain probers en paralelo y eligiendo el ganador por puntos. |
| Publica | `ChainDetected` |
| Consume | `NormalizedCallExtracted` |
| Adaptadores | `EvmRpcProber`, `SolanaRpcProber`, `HeliusProber`, etc.; `InMemoryChainProbeResultRepository` |
| Agregado raíz | `ChainProbeResult` |
| VOs clave | `ChainId`, `ChainProbeScore` |

## 6. `chain/registry`

| Atributo | Valor |
|---|---|
| Ruta | `src/chain/registry/` |
| Responsabilidad | Catálogo de chains conocidas (chainId, nativeCurrency, explorerUrl, probers disponibles, parsers de CA, formato de address). |
| Publica | — (es un servicio de consulta) |
| Consume | — |
| Adaptadores | `InMemoryChainRegistry` (catálogo estático configurable vía `AppConfig`) |
| Agregado raíz | `Chain` |
| VOs clave | `ChainSlug`, `ChainFamily` (`EVM` / `SOLANA` / `OTHER`) |

> `chain/detection` consulta el puerto `ChainRegistryPort` definido por `chain/registry`. En el core es in-memory; en producto puede leerse de DB.

## 7. `token/market-data/enrichment`

| Atributo | Valor |
|---|---|
| Ruta | `src/token/market-data/enrichment/` |
| Responsabilidad | Agregar datos de mercado (precio, liquidez, FDV, MC, holders, pares) consultando múltiples proveedores en paralelo y fusionando resultados. |
| Publica | `TokenSnapshotTaken` |
| Consume | `NormalizedCallExtracted` (también puede dispararse desde `ChainDetected`) |
| Adaptadores | `DexScreenerClient`, `GeckoTerminalClient`, `HeliusClient`; `InMemoryTokenSnapshotRepository` |
| Agregado raíz | `TokenSnapshot` |
| VOs clave | `Price`, `Liquidity`, `Fdv`, `MarketCap`, `HoldersCount`, `DexPair` |

## 8. `token/classification`

| Atributo | Valor |
|---|---|
| Ruta | `src/token/classification/` |
| Responsabilidad | Clasificar el token (`TOKEN` / `POOL` / `ROUTER` / `NFT` / `SCAM` / `UNKNOWN`) y emitir señales de riesgo (`LOW_LIQUIDITY`, `NO_HOLDERS`, `POSSIBLE_RUG`, etc.). |
| Publica | `TokenClassified` |
| Consume | `TokenSnapshotTaken` |
| Adaptadores | `InMemoryTokenClassificationRepository` |
| Agregado raíz | `TokenClassification` |
| VOs clave | `TokenKind` (enum), `RiskSignal` (enum), `RiskSeverity` |

## 9. `token/scoring`

| Atributo | Valor |
|---|---|
| Ruta | `src/token/scoring/` |
| Responsabilidad | Combinar classification + métricas + buzz + reputación del canal en un score 0..100 con desglose de factores. |
| Publica | `CallScored` |
| Consume | `TokenClassified` |
| Adaptadores | `InMemoryCallScoreRepository`, `InMemoryChannelReputationAdapter` (implementa el puerto `ChannelReputationPort`) |
| Agregado raíz | `CallScore` |
| VOs clave | `ScoreFactor`, `BuzzLevel`, `ScoreBreakdown` |

## 10. `token/honeypot`

| Atributo | Valor |
|---|---|
| Ruta | `src/token/honeypot/` |
| Responsabilidad | Detectar si un token es un honeypot. v1 heurístico (DexScreener + reglas); v2 GoPlus + bytecode Alchemy + simulación Tenderly. |
| Publica | `HoneypotChecked` |
| Consume | `TokenSnapshotTaken` (en paralelo a classification/scoring) |
| Adaptadores | `DexScreenerHoneypotHeuristics`, `InMemoryHoneypotReportRepository` |
| Agregado raíz | `HoneypotReport` |
| VOs clave | `HoneypotFlag` (enum: `SELL_REVERT`, `HIGH_TAX`, `LP_NOT_LOCKED`, `MINT_EXISTS`, `PROXY_CONTRACT`, etc.) |

## 11. `token/token-gating/filters`

| Atributo | Valor |
|---|---|
| Ruta | `src/token/token-gating/filters/` |
| Responsabilidad | Compuerta final antes de publicar: aplica gates configurables (score mínimo, blacklist, honeypot sospecha, risk weight, completeness, chain) y decide `APPROVED` / `REJECTED`. |
| Publica | `CallApproved` o `CallRejected` |
| Consume | `CallScored`, `HoneypotChecked` |
| Adaptadores | `InMemoryFilterDecisionRepository`, `InMemoryFilterRuleRepository` |
| Agregado raíz | `FilterDecision` |
| VOs clave | `FilterRule`, `FilterResult`, `RejectionReason` |

## 12. `telegram/publishing`

| Atributo | Valor |
|---|---|
| Ruta | `src/telegram/publishing/` |
| Responsabilidad | Cerrar el pipeline: formatear calls `APPROVED` como mensajes de Telegram y enviarlos a canales de output (mock por defecto, MTProto real opcional). |
| Publica | `CallPublished` |
| Consume | `CallApproved` |
| Adaptadores | `telegram-mtproto.publisher`, `MockTelegramPublisher`, `InMemoryPublishedCallRepository` |
| Agregado raíz | `PublishedCall` |
| VOs clave | `PublishTarget` (`ChannelUsername` de output), `FormattedMessage` |

## 13. `token/call-tracking`

| Atributo | Valor |
|---|---|
| Ruta | `src/token/call-tracking/` |
| Responsabilidad | Persistir cada call emitido y, retrospectivamente, evaluar si rindió bien (`STRONG` / `GOOD` / `NEUTRAL` / `POOR` / `FAILED`) comparando contra snapshots posteriores. |
| Publica | `CallOutcomeRecorded` |
| Consume | `CallPublished`, `TokenSnapshotTaken` (background) |
| Adaptadores | `InMemoryTrackedCallRepository`, `InMemoryCallOutcomeRepository` |
| Agregado raíz | `TrackedCall` |
| VOs clave | `CallOutcome`, `AthMultiplier`, `Drawdown`, `Retrace` |

## 14. `token/channel-reputation`

| Atributo | Valor |
|---|---|
| Ruta | `src/token/channel-reputation/` |
| Responsabilidad | Calcular y mantener la reputación agregada por canal (consistency, avg X, alpha caller count, PnL potential) usando los outcomes de `call-tracking`. |
| Publica | `ChannelReputationUpdated` |
| Consume | `CallOutcomeRecorded` |
| Adaptadores | `InMemoryChannelReputationRepository` |
| Agregado raíz | `ChannelReputation` |
| VOs clave | `ChannelStats`, `Consistency`, `AverageX`, `AlphaCallerCount`, `PnlPotential` |

> `token/scoring` consume `ChannelReputationPort` (puerto). En el core lo implementa un adapter in-memory; en el repo de producto, ese adapter se reemplaza por uno que lea de la DB de KOL stats.

---

## Matriz de comunicación entre BCs

| Publica \ Consume | extraction | parsing | norm | chain-detect | enrich | classify | score | honeypot | filters | publish | track | channel-rep |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **ingestion** | ✅ | | | | | | | | | | | |
| **extraction** | — | ✅ | | | | | | | | | | |
| **parsing** | | — | ✅ | | | | | | | | | |
| **normalization** | | | — | ✅ | ✅ | | | | | | | |
| **chain-detection** | | | | — | ✅ | | | | | | | |
| **enrichment** | | | | | — | ✅ | | ✅ | | | ✅ | |
| **classification** | | | | | | — | ✅ | | | | | |
| **scoring** | | | | | | | — | | ✅ | | | |
| **honeypot** | | | | | | | | — | ✅ | | | |
| **filters** | | | | | | | | | — | ✅ | | |
| **publishing** | | | | | | | | | | — | ✅ | |
| **call-tracking** | | | | | | | | | | | — | ✅ |
| **channel-reputation** | | | | | | | (port) | | | | | | — |

---

## Convenciones globales (recordatorio)

Las convenciones completas viven en [`08-file-structure.md`](08-file-structure.md). Resumen crítico:

- Hexagonal estricto: `domain/` no importa de `application/`, `infrastructure/`, `api/`.
- Puertos como `abstract class` (no `interface`).
- Inputs en `api/input/` con `class-validator`.
- VOs como `ValueObject<TProps>` con factory `fromX(...)` que lanza `DomainError`.
- Errores centralizados en `shared/domain/domain-error.ts`.
- Eventos extienden `DomainEvent` con `eventName` y payload inmutable (`Object.freeze`).
- Publisher siempre vía `publishAll(aggregate.commitEvents())` después de `save()`.
- Repos in-memory con FIFO eviction, swap-ready a TypeORM/Prisma.

---

## Out of scope del core (vive en repo de producto)

Estos BCs **NO** forman parte del core y se construyen en el repositorio de producto, consumiendo los eventos que el core publica:

- `telegram/user-bot` — bot conversacional (KOL stats, presets de filtros, premium).
- `telegram/kol-bot` — KOL Club + Notify + anuncios.
- `telegram/verify` — verificación bidireccional de `@user` / `@channel` + scam warning.
- `telegram/buybot` — alertas de compra on-chain + whale alerts + achievements de proyecto.
- `premium` — tiers, custom filters, preset filters.
- `achievements` — sistema de logros por KOL y por call.
- `kol-stats` — UI/API de consistency, avg X, PnL, alpha caller, etc.
- `web-dashboard` — UI web.
- `referrals` — programa de referidos.

Estos BCs se montan sobre el core vía:
1. **Suscripción a los eventos** que el core publica (mismo `@nestjs/event-emitter` o broker externo).
2. **Implementación alternativa** de los puertos `ChannelReputationPort`, `CallTrackingPort`, `TelegramChannelRepository`, etc. (sustituyendo el adapter in-memory del core por uno con DB persistente).
