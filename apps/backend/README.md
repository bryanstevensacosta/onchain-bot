# apps/backend — Onchain Bot

Pipeline NestJS que descubre alpha-calls de tokens on-chain desde canales de Telegram KOL, las valida, estructura y republica a canales de output.

Arquitectura hexagonal estricta · 22 wired modules · 205 Jest specs (`jest --listTests`, verificado 2026-09-24) · Eventos in-process (EventEmitter2) · Repos in-memory + Postgres (TypeORM)

> Fuente de verdad para conteos y rutas: [`AGENTS.md`](AGENTS.md) (§MODULES, §HTTP ROUTES, §PERSISTENCE) y `src/app.module.ts`.

---

## 1. Pipeline

```
canal KOL (Telegram MTProto)
  │  kol/ingestion
  │  ↓ llamada directa (fix-1 — texto crudo nunca cruza el event bus)
  ▼
token/intake/extraction       ← regex: CAs, tickers, URLs
  │  (direct call, no event bus)
  ▼
token/intake/parsing          ← parseo heurístico: ticker, name, metrics, chart
  │  (direct call, no event bus)
  ▼
token/normalization           ← dedup cross-channel → canonical token call
  │  emite: normalization.call.normalized
  ▼
┌─ chain/detection            ← resuelve blockchain (Alchemy, Helius)
│  │  emite: chain-detection.chain.detected
│  ▼
└─ token/enrichment           ← market data (DexScreener, Birdeye, Helius, GeckoTerminal)
   │  emite: enrichment.token.enriched | enrichment.token.failed
   ▼
token/classification          ← tipo + riesgo heurístico
   │  emite: classification.token.classified
   ▼
token/scoring                 ← score 0-100 (clasificación + reputación KOL)
   │  emite: scoring.token.scored
   ▼
┌─ token/vip-call-approval ← gates: score threshold, blacklist, honeypot, etc.
│  │  emite: vip-call.approval.approved | vip-call.approval.rejected
│  ▼
│  telegram/vip-calls/vip-channel  ← formatea y envía a canales de output via Bot API (NO MTProto; ver AGENTS.md §TELEGRAM PUBLISHING)
│  │  emite: publishing.telegram.published | publishing.telegram.failed
│  ▼
│  canal de output (Telegram)
│
├─ token/honeypot             ← análisis heurístico de honeypot
│  │  emite: honeypot.analysis.completed
│
└─ token/call-tracking        ← evalua resultados post-publicación (cron cada 5min)
     emite: analytics.evaluation.completed
```

**Fix-1 aplicado**: Extracción y parsing se invocan con llamadas directas desde `StartKolIngestionUseCase`. El texto crudo nunca cruza el event bus ni se persiste en Postgres (cumplimiento ToS Telegram §4.3).

---

## 2. Bounded Contexts (22 wired modules — ver `AGENTS.md` §MODULES y `src/app.module.ts`)

> La tabla de abajo es un resumen histórico (nombres pre-rename: `token-gating`→`token/vip-call-approval`, `vip-calls-channel`→`telegram/vip-calls/vip-channel`, `chain/explorer` eliminado). La lista verificada de módulos y prefijos vive en `AGENTS.md` §MODULES y §HTTP ROUTES.

| BC                           | Módulo                  | Responsabilidad                                                          | Consume                           | Emite                                       |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------- |
| `kol/identity`               | `IdentityModule`        | CRUD de KOLs, lifecycle (ACTIVE/DORMANT/BLACKLISTED)                     | —                                 | —                                           |
| `kol/ingestion`              | `KolIngestionModule`    | MTProto listener, orquesta extraction+parsing via direct call            | —                                 | `telegram.message.ingested` (obs)           |
| `kol/reputation`             | `ReputationModule`      | Reputación por KOL: success rate, avg ATH, confidence                    | —                                 | —                                           |
| `kol/source`                 | `SourceModule`          | Value object de atribución por KOL                                       | —                                 | —                                           |
| `kol/stats`                  | `StatsModule`           | Stub (leaderboard, ROI, alpha-callers)                                   | —                                 | —                                           |
| `token/intake/extraction`    | `ExtractionModule`      | Extrae CAs, tickers, URLs de texto vía regex                             | (direct call)                     | `extraction.candidates.extracted`           |
| `token/intake/parsing`       | `ParsingModule`         | Parseo heurístico a TokenCall con métricas                               | (direct call)                     | `parsing.call.parsed`                       |
| `token/normalization`        | `NormalizationModule`   | Canonical token call (dedup chain+address)                               | `parsing.call.parsed`             | `normalization.call.normalized`             |
| `chain/detection`            | `ChainDetectionModule`  | Probes EVM (Alchemy) + Solana (Helius), scoring                          | `normalization.call.normalized`   | `chain-detection.chain.detected`            |
| `chain/explorer`             | `ChainExplorerModule`   | 4 providers de market data (DexScreener, GeckoTerminal, Birdeye, Helius) | —                                 | —                                           |
| `chain/registry`             | `ChainRegistryModule`   | Catálogo estático de chains soportadas                                   | —                                 | —                                           |
| `token/market-data`          | `EnrichmentModule`      | Enriquecimiento con market data (merge first-non-null)                   | `normalization.call.normalized`   | `enrichment.token.enriched` / `.failed`     |
| `token/classification`       | `ClassificationModule`  | Clasificación heurística (riesgo, seguridad)                             | `enrichment.token.enriched`       | `classification.token.classified`           |
| `token/scoring`              | `ScoringModule`         | Score 0-100 (clasificación + KOL reputation)                             | `classification.token.classified` | `scoring.token.scored`                      |
| `token/token-gating`         | `FiltersModule`         | Gates: score threshold, blacklist, honeypot, risk, completeness, chain   | `scoring.token.scored`            | `vip-call.approval.approved` / `.rejected`  |
| `token/honeypot`             | `HoneypotModule`        | Análisis heurístico de honeypot (v1 sin simulación)                      | `scoring.token.scored`            | `honeypot.analysis.completed`               |
| `token/call-tracking`        | `CallTrackingModule`    | Evaluación post-publicación (STRONG/GOOD/NEUTRAL/POOR/FAILED)            | `scoring.token.scored`            | —                                           |
| `telegram/vip-calls-channel` | `VipCallsChannelModule` | Formatea y publica a canales output via MTProto                          | `vip-call.approval.approved`      | `publishing.telegram.published` / `.failed` |
| `dashboard`                  | `DashboardModule`       | Agregador read-only de KPIs cross-BC                                     | —                                 | —                                           |

> Mapa detallado en [`docs/proyect/BC.md`](docs/proyect/BC.md).

---

## 3. Arquitectura por BC (hexagonal)

```
src/<bc>/
├── api/                  ← inbound adapters (HTTP controllers)
│   ├── http/
│   └── input/            ← DTOs con validación (class-validator)
├── application/
│   ├── handlers/         ← use cases
│   ├── mappers/          ← view models
│   └── ports/            ← outbound port interfaces
├── domain/
│   ├── entities/         ← aggregate roots (+ TypeORM @Entity para DB)
│   ├── events/           ← domain events (extends DomainEvent)
│   ├── ports/            ← inbound port abstractions
│   └── value-objects/    ← VOs con validación
└── infrastructure/
    ├── persistence/      ← TypeORM repositories
    ├── repositories/     ← in-memory repos (Tier-1, cuando DATABASE_ENABLED=false)
    ├── messaging/        ← event publishers (EventEmitter2)
    ├── event-bus/        ← event handlers (@OnEvent)
    ├── adapters/         ← outbound adapters (RPC, HTTP)
    └── senders/          ← MTProto senders
```

### Ficheros clave

| Archivo                                                    | Rol                                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/app.module.ts`                                        | Root module, importa los 22 módulos activos (+ threads/ops añadidos después; ver AGENTS.md §MODULES) |
| `src/main.ts`                                              | Bootstrap: CORS, ValidationPipe                                                                      |
| `src/kol/ingestion/.../start-kol-ingestion.use-case.ts:75` | Orchestrador: direct calls a extract+parse (fix-1)                                                   |
| `src/shared/kernel/`                                       | DDD primitives: AggregateRoot, Entity, ValueObject, DomainEvent, DomainError                         |
| `src/shared/common/persistence/database.module.ts`         | TypeORM forRootAsync condicional (DATABASE_ENABLED)                                                  |
| `src/shared/common/config/app.config.ts`                   | AppConfig con todas las env vars                                                                     |

---

## 4. API endpoints

> Prefijos verificados en [`AGENTS.md`](AGENTS.md) §HTTP ROUTES (35+ controladores; p. ej. `telegram-kol/identity`, `token/vip-call-approval` — NO `/kols` pelado ni `/token/token-gating/*`). Las tablas de abajo usan los prefijos históricos y quedan como referencia; ante duda, manda AGENTS.md. Grupos no cubiertos aquí (settings, crypto-news-publisher/ads, achievements, threads, call-tracking): ver AGENTS.md.

### Sistema

| Método | Path | Controlador              |
| ------ | ---- | ------------------------ |
| `GET`  | `/`  | `AppController.getHello` |

### KOL Identity (BC `kol/identity`)

| Método | Path                     | Uso                                            |
| ------ | ------------------------ | ---------------------------------------------- |
| `GET`  | `/kols`                  | Listar todos los KOLs                          |
| `POST` | `/kols`                  | Registrar nuevo KOL                            |
| `GET`  | `/kols/:kolId`           | Detalle de KOL                                 |
| `POST` | `/kols/:kolId/lifecycle` | Cambiar lifecycle (ACTIVE/DORMANT/BLACKLISTED) |
| `POST` | `/kols/:kolId/backfill`  | Backfill de histórico de mensajes              |

### KOL Reputation (BC `kol/reputation`)

| Método | Path                     | Uso                    |
| ------ | ------------------------ | ---------------------- |
| `GET`  | `/kols`                  | Todas las reputaciones |
| `GET`  | `/kols/top`              | Top KOLs por score     |
| `GET`  | `/kols/:kolId`           | Reputación de un KOL   |
| `POST` | `/kols/recompute/:kolId` | Recalcular reputación  |

### KOL Stats (BC `kol/stats`) — stub

| Método | Path               |
| ------ | ------------------ |
| `GET`  | `/kol-leaderboard` |
| `GET`  | `/top-calls`       |
| `GET`  | `/roi-trends`      |
| `GET`  | `/alpha-callers`   |

### Pipeline (`/token`)

| Método | Path                                                 | BC              |
| ------ | ---------------------------------------------------- | --------------- |
| `POST` | `/intake/extraction/extract`                         | Extraction      |
| `GET`  | `/intake/extraction/results/recent`                  | Extraction      |
| `GET`  | `/intake/extraction/results/:kolId/:messageId`       | Extraction      |
| `POST` | `/intake/parsing/parse`                              | Parsing         |
| `GET`  | `/intake/parsing/calls/recent`                       | Parsing         |
| `GET`  | `/intake/parsing/calls/:kolId/:messageId`            | Parsing         |
| `GET`  | `/normalization/tokens/recent`                       | Normalization   |
| `GET`  | `/normalization/tokens/:chain/:address`              | Normalization   |
| `POST` | `/market-data/enrich`                                | Enrichment      |
| `GET`  | `/market-data/snapshots/recent`                      | Enrichment      |
| `GET`  | `/market-data/snapshots/:chain/:address`             | Enrichment      |
| `POST` | `/classification/classify`                           | Classification  |
| `GET`  | `/classification/tokens/recent`                      | Classification  |
| `GET`  | `/classification/tokens/:chain/:address`             | Classification  |
| `POST` | `/scoring/score`                                     | Scoring         |
| `GET`  | `/scoring/tokens/top`                                | Scoring         |
| `GET`  | `/scoring/tokens/recent`                             | Scoring         |
| `GET`  | `/scoring/tokens/:chain/:address`                    | Scoring         |
| `POST` | `/honeypot/analyze`                                  | Honeypot        |
| `GET`  | `/honeypot/analyses/recent`                          | Honeypot        |
| `GET`  | `/honeypot/analyses/:chain/:address`                 | Honeypot        |
| `POST` | `/token/vip-call-approval/apply`                     | VipCallApproval |
| `GET`  | `/token/vip-call-approval/decisions/approved`        | VipCallApproval |
| `GET`  | `/token/vip-call-approval/decisions/rejected`        | VipCallApproval |
| `GET`  | `/token/vip-call-approval/decisions/recent`          | VipCallApproval |
| `GET`  | `/token/vip-call-approval/decisions/:chain/:address` | VipCallApproval |

### Chain Detection (`/chain/detection`)

| Método | Path                | Uso                           |
| ------ | ------------------- | ----------------------------- |
| `POST` | `/detect`           | Detectar chain de una address |
| `GET`  | `/results/recent`   | Resultados recientes          |
| `GET`  | `/results/:address` | Resultado por address         |

### Telegram VIP Calls (`/vip-calls`)

| Método | Path                     | Uso                                                                                                                     |
| ------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/publish`               | Publicar un call                                                                                                        |
| `GET`  | `/calls/published`       | Publicaciones exitosas                                                                                                  |
| `GET`  | `/calls/failed`          | Publicaciones fallidas                                                                                                  |
| `GET`  | `/calls/recent`          | Publicaciones recientes                                                                                                 |
| `GET`  | `/calls/:chain/:address` | ⚠️ mal atribuido — el lookup por token vive en `GET call-tracking/tracked/:chain/:address` (ver AGENTS.md §HTTP ROUTES) |

### Call Tracking (`/token/call-tracking`)

| Método | Path                 | Uso                        |
| ------ | -------------------- | -------------------------- |
| `POST` | `/calls/evaluate`    | Evaluar call manualmente   |
| `POST` | `/jobs/enqueue`      | Encolar jobs de evaluación |
| `GET`  | `/jobs/:id`          | Estado de un job           |
| `POST` | `/jobs/evaluate-due` | Procesar jobs vencidos     |
| `POST` | `/scheduler/tick`    | Tick manual del scheduler  |

### Dashboard (`/dashboard`)

| Método | Path    | Uso                                                            |
| ------ | ------- | -------------------------------------------------------------- |
| `GET`  | `/kpis` | KPIs agregados (KOLs activos, calls, approval rate, published) |

---

## 5. Entidades de base de datos (47 entidades — `EXPECTED_ENTITY_COUNT = 47`, verificado 2026-09-24; detalle en [`AGENTS.md`](AGENTS.md) §PERSISTENCE)

> La tabla de abajo es el núcleo histórico del pipeline (14 tablas). El conteo real es 47 (settings, publisher/queue/throttle/slots, ads, threads, achievements, dedup, matching, etc.). Las 3 tablas crypto-news viven SOLO en ingestion-telegram desde el split 2026-09-08.

| Tabla                     | Entidad                      | BC             |
| ------------------------- | ---------------------------- | -------------- |
| `kols`                    | `KolEntity`                  | Identity       |
| `kol_reputations`         | `KolReputationEntity`        | Reputation     |
| `extraction_results`      | `ExtractionResultEntity`     | Extraction     |
| `token_calls`             | `TokenCallEntity`            | Parsing        |
| `canonical_token_calls`   | `CanonicalTokenCallEntity`   | Normalization  |
| `token_snapshots`         | `TokenSnapshotEntity`        | Enrichment     |
| `token_classifications`   | `TokenClassificationEntity`  | Classification |
| `token_scores`            | `TokenScoreEntity`           | Scoring        |
| `filter_decisions`        | `FilterDecisionEntity`       | Filters        |
| `honeypot_analyses`       | `HoneypotAnalysisEntity`     | Honeypot       |
| `call_evaluation_jobs`    | `CallEvaluationJobEntity`    | CallTracking   |
| `call_performances`       | `CallPerformanceEntity`      | CallTracking   |
| `published_calls`         | `PublishedCallEntity`        | Publishing     |
| `chain_detection_results` | `ChainDetectionResultEntity` | ChainDetection |

TypeORM `synchronize: true` auto-crea las tablas al boot (solo dev). Con `DATABASE_ENABLED=false` todos los repositorios usan implementaciones in-memory (LRU caches).

---

## 6. Configuración

### `.env` (apps/backend/.env)

| Variable                                               | Descripción                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_ENABLED`                                     | `true` usa Postgres; `false` usa in-memory                                                                                            |
| `DATABASE_SYNCHRONIZE`                                 | `true` auto-crea schema (dev)                                                                                                         |
| `POSTGRES_*`                                           | Host, port, user, password, db                                                                                                        |
| `TELEGRAM_BOT_TOKEN`                                   | Deprecated — replaced by `VIP_CALLS_BOT_TOKEN`, `CRYPTO_NEWS_BOT_TOKEN`, `CHAIN_DEXTER_BOT_TOKEN`                                     |
| `TELEGRAM_MTPROTO_API_ID/HASH/SESSION`                 | ⚠️ Sin lector en el backend (rama MTProto eliminada → `410 Gone`); las sesiones viven SOLO en ingestion-telegram (una triple por env) |
| `INGESTION_TELEGRAM_SEED_CHANNELS`                     | ⚠️ Legacy/deprecated — alta por `POST telegram-kol/identity/kols` (ver AGENTS.md §INGESTION)                                          |
| `ALCHEMY_API_KEY`, `HELIUS_API_KEY`, `BIRDEYE_API_KEY` | Providers de datos                                                                                                                    |

Ver `.env.example` en la raíz del repo.

### Docker

```bash
npm run docker:up    # postgres + pgAdmin
npm run docker:down
```

---

## 7. Tests

```bash
npm run test:backend          # Jest (205 specs via jest --listTests, verificado 2026-09-24; el nº de tests es mayor)
npm run test:backend -- --coverage
```

Los tests usan implementaciones in-memory por defecto — `DATABASE_ENABLED` no es necesario.

---

## 8. Estado actual

- **Seed KOLs legacy (deprecated)** — alta actual por `POST telegram-kol/identity/kols` (ver AGENTS.md §INGESTION, seeder `@deprecated`)
- **Fix-1 aplicado**: texto crudo eliminado del event bus y persistencia (ToS Telegram)
- **DashboardModule** agregado para KPIs cross-BC
- **TypeScript**: error de compilación en `start-kol-ingestion.use-case.ts:106` (tipos de `ContractAddress[]`)

---

## 9. Recursos

- [`AGENTS.md`](AGENTS.md) — knowledge base del backend (fuente de verdad: módulos, rutas, entidades, gaps)
- [`docs/proyect/BC.md`](docs/proyect/BC.md) — mapa detallado de BCs
- [`docs/proyect/PLAN.md`](docs/proyect/PLAN.md) — orden de implementación
- [`docs/proyect/DEPLOY.md`](docs/proyect/DEPLOY.md) — despliegue
- [`docs-money/`](../../docs-money/) — ToS Telegram, rate limits, fix-1
- [`apps/frontend/README.md`](../frontend/README.md) — dashboard frontend
