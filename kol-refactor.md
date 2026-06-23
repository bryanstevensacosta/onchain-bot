# `kol-refactor` — Consolidación `channel` / `telegram` / `kol` / `source` / `ingestion` / `reputation` en `src/telegram-kol/*`

> Estado: **borrador inicial**. Documento vivo que se va refinando a medida que se ejecutan las fases.
>
> Owner: `@bryanstevens`
> Última revisión: 2026-06-22

---

## 1. Resumen ejecutivo

`Alpha Meta Token Scanner` es una **herramienta interna** para **encontrar gemas y monedas de alto retorno de inversión** mediante el análisis de mensajes que KOLs de **Telegram** publican, **escogiendo siempre a los mejores KOLs** a través de un ciclo de **autoaprendizaje**: cada call se trackea, se mide su outcome (ATH, drawdown, retrace), y eso recalibra la reputación/confianza de cada KOL — que a su vez pondera el score de futuros calls.

Hoy el concepto "channel" vive repartido en tres BCs del core (`telegram/channels`, `token/channel-reputation`, más el VO `Source.channelId` en `token/normalization`), con cero aparición de la palabra "kol" en código aunque sea el término ubiquitous de la herramienta. Esto enturbia el bucle de autoaprendizaje, que necesita un único modelo de KOL para poder preguntarle "¿cuánto confío en este caller?" sin saltar entre áreas.

Este refactor **consolida** toda la superficie relacionada con KOLs de Telegram bajo un único árbol `src/telegram-kol/<sub-bc>/` (dos niveles: `telegram-kol/` + sub-BC). El prefijo `telegram-` deja explícito que hoy solo soportamos KOLs identificados por su canal de Telegram — si mañana se añaden KOLs de Discord o Twitter, se crean `discord-kol/`, `twitter-kol/` al mismo nivel, y `kol/` queda libre como umbrella futura.

No es una reescritura: es un **rename + reubicación** de BCs existentes. Además, `src/telegram/publishing/` (el único BC de Telegram que **no** es KOL) se aplana a `src/telegram-publishing/` para que `src/telegram/` no quede como directorio con un solo hijo.

---

## 2. Conceptos que se consolidan

| Concepto actual | Dónde vive hoy | A dónde va |
|---|---|---|
| **channel identity** | `src/telegram/channels/` (CRUD de canales monitorizados) | `src/telegram-kol/identity/` |
| **telegram ingestion** | `src/telegram/ingestion/` (MTProto listener + mensajes) | `src/telegram-kol/ingestion/` |
| **reputation stats** | `src/token/channel-reputation/` (score, counts, confidence) | `src/telegram-kol/reputation/` ← **corazón del autoaprendizaje** |
| **source attribution** | `src/token/normalization/domain/value-objects/source.vo.ts` (VO `Source` con `channelId`) | `src/telegram-kol/source/` |
| **stats / dashboard interno** (no existe) | — | `src/telegram-kol/stats/` ← leaderboards internos (top KOLs, top calls, ROI trends) |

**No se consolidan** (siguen donde están — o se aplanan — porque no son conceptos de KOL):
- `src/telegram/publishing/` → `src/telegram-publishing/` — canales de **output** del bot, no son KOLs. Se aplana el path para que `src/telegram/` no quede como directorio con un solo hijo.
- `src/token/call-tracking/` — trackea **calls**, no KOLs. La atribución va por FK (`kolId`).
- `src/token/{intake,normalization,classification,scoring,honeypot,token-gating,market-data}` — pipeline del token, el KOL es solo un dato de entrada.
- `src/shared/` — primitivas DDD transversales, sin cambios.

---

## 3. Mi opinión (veredicto)

### Pros
1. **Ubiquitous language consistente.** La herramienta entera habla "KOL"; el código deja de decir "channel" en 3 sitios con 3 significados.
2. **El loop de autoaprendizaje tiene un solo dueño.** Hoy `ChannelReputationStats` (en `token/channel-reputation`) es actualizado por `token/call-tracking/EvaluateCallPerformanceUseCase` (`evaluate-call-performance.use-case.ts:60`) y leído por `token/scoring/DefaultChannelReputationAdapter` (`default-channel-reputation.adapter.ts:58`). El modelo existe pero está disperso. Moverlo a `telegram-kol/reputation` lo deja como un agregado rico, fácil de extender con per-chain consistency, alpha-caller count, PnL potential, ROI-weighted score, etc.
3. **Single source of truth para "quién es este caller".** Hoy `ChannelId` (en `telegram/channels`), `channelId: string` (en `channel-reputation`) y `Source.channelId` (en `normalization`) son strings sueltos. Moverlos a `telegram-kol/identity` + `telegram-kol/reputation` + `telegram-kol/source` deja un dueño claro por agregado.
4. **Naming explícito de la约束 del transporte.** Llamarlo `telegram-kol` deja claro que hoy solo hay KOLs de Telegram. Si mañana entran KOLs de Discord, no se mezclan con los de Telegram en el mismo BC.
5. **Elimina la abstracción leaky "channel".** "Channel" en `telegram/channels` significa "input channel monitorizado" — pero todos los input channels son KOLs en esta herramienta, así que el nivel de indirección no aporta.
6. **Hardcoded `KNOWN_GOOD`/`KNOWN_BAD` sale del adapter de scoring.** `scoring/infrastructure/adapters/default-channel-reputation.adapter.ts:22-37` tiene listas pegadas que son KOL-specific. Moverlas a `telegram-kol/reputation` (o `telegram-kol/stats` si son heurísticas operativas) deja `scoring` 100% genérico sobre un puerto `KolReputationPort`.

### Contras
1. **Rompe `08-file-structure.md`** que define áreas top-level (`telegram/`, `token/`, `chain/`, `shared/`). Hay que actualizar el doc.
2. **Rename masivo**: clases, archivos, módulos, tests, eventos, columnas de DB (`channel_id` → `kol_id`), seeds, scripts de migración.
3. **Cross-area imports nuevos**: `token/call-tracking` y `token/scoring` pasan a depender de `telegram-kol/*`. Tolerable (ya lo hacían vía puerto `ChannelReputationPort`).
4. **Riesgo de regresión en scoring** si el rename toca el orden de evaluación. Mitigación: snapshot de scores pre-refactor + test de paridad.

### Veredicto
**Hacerlo, faseado**. La ganancia conceptual (loop de aprendizaje unificado, naming explícito) supera el costo mecánico. Sin faseado es unsafe.

---

## 4. Estructura objetivo

Dos niveles: `src/telegram-kol/` (umbrella) + sub-BC (`telegram-kol/<nombre>/`). Sigue la plantilla hexagonal de `08-file-structure.md` dentro de cada sub-BC.

Además, el único BC de Telegram que **no** es KOL (`publishing/`) vive en su propio árbol flat:

```
src/
├── telegram-publishing/                          ← (ex src/telegram/publishing/) BC de output del bot
│   ├── README.md
│   ├── publishing.module.ts
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   └── api/
│
└── telegram-kol/
├── README.md                                      ← mapa del área, bucle de autoaprendizaje, naming convention
├── telegram-kol.module.ts                         ← @Module que importa y exporta los sub-BCs
│
├── identity/                                      ← KOL CRUD + lifecycle (active/dormant/blacklisted)
│   ├── README.md
│   ├── domain/
│   │   ├── entities/kol.entity.ts                 ← ex TelegramChannel
│   │   ├── value-objects/
│   │   │   ├── kol-id.vo.ts                       ← ex ChannelId
│   │   │   └── kol-handle.vo.ts                   ← ex ChannelUsername (@user_telegram)
│   │   └── ports/kol.repository.port.ts
│   ├── application/
│   │   ├── handlers/
│   │   │   ├── register-kol.use-case.ts           ← ex add-channel
│   │   │   ├── get-kol.use-case.ts                ← ex get-channel
│   │   │   ├── list-kols.use-case.ts              ← ex list-channels
│   │   │   └── set-kol-lifecycle.use-case.ts      ← NEW: activate / dormant / blacklist
│   │   ├── ports/kol.repository.ts
│   │   └── mappers/kol.mapper.ts
│   ├── infrastructure/
│   │   ├── persistence/typeorm/
│   │   │   ├── entities/kol.entity.ts             ← tabla `kols` (ex `telegram_channels`) + lifecycle_status
│   │   │   ├── mappers/kol.mapper.ts
│   │   │   └── repositories/typeorm-kol.repository.ts
│   │   └── repositories/in-memory-kol.repository.ts
│   ├── api/
│   │   ├── input/register-kol.input.ts
│   │   └── http/
│   │       ├── kol.controller.ts                  ← /telegram-kol/identity/...  (o /kols)
│   │       └── dto/
│   └── identity.module.ts
│
├── ingestion/                                     ← MTProto subscription + message consumption
│   ├── README.md
│   ├── domain/
│   │   ├── entities/telegram-subscription.entity.ts
│   │   ├── value-objects/message-id.vo.ts
│   │   ├── events/kol-message-ingested.event.ts   ← ex MessageIngested
│   │   └── ports/telegram-listener.port.ts        ← TelegramMTProtoClient
│   ├── application/
│   │   ├── handlers/
│   │   │   ├── start-ingestion.use-case.ts        ← ex start-listening
│   │   │   └── backfill.use-case.ts               ← ex get-channel-history
│   │   ├── ports/
│   │   └── mappers/
│   ├── infrastructure/
│   │   ├── api/mtproto/telegram-mtproto.adapter.ts
│   │   └── seeders/
│   ├── api/
│   └── ingestion.module.ts
│
├── reputation/                                    ← CORAZÓN DEL AUTOAPRENDIZAJE
│   ├── README.md                                  ← describe el loop: outcome → recompute → score
│   ├── domain/
│   │   ├── value-objects/
│   │   │   ├── kol-reputation.vo.ts                ← ex ChannelReputationStats (agregado rico)
│   │   │   ├── kol-confidence.vo.ts                ← LOW/MEDIUM/HIGH/VERY_HIGH (basado en #calls)
│   │   │   ├── chain-consistency.vo.ts             ← NEW: consistency por chain
│   │   │   ├── alpha-caller-count.vo.ts            ← NEW: # veces first-call sobre 10+ network
│   │   │   ├── pnl-potential.vo.ts                 ← NEW: $X invertidos → ATH/current
│   │   │   ├── roi-weighted-score.vo.ts            ← NEW: score ponderado por ROI histórico, no solo X
│   │   │   └── call-summary.vo.ts                  ← NEW: top/best/recent call
│   │   ├── services/recompute-kol-stats.service.ts  ← pure fn (ex recomputeStats)
│   │   └── ports/kol-reputation.repository.port.ts
│   ├── application/
│   │   ├── handlers/
│   │   │   ├── get-kol-reputation.use-case.ts
│   │   │   ├── get-top-kols.use-case.ts
│   │   │   ├── list-all-kol-reputations.use-case.ts
│   │   │   └── recompute-kol-reputation.use-case.ts
│   │   ├── ports/kol-reputation.repository.ts
│   │   └── mappers/kol-reputation.mapper.ts
│   ├── infrastructure/
│   │   ├── persistence/typeorm/
│   │   │   ├── entities/kol-reputation.entity.ts
│   │   │   ├── mappers/kol-reputation.mapper.ts
│   │   │   └── repositories/typeorm-kol-reputation.repository.ts
│   │   └── repositories/in-memory-kol-reputation.repository.ts
│   ├── api/
│   │   ├── input/
│   │   └── http/
│   │       ├── kol-reputation.controller.ts        ← /telegram-kol/reputation/...
│   │       └── dto/
│   └── reputation.module.ts
│
├── source/                                        ← atribución de menciones a KOLs
│   ├── README.md
│   ├── domain/
│   │   ├── value-objects/
│   │   │   ├── source.vo.ts                       ← rename: channelId → kolId
│   │   │   └── source-type.vo.ts                  ← 'TELEGRAM' | 'DISCORD' | 'OTHER'
│   │   └── ports/source-aggregator.port.ts        ← para que normalization agregue menciones
│   ├── application/
│   │   └── handlers/
│   │       └── build-kol-source-list.use-case.ts  ← NEW: given mentions → dedup por kolId
│   └── source.module.ts
│
└── stats/                                         ← STUB — dashboard interno (KOL leaderboard, top calls, ROI trends)
    ├── README.md                                  ← describe endpoints de solo-lectura
    └── stats.module.ts                            ← módulo mínimo, expone `KolStatsPort` (todavía sin implementar)
```

`telegram-kol.module.ts` reune todo:

```ts
@Module({
  imports: [
    IdentityModule,
    IngestionModule,
    ReputationModule,
    SourceModule,
    StatsModule,
  ],
  exports: [
    IdentityModule,        // expone KolRepository a ingestion + reputation + stats
    ReputationModule,      // expone KolReputationPort a scoring + stats
    SourceModule,          // expone SourceAggregatorPort a normalization
  ],
})
export class TelegramKolModule {}
```

> **Convención de naming** (a documentar en el README del área):
> - **Top-level** = transporte + dominio (`telegram-kol`, mañana `discord-kol`, `twitter-kol`).
> - **Sub-BCs** = bounded contexts del dominio (`identity`, `ingestion`, `reputation`, `source`, `stats`).
> - **Naming de clases**: el transporte se sobreentiende por el path. Dentro de `telegram-kol/identity/` el agregado se llama `Kol` (no `TelegramKol`), porque ya estamos en el contexto Telegram.
> - **Endpoints HTTP**: prefijan `/telegram-kol/` para evitar colisión futura con `discord-kol/` o `kol/` umbrella.

---

## 5. Mapa de migración (before → after)

### Archivos

| Path actual | Path nuevo |
|---|---|
| `src/telegram/channels/**` | `src/telegram-kol/identity/**` |
| `src/telegram/ingestion/**` | `src/telegram-kol/ingestion/**` |
| `src/token/channel-reputation/**` | `src/telegram-kol/reputation/**` |
| `src/token/normalization/domain/value-objects/source.vo.ts` | `src/telegram-kol/source/domain/value-objects/source.vo.ts` |
| `src/telegram/publishing/**` | `src/telegram-publishing/**` (rename + flatten) |
| `src/app.module.ts` (imports de los 3 BCs) | `src/app.module.ts` importa `TelegramKolModule` y `TelegramPublishingModule` |

### Renombres de dominio (clases, VOs, eventos)

| Antes | Después |
|---|---|
| `TelegramChannel` | `Kol` |
| `ChannelId` | `KolId` |
| `ChannelUsername` | `KolHandle` |
| `TelegramChannelRepository` | `KolRepository` |
| `TelegramChannelEntity` | `KolEntity` (tabla `kols`, añade columna `lifecycle_status`) |
| `TelegramChannelsController` | `KolController` |
| `AddChannelUseCase` | `RegisterKolUseCase` |
| `GetChannelUseCase` | `GetKolUseCase` |
| `ListChannelsUseCase` | `ListKolsUseCase` |
| `MessageIngestedEvent` | `KolMessageIngestedEvent` |
| `StartListeningUseCase` | `StartIngestionUseCase` |
| `GetChannelHistoryUseCase` | `BackfillUseCase` |
| `ChannelReputationStats` | `KolReputation` |
| `ChannelReputationStatsRepository` | `KolReputationRepository` |
| `ChannelReputationStatsEntity` (tabla `channel_reputation_stats`) | `KolReputationEntity` (tabla `kol_reputations`) |
| `ChannelReputationController` | `KolReputationController` |
| `GetChannelReputationUseCase` | `GetKolReputationUseCase` |
| `GetTopReputedChannelsUseCase` | `GetTopKolsUseCase` |
| `ListAllChannelReputationsUseCase` | `ListAllKolReputationsUseCase` |
| `RecomputeChannelStatsUseCase` | `RecomputeKolReputationUseCase` |
| `recomputeStats()` (pure fn) | `recomputeKolReputation()` |
| `ChannelReputationPort` (en `token/scoring/domain/ports/`) | `KolReputationPort` |
| `DefaultChannelReputationAdapter` | `DefaultKolReputationAdapter` |
| `ChannelReputation` (VO en `token/scoring`) | `KolReputationSummary` (rename para evitar colisión con `KolReputation` agregado) |
| `Source.channelId` | `Source.kolId` |
| `SourceType.TELEGRAM` (string literal) | se queda igual |

### Endpoints HTTP

| Antes | Después |
|---|---|
| `GET/POST /telegram/channels/channels` | `GET/POST /telegram-kol/identity/kols` |
| `GET /telegram/channels/channels/:id` | `GET /telegram-kol/identity/kols/:id` |
| `POST /telegram/channels/channels/:id/backfill` | `POST /telegram-kol/ingestion/kols/:id/backfill` |
| `GET /token/channel-reputation/channels` | `GET /telegram-kol/reputation` |
| `GET /token/channel-reputation/channels/top` | `GET /telegram-kol/reputation/top` |
| `GET /token/channel-reputation/channels/:id` | `GET /telegram-kol/reputation/:kolId` |
| `POST /token/channel-reputation/channels/recompute/:id` | `POST /telegram-kol/reputation/:kolId/recompute` |

Los controllers viejos se quedan un release con un redirect 308 al nuevo path, después se borran.

### DB

| Tabla actual | Tabla nueva | Migración |
|---|---|---|
| `telegram_channels` | `kols` | rename + `channel_id` (PK) → `kol_id` (PK) + nueva columna `lifecycle_status` (`ACTIVE` / `DORMANT` / `BLACKLISTED`) |
| `channel_reputation_stats` | `kol_reputations` | rename + `channel_id` → `kol_id` |

---

## 6. Dependencias cross-BC (después)

```
telegram-kol/identity     ──► (nadie, raíz)
telegram-kol/ingestion    ──► telegram-kol/identity           (lookup Kol by id)
telegram-kol/reputation   ──► telegram-kol/identity           (lookup Kol)
telegram-kol/reputation   ◄── token/call-tracking             (recomputeKolReputation tras CallOutcomeRecorded)
telegram-kol/reputation   ◄── token/scoring                   (KolReputationPort → multiplier 0.85x..1.15x)
telegram-kol/source       ◄── token/normalization             (atribución de menciones a kolId)
telegram-kol/stats        ──► telegram-kol/reputation          (leaderboards read-only)
telegram-kol/stats        ──► telegram-kol/identity            (lifecycle status read-only)

token/intake/extraction ◄── telegram-kol/ingestion             (consume KolMessageIngested)
```

Reglas (per `08-file-structure.md` §Convenciones fijas):
- `domain/` no importa de `application/`, `infrastructure/`, `api/`. ✓ (se mantiene).
- Comunicación entre BCs **solo vía puertos** (`abstract class`) o **eventos in-process**. ✓ (ya se hace con `KolReputationPort`; el resto es por `@nestjs/event-emitter`).
- `token/*` puede importar puertos de `telegram-kol/*` (cross-area pero OK porque va por abstracción).

---

## 7. Plan por fases

Cada fase = 1 PR chico, mergable independientemente. Tests + lint en verde al cerrar cada una.

### Fase 0 — Aprobación del doc
- [ ] Revisar y firmar este `kol-refactor.md`.
- [ ] Actualizar `docs/spydefi/arch/08-file-structure.md` para incluir `telegram-kol/` como área top-level.
- [ ] Actualizar `docs/spydefi/arch/12-spydefi-core-overview.md`: el BC 14 (`channel-reputation`) pasa a ser `telegram-kol/reputation` dentro del área `telegram-kol/`.
- [ ] Marcar `docs/spydefi/arch/13-recipe-extract-core.md` como N/A (herramienta interna, no se extrae a otro repo).

### Fase 1 — `telegram-kol/identity` (rename + move)
- [ ] Crear `src/telegram-kol/identity/` con la plantilla hexagonal.
- [ ] Mover `src/telegram/channels/**` → `src/telegram-kol/identity/**`.
- [ ] Renombrar `TelegramChannel` → `Kol`, `ChannelId` → `KolId`, etc.
- [ ] Añadir columna `lifecycle_status` al `Kol` (default `DORMANT` al crear, `ACTIVE` al primer mensaje ingestado).
- [ ] Renombrar tabla `telegram_channels` → `kols` con migración SQL.
- [ ] Apuntar `telegram/ingestion` (aún sin mover) al nuevo `KolRepository` vía `TelegramKolModule`.
- [ ] Deprecar `src/telegram/channels/` (deja un `index.ts` que reexporta desde `telegram-kol/identity`).
- [ ] **Smoke test**: `npm run build` + tests + arrancar y ver que los canales seedeados siguen cargando.

### Fase 2 — `telegram-kol/reputation` (rename + move + enriquecimiento)
- [ ] Crear `src/telegram-kol/reputation/` con la plantilla hexagonal.
- [ ] Mover `src/token/channel-reputation/**` → `src/telegram-kol/reputation/**`.
- [ ] Renombrar `ChannelReputationStats` → `KolReputation`, etc.
- [ ] Renombrar tabla `channel_reputation_stats` → `kol_reputations` con migración SQL.
- [ ] Renombrar `ChannelReputationPort` → `KolReputationPort`, `DefaultChannelReputationAdapter` → `DefaultKolReputationAdapter`.
- [ ] Mover las listas `KNOWN_GOOD`/`KNOWN_BAD` de `scoring/infrastructure/adapters/default-channel-reputation.adapter.ts:22-37` a `telegram-kol/reputation` (leídas por puerto, no hardcoded en el adapter de core).
- [ ] Apuntar `token/call-tracking/EvaluateCallPerformanceUseCase` al nuevo puerto.
- [ ] Apuntar `token/scoring` al nuevo puerto + adapter.
- [ ] **Smoke test**: scoring sigue dando multiplier 0.85x..1.15x con los mismos KNOWN_GOOD.

### Fase 3 — `telegram-kol/source` (rename + move)
- [ ] Crear `src/telegram-kol/source/`.
- [ ] Mover `src/token/normalization/domain/value-objects/source.vo.ts` → `src/telegram-kol/source/domain/value-objects/source.vo.ts`.
- [ ] Renombrar `channelId` → `kolId` dentro del VO `Source`.
- [ ] Actualizar todos los `Source.firstMention(channelId, …)` → `Source.firstMention(kolId, …)` en `token/normalization/`.
- [ ] Crear `SourceAggregatorPort` para que `token/normalization` consuma el BC sin importar tipos concretos.
- [ ] **Smoke test**: pipeline end-to-end sigue produciendo los mismos `NormalizedCall` con el mismo `mentionCount`.

### Fase 4 — `telegram-kol/ingestion` (rename + move)
- [ ] Crear `src/telegram-kol/ingestion/`.
- [ ] Mover `src/telegram/ingestion/**` → `src/telegram-kol/ingestion/**`.
- [ ] Renombrar `MessageIngestedEvent` → `KolMessageIngestedEvent`, `StartListeningUseCase` → `StartIngestionUseCase`.
- [ ] Apuntar `token/intake/extraction` (handler de `MessageIngested`) al nuevo evento.
- [ ] Deprecar `src/telegram/ingestion/`.
- [ ] **Smoke test**: arrancar con `TELEGRAM_MONITORED_CHANNELS` real y ver mensajes fluyendo.

### Fase 5 — `telegram-kol/stats` (stub)
- [ ] Crear `src/telegram-kol/stats/` con un `README.md` describiendo los endpoints planeados (`GET /telegram-kol/stats/kol-leaderboard`, `GET /telegram-kol/stats/top-calls`, `GET /telegram-kol/stats/roi-trends`) y un `stats.module.ts` mínimo que exporta un módulo vacío.
- [ ] `TelegramKolModule` lo importa para que el árbol esté completo.
- [ ] `npm run build` + tests siguen verdes.

### Fase 6 — Frontend
- [ ] Renombrar `apps/frontend/src/pages/channels/` → `pages/kols/`, ruta `/channels` → `/kols`, nav "Channels" → "KOLs".
- [ ] Renombrar `apps/frontend/src/entities/channel/` → `entities/kol/`.
- [ ] Actualizar `apps/frontend/src/shared/api/endpoints.ts` a los nuevos paths del backend.
- [ ] Redirect 308 de `/channels/*` → `/kols/*`.

### Fase 7 — Cleanup
- [ ] Borrar `src/telegram/channels/` y `src/telegram/ingestion/`.
- [ ] Verificar que `src/telegram/` quedó vacío tras los moves; si quedó solo `publishing/`, ejecutar el rename + flatten: `git mv src/telegram/publishing src/telegram-publishing` y actualizar el `import` en `app.module.ts` (`TelegramPublishingModule` ahora vive en `src/telegram-publishing/publishing.module.ts`).
- [ ] Actualizar `docs/spydefi/arch/INDEX.md` y `02-bounded-contexts.md` con la nueva lista.
- [ ] Tag de release `v0.x.kol-refactor`.

---

## 8. Impacto en docs

| Doc | Cambio |
|---|---|
| `docs/spydefi/arch/02-bounded-contexts.md` | Añadir área `telegram-kol/` con sub-BCs `identity`, `ingestion`, `reputation`, `source`, `stats`. Renombrar BC 14. Renombrar BC 12 (`telegram/publishing`) → `telegram-publishing/` flat. |
| `docs/spydefi/arch/08-file-structure.md` | Listar `telegram-kol/` y `telegram-publishing/` como áreas top-level. Documentar la excepción: un solo BC puede vivir flat si describe transporte + dominio (ej. `telegram-publishing/`). |
| `docs/spydefi/arch/12-spydefi-core-overview.md` | Renombrar BC 14. Mover BC 12 a su nueva entrada. |
| `docs/spydefi/arch/13-recipe-extract-core.md` | Marcar como N/A: herramienta interna, no se extrae. |
| `README.md` raíz | Si menciona "telegram channels" o "channel reputation", apuntar a `src/telegram-kol/`. Si menciona "telegram publishing", apuntar a `src/telegram-publishing/`. |

---

## 9. Riesgos y preguntas abiertas

### Riesgos
1. **Tiempo de build + tests durante la transición.** Mientras convivan las dos rutas (vieja + nueva) hay doble compilación. Mitigación: `index.ts` deprecado que reexporta, no copia.
2. **Migraciones SQL pesadas.** Las dos renames de tabla (`telegram_channels`, `channel_reputation_stats`) requieren migración. Como es herramienta interna con DB propia, downtime está OK si hace falta.
3. **`telegram-kol/stats` (stub) podría diseñarse de más.** Riesgo de caer en el "diseñar antes de tener datos". **Mitigación:** empezar con 2-3 endpoints read-only sacados de `kol/reputation` + `token/call-tracking`, refinar con uso real.
4. **Cross-area `token/*` → `telegram-kol/*`.** Hoy ya pasa (`scoring → channel-reputation`). Formalizar en los docs que el área `token` puede consumir puertos del área `telegram-kol`, pero no viceversa.

### Preguntas abiertas (a resolver antes de Fase 1)
1. **¿La identidad del KOL debe ser multi-transporte desde día 1?** Hoy solo Telegram. Si mañana se quiere añadir Discord, ¿se crea `discord-kol/` separado (propuesta actual) o se sube `kol/` como umbrella con `telegram-kol/`, `discord-kol/` dentro? **Propuesta:** v1 single-transport (`telegram-kol/`). Si crece, umbrella `kol/` con sub-áreas por transporte.
2. **¿`Kol` vive en `telegram-kol/identity` o como agregado aparte?** Propuesta: dentro de `telegram-kol/identity` por simplicidad. Si crece (perfiles públicos, settings), se separa.
3. **¿`Source` queda en `telegram-kol/source` o se queda en `token/normalization`?** El VO `Source` describe "este token fue mencionado por X KOL en el mensaje Y" — es un dato de normalización, no de KOL. Trade-off: si va a `telegram-kol/source`, `token/normalization` consume un puerto de `telegram-kol` (cross-area pero OK). Si se queda, hay que renombrar `channelId` → `kolId` in-situ. **Propuesta:** mover a `telegram-kol/source` para forzar que `token/normalization` declare explícitamente que necesita un `kolId` via port, no por string suelto.

---

## 10. El bucle de autoaprendizaje (cómo encaja después del refactor)

Estado actual (parcial, disperso):

```
[telegram/ingestion] --(MessageIngested)--> [token/intake/*] --> ... --> [token/scoring]
                                                                       │
                                                                       ▼
                                            [DefaultChannelReputationAdapter] --lee--> [token/channel-reputation]
                                                                       │                       ▲
                                                                       ▼                       │
                                                                  [multiplier 0.85x..1.15x]   │
                                                                                              │
[telegram/ingestion] --(CallPublished)--> [token/call-tracking] --> [EvaluateCallPerformanceUseCase]
                                                                              │
                                                                              ▼
                                                              [recomputeStats] --actualiza--> [token/channel-reputation]
```

Estado objetivo (con `telegram-kol/*`):

```
[telegram-kol/ingestion] --(KolMessageIngested)--> [token/intake/*] --> ... --> [token/scoring]
                                                                              │
                                                                              ▼
                                            [DefaultKolReputationAdapter] --lee--> [telegram-kol/reputation]
                                                                              │                       ▲
                                                                              ▼                       │
                                                                          [multiplier]                 │
                                                                                                      │
[telegram-kol/ingestion] --(CallPublished)--> [token/call-tracking] --> [EvaluateCallPerformanceUseCase]
                                                                              │
                                                                              ▼
                                                              [recomputeKolReputation] --actualiza--> [telegram-kol/reputation]
                                                                                                                │
                                                                                                                ▼
                                                                                                    [telegram-kol/stats]
                                                                                                                │
                                                                                                                ▼
                                                                                              [leaderboards, ROI trends]
                                                                                                                │
                                                                                                                ▼
                                                                                                      [dashboard interno]
                                                                                                                │
                                                                                                                ▼
                                                                          [decisión humana: activar/dormir/blacklist KOL]
                                                                                                                │
                                                                                                                ▼
                                                                                          [telegram-kol/identity.Kol.lifecycle_status]
```

Lo que el refactor habilita:
- `telegram-kol/reputation` como **única** fuente de verdad de "qué tan bueno es este KOL" (hoy disperso).
- `telegram-kol/stats` como observabilidad del loop (hoy no existe; hoy hay que ir a la DB a mano).
- El ciclo de decisión humana (activar/dormir/blacklist) sobre datos que ya están consolidados.

Lo que **no** entra en este refactor (se hace fuera, cuando haya uso real):
- Loop de auto-activación/dormancia automático (sin decisión humana).
- "Gem ranking" como BC separado — por ahora se calcula ad-hoc sobre `telegram-kol/reputation` + `token/scoring`.

---

## 11. Checklist pre-Fase 1

- [ ] Este doc revisado y firmado.
- [ ] Branch `kol-refactor/fase-0-docs` creado.
- [ ] PR con los cambios de docs/spydefi/arch mergeado.
- [ ] Decisión sobre las 3 preguntas abiertas de §9.
- [ ] Estimación de tiempo para Fase 1 (esperado: 2-4 días con review).

---

## Apéndice A — Mapping rápido desde la pregunta inicial

> "channel" + "telegram" + "kol" + "source" + "ingestion" + "reputation" → `src/telegram-kol/*`

| Término | Sub-BC resultante |
|---|---|
| channel | `telegram-kol/identity` |
| telegram (MTProto, input) | `telegram-kol/ingestion` (sub-adapter) |
| telegram (MTProto, output) | `telegram-publishing/` (flat, separado) |
| kol (herramienta interna) | transversal al área `telegram-kol/` |
| source | `telegram-kol/source` |
| ingestion | `telegram-kol/ingestion` |
| reputation | `telegram-kol/reputation` ← corazón del autoaprendizaje |
| (no en la pregunta, pero emerge del objetivo) | `telegram-kol/stats` ← dashboard interno |

## Apéndice B — Lo que la herramienta es y no es

### Es
- **Herramienta interna** (un solo usuario/equipo).
- **Pipeline**: ingest → extract → score → track → reputation → stats.
- **Output**: dashboard interno con leaderboard de KOLs, top calls, ROI trends; la decisión de "qué gema comprar" se toma afuera (humano + el dashboard).

### No es
- **Producto** a vender (no hay clientes, no hay pricing, no hay KOL bot externo, no hay verify, no hay premium).
- **API pública** (no hay auth, no hay rate limiting, no hay docs de developer).
- **Red social** (no hay achievements públicos, no hay posts en feed, no hay kudos).
- **Servicio de terceros** (no hay Verify bidireccional, no hay Notify a KOLs, no hay KOL Club).
- **Auto-pilot de trading** (no compra/vende tokens automáticamente; el humano decide con el dashboard).

Las BCs de `docs/spydefi/spydefi-for-kols/*` (achievements, verify, kol-bot, notify, moments, calls-of-the-week, kol-club, premium) **no se incluyen** en este refactor.

---

## Apéndice C — Sweep consolidado de `channel` → `kol` (Fase 4 + 7 + barrido final)

Barrido de palabras clave: `channel`, `kol`, `reputation`, `telegram`, `ingestion`, `mtproto`. Resultado del grep previo a Fase 4 (junio 2026):

### Backend — 251 ocurrencias de `channelId` / `ChannelId` repartidas en:

| Área / BC | Archivos afectados | Renombre a aplicar |
|---|---|---|
| `telegram/ingestion/` (mover) | 7 archivos: `telegram-mtproto.adapter.ts`, `start-listening.use-case.ts`, `message-ingested.event.ts`, `telegram-listener.port.ts`, `telegram-ingestion.module.ts`, `in-process-telegram-event.publisher.ts`, `start-listening.input.ts` | Mover todo a `telegram-kol/ingestion/`. Renombrar `MessageIngestedEvent` → `KolMessageIngestedEvent`, `TelegramListenerPort` → `KolListenerPort`, `TelegramEventPublisher` → `KolEventPublisher`, `StartListeningUseCase` → `StartKolIngestionUseCase`. `channelId` → `kolId` en payloads. |
| `telegram/publishing/` (flatten) | 8 archivos: controller, mappers, ports, use cases, sender client | Mover todo a `telegram-publishing/` flat. |
| `token/intake/extraction/` | 14 archivos: entity, repository, mapper, use cases, controller, adapter, event handler | `channelId` → `kolId` en entidad + repos + mappers + controllers + DTOs + event handler. DB column `channel_id` → `kol_id`. |
| `token/intake/parsing/` | 11 archivos: entity, repository, mapper, use cases, controller, event handler | Idem. |
| `token/call-tracking/` | 15 archivos: entity, repository, mapper, use cases, controller, event handler | Idem. `ChannelId` ya no existe como VO, era string suelto. |
| `token/normalization/` | 9 archivos: entity, repository, mapper, use case, event handler | Idem. DB entity JSONB field `channelId` → `kolId`. |

### Backend — renombres de clases / eventos

| Antes | Después |
|---|---|
| `MessageIngestedEvent` (en `telegram/ingestion/`) | `KolMessageIngestedEvent` (en `telegram-kol/ingestion/`) |
| `TelegramListenerPort` | `KolListenerPort` |
| `TelegramEventPublisher` | `KolEventPublisher` |
| `InProcessTelegramEventPublisher` | `InProcessKolEventPublisher` |
| `StartListeningUseCase` | `StartKolIngestionUseCase` |
| `TelegramMtprotoAdapter` | `KolTelegramMtprotoAdapter` (mantiene "telegram" porque el adapter implementa el cliente MTProto de Telegram; "kol" porque es owned por `telegram-kol/ingestion/`) |
| `OutputChannel` VO | `OutputBotChannel` (el "channel" en publishing es el canal de output del bot, no un KOL) |
| `outputChannelResolver` adapter | `outputBotChannelResolver` |

### Frontend — barrido completo

| Archivo | Cambio |
|---|---|
| `shared/realtime/events.ts` | `channelId` → `kolId` en 3 interfaces (espejo del backend renombrado en Fase 4). |
| `features/replay-message/api/replay-client.ts` | `ReplayInput.channelId` → `ReplayInput.kolId`, `ExtractionResultView.channelId` → `ExtractionResultView.kolId`. Serialización JSON del backend usa `channelId` en su DTO (no se cambia hasta que Fase 4+ renombre el `extract.input.ts`). Se mapea en cliente. |
| `features/replay-message/ui/replay-form.tsx` | Estado local `channelId` → `kolId`. Label "Channel ID" → "KOL ID". |

### Columnas DB renombradas

| Tabla | Columna antes | Columna después |
|---|---|---|
| `kols` (nueva) | (ya existía de Fase 1) | OK |
| `kol_reputations` (nueva) | (ya existía de Fase 2) | OK |
| `extraction_results` | `channel_id` | `kol_id` |
| `token_calls` | `channel_id` | `kol_id` |
| `call_performances` | `channel_id` | `kol_id` |
| `call_evaluation_jobs` | `channel_id` | `kol_id` |
| `canonical_token_calls` (JSONB) | `sources[].channelId` | `sources[].kolId` |
| `published_calls` | `output_channel_ids` (output, no KOL) | mantener — no es KOL |

Con `synchronize: true` en `.env` (default), TypeORM hace los ALTERs automáticamente al próximo arranque. Para producción con datos: backup antes.

### Convención final (consolidada para nuevos lectores)

| Concepto | Naming |
|---|---|
| Identidad de KOL | `Kol`, `KolId`, `KolHandle` |
| Reputación del KOL | `KolReputation`, `KolReputationSummary` (proyección lightweight), `KolConfidence` |
| Atribución de mención a KOL | `Source` con `kolId` |
| Ingesta de mensajes desde KOLs | `KolListenerPort`, `KolMessageIngestedEvent`, `StartKolIngestionUseCase` |
| Transport (Telegram MTProto) | `KolTelegramMtprotoAdapter`, `telegram-mtproto` como nombre de carpeta (sigue siendo Telegram) |
| Output del bot (canales SpyDefi, no KOLs) | `OutputBotChannel`, `telegram-publishing/` flat, `outputBotChannelResolver` |
| Estados del KOL | `KolLifecycleStatus` = `ACTIVE` / `DORMANT` / `BLACKLISTED` |
| Confianza de la reputación | `KolConfidence` = `LOW` / `MEDIUM` / `HIGH` / `VERY_HIGH` |

### Plan de ejecución del barrido (lo que se ejecuta en esta tanda)

1. **Fase 4** — Mover `telegram/ingestion/` → `telegram-kol/ingestion/`. Renombrar `MessageIngestedEvent`, `TelegramListenerPort`, `TelegramEventPublisher`, `StartListeningUseCase`. Eliminar `src/telegram/ingestion/` viejo.
2. **Fase 7** — Mover `telegram/publishing/` → `telegram-publishing/` flat. Eliminar `src/telegram/` vacío.
3. **Barrido backend** — Renombrar `channelId` → `kolId` en `token/intake/extraction`, `token/intake/parsing`, `token/call-tracking`, `token/normalization` (entidades, repos, mappers, use cases, controllers, event handlers, DTOs). Renombrar columna DB `channel_id` → `kol_id`.
4. **Barrido frontend** — Renombrar `channelId` → `kolId` en `shared/realtime/events.ts`, `features/replay-message/*`.
5. **Verificación** — `npm run build` + `npm test` (backend 280 tests deben seguir verdes).

### Riesgos

1. **DB column rename con datos existentes**: `synchronize: true` en dev dropea/recrea columnas. Backup antes.
2. **WebSocket event payload**: el cambio `channelId` → `kolId` rompe clientes WS existentes. Se asume que no hay clientes WS desplegados aún (herramienta interna nueva).
3. **`MessageIngestedEvent` rename**: cualquier handler que escuche `telegram.message.ingested` debe actualizarse al mismo nombre del evento. Listo en el barrido.

