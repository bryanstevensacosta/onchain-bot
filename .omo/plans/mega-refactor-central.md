# mega-refactor-central - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Un índice que gobierna el mega-refactor: 3 tramos en orden (kol, content, market-data), 9 contratos con valores sellados y gates que impiden avanzar sin evidencia.

**Why this approach:** Sin un centro con contratos versionados, tres extracciones gigantes de un monolito colisionan (mismo `telegram/shared`, mismos providers, mismos puertos). El centro fija las reglas; los tramos solo ejecutan.

**What it will NOT do:** No escribe código producto ni duplica los todos de los tramos. No reabre lo sellado (orden, nombres, rama) sin tu veto.

**Effort:** Medium (8 todos de gobernanza, sin código)
**Risk:** Medium - un contrato mal sellado bloquea 3 tramos
**Decisions I made for you:** DBs mismo-servidor `<base>_<app>`; tripletas de puertos con verificación Oracle; `?type=kol` en vez de endpoints nuevos; staging 14 días para el Tramo 1; threads-stub 501; avatar servido por ingestion-telegram; bot-tokens cifrados. Vetos bienvenidos arriba.

Your next move: <fill - e.g. approve, or run a high-accuracy review>. Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

- Plan índice que gobierna el mega-refactor en 3 tramos delegados: Tramo 1 kol-system (`mega-refactor-kol-system.md`), Tramo 2 content-publisher (`mega-refactor-content-publisher.md`), Tramo 3 market-data (`mega-refactor-market-data.md`).
- 9 contratos versionados como única fuente (C-SHARED-01, C-DATA-01, C-PORTS-01, C-BOTS-01, C-DB-01, C-SSE-01, C-CI-01, C-FLAGS-01, C-UX-01) — los tramos los referencian, nunca los redefinen.
- Orden de ejecución kol-system → content-publisher → market-data con cadena de preconditions (T2←T1 staging, T3←T2 staging).
- Gates de tramo + checklist de cutover global. Rama `feat/mega-refactor-tramos`.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO duplica los todos de ningún tramo; solo links + contratos + orden + gates.
- NO toca código producto (`apps/*`, `scripts/*`); este plan solo produce/actualiza artefactos `.omo/` y decisiones de contrato.
- NO reabre decisiones selladas (orden, `apps/market-data`, rama) salvo veto explícito del usuario.
- NO permite que dos tramos toquen `telegram/shared` o `data-provider/` sin citar C-SHARED-01 / C-DATA-01.
- NO cutover sin staging validado + rollback ensayado (endurecido: Tramo 1 staging 14 días + shadow/dry-run por pilotar el money-path).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: none (governance plan, no product code) + agent-executed checks (shell: `git`, `lsof`, `curl`, `node scripts/*`)
- Evidence: .omo/evidence/task-<N>-mega-refactor-central.<ext>

## Execution strategy

### Parallel execution waves

> Central todos are gates + contract artifacts; code waves live in tramo plans. Tramo plans execute strictly in order T1 → T2 → T3 (D4); inside a tramo, follow its own waves.

### Dependency matrix

| Todo                        | Depends on | Blocks                       | Can parallelize with |
| --------------------------- | ---------- | ---------------------------- | -------------------- |
| 1 (P0)                      | —          | 2-8                          | —                    |
| 2 (C-DB-01), 3 (C-PORTS-01) | 1          | tramos (config/DB/puertos)   | 2 ∥ 3 ∥ 5            |
| 5 (C-SSE-01)                | 1          | T1-todo4, T2-todo2           | con 2, 3             |
| 4 (C-CI-01)                 | 2, 3       | gates (precondition cutover) | con 6, 7             |
| 6 (flags+bots+versionado)   | 1          | gates                        | con 4, 7             |
| 7 (C-UX-01)                 | 2, 3       | frontend todos               | con 4, 6             |
| 8 (gates+cutover)           | 4, 6, 7    | —                            | —                    |

## Tramos delegados (D2 — el central NO duplica sus todos)

> Versión contratos: C-\* v2026-09-24 (central 4b0c643f). Cada tramo pinnea esta versión al arrancar.
> | Tramo | Plan (path) | Spec origen | Precondition | Done-gate |
> | --- | --- | --- | --- | --- |
> | T1 kol-system | `.omo/plans/mega-refactor-kol-system.md` | `.kiro/specs/refactor-kol-system/` (pivot P1–P9 manda) | central todos 1-3,5-7 | Gate T1 (todo 8 central): staging 14d + shadow + rehearsal |
> | T2 content-publisher | `.omo/plans/mega-refactor-content-publisher.md` | `.kiro/specs/refactor-content-publisher/` | Gate T1 + checklist shared (T2-todo 0) | Gate T2: staging 7d + rehearsal 30min |
> | T3 market-data | `.omo/plans/mega-refactor-market-data.md` | `.kiro/specs/refactor-data/` (requisitos, no topología) | Gate T2 + mapeo libs→src (T3-todo 0) | Gate T3: p95<500ms 24h, cierra programa |

## Todos

> Implementation + Test = ONE todo. Never separate.
> Defaults adoptados (a veto, Metis G-01/G-02/G-09/G-10/G-11 + preguntas):
> DBs mismo-servidor-por-env `<base>_<app>` + `_staging` en twin (precedente `_ingestion`) · Puertos tripletas 3040/41/42, 3050/51/52, 4000/4001/4002, 4060/4061/4062 (dexter, propuesto P13, verificar con lsof) (worker verifica con lsof en Oracle; si clash, fallback a proxy) · Avatar lo sirve ingestion-telegram `/api/kol-avatar/:channelId` con placeholder fallback · Bot-tokens en tabla cifrada `template_bot_tokens` + `ENCRYPTION_KEY` rotatable · Threads-stub = `threadConfig: null` + endpoints 501 + test que lo fija · Endpoints ingestion: usar `?type=kol` existente (NO crear `/feed/kols`).

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. P0 hygiene ejecutable de rama (G-21)
     What to do / Must NOT do: `git status --porcelain` (esperado: solo `M .omo/boulder.json` + untracked specs); si boulder sigue modificado `git stash push .omo/boulder.json` (NO revertir trabajo ajeno); verificar `git branch --show-current` = `feat/mega-refactor-tramos`; `git add .kiro/specs/refactor-kol-system .kiro/specs/refactor-content-publisher .kiro/specs/refactor-data .omo/plans/mega-refactor-*.md`. Must NOT commitear `boulder.json` ni tocar `scripts/add-deprecation-headers.js`.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 2-8
     References: .omo/drafts/mega-refactor-tramos.md:69-73 (F-5, P0); GOVERNANCE.md (feat/\* desde dev)
     Acceptance criteria: `git status --porcelain | grep -c boulder` = 0 en staged; `git branch --show-current` imprime `feat/mega-refactor-tramos`
     QA scenarios: happy `git log --oneline -1` muestra commit P0; failure: si `git stash list` no contiene boulder y el worktree lo modifica, abortar y reportar. Evidence .omo/evidence/task-1-mega-refactor-central.log
     Commit: Y | chore(git): P0 hygiene rama mega-refactor (stash boulder, stage specs+planes)
- [ ] 2. Sellar C-DB-01: tabla 12 DBs + owners migración (G-01, G-13)
     What to do / Must NOT do: Escribir en este plan la tabla: dev local `onchain_bot_{kol_system,content_publisher,market_data,dexter}`; Oracle prod `onchain_bot_{kol_system,content_publisher,market_data,dexter}`; twin staging `onchain_bot_{kol_system_staging,content_publisher_staging,market_data_staging,dexter_staging}` (12 DBs); owner `migration:run` por app (su propio `data-source.ts`); `synchronize:false, migrationsRun:false` fuera dev/test. Nombres `onchain_bot_*` SOLO para las 4 apps NUEVAS (decisión 2026-09-25): los existentes `alpha_meta_token_scanner[_staging|_ingestion|_staging_ingestion]` quedan INTOCADOS — renombrar datos prod necesita su propia decisión de migración (open question, ver evidencia task-dbs-envs). Tramo 1 usa 17-18 tablas efectivas (NO 22). Must NOT inventar otros nombres ni renombrar DBs existentes.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: tramos (sus database.config.ts)
     References: .omo/drafts/mega-refactor-tramos.md:99 (C-DB-01 promesa); apps/backend AGENTS (split 2026-09-08, baseline ingestion `1788844970659-BaselineIngestionSchema`); .kiro/specs/refactor-kol-system/overview.md:1211-1238 (22→17/18 tras P4+P6); .omo/evidence/task-dbs-envs.log (rename onchain*bot*_ + open question prod)
     Acceptance criteria: `grep -o "onchain*bot*[a-z_]\_" .omo/plans/mega-refactor-central.md | sort -u | wc -l` >= 8 (4 bases + 4 staging)
     QA scenarios: happy tabla completa 3×3 con servidor+owner; failure: si falta staging twin, marcar incompleto. Evidence .omo/evidence/task-2-mega-refactor-central.log
     Commit: Y | docs(central): sella C-DB-01 con 12 DBs y owners
- [ ] 3. Sellar C-PORTS-01: tabla puertos×env + verificación Oracle (G-02)
     What to do / Must NOT do: Tabla dev/staging/prod: kol 3050/3051/3052, content 3040/3041/3042, market 4000/4001/4002, dexter 4060/4061/4062 (propuesto P13, worker verifica); backend 3030/3031/3030, ingestion 3031/3033/3032, frontend 5173/4173/80. Verificación ejecutable en Oracle: `lsof -i :3040-3042,3050-3052,4000-4002` debe salir vacío; si clash, fallback anotado (proxy reverso, NO cambiar tripletas sin veto). Must NOT asumir Oracle libres sin correr el comando.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: tramos (main.ts/Dockerfile/compose/nginx)
     References: .kiro/specs/refactor-content-publisher/11-refactor.md:1367-1369 (tabla puertos); .kiro/specs/refactor-kol-system/overview.md:190-191; .kiro/specs/refactor-data/overview.md:1173-1190 (solo "4000:4000" → se adopta tripleta)
     Acceptance criteria: salida `lsof` vacía guardada en evidencia, o fallback documentado con veto pedido
     QA scenarios: happy puertos libres; failure clash → documentar alternativa y pedir veto, NO auto-reasignar. Evidence .omo/evidence/task-3-mega-refactor-central.log
     Commit: Y | docs(central): sella C-PORTS-01 con verificación Oracle
- [ ] 4. Sellar C-CI-01: matriz CI/deploy 3 apps (G-03, G-19 base)
     What to do / Must NOT do: Matriz por app (kol/content/market): `test:<app>` (Jest), `lint:<app>`, `tsc --noEmit`, `build:<app>`, imagen GHCR `:sha+:latest`, `deploy-<app>.yml` o matriz con path-filters (`apps/kol-system/**` etc.), migraciones en one-off container antes de `compose up -d`, healthcheck + rollback por app. Tramos solo referencian jobs. Must NOT acoplar deploys entre apps (cada app despliega sola).
     Parallelization: Wave 2 | Blocked by: 2, 3 | Blocks: gates 6-8 (precondition cutover)
     References: .github/workflows/ci.yml:80-107,236-267 (solo backend/frontend/ingestion hoy); .github/workflows/deploy.yml (patrón buildx+GHCR+one-off migrations+rollback)
     Acceptance criteria: matriz 3 apps × (test,lint,build,imagen,deploy,migrate,health) sin celdas vacías
     QA scenarios: happy `gh workflow list | grep deploy-` muestra 3 workflows (o matriz con filters); failure: path-filter sin `apps/<app>/**` → incompleto. Evidence .omo/evidence/task-4-mega-refactor-central.log
     Commit: Y | docs(central): sella C-CI-01 con matriz por app
- [ ] 5. Sellar C-SSE-01 + decisión endpoints (G-04, G-05)
     What to do / Must NOT do: Contrato frame SSE con campo `messageType: 'kol'|'crypto-news'`, filtrado client-side obligatorio, 3 conexiones/env verificadas (`curl /api/ingestion/stream` ×3). Separación estricta P10: kol-system SOLO `'kol'`, content-publisher SOLO `'crypto-news'` — ningún consumer se suscribe al tipo ajeno. Decisión G-05 ADOPTADA: usar `GET /api/feed/sources?type=kol` + `/api/feed/messages` existentes (NO crear `/feed/kols` ni `/kol-messages`); corregir ambos specs. Must NOT abrir MTProto fuera de ingestion-telegram (riesgo AUTH_KEY_DUPLICATED).
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: Tramo 1 ingestion, Tramo 2 ingestion
     References: apps/ingestion-telegram/src/stream/application/services/stream.service.ts:201-217 (broadcast fan-out); apps/ingestion-telegram/src/core/application/coordinators/message-persistence.coordinator.ts:143-151; .kiro/specs/refactor-kol-system/overview.md:165-207; apps/frontend/src/shared/api/endpoints.ts:12 (`?type=kol` ya migrado)
     Acceptance criteria: `curl -s localhost:3031/api/feed/sources?type=kol | jq length` >= 0 sin error; contrato frame escrito con campo messageType
     QA scenarios: happy 3 consumidores simultáneos reciben solo su tipo; failure SSE caído → backoff 1s→30s verificado en listener. Evidence .omo/evidence/task-5-mega-refactor-central.log
     Commit: Y | docs(central): sella C-SSE-01 y decisión ?type=kol
- [ ] 6. Sellar C-FLAGS-01 + C-BOTS-01 + versionado C-SHARED-01/C-DATA-01 (G-20, F-3)
     What to do / Must NOT do: Tabla flag×app×env: `KOL_PIPELINE_ENABLED` (backend legacy, default true→false en cutover), `KOL_SYSTEM_ENABLED` + `TEMPLATE_ORCHESTRATOR_ENABLED` (kol-system), `USE_CONTENT_PUBLISHER` (backend→content), `USE_DATA_SERVICE_API` (backend/kol/content→market, default false hasta Tramo 3); kill-switch semantics Tramo 1; orden cutover kol→content→data. C-BOTS-01: kol-system SIN env bot (catálogo `telegram_bots` en DB, P23; mismo bot reutilizable en varios canales/templates), lookup→DEXTER_BOT_TOKEN (dexter-onchain-bot, P13; migra CHAIN_DEXTER_BOT_TOKEN), crypto→CRYPTO_NEWS_BOT_TOKEN, threads→THREADS_BOT_TOKEN, por-template→tabla cifrada (G-10). P22: ningún bot nuevo usa env vars (todo en DB vía frontend). Cada contrato lleva `versión fecha+hash`; tramos pinnean la versión que usan. Must NOT cambiar defaults sin veto.
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: gates 6-8
     References: .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:639-693 (dual-run/cutover/rollback); .kiro/specs/refactor-content-publisher/IMPLEMENTATION-GUIDE.md:563-586; .kiro/specs/refactor-data/overview.md:1295-1308; .omo/drafts/mega-refactor-tramos.md:92 (F-3 versionado)
     Acceptance criteria: tabla sin defaults vacíos + cada C-\* con línea `versión: YYYY-MM-DD + short-hash`
     QA scenarios: happy kill-switch `TEMPLATE_ORCHESTRATOR_ENABLED=false` detiene publishing en <1 cron; failure flag ausente → app arranca en modo seguro (publishing off). Evidence .omo/evidence/task-6-mega-refactor-central.log
     Commit: Y | docs(central): sella flags, bots y versionado de contratos
- [ ] 7. Sellar C-UX-01: mapa frontend por prefijo (G-06, G-18)
     What to do / Must NOT do: Tabla fila-por-prefijo de `apps/frontend/src/shared/api/endpoints.ts:17-152` → app dueña post-tramo + baseURL (:3050/:3040/400x) + proxy vite (`vite.config.ts`) / nginx (`nginx.conf`, `nginx.staging.conf`) + polling a mantener. Incluye renombre Tramo 3 `/token/market-data`→`/token/enrichment` (G-18). Must NOT romper dashboard legacy antes del cutover de su tramo.
     Parallelization: Wave 2 | Blocked by: 2, 3 | Blocks: frontend todos de cada tramo
     References: apps/frontend/src/shared/api/endpoints.ts:17-152; apps/frontend/vite.config.ts (proxy); apps/frontend/nginx.conf; apps/frontend/AGENTS.md §PROXY
     Acceptance criteria: todo prefijo de endpoints.ts tiene fila con dueña + baseURL; 0 filas "TBD"
     QA scenarios: happy `grep -c "localhost:305" apps/frontend/src/shared/api/endpoints.ts` > 0 tras Tramo 1; failure proxy ausente → 404 en dev. Evidence .omo/evidence/task-7-mega-refactor-central.log
     Commit: Y | docs(central): sella C-UX-01 con mapa por prefijo
- [ ] 8. Gates T1/T2/T3 + cutover global (C3, G-19)
     What to do / Must NOT do: Gate T1: staging 14 días + shadow/dry-run canal espejo + rollback rehearsal + E2E>200 green + load 100calls/h×24h + suites legacy green (`npm run test:backend -- token kol telegram`, `test:ingestion`, `test:frontend`). Gate T2: staging 7 días + E2E spec + rollback 30min ensayado. Gate T3: staging 7 días + `USE_DATA_SERVICE_API` staged. Cutover global kol→content→data, nunca en paralelo sobre mismo código. Must NOT declarar done sin evidencia en `.omo/evidence/`.
     Parallelization: Wave 3 | Blocked by: 4, 6, 7 | Blocks: — (cierra programa)
     References: .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:658-693 (checklist+cutover+rollback); .kiro/specs/refactor-content-publisher/MIGRATION-PLAYBOOK.md:52-65 (go/no-go); .omo/drafts/mega-refactor-tramos.md:113,131 (C3)
     Acceptance criteria: checklist con 0 items sin evidencia enlazada
     QA scenarios: happy todos los gates con logs; failure cualquier gate rojo → programa bloqueado, rollback ejecutado. Evidence .omo/evidence/task-8-mega-refactor-central.log
     Commit: Y | docs(central): gates y cutover global verificados

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

Docs de gobernanza: un commit por todo (docs(central): …), push a `feat/mega-refactor-tramos`. Sin código producto en este plan.

## Success criteria

- 9 contratos con valores + versión fecha+hash, 0 "TBD".
- Gates T1/T2/T3 definidos con evidencia enlazada.
- Tramos solo referencian contratos (grep de redefiniciones = 0).
