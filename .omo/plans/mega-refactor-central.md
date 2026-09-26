# mega-refactor-central - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Un índice que gobierna el mega-refactor: 3 tramos en orden (kol, content, market-data), 9 contratos con valores sellados, gates inter-tramo rápidos (deprecation-check + green) y UNA full final review al cierre.

**Why this approach:** Sin un centro con contratos versionados, tres extracciones gigantes de un monolito colisionan (mismo `telegram/shared`, mismos providers, mismos puertos). El centro fija las reglas; los tramos solo ejecutan.

**What it will NOT do:** No escribe código producto ni duplica los todos de los tramos. No reabre lo sellado (orden, nombres, rama) sin tu veto.

**Effort:** Medium (8 todos de gobernanza, sin código)
**Risk:** Medium - un contrato mal sellado bloquea 3 tramos
**Decisions I made for you:** DBs mismo-servidor `<base>_<app>`; tripletas de puertos con verificación Oracle; `?type=kol` en vez de endpoints nuevos; staging 48h validación no-bloqueante T1 (C4-bis) + FINAL REVIEW con validación completa; threads-stub 501; avatar servido por ingestion-telegram; bot-tokens cifrados. Vetos bienvenidos arriba.

Your next move: <fill - e.g. approve, or run a high-accuracy review>. Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

- Plan índice que gobierna el mega-refactor en 3 tramos delegados: Tramo 1 kol-system (`mega-refactor-kol-system.md`), Tramo 2 feed-publisher (`mega-refactor-feed-publisher.md`), Tramo 3 market-data (`mega-refactor-market-data.md`).
- 9 contratos versionados como única fuente (C-SHARED-01, C-DATA-01, C-PORTS-01, C-BOTS-01, C-DB-01, C-SSE-01, C-CI-01, C-FLAGS-01, C-UX-01) — los tramos los referencian, nunca los redefinen.
- Orden de ejecución kol-system → feed-publisher → market-data con cadena de preconditions C4-bis (T2←T1 deprecation-check + green, T3←T2 deprecation-check + green; staging por tramo es validación, NO bloqueante para arrancar código del siguiente tramo).
- Gates inter-tramo rápidos + UNA FINAL REVIEW al completar los 3 tramos (validación completa, eliminación deprecated, backend-remainder decision, cierre de programa) + checklist de cutover global. Rama `feat/mega-refactor-tramos`.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO duplica los todos de ningún tramo; solo links + contratos + orden + gates.
- NO toca código producto (`apps/*`, `scripts/*`); este plan solo produce/actualiza artefactos `.omo/` y decisiones de contrato.
- NO reabre decisiones selladas (orden, `apps/market-data`, rama) salvo veto explícito del usuario.
- NO permite que dos tramos toquen `telegram/shared` o `data-provider/` sin citar C-SHARED-01 / C-DATA-01.
- NO arranca código del siguiente tramo sin su gate inter-tramo C4-bis (deprecation-check + green suites del tramo previo). Staging por tramo (48h T1; ventanas T2-T3 existentes) es validación, NO bloqueante para arrancar el siguiente tramo.
- NO borrado de código deprecated hasta la FINAL REVIEW (C4-bis.3): los tramos deprecatan con JSDoc (nueva ruta + refactor target), la eliminación es solo en la review final.

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

> Versión contratos: C-\* v2026-09-24 (central 4b0c643f) + estrategia C4-bis 2026-09-25 (gates rápidos + FINAL REVIEW). Cada tramo pinnea esta versión al arrancar.
> | Tramo | Plan (path) | Spec origen | Precondition | Done-gate |
> | --- | --- | --- | --- | --- |
> | T1 kol-system | `.omo/plans/mega-refactor-kol-system.md` | `.kiro/specs/refactor-kol-system/` (pivot P1–P9 manda) | central todos 1-3,5-7 | Gate T1 (todo 8 central): deprecation-check + green suites; staging 48h como validación no-bloqueante |
> | T2 feed-publisher | `.omo/plans/mega-refactor-feed-publisher.md` | `.kiro/specs/refactor-feed-publisher/` | Gate T1 (deprecation-check + green) + checklist shared (T2-todo 0) | Gate T2: deprecation-check + green suites; staging 7d como validación no-bloqueante |
> | T3 market-data | `.omo/plans/mega-refactor-market-data.md` | `.kiro/specs/refactor-data/` (requisitos, no topología) | Gate T2 (deprecation-check + green) + mapeo libs→src (T3-todo 0) | Gate T3: deprecation-check + green suites; p95<500ms como validación. Cierre real en FINAL REVIEW (todo 9 central) |

## Todos

> Implementation + Test = ONE todo. Never separate.
> Defaults adoptados (a veto, Metis G-01/G-02/G-09/G-10/G-11 + preguntas):
> DBs mismo-servidor-por-env `<base>_<app>` + `_staging` en staging ingestion (precedente `_ingestion`) · Puertos tripletas 3040/41/42, 3050/51/52, 4000/4001/4002, 4060/4061/4062 (dexter, propuesto P13, verificar con lsof) (worker verifica con lsof en Oracle; si clash, fallback a proxy) · Avatar lo sirve ingestion-telegram `/api/kol-avatar/:channelId` con placeholder fallback · Bot-tokens en tabla cifrada `template_bot_tokens` + `ENCRYPTION_KEY` rotatable · Threads-stub = `threadConfig: null` + endpoints 501 + test que lo fija · Endpoints ingestion: usar `?type=kol` existente (NO crear `/feed/kols`).

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. P0 hygiene ejecutable de rama (G-21)
     What to do / Must NOT do: `git status --porcelain` (esperado: solo `M .omo/boulder.json` + untracked specs); si boulder sigue modificado `git stash push .omo/boulder.json` (NO revertir trabajo ajeno); verificar `git branch --show-current` = `feat/mega-refactor-tramos`; `git add .kiro/specs/refactor-kol-system .kiro/specs/refactor-feed-publisher .kiro/specs/refactor-data .omo/plans/mega-refactor-*.md`. Must NOT commitear `boulder.json` ni tocar `scripts/add-deprecation-headers.js`.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 2-8
     References: .omo/drafts/mega-refactor-tramos.md:69-73 (F-5, P0); GOVERNANCE.md (feat/\* desde dev)
     Acceptance criteria: `git status --porcelain | grep -c boulder` = 0 en staged; `git branch --show-current` imprime `feat/mega-refactor-tramos`
     QA scenarios: happy `git log --oneline -1` muestra commit P0; failure: si `git stash list` no contiene boulder y el worktree lo modifica, abortar y reportar. Evidence .omo/evidence/task-1-mega-refactor-central.log
     Commit: Y | chore(git): P0 hygiene rama mega-refactor (stash boulder, stage specs+planes)
- [x] 2. Sellar C-DB-01: tabla 12 DBs + owners migración (G-01, G-13)
     What to do / Must NOT do: Escribir en este plan la tabla: dev local `onchain_bot_{kol_system,feed_publisher,market_data,dexter}`; Oracle prod `onchain_bot_{kol_system,feed_publisher,market_data,dexter}`; staging ingestion `onchain_bot_{kol_system_staging,feed_publisher_staging,market_data_staging,dexter_staging}` (12 DBs); owner `migration:run` por app (su propio `data-source.ts`); `synchronize:false, migrationsRun:false` fuera dev/test. Nombres `onchain_bot_*` SOLO para las 4 apps NUEVAS (decisión 2026-09-25): las DBs pre-existentes de backend/ingestion quedan INTOCADAS hasta que ejecute el runbook de renombre (.omo/runbooks/rename-onchain-bot-db.md, fase 3 — esta tarea; era el open question de evidencia task-dbs-envs). Tramo 1 usa 17-18 tablas efectivas (NO 22). Must NOT inventar otros nombres ni renombrar DBs existentes.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: tramos (sus database.config.ts)
     References: .omo/drafts/mega-refactor-tramos.md:99 (C-DB-01 promesa); apps/backend AGENTS (split 2026-09-08, baseline ingestion `1788844970659-BaselineIngestionSchema`); .kiro/specs/refactor-kol-system/overview.md:1211-1238 (22→17/18 tras P4+P6); .omo/evidence/task-dbs-envs.log (rename onchain*bot*_ + open question prod)
     Acceptance criteria: `grep -o "onchain*bot*[a-z_]\_" .omo/plans/mega-refactor-central.md | sort -u | wc -l` >= 8 (4 bases + 4 staging)
     QA scenarios: happy tabla completa 3×3 con servidor+owner; failure: si falta staging ingestion, marcar incompleto. Evidence .omo/evidence/task-2-mega-refactor-central.log
     Commit: Y | docs(central): sella C-DB-01 con 12 DBs y owners
- [x] 3. Sellar C-PORTS-01: tabla puertos×env + verificación Oracle (G-02)
     What to do / Must NOT do: Tabla dev/staging/prod: kol 3050/3051/3052, content 3040/3041/3042, market 4000/4001/4002, dexter 4060/4061/4062 (propuesto P13, worker verifica); backend 3030/3031/3030, ingestion 3031/3033/3032, frontend 5173/4173/80. Verificación ejecutable en Oracle: `lsof -i :3040-3042,3050-3052,4000-4002` debe salir vacío; si clash, fallback anotado (proxy reverso, NO cambiar tripletas sin veto). Must NOT asumir Oracle libres sin correr el comando.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: tramos (main.ts/Dockerfile/compose/nginx)
     References: .kiro/specs/refactor-feed-publisher/11-refactor.md:1367-1369 (tabla puertos); .kiro/specs/refactor-kol-system/overview.md:190-191; .kiro/specs/refactor-data/overview.md:1173-1190 (solo "4000:4000" → se adopta tripleta)
     Acceptance criteria: salida `lsof` vacía guardada en evidencia, o fallback documentado con veto pedido
     QA scenarios: happy puertos libres; failure clash → documentar alternativa y pedir veto, NO auto-reasignar. Evidence .omo/evidence/task-3-mega-refactor-central.log
     Commit: Y | docs(central): sella C-PORTS-01 con verificación Oracle
- [x] 4. Sellar C-CI-01: matriz CI/deploy 3 apps (G-03, G-19 base)
     What to do / Must NOT do: Matriz por app (kol/content/market): `test:<app>` (Jest), `lint:<app>`, `tsc --noEmit`, `build:<app>`, imagen GHCR `:sha+:latest`, `deploy-<app>.yml` o matriz con path-filters (`apps/kol-system/**` etc.), migraciones en one-off container antes de `compose up -d`, healthcheck + rollback por app. Tramos solo referencian jobs. Must NOT acoplar deploys entre apps (cada app despliega sola).
     Parallelization: Wave 2 | Blocked by: 2, 3 | Blocks: gates 6-8 (precondition cutover)
     References: .github/workflows/ci.yml:80-107,236-267 (solo backend/frontend/ingestion hoy); .github/workflows/deploy.yml (patrón buildx+GHCR+one-off migrations+rollback)
     Acceptance criteria: matriz 3 apps × (test,lint,build,imagen,deploy,migrate,health) sin celdas vacías
     QA scenarios: happy `gh workflow list | grep deploy-` muestra 3 workflows (o matriz con filters); failure: path-filter sin `apps/<app>/**` → incompleto. Evidence .omo/evidence/task-4-mega-refactor-central.log
     Commit: Y | docs(central): sella C-CI-01 con matriz por app
- [x] 5. Sellar C-SSE-01 + decisión endpoints (G-04, G-05)
     What to do / Must NOT do: Contrato frame SSE con campo `messageType: 'kol'|'crypto-news'`, filtrado client-side obligatorio, 3 conexiones/env verificadas (`curl /api/ingestion/stream` ×3). Separación estricta P10: kol-system SOLO `'kol'`, feed-publisher SOLO `'crypto-news'` — ningún consumer se suscribe al tipo ajeno. Decisión G-05 ADOPTADA: usar `GET /api/feed/sources?type=kol` + `/api/feed/messages` existentes (NO crear `/feed/kols` ni `/kol-messages`); corregir ambos specs. Must NOT abrir MTProto fuera de ingestion-telegram (riesgo AUTH_KEY_DUPLICATED).
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: Tramo 1 ingestion, Tramo 2 ingestion
     References: apps/ingestion-telegram/src/stream/application/services/stream.service.ts:201-217 (broadcast fan-out); apps/ingestion-telegram/src/core/application/coordinators/message-persistence.coordinator.ts:143-151; .kiro/specs/refactor-kol-system/overview.md:165-207; apps/frontend/src/shared/api/endpoints.ts:12 (`?type=kol` ya migrado)
     Acceptance criteria: `curl -s localhost:3031/api/feed/sources?type=kol | jq length` >= 0 sin error; contrato frame escrito con campo messageType
     QA scenarios: happy 3 consumidores simultáneos reciben solo su tipo; failure SSE caído → backoff 1s→30s verificado en listener. Evidence .omo/evidence/task-5-mega-refactor-central.log
     Commit: Y | docs(central): sella C-SSE-01 y decisión ?type=kol
- [x] 6. Sellar C-FLAGS-01 + C-BOTS-01 + versionado C-SHARED-01/C-DATA-01 (G-20, F-3)
     What to do / Must NOT do: Tabla flag×app×env: `KOL_PIPELINE_ENABLED` (backend legacy, default true→false en cutover), `KOL_SYSTEM_ENABLED` + `TEMPLATE_ORCHESTRATOR_ENABLED` (kol-system), `USE_FEED_PUBLISHER` (backend→content), `USE_DATA_SERVICE_API` (backend/kol/content→market, default false hasta Tramo 3); kill-switch semantics Tramo 1; orden cutover kol→content→data. C-BOTS-01: kol-system SIN env bot (catálogo `telegram_bots` en DB, P23; mismo bot reutilizable en varios canales/templates), lookup→DEXTER_BOT_TOKEN (dexter-onchain-bot, P13; migra CHAIN_DEXTER_BOT_TOKEN), crypto→CRYPTO_NEWS_BOT_TOKEN, threads→THREADS_BOT_TOKEN, por-template→tabla cifrada (G-10). P22: ningún bot nuevo usa env vars (todo en DB vía frontend). Cada contrato lleva `versión fecha+hash`; tramos pinnean la versión que usan. Must NOT cambiar defaults sin veto.
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: gates 6-8
     References: .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:639-693 (dual-run/cutover/rollback); .kiro/specs/refactor-feed-publisher/IMPLEMENTATION-GUIDE.md:563-586; .kiro/specs/refactor-data/overview.md:1295-1308; .omo/drafts/mega-refactor-tramos.md:92 (F-3 versionado)
     Acceptance criteria: tabla sin defaults vacíos + cada C-\* con línea `versión: YYYY-MM-DD + short-hash`
     QA scenarios: happy kill-switch `TEMPLATE_ORCHESTRATOR_ENABLED=false` detiene publishing en <1 cron; failure flag ausente → app arranca en modo seguro (publishing off). Evidence .omo/evidence/task-6-mega-refactor-central.log
     Commit: Y | docs(central): sella flags, bots y versionado de contratos
- [x] 7. Sellar C-UX-01: mapa frontend por prefijo (G-06, G-18)
     What to do / Must NOT do: Tabla fila-por-prefijo de `apps/frontend/src/shared/api/endpoints.ts:17-152` → app dueña post-tramo + baseURL (:3050/:3040/400x) + proxy vite (`vite.config.ts`) / nginx (`nginx.conf`, `nginx.staging.conf`) + polling a mantener. Incluye renombre Tramo 3 `/token/market-data`→`/token/enrichment` (G-18). Fila P41 (2026-09-25): `crypto-news-publisher`→`feed-publisher`, `crypto-news-scheduling`→`feed-scheduling`, `threads-publisher`→`feed-threads-publisher`, `crypto-news/matching`→`feed-matching`, `crypto-news/sources`→`feed-sources` ONLY ingestion-telegram, `crypto-news/filters`→`feed-filters`, `ops/backups` KEPT (detalle: `.omo/drafts/mega-refactor-tramos.md` §11; ejecución: T2 todo 13). Must NOT romper dashboard legacy antes del cutover de su tramo.
     Parallelization: Wave 2 | Blocked by: 2, 3 | Blocks: frontend todos de cada tramo
     References: apps/frontend/src/shared/api/endpoints.ts:17-152; apps/frontend/vite.config.ts (proxy); apps/frontend/nginx.conf; apps/frontend/AGENTS.md §PROXY
     Acceptance criteria: todo prefijo de endpoints.ts tiene fila con dueña + baseURL; 0 filas "TBD"
     QA scenarios: happy `grep -c "localhost:305" apps/frontend/src/shared/api/endpoints.ts` > 0 tras Tramo 1; failure proxy ausente → 404 en dev. Evidence .omo/evidence/task-7-mega-refactor-central.log
     Commit: Y | docs(central): sella C-UX-01 con mapa por prefijo
- [ ] 8. Gates T1/T2/T3 rápidos + cutover global (C4-bis, override C3/C3-bis como bloqueantes)
     What to do / Must NOT do: Hard gate inter-tramo C4-bis (IGUAL para T1/T2/T3): (a) deprecation-check — TODO el legacy del concepto del tramo verificado deprecated con JSDoc claro (nueva ruta + refactor target), verificado por grep; (b) green suites — suites legacy + nuevas en verde (`npm run test:backend`, `test:ingestion`, `test:frontend` según tramo). Staging por tramo queda como VALIDACIÓN no-bloqueante (T1 48h con shadow/dry-run canal espejo + E2E>200 + load 100calls/h×24h; T2 7 días + E2E spec + rollback 30min ensayado; T3 p95<500ms + `USE_DATA_SERVICE_API` staged) — su ventana NO bloquea arrancar código del siguiente tramo. Cutover global kol→content→data por flags, nunca en paralelo sobre mismo código. Must NOT exigir ventana staging completa para arrancar el siguiente tramo; Must NOT borrar deprecated aquí (solo FINAL REVIEW todo 9).
     Parallelization: Wave 3 | Blocked by: 4, 6, 7 | Blocks: 9 (FINAL REVIEW)
     References: .omo/drafts/mega-refactor-tramos.md §10 (C4-bis 2026-09-25); .kiro/specs/refactor-kol-system/IMPLEMENTATION-GUIDE.md:658-693 (checklist+cutover+rollback); .kiro/specs/refactor-feed-publisher/MIGRATION-PLAYBOOK.md:52-65 (go/no-go)
     Acceptance criteria: por tramo: `grep -r "@deprecated" <legacy-tramo>` >= 1 por concepto + suites verdes en evidencia; checklist con 0 items sin evidencia enlazada
     QA scenarios: happy deprecation-check + green por tramo con logs; failure deprecation-check rojo o suites rojas → siguiente tramo bloqueado, rollback ejecutado. Evidence .omo/evidence/task-8-mega-refactor-central.log
     Commit: Y | docs(central): gates rápidos C4-bis y cutover global verificados
- [ ] 9. FINAL REVIEW: validación completa + eliminación deprecated + backend-remainder + cierre (C4-bis.1-3)
     What to do / Must NOT do: UNA full final review cuando los 3 tramos completan: (a) validación completa — staging extendido + E2E + load + rollback rehearsal medido + suites legacy + 0 divergencias dual-run, con evidencia por tramo; (b) deprecated ELIMINATION — `rm -rf` legacy deprecated + DROP/archivado de tablas + deprecation headers resto, verificado por grep (`grep -r "@deprecated" apps/backend/src` → 0 tras eliminar o solo headers residuales documentados); (c) backend-remainder decision — lo que quede sin decidir del backend se decide aquí (absorber / archivar / mantener) y se registra; (d) cierre de programa — gates T1/T2/T3 + esta review con logs. Must NOT ejecutar antes de los 3 tramos; Must NOT borrar deprecated fuera de este todo.
     Parallelization: Wave 4 | Blocked by: 8 + Gates T1/T2/T3 | Blocks: — (cierra programa)
     References: .omo/drafts/mega-refactor-tramos.md §10 (C4-bis); planes T1/T2/T3 todos de cutover/deprecate-only
     Acceptance criteria: validación completa con 0 items sin evidencia + `ls apps/backend/src/{kol,telegram/data-provider}` vacío según decisión + backend-remainder registrado
     QA scenarios: happy review completa verde → programa cerrado; failure cualquier validación roja → rollback ejecutado y medido, programa NO cerrado. Evidence .omo/evidence/task-9-mega-refactor-central.log
     Commit: Y | docs(central): FINAL REVIEW con eliminación deprecated y cierre
- [ ] 10. Auth anti-exploit ingestion-telegram (P50, excepción documentada: único todo de implementación de este plan)
      What to do / Must NOT do: auth key en TODO salvo `/api/health` (+ SSE con `x-api-key` ya existente — extender a feed/media/avatar si falta); rate-limit; audit log accesos; cero keys en logs; drill compromiso. Tests + matriz curl. Must NOT endpoint sensible sin auth.
      Parallelization: Wave 4 | Blocked by: — | Blocks: programa (requisito final review)
      References: .omo/drafts/mega-refactor-tramos.md (P50); apps/ingestion-telegram/src/
      Acceptance criteria: matriz 401/403 verde + suites verdes
      QA scenarios: happy con key; failure sin key → 401. Evidence .omo/evidence/task-sec1-central.log
      Commit: Y | feat(ingestion-telegram): auth anti-exploit global

## Contratos sellados (C-\* — versión: 2026-09-26 + 5f463b88; los tramos referencian, nunca redefinen)

### C-DB-01 — 12 DBs `onchain_bot_*` solo apps nuevas (versión: 2026-09-26 + 5f463b88)

Regla sync: `synchronize:false, migrationsRun:false` fuera de dev/test; owner `migration:run` por app con su propio `data-source.ts`. Mismo-servidor-por-env `<base>_<app>` (+`_staging` en staging, precedente `_ingestion`). Nombres `onchain_bot_*` SOLO para las 4 apps NUEVAS (decisión 2026-09-25): DBs pre-existentes de backend/ingestion quedan INTOCADAS hasta que ejecute el runbook de renombre (`.omo/runbooks/rename-onchain-bot-db.md`, fase 3). Tramo 1 usa 17-18 tablas efectivas (NO 22). Nota: `onchain_bot_bots[_staging]` del gateway (`.omo/plans/telegram-bots-gateway.md`) NO entra en estas 12 — se sella en su propio plan.

| App                | Dev local (mismo servidor)   | Oracle prod (mismo servidor) | Staging (sufijo `_staging`)          | Owner migración                                              |
| ------------------ | ---------------------------- | ---------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| kol-system         | `onchain_bot_kol_system`     | `onchain_bot_kol_system`     | `onchain_bot_kol_system_staging`     | kol-system `migration:run` (`data-source.ts` propio)         |
| feed-publisher     | `onchain_bot_feed_publisher` | `onchain_bot_feed_publisher` | `onchain_bot_feed_publisher_staging` | feed-publisher `migration:run` (`data-source.ts` propio)     |
| market-data        | `onchain_bot_market_data`    | `onchain_bot_market_data`    | `onchain_bot_market_data_staging`    | market-data `migration:run` (`data-source.ts` propio)        |
| dexter-onchain-bot | `onchain_bot_dexter`         | `onchain_bot_dexter`         | `onchain_bot_dexter_staging`         | dexter-onchain-bot `migration:run` (`data-source.ts` propio) |

### C-PORTS-01 — tabla puertos×env (versión: 2026-09-26 + 5f463b88)

Tripletas dev/staging/prod por app nueva; sin cambios sin veto (si clash: fallback proxy reverso, NO reasignar). Verificación local 2026-09-26: `lsof` sobre `:3040 :3050 :4000 :4060 :4070` vacío (nada escuchando en este host; rangos completos no chequeables aquí — ver paso operador Oracle).

| App / servicio           | Dev  | Staging | Prod | Estado                                                          |
| ------------------------ | ---- | ------- | ---- | --------------------------------------------------------------- |
| kol-system               | 3050 | 3051    | 3052 | sellado (spec)                                                  |
| feed-publisher (content) | 3040 | 3041    | 3042 | sellado (spec `11-refactor.md:1367-1369`)                       |
| market-data              | 4000 | 4001    | 4002 | adoptado (spec traía solo `4000:4000`; tripleta por convención) |
| dexter-onchain-bot       | 4060 | 4061    | 4062 | propuesto P13, verificado local vacío                           |
| telegram-bots-gateway    | 4070 | 4071    | 4072 | propuesto (plan gateway), verificado local vacío                |
| backend                  | 3030 | 3031    | 3030 | existente                                                       |
| ingestion-telegram       | 3031 | 3033    | 3032 | existente (1:1 por env)                                         |
| frontend                 | 5173 | 4173    | 80   | existente                                                       |

Operador Oracle (paso manual pendiente, sin escrituras): `lsof -i :3040-3042,3050-3052,4000-4002,4060-4062,4070-4072` debe salir vacío; evidencia en `task-3` log.

### C-CI-01 — matriz CI/deploy por app (versión: 2026-09-26 + 5f463b88)

Verificado contra disco 2026-09-26: `ci.yml` hoy solo cubre backend/frontend/ingestion-telegram (jobs `tests` con `test:backend`/`test:frontend`/`test:ingestion` + `lint` + `typescript-check`); `deploy.yml` = patrón buildx→GHCR (`:sha`+`:latest`) + migraciones en one-off container + `compose up -d` + healthcheck `:3030/api/health` + rollback; `deploy-staging.yml` (push dev) y `deploy-ingestion.yml` (path-filter `apps/ingestion-telegram/**`, no-cancel) existen. Workflows listados: `backup-health, branch-governance, ci, cleanup, deploy-ingestion, deploy-staging, deploy, full-prune, ghcr-test-build, ghcr-test-pull, pr-sync-check, pr-title-lint, sync-dev` — NINGUNO para las apps nuevas (gap: se crean en sus tramos; los tramos solo referencian esta matriz).

| App                   | test                              | lint                  | tsc --noEmit | build                  | imagen GHCR      | deploy                                                                             | migrate                                    | health+rollback                  |
| --------------------- | --------------------------------- | --------------------- | ------------ | ---------------------- | ---------------- | ---------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------- |
| kol-system            | `test:kol-system` (Jest)          | `lint:kol-system`     | sí           | `build:kol-system`     | `:sha`+`:latest` | `deploy-kol-system.yml` o matriz con path-filter `apps/kol-system/**`              | one-off container antes de `compose up -d` | `/api/health` + rollback por app |
| feed-publisher        | `test:feed-publisher` (Jest)      | `lint:feed-publisher` | sí           | `build:feed-publisher` | `:sha`+`:latest` | `deploy-feed-publisher.yml` o matriz con path-filter `apps/feed-publisher/**`      | one-off container antes de `compose up -d` | `/api/health` + rollback por app |
| market-data           | `test:market-data` (Jest)         | `lint:market-data`    | sí           | `build:market-data`    | `:sha`+`:latest` | `deploy-market-data.yml` o matriz con path-filter `apps/market-data/**`            | one-off container antes de `compose up -d` | `/api/health` + rollback por app |
| dexter-onchain-bot    | `test:dexter` (Jest, 5 casos P13) | `lint:dexter`         | sí           | `build:dexter`         | `:sha`+`:latest` | con market-data (fase final T3) + path-filter `apps/dexter-onchain-bot/**`         | one-off container antes de `compose up -d` | `/api/health` + rollback por app |
| telegram-bots-gateway | `test:bots-gateway` (Jest)        | `lint:bots-gateway`   | sí           | `build:bots-gateway`   | `:sha`+`:latest` | `deploy-bots-gateway.yml` o matriz con path-filter `apps/telegram-bots-gateway/**` | one-off container antes de `compose up -d` | `/api/health` + rollback por app |

Regla: cada app despliega sola (sin acoplar deploys entre apps).

### C-SSE-01 + endpoints (versión: 2026-09-26 + 5f463b88)

Frame SSE (verificado en `message-persistence.coordinator.ts:100,139` + spec `coordinator.integration.spec.ts:672-681`): campo `messageType: 'kol' | 'crypto-news'`, filtrado client-side OBLIGATORIO por app. P10 separación estricta: kol-system SOLO `'kol'`, feed-publisher SOLO `'crypto-news'` — ningún consumer se suscribe al tipo ajeno. P20: kol-system SSE-only sin polling (catch-up por cursor `GET /api/feed/messages?type=kol` desde último messageId, NO loop periódico).

Decisión G-05 ADOPTADA: usar `GET /api/feed/sources?type=kol` + `/api/feed/messages` existentes (NO crear `/feed/kols` ni `/kol-messages`). Check 2026-09-26: `curl -s localhost:3031/api/feed/sources?type=kol` sin ingestion local → sin respuesta (servicio caído en dev; contrato válido contra staging `:3033`/prod `:3032` por operador). MTProto NUNCA fuera de ingestion-telegram (riesgo `AUTH_KEY_DUPLICATED`).

| Endpoint ingestion-telegram                                                                     | Uso                                                                   | Owner consumo                                                                |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/ingestion/stream` (SSE abierto, `stream.module.ts:26`, `sse-stream.controller.ts:17`) | fan-out ambos tipos; 3 conexiones/env                                 | kol-system (`==='kol'`), feed-publisher (`==='crypto-news'`), backend legacy |
| `GET /api/feed/sources?type=kol`                                                                | picker sources kol (P16), avatar `avatarUrl` en proyección (P19)      | kol-system + frontend                                                        |
| `GET /api/feed/sources?type=crypto-news`                                                        | picker sources news (P30d)                                            | feed-publisher + frontend                                                    |
| `GET /api/feed/messages[?type=]`                                                                | catch-up por cursor (P20), poll backend 1/min Opción A                | kol-system cursor, backend feed                                              |
| `GET /api/media/:channelId/:messageId/:idx`                                                     | media news (owner ingestion)                                          | frontend directo                                                             |
| `GET /api/kol-avatar/:channelId` (+ placeholder fallback, P19/P29 rate-limit)                   | avatar permanente (EXCLUIDO janitor 72h; fetch-once + refresh manual) | kol-system + frontend                                                        |

P41 (rename `crypto-news`→`feed`, dual-serve T2-todo13): `crypto-news-publisher`→`feed-publisher`, `crypto-news-scheduling`→`feed-scheduling`, `threads-publisher`→`feed-threads-publisher`, `crypto-news/matching`→`feed-matching`, `crypto-news/sources`→`feed-sources` ONLY ingestion-telegram, `crypto-news/filters`→`feed-filters`, `ops/backups` KEPT.

### C-FLAGS-01 + C-BOTS-01 (versión: 2026-09-26 + 5f463b88)

Cutover orden: kol → content → data (nunca en paralelo sobre el mismo código). Kill-switch: `TEMPLATE_ORCHESTRATOR_ENABLED=false` detiene publishing en <1 cron; flag ausente → arranque seguro (publishing off).

| Flag                                                                         | App×env                                        | Default                        | Efecto                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------ | -------------------------------------------------- |
| `KOL_PIPELINE_ENABLED`                                                       | backend legacy (los 3 envs)                    | `true` → `false` en cutover T1 | apaga pipeline legacy al cortar a kol-system       |
| `KOL_SYSTEM_ENABLED`                                                         | kol-system (los 3 envs)                        | `false` → `true` en cutover T1 | enciende kol-system                                |
| `TEMPLATE_ORCHESTRATOR_ENABLED`                                              | kol-system (los 3 envs)                        | `false` → `true` en cutover T1 | kill-switch publishing templates                   |
| `USE_FEED_PUBLISHER` (canónico post-P35; spec decía `USE_CONTENT_PUBLISHER`) | backend → feed-publisher (los 3 envs)          | `false` → `true` en cutover T2 | redirige news a feed-publisher                     |
| `USE_DATA_SERVICE_API`                                                       | backend/kol/content → market-data (los 3 envs) | `false` hasta Tramo 3          | puente enrichment/market-data (default-true en T3) |

C-BOTS-01 — catálogo P22/P23 (cero env KOL): NO existe `KOL_BOT_TOKEN` (ni seed; retirar de `.env.example` + validación Tier-1 en T1-todo19). Modelo: `telegram_bots` (id, token cifrado AES-256-GCM, label) + `template_bot_tokens` (template_id, bot_id, token cifrado, channel_id/channel_target, `admin_verified_at` vía `getChatMember`). Un bot reutilizable en varios canales/templates; publicar opcional (sin `bot_id` = solo-dashboard). CRUD/rotación vía frontend, `ENCRYPTION_KEY` distinta por env. Lookup→`DEXTER_BOT_TOKEN` (migra `CHAIN_DEXTER_BOT_TOKEN`, verificado en `app.config.ts:498`); crypto→`CRYPTO_NEWS_BOT_TOKEN` (verificado `app.config.ts:494`); threads→`THREADS_BOT_TOKEN` (verificado `feed-publisher/src/shared/config/telegram.config.ts:30-31`); por-template→tabla cifrada (G-10). P22: ningún bot nuevo usa env vars. Dexter thin consumer vía `telegram-bots-gateway`, cero Bot API directo (P13 2026-09-25).

### C-UX-01 — mapa frontend por prefijo (versión: 2026-09-26 + 5f463b88)

Verificado contra `endpoints.ts` + `vite.config.ts:51-145` 2026-09-26 (ya migrado: `?type=kol` `endpoints.ts:15`, `/kol-api`→`:3050`, `/feed-api`→`:3040`, `/market-data-api`, `/feed-threads-publisher/*`, `/feed-publisher/matching/*`). BaseURLs dev/staging/prod: kol `:3050/:3051/:3052`, feed `:3040/:3041/:3042`, market `:4000/:4001/:4002`; rewrite `/kol-api`→`/api`, `/feed-api`→`''`, `/market-data-api`→`''`, `/ingestion-api`→`/api`. Polling TanStack a mantener (5-30s). Legacy intacto hasta cutover de su tramo.

| Prefijo frontend                                                                     | Dueña post-tramo                           | BaseURL (dev/stg/prd)       | Proxy vite / nginx             | Polling |
| ------------------------------------------------------------------------------------ | ------------------------------------------ | --------------------------- | ------------------------------ | ------- |
| `/ingestion-api/feed/sources?type=kol` (+ `kolAvatar /ingestion-api/kol-avatar/:id`) | ingestion-telegram (P4)                    | `:3031/:3033/:3032`         | `/ingestion-api`→ingestion     | 30s     |
| `/ingestion-api/feed/sources?type=crypto-news`, `/ingestion-api/feed/messages`       | ingestion-telegram                         | `:3031/:3033/:3032`         | `/ingestion-api`→ingestion     | 5-30s   |
| `/kol-api/*` (templates, rankings, pending-approvals)                                | kol-system (T1)                            | `:3050/:3051/:3052`         | `/kol-api`→kol-system          | 5-30s   |
| `/feed-api/*` (matching, queue, llm, scheduling)                                     | feed-publisher (T2)                        | `:3040/:3041/:3042`         | `/feed-api`→feed-publisher     | 5-15s   |
| `/market-data-api/*`                                                                 | market-data (T3)                           | `:4000/:4001/:4002`         | `/market-data-api`→market-data | 10s     |
| `/crypto-news-publisher/*` → `/feed-publisher/*` (P41 dual-serve→cutover)            | feed-publisher (T2-todo13)                 | backend→`:3040/:3041/:3042` | vite `61`+nginx both envs      | 5s      |
| `/crypto-news-scheduling/*` → `/feed-scheduling/*` (P41)                             | feed-publisher scheduling (T2)             | backend→`:3040/:3041/:3042` | vite+nginx dual                | 1min    |
| `/threads-publisher/*` → `/feed-threads-publisher/*` (P41)                           | feed-publisher threads (T2)                | backend→`:3040/:3041/:3042` | vite+nginx dual                | 1min    |
| `/crypto-news/matching` → `/feed-matching` (P41)                                     | feed-publisher (T2)                        | backend→`:3040/:3041/:3042` | vite+nginx dual                | 15s     |
| `/crypto-news/sources` (backend filter CRUD Opción A; sources nuevas SOLO ingestion) | backend filters (NO rename a feed-sources) | backend `:3030`             | vite `:91` intacto             | 30s     |
| `/crypto-news/filters` → `/feed-filters` (P41)                                       | backend→feed-publisher (T2)                | backend→`:3040/:3041/:3042` | vite+nginx dual                | 30s     |
| `/token/market-data/*` → `/token/enrichment` + redirect 307 una versión (G-18)       | market-data (T3-todo6)                     | backend→`:4000/:4001/:4002` | vite+nginx                     | 10s     |
| `/ops/backups` KEPT (P41, sin rename)                                                | backend ops                                | backend `:3030`             | vite específico intacto        | manual  |
| `/socket.io`                                                                         | backend (WS 12 eventos)                    | `:3030`                     | ws:true                        | live    |

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
- Gates T1/T2/T3 rápidos (deprecation-check + green) + FINAL REVIEW definidos con evidencia enlazada.
- Tramos solo referencian contratos (grep de redefiniciones = 0).
- Cero borrado deprecated fuera de la FINAL REVIEW (grep `@deprecated` en backend > 0 hasta el todo 9).
