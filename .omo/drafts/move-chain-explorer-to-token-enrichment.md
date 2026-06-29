# Draft: Move chain/explorer → token/enrichment

## Intent
CLEAR — mover todo el BC `chain/explorer` a `token/enrichment`. El nombre `enrichment` describe el proceso del BC (enriquecer tokens con market data), no solo el artifacto (snapshot). Escala a futuros casos de uso (bots, dashboards, batch jobs) que necesiten enrichment sin necesariamente crear un snapshot de call.

## Decisiones
- **Destino**: `apps/backend/src/token/enrichment/`
- **Nombre módulo**: `EnrichmentModule` (antes `ChainExplorerModule`)
- **Archivo módulo**: `enrichment.module.ts` (antes `chain-explorer.module.ts`)
- **Archivo tokens**: `enrichment.tokens.ts` (antes `chain-explorer.tokens.ts`)
- **TokenImage**: se mueve junto con el BC (incluido en `token/enrichment/`)
- **Controller paths**: `token/market-data` se mantiene igual (no romper frontend)
- **Event names**: `enrichment.token.*` se mantiene igual
- **DI token**: `MARKET_DATA_PROVIDERS` se mantiene igual
- **Naming interno**: `TokenSnapshot`, `TokenSnapshotRepository`, `TokenSnapshotMapper` se quedan como están (son el artifacto del proceso de enrichment)

## Topología

### C1 — Filesystem: mover archivos
~25 archivos de `chain/explorer/` → `token/enrichment/` (estructura hexagonal idéntica).

### C2 — Imports internos
Bulk replace `chain/explorer` → `token/enrichment` en archivos movidos.

### C3 — Imports externos
~17 archivos en 6 BCs. Bulk replace + renombrar referencias al módulo.

### C4 — Renombrar módulo
`ChainExplorerModule` → `EnrichmentModule` en clases + archivos.

### C5 — Verificación
Build + tests + curl.

## Archivos a mover (~25)
Ídem al draft anterior, pero reemplazando `token/snapshot` → `token/enrichment`.

## Archivos a modificar (imports externos — 17 archivos)
Ídem al draft anterior.

## Estado
`status: awaiting-approval` — el usuario ya aprobó la dirección general.
