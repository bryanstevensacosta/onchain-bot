# mega-refactor-market-data - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Una app nueva `market-data` que centraliza todos los datos onchain/offchain con SLO medido, más el renombre del legacy que hoy colisiona con su nombre.

**Why this approach:** Va último porque los Tramos 1-2 ya consumen enrichment vía ports con flag; este tramo solo cambia el default a HTTP y mueve los providers físicamente. Variante A monorepo (no repo Nx separado) para no multiplicar la operación.

**What it will NOT do:** No crea repo separado, no mueve providers antes de tiempo, no rompe consumers legacy sin flag.

**Effort:** Medium (10 todos)
**Risk:** Medium - p95<500ms debe medirse antes del default-true
**Decisions I made for you:** Variante A v1 + B gateada a futuro; tripleta 4000/4001/4002; renombre `/token/enrichment` con redirect temporal.

Your next move: approve — listo para $start-work Tramo 3 tras Gate T2. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, Medium risk (p95-gated), market-data Variante A + provider extraction

## Scope

### Must have

- Nueva app `apps/market-data/` (:4000/4001/4002) **Variante A BC único como v1** (override explícito del repo-separado-Nx del spec: mapear cada `libs/*` → `src/*` del tree; G-16). Módulos: token, chain, provider, cache, rate-limiter, shared. Variante B como fase posterior gateada (nº consumers o p95).
- Extracción FÍSICA de providers (C-DATA-01, último movimiento): 13 data-providers + Dexter (`chain-dexter-bot` gap-7) → adapters `token/infrastructure/providers/`.
- Lado servidor del puente: `MarketDataPort` HTTP con SLO p95<500ms; vuelve default `USE_DATA_SERVICE_API=true` por env (G-17).
- Renombre legacy R-4/G-18: `/token/market-data/*` → `/token/enrichment` + desambiguación `MarketDataProviderPort` + migración frontend (C-UX-01).
- App hermana `apps/dexter-onchain-bot/` (P13, fase final del tramo): solo lógica bot Telegram alimentada por market-data HTTP; `/start` + `/ca` + detección pelada + extracción forwards; reutiliza router/pipeline/formatter/trade-buttons/settings de `chain-dexter-bot`; token `DEXTER_BOT_TOKEN`; puertos 4060/4061/4062 (verificar lsof); DB propia `onchain_bot_dexter[_staging]`.
- Staging 7 días + cutover + cleanup.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO repo separado ni Nx (v1 es monorepo). NO mover providers antes de Tramos 1-2 validados (C-DATA-01 orden).
- NO romper consumers legacy (`enrich-token`, Dexter, tracking) antes de su flag. NO cutover sin Gate T3.

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + Jest + e2e (batch + p95) + k6/load opcional para SLO.
- Evidence: .omo/evidence/task-<N>-mega-refactor-market-data.<ext>

## Execution strategy

### Parallel execution waves

> Wave 1: setup+shared+mapeo libs→src. Wave 2: token+chain+provider+cache/rate-limiter. Wave 3: extracción providers + puente HTTP + renombre legacy + frontend. Wave 4: staging/cutover market-data (todo 8). Wave 5: dexter-onchain-bot (todo 9, tras market estable). Precondition wave 0: T1+T2 validados.

### Dependency matrix

| Todo                            | Depends on           | Blocks | Can parallelize with                       |
| ------------------------------- | -------------------- | ------ | ------------------------------------------ |
| 0 (precondition T2)             | central gates T1, T2 | 1-9    | —                                          |
| 1 (setup+shared)                | 0, central 2,3       | 2, 3   | —                                          |
| 2 (chain/provider/cache)        | 1                    | 4      | con nada (base de token/)                  |
| 3 (token)                       | 1                    | 4      | ∥ 2 (módulos independientes, mismo wave)   |
| 4 (extracción)                  | 2, 3                 | 8      | —                                          |
| 5-7 (puente+renombre+frontend)  | 4                    | 8      | 5 ∥ 6 ∥ 7                                  |
| 8 (staging+cutover market-data) | 5, 6, 7              | 9      | —                                          |
| 9 (dexter app, fase final)      | 5, 8                 | —      | — (cierra programa; alternativa T4 a veto) |

## Todos

> Implementation + Test = ONE todo. Never separate.
> Contrato central pinneado: C-\* v2026-09-24 (central 4b0c643f) — C-DATA-01, C-FLAGS-01, C-PORTS-01, C-DB-01, C-UX-01. Spec base: `.kiro/specs/refactor-data/` (leer como REQUISITOS, no como topología: la topología v1 es monorepo Variante A de este plan, G-16).

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 0. Precondition: Gates T1/T2 C4-bis (deprecation-check + green) + mapeo libs→src (G-16)
     What to do / Must NOT do: Verificar Gates T1/T2 C4-bis en evidencia: (a) deprecation-check — legacy KOL (T1) y crypto-news (T2) con `@deprecated` + JSDoc (nueva ruta + refactor target); (b) suites T1/T2 en verde; staging (48h T1, 7d T2) es validación y NO se exige completo para arrancar (C4-bis.4). Escribir tabla mapeo `libs/*` del spec → `src/*` del tree (providers→`token/infrastructure/providers`, aggregators→`token/application/services`, cache/rate-limiter→módulos, shared-kernel→`shared/`); sellar Variante B como fase posterior con gate (nº consumers o p95). Must NOT arrancar sin deprecation-checks + green T1/T2.
     Parallelization: Wave 0 | Blocked by: central gates T1, T2 (deprecation-check + green) | Blocks: 1-9
     References: .kiro/specs/refactor-data/naming-and-architecture.md:421-582 (Variante B a mapear); .omo/reference/mega-refactor-target-tree.md (bloque market-data); plan central Gate T2 C4-bis + FINAL REVIEW; .omo/drafts/mega-refactor-tramos.md §10 (C4-bis)
     Acceptance criteria: deprecation-checks T1/T2 verdes + suites verdes en evidencia + tabla mapeo sin `libs/*` sin destino + gate B escrito
     QA scenarios: happy deprecation-checks + mapeo 1:1; failure lib sin destino → pedir veto, NO inventar módulo. Evidence .omo/evidence/task-0-mega-refactor-market-data.log
     Commit: N | — | —
- [ ] 1. App setup + shared kernel (Variante A)
     What to do / Must NOT do: `apps/market-data/` (package, nest-cli, tsconfig, `src/main.ts` :4000, `app.module.ts` 6 imports, `.env.example`, compose dev con DB `onchain_bot_market_data`, `/api/health`) + `src/shared/{kernel,value-objects/chain-id+token-id,guards/api-key}`. Tests base. Must NOT multi-app (eso es Variante B futura).
     Parallelization: Wave 1 | Blocked by: 0 | Blocks: 3, 4
     References: .kiro/specs/refactor-data/naming-and-architecture.md:244-400 (Variante A literal, renombrar dir); plan central C-DB-01/C-PORTS-01
     Acceptance criteria: `curl -s localhost:4000/api/health | grep -q '"status":"ok"'`
     QA scenarios: happy boot; failure clash :4000 → fallback C-PORTS-01. Evidence .omo/evidence/task-1-mega-refactor-market-data.log
     Commit: Y | feat(market-data): setup Variante A
- [ ] 2. Módulos chain + provider + cache + rate-limiter
     What to do / Must NOT do: `chain/` (catálogo estático + probers EVM/Solana + `detect-chain`), `provider/` (health/latency/rate-limit + `/api/v1/providers`), `cache/` (Redis+memory+interceptor), `rate-limiter/` (sliding window + circuit breaker). Tests por módulo. Must NOT tocar token/ aún.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 5
     References: .kiro/specs/refactor-data/naming-and-architecture.md:309-400; apps/backend/src/chain (origen probers); apps/backend/src/token/enrichment (origen chain-specific)
     Acceptance criteria: `curl -s localhost:4000/api/v1/chains | jq length` > 0 + suites verdes
     QA scenarios: happy detect EVM+Solana; failure RPC caído → null + siguiente prober. Evidence .omo/evidence/task-2-mega-refactor-market-data.log
     Commit: Y | feat(market-data): chain, provider, cache y rate-limiter
- [ ] 3. Módulo token: agregado + aggregators + HTTP (Variante A §token)
     What to do / Must NOT do: `TokenSnapshot` + VOs + eventos + ports; `Price/Holders/SecurityAggregators` (cascadas DexS→Gecko→CG, Gecko→Helius/Moralis→Alchemy, Rugcheck+Birdeye+heuristics) con rate-limit pre-call; `AggregateTokenData` (`Promise.allSettled` + persist + `publishAll(commitEvents())`); REST `GET /api/v1/tokens/:chain/:address` + batch. Tests cascada + invariantes (price>0).
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5
     References: .kiro/specs/refactor-data/naming-and-architecture.md:260-308,605-932 (código ejemplo port+adapter+service+use-case); apps/backend/src/data-provider/ (13 adapters origen)
     Acceptance criteria: `curl -s 'localhost:4000/api/v1/tokens/solana/<addr-fixture>' | jq .priceUsd` > 0
     QA scenarios: happy agregado multi-source; failure todos providers vacíos → error explícito (NO null silencioso al cliente). Evidence .omo/evidence/task-3-mega-refactor-market-data.log
     Commit: Y | feat(market-data): módulo token con aggregators
- [ ] 4. Extracción física providers + Dexter (C-DATA-01, último movimiento)
     What to do / Must NOT do: Mover con `lsp_find_references` primero: 13 adapters `data-provider/` → `token/infrastructure/providers/` + `chain-dexter-bot` (gap-7) → consumers de market-data (bot standalone según spec data o integrado — default integrado, a veto); backend pasa a consumir vía HTTP. Tests: consumers legacy verdes contra HTTP.
     Parallelization: Wave 3 | Blocked by: 2, 3 | Blocks: 8
     References: plan central C-DATA-01; apps/backend/src/data-provider/ (13); apps/backend/src/telegram/chain-dexter-bot/; .kiro/specs/refactor-data/overview.md (bot Dexter)
     Acceptance criteria: `grep -rn "from 'data-provider" apps/backend/src | wc -l` = 0; `npm run test:backend -- token/enrichment` verde
     QA scenarios: happy enrich vía HTTP igual resultado; failure market-data caído → fallback cascada local (flag) + alerta. Evidence .omo/evidence/task-4-mega-refactor-market-data.log
     Commit: Y | feat(market-data)!: extracción física de providers
- [ ] 5. Puente HTTP + SLO + flag default (G-17)
     What to do / Must NOT do: Servidor cumple SLO p95<500ms (cache + batch); `USE_DATA_SERVICE_API=true` default por env de forma escalonada (dev→staging→prod); T1/T2 cambian su `MarketDataPort` a HTTP como default con fallback local. Medición p95 con carga realista. Tests SLO.
     Parallelization: Wave 3 | Blocked by: 4 | Blocks: 8
     References: .kiro/specs/refactor-data/overview.md:1295-1321 (flag + SLO); planes T1 todo 8 / T2 (port dual ya implementado)
     Acceptance criteria: p95 medido <500ms en evidencia + `curl` batch 50 tokens OK
     QA scenarios: happy p95; failure p95>500ms → NO default true, optimizar cache. Evidence .omo/evidence/task-5-mega-refactor-market-data.log
     Commit: Y | feat(market-data): puente HTTP con SLO y flag
- [ ] 6. Renombre legacy market-data + migración frontend (R-4, G-18)
     What to do / Must NOT do: Backend `/token/market-data/*` → `/token/enrichment` (con redirect temporal 307 una versión); `MarketDataProviderPort` → alias claro (`LegacyEnrichmentPort` o rename, a veto worker con justificación); frontend `endpoints.ts:37-40` + README/AGENTS menciones; C-UX-01 actualizado. Tests frontend verdes.
     Parallelization: Wave 3 | Blocked by: 4 | Blocks: 8
     References: .omo/drafts/mega-refactor-tramos.md:103-104 (R-4); apps/frontend/src/shared/api/endpoints.ts:37-40; apps/backend/src/token/enrichment/api/http/enrichment.controller.ts:8
     Acceptance criteria: `grep -rn "token/market-data" apps/frontend/src apps/backend/src --include="*.ts" | grep -v redirect` vacío + `test:frontend` verde
     QA scenarios: happy redirect 307 funciona; failure link roto → Playwright lo caza. Evidence .omo/evidence/task-6-mega-refactor-market-data.log
     Commit: Y | refactor(market-data): renombre legacy y migración frontend
- [ ] 7. Frontend: dashboard data + Dexter (C-UX-01)
     What to do / Must NOT do: Vistas consumo `:4000/4001/4002` (snapshots, chains, providers) + Dexter (`/x`, `/c`) contra market-data; proxies vite/nginx; polling TanStack. Playwright flujos.
     Parallelization: Wave 3 | Blocked by: 5, 6 | Blocks: 8
     References: plan central C-UX-01 sub-tabla T3; apps/frontend/src/shared/api/endpoints.ts
     Acceptance criteria: `npx playwright test -g "market-data"` verde
     QA scenarios: happy snapshot render; failure API caída → empty-state. Evidence .omo/evidence/task-7-mega-refactor-market-data.log + capturas
     Commit: Y | feat(frontend): dashboard market-data
- [ ] 8. Staging 7d + cutover + cleanup Tramo 3
     What to do / Must NOT do: Staging 7 días (:4001), rehearsal rollback, cutover `USE_DATA_SERVICE_API=true` dev→staging→prod, monitor p95/error; tras OK: borrar `data-provider/` + legacy backend (excepto `chain-dexter-bot/`, que extrae el todo 9 antes de su borrado), archivar tablas si aplica, deprecation headers. Cierra programa (Gate T3 central).
     Parallelization: Wave 4 | Blocked by: 5, 6, 7 | Blocks: 9
     References: .kiro/specs/refactor-data/overview.md (fases migración); plan central Gate T3
     Acceptance criteria: `ls apps/backend/src/data-provider 2>/dev/null` vacío + p95 prod <500ms 24h
     QA scenarios: happy cutover sin degradación; failure → rollback + medición. Evidence .omo/evidence/task-8-mega-refactor-market-data.log
     Commit: Y | feat(market-data)!: cutover y cleanup providers backend
- [ ] 9. App dexter-onchain-bot: extracción + cutover (P13, fase final)
     What to do / Must NOT do: `apps/dexter-onchain-bot/` (`package`, nest-cli, tsconfig, `src/main.ts` :4060 dev/:4061 staging/:4062 prod — verificar `lsof` C-PORTS-01, compose con DB `<base>_dexter[_staging]`, `/api/health`); mover desde `chain-dexter-bot/`: `CommandRouterService` + comandos (`/start` reescrito: info+uso lookup, `/ca <contrato>`, resto `/x /z /c /cc /tb /settings` heredados) + `TokenScanPipeline.resolve` + formatter + `TradeButtonRegistry` + settings por chat + poller/webhook; NUEVO: detector de address pelada (sin slash) + extractor de forwards/cualquier-texto (parse→normalize vía market-data, wallet/token/exchange/agregador); ficha Rendida por market-data HTTP (puente todo 5 default-true); token `DEXTER_BOT_TOKEN` (migra `CHAIN_DEXTER_BOT_TOKEN`, env + `.env.example`); rate-limit por usuario. Tests: /start, /ca, pelado, forward-ok, forward-vacío, settings. Must NOT publicar en canales (lookup ≠ publishing) ni lógica de scoring/tracking (eso es kol-system).
     Parallelization: Wave 5 | Blocked by: 5, 8 | Blocks: — (cierra programa)
     References: .omo/drafts/mega-refactor-tramos.md (P13, P12-bis); apps/backend/src/telegram/chain-dexter-bot/ (origen completo: bot.config.ts, command-router.service.ts:22-89, commands/, token-scan.pipeline, message-formatter.adapter, trade-button-registry.ts:91-187, update-poller.service.ts:27-61, chat-settings.service); plan central C-BOTS-01/C-PORTS-01/C-DB-01 (entradas dexter)
     Acceptance criteria: `curl -s localhost:4060/api/health | grep -q '"status":"ok"'` + `npx jest apps/dexter-onchain-bot` verde (5 casos) + e2e `/start` responde ayuda y `/ca <fixture>` devuelve ficha con trade buttons
     QA scenarios: happy ficha <5s con botones; failure market-data caído → mensaje explícito (sin ficha parcial silenciosa); failure token ausente → bot inactivo con warn, app sigue. Evidence .omo/evidence/task-9-mega-refactor-market-data.log
     Commit: Y | feat(dexter-onchain-bot): extracción bot lookup y cutover

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

Un commit por todo (feat(market-data): …). Extracción providers con `!`. Push a la rama; PR a `dev` al Gate T3 (cierra programa).

## Success criteria

- `apps/market-data/` en prod con `USE_DATA_SERVICE_API=true` por defecto y p95<500ms 24h.
- Backend sin `data-provider/` ni `chain-dexter-bot`; legacy renombrado; dexter-onchain-bot en prod; programa completo.
