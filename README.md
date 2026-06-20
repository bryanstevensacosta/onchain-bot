# onchain-bot

Pipeline NestJS para descubrir, validar y republicar alpha-calls de tokens on-chain desde canales de Telegram. Sigue arquitectura hexagonal estricta con un Bounded Context (BC) por concern, comunicación por eventos in-process (`@nestjs/event-emitter`) y repos in-memory (swap-ready a TypeORM/Prisma para producción).

> Convención: cada BC tiene su propio `README.md` con su estructura hexagonal, puertos, eventos, casos de uso y wiring. La guía canónica para escribir esos README vive en [`docs/proyect/README-BC-GUIDE.md`](docs/proyect/README-BC-GUIDE.md). El mapa de BCs y dependencias globales está en [`docs/proyect/BC.md`](docs/proyect/BC.md).

---

## 1. Setup

```bash
$ npm install
```

## 2. Comandos

```bash
# desarrollo (con watch)
$ npm run start:dev

# producción
$ npm run start:prod

# tests
$ npm run test          # unit (Jest)
$ npm run test:e2e      # e2e
$ npm run test:cov      # con coverage
```

## 3. Arquitectura de alto nivel

El pipeline `ca` (contract analysis) recorre las siguientes etapas, conectadas por eventos:

```
ingestion → extraction → parsing → normalization → chain-detection ──┐
                                              │                       │
                                              └→ enrichment ─→ classification ─→ scoring ─→ honeypot ─→ filters ─→ publishing
                                                                                                                    │
                                                                                                                    └──→ analytics (background, retrospectivo)
```

`shared` provee primitivas DDD, error centralizado y config (no es un BC).

## 4. Bounded Contexts

### 4.1 Pipeline discovery (`src/discovery/`)

| BC | Resumen | README |
|---|---|---|
| `ingestion/telegram` | Suscribe, persiste y consume en tiempo real los mensajes de canales de Telegram que el sistema monitoriza. | [`src/discovery/ingestion/telegram/README.md`](src/discovery/ingestion/telegram/README.md) |
| `extraction` | Extrae candidatos crudos (CAs EVM/Solana, tickers, URLs) del texto plano de un mensaje de Telegram, sin reglas de negocio semánticas. | [`src/discovery/extraction/README.md`](src/discovery/extraction/README.md) |
| `parsing` | Convierte texto crudo + candidatos extraídos en un `TokenCall` estructurado (contrato primario, ticker, métricas USD, confidence heurístico). | [`src/discovery/parsing/README.md`](src/discovery/parsing/README.md) |
| `normalization` | Dedupica menciones del mismo token a lo largo de múltiples canales/mensajes y produce una entrada canónica agregada por `(chain, address)`. | [`src/discovery/normalization/README.md`](src/discovery/normalization/README.md) |
| `chain-detection` | Determina en qué chain vive una dirección de contrato, sondeando múltiples chain probers en paralelo y eligiendo el ganador por puntos. | [`src/discovery/chain-detection/README.md`](src/discovery/chain-detection/README.md) |
| `enrichment` | Agrega datos de mercado en tiempo real (precio, liquidez, FDV, MC, holders, pares) consultando múltiples proveedores externos en paralelo y fusionando los resultados. | [`src/discovery/enrichment/README.md`](src/discovery/enrichment/README.md) |
| `classification` | Clasifica tokens (`TOKEN`/`POOL`/`ROUTER`/`NFT`/`SCAM`/`UNKNOWN`) y emite señales de riesgo (LOW_LIQUIDITY, NO_HOLDERS, POSSIBLE_RUG, etc.) basándose en el `TokenSnapshot` de enrichment. | [`src/discovery/classification/README.md`](src/discovery/classification/README.md) |
| `scoring` | Combina classification + métricas + buzz + reputación de canal en un score 0..100 con desglose de factores. | [`src/discovery/scoring/README.md`](src/discovery/scoring/README.md) |
| `honeypot` | Detecta si un token es un honeypot. v1 heurístico (DexScreener + reglas); v2计划 integrar GoPlus, bytecode Alchemy y simulación Tenderly. | (pendiente de README — [`src/discovery/honeypot/`](src/discovery/honeypot/)) |
| `filters` | Última compuerta antes de publicar: aplica gates configurables (score mínimo, blacklist, honeypot sospecha, risk weight, completeness, chain) y decide `APPROVED`/`REJECTED`. | [`src/discovery/filters/README.md`](src/discovery/filters/README.md) |
| `publishing/telegram` | Cierra el pipeline: formatea calls APPROVED como mensajes de Telegram y los envía a canales de output (mock por defecto, MTProto real opcional). | [`src/discovery/publishing/telegram/README.md`](src/discovery/publishing/telegram/README.md) |
| `analytics` | Evalúa retrospectivamente si los calls rindieron bien (`STRONG`/`GOOD`/`NEUTRAL`/`POOR`/`FAILED`) y agrega reputación por canal para alimentar `scoring` con datos reales. | [`src/discovery/analytics/README.md`](src/discovery/analytics/README.md) |

### 4.2 Núcleo transversal

| Módulo | Resumen | README |
|---|---|---|
| `shared` | Primitivas DDD (`AggregateRoot`, `Entity`, `ValueObject`, `DomainEvent`), enum `ErrorCode` + `DomainError`, `AppConfig` desde env vars y helpers `Uuid`/`DateTime`. No es un BC. | [`src/shared/README.md`](src/shared/README.md) |

## 5. Convenciones globales

- **Hexagonal estricto**: `domain/` no importa de `application/`, `infrastructure/` ni `api/`. Puertos como `abstract class` para tokens DI.
- **Inputs en `api/input/`** validados con `class-validator` (`@IsString`, `@IsInt`, `@IsOptional`, etc.).
- **VOs como `ValueObject<TProps>`** con factories `fromX(...)` que lanzan `DomainError(ErrorCode.VALIDATION)` o código específico.
- **Errores centralizados** en `shared/domain/domain-error.ts` (`ErrorCode.NOT_FOUND`, `VALIDATION`, `INVALID_ADDRESS`, `NO_CONTRACT_ADDRESS`, etc.).
- **Eventos extienden `DomainEvent`** con `eventName` y payload inmutable (`Object.freeze`). Publisher siempre vía `publishAll` después de `aggregate.commit()`.
- **In-memory repos con FIFO eviction** (capacity 500-10 000 según BC). Reemplazables por TypeORM/Prisma sin tocar BC consumers.

## 6. Recursos

- [`docs/proyect/BC.md`](docs/proyect/BC.md) — Mapa global de BCs y dependencias.
- [`docs/proyect/PLAN.md`](docs/proyect/PLAN.md) — Orden de implementación.
- [`docs/proyect/README-BC-GUIDE.md`](docs/proyect/README-BC-GUIDE.md) — Cómo escribir el README de un BC.
- [NestJS Documentation](https://docs.nestjs.com)
