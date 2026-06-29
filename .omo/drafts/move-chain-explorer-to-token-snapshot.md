# Draft: Move chain/explorer → token/snapshot

## Intent
CLEAR — mover todo el BC `chain/explorer` a `token/snapshot`. El nombre `snapshot` comunica el agregado raíz. El naming interno ("enrichment", "providers", etc.) se conserva dentro de los archivos.

## Decisiones acordadas
- **Destino**: `apps/backend/src/token/snapshot/`
- **Nombre módulo**: `SnapshotModule` (renombrar desde `ChainExplorerModule`)
- **TokenImage**: se mueve junto con el BC (incluido en `token/snapshot/`) — no vale la pena separarlo hoy
- **Controller paths**: `token/market-data` se mantiene igual (no romper frontend)
- **Event names**: `enrichment.token.*` se mantiene igual (no romper handlers downstream)
- **DI token**: `MARKET_DATA_PROVIDERS` se mantiene igual

## Topología (componentes)

### C1 — Filesystem: mover archivos
- ~25 archivos de `chain/explorer/` → `token/snapshot/`
- Mantener misma estructura hexagonal (domain/application/infrastructure/api)
- Incluir TokenImage (controllers, service, fetcher, cache)
- Dependencias: ninguna — git mv puro

### C2 — Imports internos (self-references)
- Los archivos dentro del BC se importan entre sí con `'chain/explorer/...'`
- Bulk reemplazar `chain/explorer` → `token/snapshot` en todos los archivos movidos
- Dependencias: C1 (los archivos deben estar en su nueva ubicación primero)

### C3 — Imports externos (17 archivos, 6 BCs)
- 3 módulos importan `ChainExplorerModule`: `app.module`, `chain-dexter-bot.module`, `vip-calls.module`
- 36 archivos importan símbolos de `chain/explorer` (66 ocurrencias)
- Bulk reemplazar en archivos NO movidos

### C4 — Renombrar módulo `ChainExplorerModule` → `SnapshotModule`
- Actualizar `class ChainExplorerModule` → `SnapshotModule`
- Actualizar imports en `app.module.ts`, `chain-dexter-bot.module.ts`, `vip-calls.module.ts`
- Actualizar exports (quien importe el módulo por nombre)

### C5 — Renombrar controller class (opcional)
- `EnrichmentController` puede quedarse o renombrarse a `SnapshotController` — decisión menor
- Propuesta: mantener `EnrichmentController` (no rompe nada, no aporta valor renombrar)

### C6 — Verificar build + tests
- Backend compila sin errores (`npm run build`)
- Tests pasan (`npm test`)
- Endpoints responden 200

## Archivos a mover (~25)

```
chain/explorer/
├── api/http/
│   ├── enrichment.controller.ts           → token/snapshot/api/http/
│   └── token-image.controller.ts          → token/snapshot/api/http/
├── application/
│   ├── handlers/
│   │   ├── enrich-token.use-case.ts       → token/snapshot/application/handlers/
│   │   ├── get-snapshot.use-case.ts       → token/snapshot/application/handlers/
│   │   └── list-snapshots.use-case.ts     → token/snapshot/application/handlers/
│   ├── mappers/token-snapshot.mapper.ts   → token/snapshot/application/mappers/
│   ├── services/token-image.service.ts    → token/snapshot/application/services/
│   └── ports/
│       ├── token-snapshot.repository.ts   → token/snapshot/application/ports/
│       ├── enrichment-event.publisher.ts  → token/snapshot/application/ports/
│       └── token-image.fetcher.ts         → token/snapshot/application/ports/
├── domain/
│   ├── entities/token-snapshot.entity.ts  → token/snapshot/domain/entities/
│   ├── entities/token-snapshot.entity.spec.ts → token/snapshot/domain/entities/
│   ├── events/
│   │   ├── token-enriched.event.ts        → token/snapshot/domain/events/
│   │   └── enrichment-failed.event.ts     → token/snapshot/domain/events/
│   ├── ports/market-data-provider.port.ts → token/snapshot/domain/ports/
│   └── value-objects/pair.vo.ts           → token/snapshot/domain/value-objects/
├── infrastructure/
│   ├── event-bus/call-normalized.handler.ts → token/snapshot/infrastructure/event-bus/
│   ├── messaging/in-process-enrichment-event.publisher.ts → token/snapshot/infrastructure/messaging/
│   ├── persistence/typeorm/
│   │   ├── entities/token-snapshot.entity.ts → token/snapshot/infrastructure/persistence/typeorm/entities/
│   │   ├── mappers/token-snapshot.mapper.ts → token/snapshot/infrastructure/persistence/typeorm/mappers/
│   │   └── repositories/typeorm-token-snapshot.repository.ts → token/snapshot/...
│   ├── providers/  ← 10 archivos → token/snapshot/infrastructure/providers/
│   ├── repositories/in-memory-token-snapshot.repository.ts → token/snapshot/...
│   └── fetchers/token-image.fetcher.ts    → token/snapshot/infrastructure/fetchers/
├── chain-explorer.module.ts               → token/snapshot/snapshot.module.ts
├── chain-explorer.tokens.ts               → token/snapshot/snapshot.tokens.ts
├── input/enrich-token.input.ts            → token/snapshot/api/input/
└── tests/ (spec files alongside source)
```

## Archivos a modificar (imports externos — 17 archivos)

- `apps/backend/src/app.module.ts` — import + module name
- `apps/backend/src/telegram/chain-dexter-bot/chain-dexter-bot.module.ts` — import module
- `apps/backend/src/telegram/chain-dexter-bot/application/token-scan.service.ts` — imports
- `apps/backend/src/telegram/chain-dexter-bot/application/handlers/token-scan.pipeline.ts` — imports
- `apps/backend/src/telegram/vip-calls-channel/vip-calls.module.ts` — import module
- `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/token-approved-publish.handler.ts` — import
- `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/*.spec.ts` (x6) — imports
- `apps/backend/src/token/token-gating/application/handlers/reprocess-rejected-token.use-case.ts` — imports
- `apps/backend/src/token/token-gating/application/handlers/verify-rejected-token.use-case.ts` — imports
- `apps/backend/src/token/token-gating/application/handlers/verify-rejected-token.use-case.spec.ts` — imports
- `apps/backend/src/token/classification/infrastructure/event-bus/token-enriched.handler.ts` — import
- `apps/backend/src/token/classification/infrastructure/event-bus/token-enriched.handler.spec.ts` — import
- `apps/backend/src/shared/common/persistence/database.module.ts` — import TypeORM entity
- `apps/backend/src/settings/application/services/settings-presets.service.ts` — probable import
- `apps/backend/src/dashboard/application/handlers/get-dashboard-kpis.use-case.ts` — probable import

## Estado
`status: awaiting-approval` → el usuario dijo "procede a crear el plan" (aprobación implícita de la dirección). Se genera el plan directamente.
