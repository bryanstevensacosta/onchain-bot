# Bounded Contexts

A **Bounded Context** (BC) is an explicit boundary where:
- A domain model is valid
- The language is consistent (Ubiquitous Language)
- No mixing with other system models

## BCs del core de SpyDefi

El motor de discovery está compuesto por **14 Bounded Contexts** encadenados por eventos in-process, más `shared` como núcleo transversal (no es un BC).

| # | BC | Responsabilidad |
|---|---|---|
| 1 | `telegram/ingestion` | Suscribe y consume en tiempo real los mensajes de canales de Telegram que el sistema monitoriza. |
| 2 | `token/intake/extraction` | Extrae candidatos crudos (CAs EVM/Solana, tickers, URLs) del texto plano de un mensaje, sin reglas de negocio semánticas. |
| 3 | `token/intake/parsing` | Convierte texto crudo + candidatos extraídos en un `TokenCall` estructurado. |
| 4 | `token/normalization` | Dedup menciones del mismo `(chain, address)` y produce una entrada canónica agregada. |
| 5 | `chain/detection` | Determina en qué chain vive un contrato sondeando varios chain probers en paralelo. |
| 6 | `chain/registry` | Mantiene el catálogo de chains conocidas (chainId, nativeCurrency, explorerUrl, probers, parsers de CA). |
| 7 | `token/market-data/enrichment` | Agrega datos de mercado en tiempo real (precio, liquidez, FDV, MC, holders, pares) desde múltiples proveedores. |
| 8 | `token/classification` | Clasifica el token (`TOKEN`/`POOL`/`ROUTER`/`NFT`/`SCAM`/`UNKNOWN`) y emite señales de riesgo. |
| 9 | `token/scoring` | Combina classification + métricas + buzz + reputación de canal en un score 0..100. |
| 10 | `token/honeypot` | Detecta si un token es un honeypot (v1 heurístico, v2 GoPlus/Alchemy/Tenderly). |
| 11 | `token/token-gating/filters` | Compuerta final antes de publicar: gates configurables que deciden `APPROVED`/`REJECTED`. |
| 12 | `telegram/publishing` | Formatea calls `APPROVED` y los envía a canales de output de Telegram. |
| 13 | `token/call-tracking` | Persiste cada call emitido con su outcome eventual (ATH, drawdown, retrace) para analytics. |
| 14 | `token/channel-reputation` | Calcula y mantiene la reputación agregada por canal de Telegram (consistency, avg X, alpha caller). |

`shared` (no es BC) provee primitivas DDD (`AggregateRoot`, `Entity`, `ValueObject`, `DomainEvent`), `ErrorCode` enum + `DomainError`, `AppConfig` desde env vars, y helpers `Uuid`/`DateTime`.

> El mapa detallado (eventos publicados/consumidos, agregados, VOs, puertos) está en [`12-spydefi-core-overview.md`](12-spydefi-core-overview.md).

## BC Rules

- Each BC has its **own model**
- Each BC has its **own database** (ideally) — en el core, cada BC tiene su propio repo in-memory aislado.
- Each BC has its **own business rules**
- BCs **never share entities** directly
- BCs **do not import** each other's internals

## Ubiquitous Language (resumen)

```
ingestion BC:     TelegramChannel, TelegramMessage, MessageIngested
extraction BC:    RawCandidate, ExtractionSource
parsing BC:       TokenCall, CallTicker, CallConfidence
normalization BC: NormalizedCall, AddressKey
chain-detection BC: ChainProbe, ChainProbeResult
enrichment BC:    TokenSnapshot, DexPair, Liquidity, HoldersDistribution
classification BC: TokenKind, RiskSignal
scoring BC:       CallScore, ScoreFactor, BuzzLevel
honeypot BC:      HoneypotReport, HoneypotFlag
filters BC:       FilterDecision, FilterRule
publishing BC:    PublishedCall, PublishTarget
call-tracking BC: TrackedCall, CallOutcome
channel-reputation BC: ChannelStats, ChannelReputation
```

El glosario completo, término a término, vive en el README de cada BC.
