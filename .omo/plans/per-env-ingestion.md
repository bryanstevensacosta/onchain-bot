# per-env-ingestion - Work Plan

## TL;DR (For humans)

**What you'll get:** cada entorno con su ingestion propia (staging-gemelo con tu cuenta vieja de dev, dev-local con la cuenta nueva y 3-4 canales), el registro multi-backend y el código muerto eliminados, y rollback rápido para prod. Sin duplicar disco a lo loco: el gemelo arranca vacío y crece solo si lo pides.

**Why this approach:** twin primero (infra nueva sin tocar prod), simplificación después (misma imagen → validada en staging antes de rozar prod), rollback al final (red de seguridad documentada y probada en el gemelo).

**What it will NOT do:** no canary en paralelo (imposible con 1 sesión por cuenta — el rollback rápido es la red real), no espeja fuentes de prod a staging, no toca scoring/backend pipeline, no métricas nuevas.

**Effort:** Medium (10 todos + final + paso manual go-live)
**Risk:** Medium - el borrado viaja en la misma imagen (mitigado: stream byte-idéntico + suites + staging valida primero); el twin es infra nueva sin tráfico real; el go-live prod es manual con tu OK
**Decisions to sanity-check:** cuentas (staging=vieja-dev, local=nueva); gemelo arranca VACÍO; rollback-seconds en vez de canary; tabla de código muerto explícita abajo

Your next move: approve, or run a high-accuracy review. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, Medium risk, per-env ingestion (staging twin + account reshuffle + SSE simplification + fast rollback)

## Scope

### Must have

- Cuentas (decisión operador): staging-twin usa la VIEJA cuenta de dev; dev-local usa la NUEVA (3-4 canales); prod intacta. Sesiones NUNCA compartidas (una triple por env).
- Gemelo staging: compose propio (`:3033`→`:3031`, proyecto/contenedor propios, `.env.staging` con triple vieja-dev, uploads separados, DB `alpha_meta_token_scanner_staging_ingestion` — ENMIENDA invariante #3), BACKEND_URL staging, red staging. Arranca VACÍO de fuentes (sin seed, sin mirror prod).
- Simplificación SSE con tabla de disposición explícita (misma imagen → rige para prod también):
  | Pieza | Destino | Dónde |
  |---|---|---|
  | `StreamService` broadcast | KEEP (única vía) | `src/stream/` |
  | `SSEBroadcastService` + bloque dual en core.module | DELETE | stream + core.module |
  | Gate 401 + param backendId | DELETE | sse-stream.controller |
  | Controller registro + DTO + registry service + entity | DELETE | stream/ |
  | Union/diff de canales | DELETE | registry service |
  | Inline registration en adapter backend (boot/retry/keep-alive/status) | DELETE | backend adapter |
  | `DisconnectionTracker` | DELETE (+ ajustar warnings de `/api/health` que lo consumen) | stream/ |
  | `BackfillBuffer` + entity + rama lastSeenTimestamp + eventos | DELETE | stream/ |
  | `BackendCircuitBreakerService` | DELETE (ni siquiera wireado) | stream/ |
  | Keys `SSE_RECONNECT_*` ingestion | KEEP (verificado round-2: parseadas en stream.config + heartbeat drive en stream.service + spec asserts defaults — corrección a la tabla anterior) | stream.config |
  | Legacy `stream.controller` sin auth (colisiona ruta con el gateado) | DELETE (queda sse-stream.controller sin gate) | stream/ |
  | Backend muerto post-plan: bloque registration inline en adapter SSE (boot/retry/keep-alive/status + tipos + `subscribe` sin backendId) | DELETE | backend adapter + specs |
  | Backend `BACKEND_ID` (app.config + fallback adapter) | DELETE solo si grep-cero tras lo anterior (si algo lo sigue leyendo, KEEP + reportar) | backend config |
  | Backend `config-validator.ts:172-192` Tier-1 + `:225-236` Tier-3 MTPROTO requires | ATÓMICO con app.config MTPROTO reads (los 3 flipan juntos; grep `INGESTION_TELEGRAM_MTPROTO_` en backend o vacío total o keep total) | backend config |
  | Backend modo legacy MTProto (`INGESTION_TELEGRAM_MTPROTO_*` + adapter legacy + specs + wiring) | DELETE CONDICIONAL: solo si inventario prueba cero referencias vivas Y staging/prod corren SSE (`USE_SSE_INGESTION=true` verificado); si no, se deja + se documenta | backend |
  | Vars muertas: `INGESTION_MULTI_BACKEND_ENABLED`, `INGESTION_BACKFILL_BUFFER_SIZE`, `INGESTION_BACKFILL_RETENTION_HOURS` (ingestion) | DELETE de templates, `.env.*` y código que las lea | env + config |
  | KEEP: heartbeat (env), reconnect backend (env), cursors LastSeen, dedup source-side | — | — |
- Reapuntado staging backend → gemelo (compose env + templates) + guía de alta de canales staging.
- Deploy: parametrizar `deploy-ingestion.yml` (bloque staging: env/red/puerto/backup/migraciones/healthcheck/smoke `:3033`) + socat/firewall `:3033` + smoke por instancia.
- Rollback rápido prod (NO canary): job/paso que re-levanta el tag anterior verificado + healthcheck + runbook + drill probado en el gemelo (downtime segundos por reconnect SSE, no minutos).
- Docs: enmendar invariantes #1 (singleton→por-env), #2 (una sesión por env, jamás compartida), #3 (DB staging-ingestion permitida), #7 (composes) + runbook twin + mapa de las 3 triples (sin secretos) + referencia env.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO canary paralelo con la misma cuenta (la tumbaría por sesión duplicada); NO mirror prod→staging; NO seed del gemelo (vacío por diseño)
- NO tocar scoring/reputación/pipeline backend, retention/stream/media más allá de lo listado, MTProto salvo nueva sesión dev, frontend salvo upstream staging + URLs (item 3)
- NO métricas nuevas; NO replay/backfill real; NO PublishingMode; NO overview.md del operador
- Secretos (triples/sesiones) JAMÁS en repo ni evidencias (solo nombres de vars)

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + specs actualizados/eliminados con su código; Jest co-locado; `tsc --noEmit` limpio por app y todo
- Borrado probado por `grep` vacío + suites verdes + `migration:show` limpio; rollback drill en gemelo con downtime medido
- Evidence: .omo/evidence/task-<N>-per-env-ingestion.txt

## Execution strategy

### Parallel execution waves

- Wave 1 (twin, 3 todos): T1 compose+env+cuentas, T2 deploy workflow + DB staging, T3 reapuntado backend + guía (tras T1)
- Wave 2 (simplificación, 2 todos paralelizables): T4 borrado SSE (tabla explícita), T5 swap cuenta dev-local (tras gen-session operador)
- Wave 3 (red + docs, 2 todos): T6 rollback rápido + drill, T7 docs e invariantes
- Wave 4: Final verification wave F1-F4 en paralelo
- PASO FINAL (post-F1-F4): item 8 go-live prod, MANUAL, requiere tu confirmación tras staging verde (no se ejecuta solo)
- Wave 4 (post-review): item 9 orden + rollbacks, luego RE-RUN F1–F4 (el item 9 toca workflows tras el pass — la Final Wave debe re-verificar)

### Dependency matrix

| Todo                                             | Depends on                                                       | Blocks                   | Can parallelize with |
| ------------------------------------------------ | ---------------------------------------------------------------- | ------------------------ | -------------------- |
| T1 twin compose+env                              | —                                                                | T2, T3                   | —                    |
| T2 deploy staging                                | T1                                                               | T6                       | T3                   |
| T3 reapuntado+guía                               | T1                                                               | —                        | T2                   |
| T4 borrado SSE                                   | —                                                                | T6                       | T5                   |
| T5 swap dev                                      | operador (triple nueva)                                          | —                        | T4                   |
| T6 rollback+drill                                | T2, T4                                                           | —                        | T7                   |
| T7 docs                                          | —                                                                | —                        | T6                   |
| 8 go-live prod (MANUAL)                          | F1–F4 + T2 :prev + T6 drill + T3 traffic + USE_SSE + OK operador | —                        | —                    |
| 9 deploy ordering + rollbacks (Wave 4)           | —                                                                | F1–F4 re-run             | —                    |
| 10 semantic dedup (Wave 5, bloqueante PR master) | —                                                                | F1–F4 re-run + PR master | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

- [x] 1. Gemelo staging: compose + env + cuentas asignadas
     What to do: `docker-compose.staging-ingestion.yml` (name/contenedor propios, `127.0.0.1:3033:3031`, env_file `.env.staging` NUEVO, uploads bind separado, red staging-net, INTERNAL 3031). `.env.staging.template` (espejar prod template con triple VACÍA + `INGESTION_DATABASE_NAME=alpha_meta_token_scanner_staging_ingestion` + BACKEND_URL staging + REDIS staging). Documentar mapa de cuentas (prod=actual, staging=VIEJA-dev, local=NUEVA — sin secretos, solo qué-triple-va-dónde + pasos `telegram:gen-session` para la nueva). Verificar `:3033` libre en Oracle (grep FW_PORTS + ss) y reservarlo en `bootstrap-droplet.sh` + socat template.
     Must NOT do: tocar compose prod, credenciales reales, staging backend aún (T3), sembrar fuentes.
     Parallelization: Wave 1 | Blocked by: — | Blocks: T2, T3
     References: `apps/backend/docker-compose.ingestion.yml` (plantilla 70 líneas: name, 3032-map, binds, env prod hardcodeado), `apps/ingestion-telegram/.env.production.template` (schema 96 líneas), `bootstrap-droplet.sh` (FW_PORTS), `infra/systemd/socat-ingestion.service.template`, `scripts/install-socat-services.sh` (prod-only staging gap).
     Acceptance criteria: `docker compose -f docker-compose.staging-ingestion.yml config` válido con env DUMMY únicamente (jamás con triple real — el output interpolaría la sesión); `grep -rn '3032\|onchain-bot-ingestion-telegram\b\|../backend/uploads' <nuevo compose>` vacío (cero colisiones puerto/proyecto/volumen); pre-boot triple-inequality assert documentado (hashes, nunca valores; aborta si dos coinciden); triple staging como pendiente-de-operador si falta (solo nombre de var).
     QA scenarios: happy — config parsea + validación app.config pasaría con triple dummy (spec o tsc); failure — puerto/proyecto duplicado → compose lo rechaza y se corrige. Evidence .omo/evidence/task-1-per-env-ingestion.txt
     Commit: Y | feat(ingestion): staging twin compose and env

- [x] 2. Deploy workflow parametrizado (staging) + DB staging + :prev
     What to do: Bloque staging en `deploy-ingestion.yml` (o job gemelo): env `staging`, red staging-net, healthcheck `:3033/api/health`, backup `alpha_meta_token_scanner_staging_ingestion` (DB se crea al primer migrate — documentar), migraciones contra staging DB, smoke `:3033/api/feed/sources` + SSE headers + SOURCES-COUNT (200 con `[]` explícito-vacío-OK vs N esperado — sin este assert el smoke da falso verde) + smoke VERSIONADO (pre-T4 espera 400 sin backendId en `/api/ingestion/stream`; post-T4 espera 200 — versionar el script por gate). `ENVF` pineado por job (quitar fallback legacy del job staging). FIJAR `:prev` en cada deploy bueno (tag+push `:prev`, retener 1-2 releases — T6 lo consume; sin esto el rollback es inejecutable). Socat+firewall `:3033` (unit + FW_PORTS + loop socat) ANTES del primer healthcheck (orden: firewall/socat → deploy → smoke). NO tocar el bloque prod (solo añadir).
     Must NOT do: cambiar flujo prod; desplegar nada (el operador dispara); sembrar datos.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 6
     References: `.github/workflows/deploy-ingestion.yml` (141 líneas: triggers master+dispatch, backup, migrate, recreate, healthcheck `:3032`, smoke connected>=1), `scripts/install-socat-services.sh:50-57,119-126` (prod-only hoy), `bootstrap-droplet.sh:100` (FW_PORTS) + loop socat 3030/3031/3032, `scripts/smoke-prod.sh:62-89` (probes a versionar).
     Acceptance criteria: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy-ingestion.yml'))"` exit 0 + `grep -n '3033\|staging' .github/workflows/deploy-ingestion.yml` muestra env/red/puerto/backup/migrate/healthcheck/smoke del lane staging + `grep -n ':prev' .github/workflows/deploy-ingestion.yml` muestra pin en deploy bueno + `npm run migration:show` local limpio (app ingestion, DB dev).
     QA scenarios: happy — cada paso del lane referencia `:3033`/staging DB (checklist en evidence); failure — `ENVF` legacy alcanzable desde el job staging → se elimina el fallback (assert por inspección del diff). Evidence .omo/evidence/task-2-per-env-ingestion.txt
     Commit: Y | ci(ingestion): staging deploy lane and firewall

- [x] 3. Reapuntado staging (backend + frontend) + guía de alta (+ checkpoint de tráfico)
     Estado 2026-09-22: gemelo sirviendo :3033 + backend staging reapuntado (env + clientes verificados) + tráfico OBSERVADO (48 msgs cointelegraph en twin, 14 matched en backend). COMPLETO.
     What to do: `INGESTION_TELEGRAM_URL` staging → gemelo en TRES sitios (no solo templates): `docker-compose.staging.yml` env (línea ~96, es lo que gana en runtime), archivo REAL en Oracle `/opt/.../.env.staging` (gitignored — el template no corre; documentar el valor a poner), `.env.staging.template` (línea ~72, para futuros clones). Grep frontend-staging hacia `:3032`/singleton. FRONTEND STAGING (hallazgo verificado: `apps/frontend/nginx.conf:252-256` hardcodea upstream al singleton prod para AMBOS tags — tras el gemelo el staging mostraría datos de prod mientras su backend lee el twin = split-brain UI): crear `apps/frontend/nginx.staging.conf` con upstream al gemelo (DNS staging + `:3031` interno) + `Dockerfile` con MECÁNICA EXACTA (multi-stage: el ARG vive en build, el COPY en runtime): (1) crear PRIMERO `nginx.staging.conf` (copia con ÚNICO cambio: upstream twin, preservando verbatim lazy-DNS `nginx.conf:252-256`); (2) re-declarar `ARG VITE_APP_ENV` tras el segundo FROM + condicional vía `RUN if`+cp (COPY no expande ARG en source); (3) build AMBOS tags (prod sin arg + staging con arg) y `grep` del default.conf horneado (prod→singleton, staging→twin) — OBLIGATORIO, sin pass por inspección; (4) drift guard: snippet `include` o check `diff` solo-hunk-upstream con dueño dual-apply. Twin ∈ `onchain-bot-staging-net` como precondición DNS. SMOKE STAGING: re-apuntar `deploy-staging.yml:414 SMOKE_INGESTION_URL` → `:3033` + versionar probe SSE por gate). `DEFAULT_INGESTION_TELEGRAM_URL` (`app.config.ts:87`) es default LOCAL — documentar que no se toca. Mini-guía alta de canales staging (POST manual, 2-3 de test, rollback por DELETE). El gemelo arranca VACÍO por diseño (sin seed). CHECKPOINT DE TRÁFICO (gate, no texto): gemelo sirve (`:3033/api/feed/sources` 200) → backend reapuntado → tráfico OBSERVADO (1 mensaje o probe SSE con datos) antes de declarar verde.
     Must NOT do: tocar prod; tocar lógica backend (solo URLs); sembrar prod.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: —
     References: `docker-compose.staging.yml:96` + header singleton `:1,10-17` (a enmendar en T7), archivo real en Oracle `.env.staging` (ruta exacta en evidence), `.env.staging.template:72`, `apps/ingestion-telegram/docs/guides/ADD_FEED_SOURCE.md` como patrón.
     Acceptance criteria: `grep -rn 'onchain-bot-ingestion-telegram:3031' docker-compose.staging.yml .env.staging.template` vacío de singleton (staging) Y `grep -n onchain-bot-ingestion-telegram:3031 apps/frontend/nginx.conf` NO vacío (prod intacto) + `test -f apps/frontend/nginx.staging.conf && grep -n staging apps/frontend/nginx.staging.conf` (+ archivo real verificado por operador, checklist); `apps/frontend/nginx.staging.conf` existe con upstream gemelo + Dockerfile COPY condicional por `VITE_APP_ENV` (inspección + `docker build` staging-target si es barato, si no inspección rigurosa); tsc limpio frontend (`tsc -b`); guía existe + `docs:check` exit 0; checkpoint de tráfico registrado en evidence (backend + UI staging contra gemelo).
     QA scenarios: happy — backend staging + UI staging contra gemelo + 1 probe con datos OBSERVADOS; failure — 0 mensajes tras alta de 2-3 canales + una ventana de polling = FAIL (no advisory); URL vieja remanente → grep la caza. Archivo real: /opt/onchain-bot-staging/.env.staging (desde .env.staging.template:4), aplicado por OPERADOR antes del recreate + grep pre/post en evidence. Evidence .omo/evidence/task-3-per-env-ingestion.txt
     Commit: Y | chore(staging): point backend and frontend at staging twin

- [x] 4. Borrado SSE + código muerto (tabla explícita)
     What to do: INVENTARIO PRIMERO (grep cada símbolo y listar consumidores en evidence antes de borrar nada: `backendId`, `getRegisteredBackendIds`, `RegistrationResult`, `channelUnionSize`, `sourceWhitelist`, `getActiveChannels`, `lastSeenTimestamp`, `backfill-unavailable`, `MULTI_BACKEND`, `BACKFILL_BUFFER`, `BACKEND_ID`, `INGESTION_TELEGRAM_MTPROTO_` en backend, adapter legacy MTProto + su wiring/specs). Luego ejecutar la tabla de disposición del Scope (12 deletes + keeps + filas backend — `SSE_RECONNECT_*` EXCLUIDOS, se conservan) en ingestion + adapter backend: borrar ficheros+specs+wiring (registry controller/DTO/service/entity, union, SSEBroadcast + bloque dual core.module, tracker + ajustar warnings `/api/health`, buffer+entity+rama+eventos, breaker, keys config, legacy controller, inline registration backend + BACKEND_ID si queda huérfano, adapter legacy MTProto SOLO si el inventario lo declara muerto, vars muertas de templates y código). Limpieza `.env` STAGING backend: quitar del template `.env.staging.template` (+ nota para el archivo real en Oracle) las vars confirmadas muertas por el inventario. `subscribe()` backend conserva el loop pero SIN param backendId. Actualizar specs que asertaban gate/registro (reescribir a nueva forma, no borrar a ciegas). `grep` vacío por cada símbolo borrado.
     Must NOT do: tocar broadcast `StreamService`, heartbeat, reconnect, cursors, dedup, retention/media, lógica backend; cambiar comportamiento del stream (byte-idéntico).
     Parallelization: Wave 2 | Blocked by: — | Blocks: T6
     References: la tabla del Scope + paths del explore (`stream.service.ts:227-251` keep, `sse-broadcast.service.ts:55-183` delete, `sse-stream.controller.ts:128-139` gate, adapter backend `:149-157,552-731`, `stream.controller.ts:99-108` legacy, `disconnection-tracker`, `backfill-buffer`, `backend-circuit-breaker`, `stream.config.ts` keys, `computeChannelDiff`).
     Acceptance criteria: greps vacíos por símbolo (lista en evidence, INCLUIDO inventario backend legacy con veredicto borrar/mantener); `npx tsc --noEmit` limpio ambas apps; suites stream/core/adapter/backend-adapter verdes + full ingestion/backend verdes (salvo 29 preexistentes conocidos); boot ingestion libre + `curl /api/feed/sources` 200 y SSE conecta SIN register previo (prueba viva de que el gate sobraba); template `.env.staging.template` sin vars muertas.
     QA scenarios: happy — SSE streaming sin handshake; failure — spec vieja que asertaba 401 → reescrita (no skip). Evidence .omo/evidence/task-4-per-env-ingestion.txt
     Commit: Y | refactor(ingestion): drop multi-backend layer and dead code

- [x] 5. Swap cuenta dev-local (nueva, 3-4 canales) — REQUIERE OPERADOR (gen-session)
     Estado 2026-09-22: triple ACTUAL de dev movida a `.env.staging`; `.env` dev con triple NUEVA (operador); 1 canal `@cointelegraph` (-1001072723547, crypto-news) verificado con mensajes reales fluyendo; muertos eliminados. COMPLETO.
     What to do: El OPERADOR genera la sesión cuenta NUEVA (`telegram:gen-session`, salida redactada: pipear a archivo, jamás pegar en terminal-evidence) ANTES de este todo (gate: FAIL si triple dummy). Con triple real: `.env` dev con la triple (verificar precedencia `.env.dev` vs `.env` — editar el archivo que REALMENTE gana según `ConfigModule.envFilePath`, no asumir) + reseed vía `POST /api/feed/sources` en dev DB (NO editar seeds — están muertos en runtime) con 3-4 canales (lista del operador) + boot dev verifica (`curl :3031/api/health` 200 + 1 mensaje real fluye por SSE). Documentar canales y volúmenes. NUNCA commitear `.env`/`.env.dev` (solo seeds/docs; `git status` verificado antes de cada commit).
     Must NOT do: tocar staging/prod; reutilizar triples viejas en dev; commitear secretos (check `git diff --cached` en el commit); usar `compose config` con env real.
     Parallelization: Wave 2 | Blocked by: operador (triple nueva generada) | Blocks: —
     References: `apps/ingestion-telegram/.env.example` (schema), `POST /api/feed/sources` (dev), guía dev-LOCAL Mac.
     Acceptance criteria: boot dev completo + `curl :3031/api/health` 200 + 1 mensaje real fluye (criterio único, sin alternativa laxa) + `grep` triple vieja ausente del `.env` EFECTIVO (el que gana por precedencia) + `git status` sin `.env*` trackeados.
     QA scenarios: happy — flujo E2E dev; failure — sesión inválida → error claro de validación config (fail-fast), no boot a medias. Evidence .omo/evidence/task-5-per-env-ingestion.txt (SIN secretos — pre-commit `grep -E '[0-9a-f]{10,}'` sobre la evidence)
     Commit: Y (SOLO seeds/docs — jamás .env) | chore(dev): switch local ingestion to new account

- [x] 6. Rollback rápido + drill en gemelo (single-flight estricto)
     Estado 2026-09-22: drill LOCAL PASS 14s + drill en gemelo PASS (rollback-staging a :staging-prev OK + forward OK, gemelo healthy, fuentes intactas, sin AUTH issues). COMPLETO.
     What to do: Paso/job `rollback-ingestion` (prod y staging): re-levantar tag anterior verificado (`:prev` fijado en cada deploy bueno por T2) + healthcheck gate + runbook `docs/deployment/ingestion-rollback.md` (cuándo, comando exacto, qué verificar, downtime esperado = segundos por reconnect; + sección AUTH_KEY_DUPLICATED: dos contenedores con la misma triple JAMÁS coexisten — stop verificado-antes-de-start, recovery interactivo únicamente). DRILL real contra el gemelo staging (único lugar seguro): desplegar tag viejo→nuevo→rollback, medir downtime SSE (timestamps), PASS si <60s sin intervención manual.
     Must NOT do: canary paralelo (imposible por sesión única — documentado en runbook como no-opción); tocar prod en el drill (gemelo only); overlapping stop/start (single-flight).
     Parallelization: Wave 3 | Blocked by: T2, T4 | Blocks: —
     References: `deploy-ingestion.yml` (recreate + healthcheck como base), tags GHCR (`:sha/:latest` + nuevo `:prev` a fijar en deploy bueno).
     Acceptance criteria: drill ejecutado con tiempos en evidence; runbook existe + `docs:check` exit 0.
     QA scenarios: happy — rollback <60s; failure — healthcheck falla tras rollback → runbook indica reintento + escalado (documentado, no automatizado a ciegas). Evidence .omo/evidence/task-6-per-env-ingestion.txt
     Commit: Y | ci(ingestion): fast rollback lane plus drill

- [x] 7. Docs e invariantes enmendadas (incl. AGENTS.md ×4 al cierre)
     What to do: Enmendar root AGENTS.md #1 (singleton→por-env), #2 (una triple por env, jamás compartida + mapa sin secretos), #3 (DB staging-ingestion permitida), #7 (composes por env) + `apps/backend/AGENTS.md` + comentarios singleton `docker-compose.staging.yml:1,10-17` (hoy prohíben segundo ingestion — actualizarlos o contradicen el gemelo) + ingestion-telegram AGENTS (gaps que mueren: multi-backend, backfill muertos, circuit) + `apps/frontend/AGENTS.md` (upstream ingestion por env: prod-singleton vs staging-twin, `nginx.staging.conf`, proxy `/ingestion-api`, páginas que leen feed) + runbook twin (arranque, envs, puertos, DBs) + referencia env (triples map + `:3033`). NO tocar overview.md del operador.
     Must NOT do: reescribir docs enteras (enmiendas quirúrgicas); secretos en ningún doc.
     Parallelization: Wave 3 | Blocked by: — | Blocks: —
     References: `AGENTS.md` (invariantes), `apps/ingestion-telegram/AGENTS.md` (gaps), `docs/deployment/` (runbook), `docs/configuration/CRYPTO_NEWS_ENV_REFERENCE.md`.
     Acceptance criteria: `docs:check` exit 0; cada invariante cita el nuevo modelo; SWEEP: `grep -rniE 'singleton|único|onchain-bot-ingestion-telegram:3031|localhost:3032' docs/ scripts/ .github/ apps/*/AGENTS.md` triado línea a línea en evidence (amend vs keep-explícito-prod-only): runbook, env-reference, ADD_FEED_SOURCE, checklist/FAQ/migration-plan, smoke URLs de ambos deploys, socat/firewall templates; cero secretos (`grep -ri 'api_hash.*[0-9a-f]\{10\}' docs/ .omo/plans/` vacío salvo dummies documentados).
     QA scenarios: happy — lector nuevo entiende el modelo en 5 min (criterio del revisor F1); failure — n/a. Evidence .omo/evidence/task-7-per-env-ingestion.txt
     Commit: Y | docs(ingestion): per-env model and amended invariants

## High-accuracy review (2026-09-22) — FIXES APLICADOS, ROUND 4 (ITEM 9) INTEGRADO

> Round 4 (momus + metis sobre item 9): decisión cerrada `workflow_run` real (no colapso, no `needs.` ficticio); anti-double-fire con paths+matriz; rollback table por lane con tags namespaced + prune exemption + doctrina code-only/dump-restore; concurrency unificada por target + timeouts + cancel-doctrine; smoke patrón T2 + summary; dispatch con bypass explícito. Item 9 reescrito completo.
> Round 3 (momus + metis delta frontend/backend/go-live): T3 mecánica nginx exacta (ARG re-declarado, RUN-if, build ambos tags + grep horneado, drift guard, twin ∈ staging-net, smoke re-point :3033, checkpoint hard-FAIL, archivo real pineado); item 8 USE*SSE corregido + tabla 4b + rollback nombrado + deps T2/T6/T3; filas validator atómicas; sweep T7 en vez de lista cerrada; NITs (dup, scripts/, 4b)., ROUND 2 INTEGRADO
> Round 1 (momus + metis TOP-3). Round 2 (momus APPROVE WITH CHANGES + metis delta go-live): corrección factual `SSE_RECONNECT*\*`→KEEP; item 8 reescrito (preconds vinculadas, curls exactos, re-diff+freeze, pg_dump obligatorio, tabla per-var con BACKEND_URL doble-grep y BACKEND_ID keep, rollback nombrado backend+ingestion, counts en vivo sin hardcodear); matriz item 8 con deps T2/T6/T3/USE_SSE.
Round 1 (momus APPROVE WITH CHANGES + metis pre-mortem TOP-3: triple-duplication, shared-image mis-scope, twin-unreached): integrado — T2 comandos exactos + `:prev` productor + smoke versionado + sources-count; T5 gate operador + no-commit .env + precedencia + seeds vía API; T3 archivo real + frontend + checkpoint tráfico; T6 single-flight + AUTH recovery; T7 backend AGENTS + staging-compose comments; T1 dummy-only + triple-inequality + refs completas.

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete. NOTA: tras el item 9 la Final Wave se RE-EJECUTA (F1–F4 ya pasaron una vez pre-item-9; el re-run es obligatorio porque el 9 toca workflows).

- [x] F1. Plan compliance audit (re-run tras item 10)
- [x] F2. Code quality review (re-run tras item 10)
- [x] F3. Real manual QA (re-run tras item 10)
- [x] F4. Scope fidelity (re-run tras item 10)

## Wave 5 (bloqueante PR dev→master)

- [x] 10. Dedup semántico cableado en enqueue (BLOCKED real)
      What to do: Cablear `DeduplicationService` en el enqueue crypto-news (punto exacto: `EnqueueMatchingMessageUseCase` o scheduler — leer ambos y elegir el que ve el contenido filtrado ANTES del insert; si hay dos candidatos, el que ya maneja cap/cola): por cada candidato (a) `checkSemantic()` contra fingerprints recientes (ventana = TTL queue 24h + margen; threshold `DEDUP_SEMANTIC_ARBITER_THRESHOLD` default 0.7, sin cambiar), (b) duplicado → entry BLOCKED con `duplicate_of_*` (channel/message/queue-entry id según entity `publisher-queue-entry.entity.ts:75-79`), (c) único → enqueue normal + `storeFingerprint()` al publicar (para que futuros checks tengan datos). Corre en modo raw Y llm (el chequeo es previo al LLM, barato ~100ms CPU). Modelo: verificar carga en init (log `✓ Embedding model loaded` existe en código — probar en staging/dev boot; si no carga tras timeout documentado, el check degrada a exact-match-only, NUNCA bloquea enqueue — fail-open registrado en spec).
      Must NOT do: cambiar matching/keywords/LLM/publish/cap/TTL; tocar threads publisher (importa el módulo pero no lo usa — follow-up documentado, no aquí); cambiar threshold; tocar retention/stream/media/SSE; commits de datos (specs con embeddings reales? usar fixtures/mocks + 1 test de integración opcional con modelo real si corre en CI en <60s, si no mock).
      Parallelization: Wave 5 | Blocked by: — | Blocks: F1–F4 re-run + PR master
      References: `apps/backend/src/shared/deduplication/` (service, store port, embedding.service, Fingerprint VO), `EnqueueMatchingMessageUseCase` + `EnqueueMatchingCronScheduler` (punto de inserción), `publisher-queue-entry.entity.ts:75-79,338` (campos duplicate_of + guarda BLOCKED), `DEDUP_SEMANTIC_ARBITER_THRESHOLD` (`app.config.ts:561`, default 0.7).
      Acceptance criteria: specs — duplicado semántico → BLOCKED con refs (assert campos), único → PENDING + fingerprint guardado (assert store), modelo caído → enqueue sigue (fail-open spec); `npx jest deduplication crypto-news-publisher` verde; `npx tsc --noEmit` backend limpio; prueba viva en staging (forzar duplicado real oferta: publicar 2 veces el mismo contenido vía API y ver 2º BLOCKED — diseñar el probe en evidence).
      QA scenarios: happy — duplicado → BLOCKED; failure — store caído → enqueue continúa (fail-open, spec). Evidence .omo/evidence/task-10-per-env-ingestion.txt
      Commit: Y | feat(publisher): wire semantic dedup into enqueue

## Wave 4 (post-review, pre re-run Final)

- [x] 9. Orden ingestion→backend→frontend + rollbacks + concurrency + smoke unificado
     DECISIÓN ARQUITECTÓNICA (cerrada, no rebatir sin review): `workflow_run` real, NO colapsar workflows. `needs.` cross-workflow no existe en GitHub Actions — el contrato es `on.workflow_run` + guard `github.event.workflow_run.conclusion == 'success'` + `ref` pineado + anti-loop (las legs de cadena jamás re-disparan su upstream; exclusión actor bot). Rationale: un solo workflow gigante rompería ownership por servicio; el guard de conclusión + ref hace lo mismo con 1/10 del churn.
     What to do: (a) CADENA por `workflow_run`: ingestion(master→prod OK) ⇒ backend prod ⇒ frontend prod; gemelo OK ⇒ backend staging ⇒ frontend staging. Cada leg: `on: workflow_run: workflows:[<upstream exacto>] types:[completed] branches:[master|dev según env]` + `if: github.event.workflow_run.conclusion=='success'` + pin de `ref` al SHA upstream (documentar semántica default-branch: workflow_run corre la definición de la rama POR DEFECTO — pineado explícito o deriva). (b) ANTI-DOUBLE-FIRE (obligatorio, es bug determinista hoy): `paths:` en `deploy.yml` (backend/frontend paths) y `deploy-staging.yml` (staging paths) + matriz trigger×paths en evidence + drill de dos pushes (push ingestion-only ⇒ backend buildeado UNA vez); regla: donde la cadena es dueña, el leg `push` se elimina o se guarda con skip-when-chain-ran; interplay documentado con el gate `deploy.yml:221-242` (liveness, no version-match — se mantiene como backstop, no como prueba). (c) ROLLBACK por lane (tabla cerrada; prod y staging): backend-prod, frontend-prod, backend-staging, frontend-staging — cada uno con: job/workflow destino EXACTO, tag pin con namespace SIN colisionar (`:prev-backend`, `:prev-frontend`, `:staging-prev-backend`, `:staging-prev-frontend` — jamás `:prev` a secas), paso de pin en cada deploy bueno, exención explícita en los `docker image prune -af` (`deploy.yml:211-219`, `deploy-staging.yml:227-235`) para no GCear rollback targets, runbook espejo de `docs/deployment/ingestion-rollback.md` §§2-5 (stop→verify-stopped→start, pull PROHIBIDO en rollback, AUTH/single-flight donde aplique). DOCTRINA DE DATOS (cerrada): rollback = code-only; migraciones NUNCA revierten solas (roll-forward); datos = restore desde `pg_dump` pre-deploy (procedimiento con artifact path en el runbook); `migration:show` + counts como asserts post-rollback. (d) CONCURRENCY unificada: UN grupo por target físico compartido entre los 3 workflows (`ingestion-staging-target` = `/opt/onchain-bot-staging`, `ingestion-production-target` = `/opt/onchain-bot`) — cubre la carrera gemelo-vs-`deploy-staging.yml` de hoy; `cancel-in-progress:false` en lanes con migraciones (tradeoff aceptado y documentado: un commit roto bloquea la cola tras él) + `timeout-minutes` en TODOS los jobs (ningún job retiene el runner único para siempre); política supersede-queued-not-running explícita. (e) SMOKE unificado: patrón `smoke-prod.sh` (`SMOKE_TIMEOUT=10`, `SMOKE_SSE_TIMEOUT=8`, sources-count explicit-empty-OK, SSE 200-headers) + `GITHUB_STEP_SUMMARY` con versiones/health links por eslabón. (f) DISPATCH con cadena: el dispatch ejecuta los mismos gates o logea `bypass explícito con motivo` en el summary (nunca silencioso).
     Must NOT do: reescribir workflows enteros (quirúrgico por job/step); rollbacks automáticos (siempre dispatch manual); tocar código de apps, secretos, `.env*` reales; doble deploy por push (prohibido por acceptance); `docker image prune` sin exención de pins.
     Parallelization: Wave 4 | Blocked by: — (lee el estado dejado por 1–7) | Blocks: F1–F4 re-run
     References: `.github/workflows/deploy-ingestion.yml` (lanes + pins `:prev`/`:staging-prev` + concurrency + `needs.deploy.result` del auto-follow), `.github/workflows/deploy.yml:3-10,42,55,211-242,294-307` (triggers sin paths, tags, prune, gate liveness, health loops), `.github/workflows/deploy-staging.yml:4-11,18-70,102,115,227-235,341-394,410-433` (idem staging + wait-for-ci + force-recreate + SMOKE_INGESTION_URL), `docs/deployment/ingestion-rollback.md` (§§2-5 patrón + §6-7 tags/drill), `scripts/smoke-prod.sh` (probes versionadas).
     Acceptance criteria (TODO ejecutable, cero inspección vaga): `python3 -c "import yaml; [yaml.safe_load(open(f)) for f in [...3 workflows...]]"` exit 0 + `grep -n 'workflow_run' .github/workflows/deploy*.yml` muestra bloques con `conclusion==success` + `grep -n 'paths:'` por workflow con la matriz trigger×paths en evidence + `grep -n 'concurrency:'` un grupo por target compartido + `grep -n 'timeout-minutes'` en todos los jobs + `grep -n 'prev-'` tags con namespace + prune con exención verificada por inspección del step + drill REAL en twin (dispatch cadena staging, assert downstream `conclusion==success` + SHA linkage en evidence — inspección sola NO vale para la cadena) + asserts post-rollback (`migration:show`, counts, `docker images | grep prev`) + hook AGENTS (ver QA).
     QA scenarios: happy — cadena twin end-to-end verde con SHAs linkados; failure — eslabón roto NO propaga (primer downstream skipeado por conclusión, evidenciado); storm: dos dispatch rápidos → segundo encola sin solapar ni matar migración viva (con timeout matando un job colgado — citar run IDs). Evidence .omo/evidence/task-9-per-env-ingestion.txt
  - HOOK AGENTS (adición 2026-09-23, petición operador): `.husky/pre-push` bloquea el push si `apps/<app>/**` cambió sin su `apps/<app>/AGENTS.md` en el rango pusheado (backend, ingestion-telegram, frontend por separado). El mensaje de bloqueo nombra el AGENTS.md faltante + ordena actualizarlo y pushear de nuevo + desaconseja explícitamente `--no-verify` (existe para emergencias; saltárselo pudre la base de conocimiento). Verificado con rangos reales (un rango que toca backend sin AGENTS → bloquea; con AGENTS → pasa; rama nueva sin upstream → fallback merge-base, sin falsos positivos). Commit: Y | ci(deploy): explicit service ordering plus rollbacks

## Commit strategy

- Un commit por todo (7 code + item 9) + final checkpoints; orden Wave 1→4; secretos jamás commiteados (verificar `git diff --cached` antes de cada commit). El item 8 NO genera commit (`.env` gitignored; su evidence SÍ se guarda).

## Success criteria

- 7 todos + item 9 + item 10 + F1–F4 (re-run tras item 10) APPROVE + item 8 con tu OK final; gemelo desplegable por dispatch/auto; gate SSE simplificado probado vivo; drill <60s; docs coherentes; `.env` prod sin vars muertas; publisher con dedup BLOCKED real (bloqueante PR master).
