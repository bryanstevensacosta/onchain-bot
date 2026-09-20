# deprecados-deuda-tecnica - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Una limpieza completa sin cambios de funcionamiento: se retira el modo antiguo de Telegram del backend, los conectores y copias ya vacías de noticias, los interruptores y variables viejas (incluida una columna de base de datos con copia de seguridad previa), los generadores de datos de prueba del servicio de ingesta, el código muerto del panel web y el ruido de registros, dejando versiones y documentación coherentes.

**Why this approach:** Por seguridad se trabaja por oleadas con pruebas verdes en cada paso y con la red de reemplazo ya activa; la decisión clave es no borrar a ciegas sino migrar primero a quienes usan cada pieza y comprobar que nadie la referencia, y tratar el único cambio destructivo de base de datos como una oleada separada con copia y autorización explícita.

**What it will NOT do:** No creará otro servicio de ingesta ni duplicará sesiones de Telegram, no borrará dependencias del panel sin pruebas de uso, no tocará rachas visuales ni protecciones de pantalla, y no moverá temas de infraestructura como migraciones de producción o accesos a medios a este plan.

**Effort:** Large
**Risk:** Medium - el cambio de base de datos es irreversible sin copia y romper inyección de dependencias detiene el arranque
**Decisions I made for you:** Traté esto como abierto y elegí defaults: mantener compatibilidad total sin cambios funcionales; aislar y luego borrar el modo antiguo en vez de convivir con él; dropear la columna vieja solo con copia y tu OK; no desinstalar dependencias del panel sin evidencia de uso; migrar registros a sistema estándar en vez de borrarlos a ciegas; unificar versiones por archivos de paquete; dejar fuera autenticación de medios, repetición de mensajes y multi-tenencia para otros planes; si tenías otro alcance en mente, veta cualquier default aquí.

Your next move: aprueba para $start-work, o pide high-accuracy review (dual Momus + Codex) antes de ejecutar. Full execution detail follows below.

---

> TL;DR (machine): Large, Medium (DB destructivo + DI) — retira MTProto backend, stubs crypto-news, flags/config, seeders, dead-code frontend y deuda transversal con 25 todos + F1-F4

## Scope

### Must have

- C1 backend MTProto: flip default USE_SSE_INGESTION=true, rama MTProto a error 410 Gone, borrar 8 servicios + adapter + safety-config + StubCryptoNewsMediaDownloader + specs, desvincular health/config controllers.
- C2 stubs crypto-news backend: migrar consumidores (QueueController y handlers) a DTO HTTP, borrar CryptoNewsMessageRepository, save/delete deprecated de SourceRepository, InMemory vacios, stub, VO duplicado, shims DI.
- C3 flags/config: quitar fallback INGESTION_SERVICE_URL + INGESTION_REMOTE_URL muerto + ghost filters.token.\* en seed, dropear columna llm_config.matching_enabled con backup+migracion (onda destructiva con owner-gate), alinear TELEGRAM_BOT_TOKEN docs/templates.
- C4 ingestion seeders: borrar KolSeeder + CryptoNewsSeeder + registros, mover seeds/\*.seed.ts a docs o borrar, quitar fetchActiveCryptoNewsSourceIds y fallback BACKEND_PORT.
- C5 frontend dead-code: quitar refs matchingEnabled/endpoints deprecated, eliminar dead URLs (kols.backfill, publishing.byToken, reprocess\*, llm-config /api prod), evidencia depcheck/knip sin prune a ciegas.
- C6a logger: migrar console.log hot path a Nest Logger (o borrar ruido con nivel debug).
- C6b versiones-docs: single-source package.json, corregir AGENTS + README badges/tabla/counts/links rotos.
- C6c tooling: añadir dev:ingestion + tsc ingestion en hooks/lint-staged, quitar alias discovery/_ + duplicated settings/_.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO crear instancias ingestion ni duplicar creds MTProto; NO definir ingestion en docker-compose.staging.yml/.prod.yml; NO tocar DB <base>\_ingestion fuera de seeders.
- NO dropear columna sin backup + migration:show + OK explícito del owner (A2 reversible=no).
- NO borrar port/símbolo sin lsp_find_references = 0 importadores no-spec.
- NO prune lucide-react/zustand/recharts/zod/msw sin depcheck+knip+vite build verdes; NO tocar ScoreTier mismatch ni error-boundaries (plan UI aparte).
- NO terraform untrack, NO synchronize→migrations prod, NO backfill/SSE-replay, NO auth MediaController, NO health stubs, NO multi-tenancy (planes propios).
- NO git reset --hard / revert --no-commit / pkill -f / commit en master; rama feat/\* desde dev@28c259a7, conventional commits.
- NO tocar untracked .kiro/, docs/opencode-session-transfer.md (dirty_worktree fuera de alcance).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + QA agent-executed (Jest backend, Jest ingestion, Vitest frontend, tsc, curl, Playwright smoke). TDD no aplica (refactor sin cambio funcional); cada todo incluye implementación+test en uno.
- Baseline canónica a fijar en T1 (AGENTS post-split dice backend 170 suites/1969 tests, ingestion 43/815; README dice 173+2e2e / 15+5e2e — T1 decide uno y lo pinnea).
- Evidence: .omo/evidence/task-<N>-deprecados-deuda-tecnica.log (comando+salida), dumps backup en /tmp/\*-cleanup/, migration:show outputs. Prohibido "verifica manualmente / clickea": todo curl, lsp_find_references, depcheck/knip, vite build, Playwright.
- Comandos canónicos: npm run test:backend; cd apps/ingestion-telegram && npm test; npm run test:frontend; npx tsc --noEmit -p apps/backend/tsconfig.json; npx tsc --noEmit -p apps/ingestion-telegram/tsconfig.json; npx tsc --noEmit -p apps/frontend/tsconfig.json; curl -s localhost:3030/api/health; curl -s localhost:3031/api/health + /ready + /live; curl -s localhost:3032/api/crypto-news/messages?limit=2; PATCH /llm-config con matchingEnabled→400.

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 1 (T1-T6): red de seguridad + C1 MTProto (experimento falseable A1 → flip default → borrado → desvinculación). 6 todos.
- Wave 2 (T7-T13): C2 stubs + C3 flags/config (migración consumidores → deletes → fallbacks → backup/gate → drop columna → tokens). 7 todos.
- Wave 3 (T14-T19): C4 seeders + C5 frontend (borrados ingestion → verificación :3032 → limpieza frontend → depcheck/knip → build+smoke). 6 todos.
- Wave 4 final (T20-T25): C6a/b/c transversal (logger → versiones-docs → tooling). 6 todos.

### Dependency matrix

| Todo                       | Depends on     | Blocks  | Can parallelize with |
| -------------------------- | -------------- | ------- | -------------------- |
| T1 baseline                | —              | T2-T25  | —                    |
| T2 inventario              | T1             | T3-T25  | T1                   |
| T3 experimento A1          | T1-T2          | T4-T6   | —                    |
| T4 flip default+410        | T3             | T5-T6   | —                    |
| T5 borrado MTProto         | T4             | T6      | —                    |
| T6 desvincular controllers | T5             | T7      | T7 (lectura)         |
| T7 migrar consumidores C2  | T6             | T8-T9   | —                    |
| T8 borrar ports/stubs      | T7             | T9      | —                    |
| T9 quitar shims DI         | T8             | T10     | T10 (lectura)        |
| T10 fallbacks+ghost        | T9             | T11-T13 | —                    |
| T11 backup+gate A2         | T10            | T12     | —                    |
| T12 drop columna           | T11 (owner OK) | T13     | —                    |
| T13 tokens/templates       | T12            | T14     | T14 (lectura)        |
| T14 borrar seeders         | T13            | T15-T16 | —                    |
| T15 seeds+fetchActive      | T14            | T16     | —                    |
| T16 verificar :3032        | T15            | T17     | —                    |
| T17 frontend legacy refs   | T16            | T18-T19 | —                    |
| T18 dead URLs+depcheck     | T17            | T19     | —                    |
| T19 build+smoke            | T18            | T20     | —                    |
| T20 logger hot path        | T19            | T21     | T21-T22              |
| T21 debug-noise            | T20            | T22     | T20,T22              |
| T22 versiones              | T20-T21        | T23     | T23-T24              |
| T23 README/docs            | T22            | T24     | T22,T24              |
| T24 tooling hooks          | T23            | T25     | T23,T25              |
| T25 tsconfig alias         | T24            | F1-F4   | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Baseline tests + tsc + health (red de seguridad) — DONE 2026-09-20: canónico medido backend 198 suites/2159 tests, ingestion 43/821, frontend 30 files/336 tests; tsc limpio 3 apps; :3030 200, :3031/:3032 refused. Evidencia .omo/evidence/task-1-deprecados-deuda-tecnica.log
     What to do: Fijar conteos canónicos (resolver 170/1969 vs README 173) ejecutando suites y tsc en 3 apps + curl health; guardar salidas. Must NOT do: no tocar código, no cambiar versiones, no pkill -f (PID explícito si hay que matar dev).
     Parallelization: Wave 1 | Blocked by: — | Blocks: T2-T25
     References: package.json scripts; apps/backend/package.json; apps/ingestion-telegram/package.json; apps/frontend/package.json; apps/backend/src/main.ts:60-205; AGENTS.md KNOWN DRIFT; README.md tabla Apps
     Acceptance criteria: npm run test:backend PASS con conteo anotado; cd apps/ingestion-telegram && npm test PASS; npm run test:frontend PASS; tsc --noEmit backend+frontend+ingestion sin errores nuevos; curl :3030/api/health y :3031/api/health+/ready+/live responden
     QA scenarios: happy=npm run test:backend (tool: bash, invocación exacta) evidencia .omo/evidence/task-1-deprecados-deuda-tecnica.log; failure=matarProcesoConPuertoOcupado debe fallar sin pkill -f (usa readlink /proc/<pid>/cwd para distinguir dev ubuntu vs prod opc) evidencia mismo log
     Commit: N | —
- [x] 2. Inventario residual @deprecated + referencias (ast-grep + LSP) — DONE 2026-09-20: 26 matches/23 archivos; importadores: MessageRepo 3 no-spec, QueueController:26,91, MtprotoAdapter 1, fetchActive 1 interno, Stub 0; drift queue.controller:205→:26/:91. Evidencia .omo/evidence/task-2-deprecados-deuda-tecnica.log
     What to do: Correr sg --pattern '@deprecated' --lang ts en apps/\*/src y lsp_find_references de cada port/servicio C1-C4; producir tabla archivo:línea + n importadores. Must NOT do: no borrar nada aún.
     Parallelization: Wave 1 | Blocked by: T1 | Blocks: T3-T25
     References: apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:37-65; apps/backend/src/telegram/ingestion/shared/shared-ingestion.module.ts:25-52,81-122,149-150,211-223; apps/backend/src/telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository.ts:4-69; .../crypto-news-source.repository.ts:22-53; apps/backend/src/telegram/ingestion/crypto-news/domain/crypto-news-message.stub.ts:1-21; .../value-objects/crypto-news-media.vo.ts:1-16; apps/ingestion-telegram/src/telegram/kol/seeders/kol.seeder.ts:7,46,52-55; .../crypto-news/seeders/crypto-news.seeder.ts:10,55-60,70-96; .../seeds/crypto-news.seed.ts:1-66
     Acceptance criteria: sg lista 100% de @deprecated con path:línea; lsp_find_references de CryptoNewsMessageRepository, SourceRepository.save/delete, TelegramMtprotoListenerAdapter, fetchActiveCryptoNewsSourceIds documentado con conteo importadores
     QA scenarios: happy=sg corre y lista coincide con inventario C1-C4 evidencia .omo/evidence/task-2-deprecados-deuda-tecnica.log; failure=símbolo con importadores no-spec bloquea su delete (prueba con QueueController) evidencia mismo log
     Commit: N | —
- [x] 3. Experimento falseable A1 (¿MTProto backend vivo en prod/staging?) — DONE 2026-09-20: A1 CAE, borrado total aprobado; SSE efectivo en todos los ambientes, 0 AUTH_KEY en logs, 4 guards. Evidencia .omo/evidence/task-3-deprecados-deuda-tecnica.log
     What to do: Buscar TELEGRAM_MTPROTO_SESSION / USE_SSE_INGESTION en .env.production.template, .env.staging, compose prod/staging e imágenes; grep logs 30d por AUTH_KEY_DUPLICATED y tráfico MTProto backend. Veredicto: si no hay sesión ni tráfico → A1 cae y se borra total (T4-T6). Must NOT do: no copiar secretos prod a dev, no arrancar sesión MTProto nueva.
     Parallelization: Wave 1 | Blocked by: T1-T2 | Blocks: T4-T6
     References: apps/backend/src/shared/common/config/app.config.ts:361,406,410-411; apps/backend/src/telegram/ingestion/shared/shared-ingestion.module.ts:177-179; apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:102-166,110,120; apps/backend/.env.staging; apps/backend/docker-compose.prod.yml; infra/
     Acceptance criteria: tabla env-por-ambiente (prod/staging/dev) con USE_SSE_INGESTION + INGESTION_TELEGRAM_URL + ausencia/presencia MTProto session; grep logs sin AUTH_KEY_DUPLICATED backend
     QA scenarios: happy=evidencia muestra SSE activo y MTProto inerte → aprueba borrado evidencia .omo/evidence/task-3-deprecados-deuda-tecnica.log; failure=si aparece sesión MTProto backend en prod/staging → aborta T5 y escala a owner evidencia mismo log
     Commit: N | —
- [x] 4. Flip default SSE + rama MTProto a 410 Gone — DONE 2026-09-20: commit 1bf8fbe9, selectIngestionAdapter Mock>SSE>410, specs 27/27, build OK, template prod false→true. Evidencia .omo/evidence/task-4-deprecados-deuda-tecnica.log
     What to do: app.config.ts default USE_SSE_INGESTION=true; factory shared-ingestion.module rama MTProto → throw Gone 410 "MTProto backend removido, usar INGESTION_TELEGRAM_URL"; actualizar README puerta "old direct line". Must NOT do: no borrar servicios aún (eso es T5), no cambiar INGESTION_TELEGRAM_URL.
     Parallelization: Wave 1 | Blocked by: T3 | Blocks: T5-T6
     References: apps/backend/src/shared/common/config/app.config.ts:406,410-411; apps/backend/src/telegram/ingestion/shared/shared-ingestion.module.ts:164,177-179,211-223; apps/backend/src/telegram/ingestion/shared/api/sse/\*; README.md tabla 3 puertas
     Acceptance criteria: con flags vacíos el adapter seleccionado es SSE; forzar modo MTProto responde/lanza 410 con mensaje exacto; nest build verde; spec de selección actualizado
     QA scenarios: happy=USE_SSE_INGESTION unset → SSE (bash + jest shared-ingestion.module.spec) evidencia .omo/evidence/task-4-deprecados-deuda-tecnica.log; failure=forzar MTProto → 410 esperado, no AUTH_KEY_DUPLICATED evidencia mismo log
     Commit: Y | feat(ingestion): default SSE y MTProto a 410 Gone
- [x] 5. Borrar bloque MTProto backend (8 servicios + adapter + safety + stub + specs) — DONE 2026-09-20: commit f3f86f76, 12 ficheros git rm, build OK, backend 197/197 suites 2134+3skip. Evidencia .omo/evidence/task-5-deprecados-deuda-tecnica.log
     What to do: Borrar api/mtproto/telegram-mtproto-listener.adapter.ts, services telegram-client-manager, flood-wait-counter, flood-wait-handler, sleep-window, last-seen-manager, telegram-media-download, config ingestion-safety.config, StubCryptoNewsMediaDownloader en shared-ingestion.module, specs asociados (shared-ingestion.module.integration.spec, telegram-client-manager.service.spec:373). Must NOT do: no borrar adapter SSE/Mock, no romper providers list sin actualizar factory.
     Parallelization: Wave 1 | Blocked by: T4 | Blocks: T6
     References: lista T2 + apps/backend/src/telegram/ingestion/shared/infrastructure/services/flood-wait-counter.service.ts:4; .../sleep-window.service.ts:5; .../last-seen-manager.service.ts:5; .../telegram-client-manager.service.ts:28; .../flood-wait-handler.service.ts:6; .../config/ingestion-safety.config.ts:32; .../telegram-media-download.service.ts:24; .../shared-ingestion.module.ts:25-52,91-102
     Acceptance criteria: grep -ri mtproto en apps/backend/src solo docs/rollback-note + lsp_find_references de cada símbolo borrado = 0; nest build + test:backend verdes
     QA scenarios: happy=grep residual vacío salvo nota + build verde evidencia .omo/evidence/task-5-deprecados-deuda-tecnica.log; failure=intento importar símbolo borrado falla en tsc evidencia mismo log
     Commit: Y | feat(ingestion): elimina bloque MTProto backend
- [x] 6. Desvincular health/config controllers de safety/sleep/counter — DONE 2026-09-20: N commit (T5 ya completo), tsc 0, 197/2137, :3030 200. Evidencia .omo/evidence/task-6-deprecados-deuda-tecnica.log
     What to do: Quitar dependencias a servicios borrados en ingestion-health.controller e ingestion-config.controller; verificar SSE health. Must NOT do: no cambiar /health honesto vs sonrisa (otro plan).
     Parallelization: Wave 1 | Blocked by: T5 | Blocks: T7
     References: apps/backend/src/telegram/ingestion/shared/api/http/ingestion-health.controller.ts:2-4,25-27; .../ingestion-config.controller.ts:2,6
     Acceptance criteria: tsc + test:backend verdes; curl :3030/api/health 200
     QA scenarios: happy=curl health 200 evidencia .omo/evidence/task-6-deprecados-deuda-tecnica.log; failure=controller con import borrado → tsc falla antes del merge evidencia mismo log
     Commit: N | — (T5 f3f86f7 ya completo; verificación sin cambios — corregido 2026-09-20 VPS, working tree sin commitear)
- [x] 7. Migrar consumidores C2 a DTO HTTP (QueueController + handlers) — DONE 2026-09-20: commit 84b410a5, QueueController a GET :3032 tipado, 197/2137. Evidencia .omo/evidence/task-7-deprecados-deuda-tecnica.log
     What to do: Con lsp_find_references, migrar cada importador de CryptoNewsMessageRepository/SourceRepository save-delete/stub/VO a crypto-news-integration DTO + GET ingestion:3032. Must NOT do: no borrar ports aún.
     Parallelization: Wave 2 | Blocked by: T6 | Blocks: T8-T9
     References: apps/backend/src/telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository.ts:4-69; .../crypto-news-source.repository.ts:22-53; apps/backend/src/telegram/crypto-news-integration/domain/dtos/crypto-news-message.dto.ts:5; apps/backend/src/telegram/crypto-news-publisher/api/http/queue.controller.ts:205; apps/backend/src/telegram/ingestion/crypto-news/crypto-news-ingestion.module.ts:32,59-64
     Acceptance criteria: lsp_find_references post-migración = 0 importadores no-spec fuera de módulos shim; publisher queue e2e/smoke verde
     QA scenarios: happy=enqueue+publish smoke vía ingestion :3032 evidencia .omo/evidence/task-7-deprecados-deuda-tecnica.log; failure=consumidor sin migrar listado bloquea T8 evidencia mismo log
     Commit: Y | refactor(crypto-news): consumidores a DTO HTTP ingestion
- [x] 8. Borrar ports/stubs/VO C2 — DONE 2026-09-20: commit 4e746f7e, 6 git rm, 195 suites/2126 tests (delta exacto). Evidencia .omo/evidence/task-8-deprecados-deuda-tecnica.log
     What to do: Borrar crypto-news-message.repository.ts, save/delete deprecated, in-memory-crypto-news-message.repository.ts, in-memory-crypto-news-source save/delete overrides, crypto-news-message.stub.ts, crypto-news-media.vo.ts + specs DEPRECATED asociados. Must NOT do: no tocar channel-filter.repository.ts:23 (slice vigente).
     Parallelization: Wave 2 | Blocked by: T7 | Blocks: T9
     References: misma T7 + apps/backend/src/telegram/ingestion/crypto-news/infrastructure/repositories/in-memory-crypto-news-message.repository.ts:10; .../in-memory-crypto-news-source.repository.ts:17,50; .../infrastructure/repositories/**tests**/in-memory-crypto-news-source.repository.spec.ts:4-27
     Acceptance criteria: archivos inexistentes + grep de símbolos = 0; nest build + test:backend verdes
     QA scenarios: happy=build verde evidencia .omo/evidence/task-8-deprecados-deuda-tecnica.log; failure=spec huérfano que importa borrado → tsc lo detecta evidencia mismo log
     Commit: Y | feat(crypto-news): elimina ports y stubs ingestion-owned
- [x] 9. Quitar shims DI en módulos — DONE 2026-09-20: commit 9b1aff90, 195/2126 delta 0, 0 code refs. Evidencia .omo/evidence/task-9-deprecados-deuda-tecnica.log
     What to do: Quitar tokens legacy en crypto-news-ingestion.module.ts:59-64, crypto-news-publisher.module.ts:74-77, shared-ingestion.module.ts:149-150 manteniendo providers vigentes. Must NOT do: no dejar providers huérfanos.
     Parallelization: Wave 2 | Blocked by: T8 | Blocks: T10
     References: apps/backend/src/telegram/ingestion/crypto-news/crypto-news-ingestion.module.ts:32,59-64; apps/backend/src/telegram/crypto-news-publisher/crypto-news-publisher.module.ts:74-77
     Acceptance criteria: nest build verde; test arranque AppModule sin warnings DI
     QA scenarios: happy=boot + health 200 evidencia .omo/evidence/task-9-deprecados-deuda-tecnica.log; failure=token faltante → Nest DI error al boot evidencia mismo log
     Commit: Y | fix(di): retira shims crypto-news deprecated
- [x] 10. Quitar fallbacks INGESTION*SERVICE_URL/REMOTE_URL + ghost seed — DONE 2026-09-20: commit 9df73165, 12 files, greps funcionales 0, 195/2126. Evidencia .omo/evidence/task-10-deprecados-deuda-tecnica.log
      What to do: Eliminar var legacy + warn en app.config.ts:85,94-109, actualizar process-next-queued-article fallback:545, borrar INGESTION_REMOTE_URL muerto, ghost filters.token.* en apps/backend/scripts/seed-pipeline-events.ts:140-142 + vip-call-approval README. Must NOT do: no cambiar INGESTION*TELEGRAM_URL default :3031.
      Parallelization: Wave 2 | Blocked by: T9 | Blocks: T11-T13
      References: apps/backend/src/shared/common/config/app.config.ts:85,94-109; apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts:545; apps/backend/src/shared/common/config/app.config.ingestion-url.spec.ts:6,68; apps/backend/scripts/seed-pipeline-events.ts:140-142
      Acceptance criteria: grep INGESTION_SERVICE_URL/INGESTION_REMOTE_URL/filters.token.* = 0 en src+scripts; spec ingestion-url actualizado a solo URL canónica; test:backend verde
      QA scenarios: happy=grep vacío + spec verde evidencia .omo/evidence/task-10-deprecados-deuda-tecnica.log; failure=env con var legacy → arranca con URL canónica sin warn evidencia mismo log
      Commit: Y | feat(config): retira fallbacks ingestion deprecated
- [x] 11. Backup + verificación backfill 1875 (gate owner A2) — DONE 2026-09-20: N commit, columna EXISTE en dev (divergencia t vs f), backup /tmp/pre-deploy-20260920_044744.dump.gz 239 entradas, 19 pendientes (synchronize-era). T12 BLOQUEADO hasta OK owner. Evidencia .omo/evidence/task-11-deprecados-deuda-tecnica.log
      What to do: Verificar existencia migración 1875000000000-BackfillMatchingConfigFromLlm, correr migration:show antes/después, db:backup a /tmp con path anotado; presentar gate al owner para autorizar T12. Must NOT do: no dropear nada en este todo.
      Parallelization: Wave 2 | Blocked by: T10 | Blocks: T12
      References: apps/backend/src/shared/common/persistence/migrations/1875000000000-BackfillMatchingConfigFromLlm.ts:4,17; .../**tests**/1875000000000-BackfillMatchingConfigFromLlm.migration.spec.ts:39; apps/backend/src/shared/common/persistence/migrations/1788659125192-SplitLlmConfigFlags.ts:34-38
      Acceptance criteria: migration:show sin pendientes salvo T12; backup dump existe y es restaurable (listado); owner responde OK explícito en sesión
      QA scenarios: happy=backup + show outputs guardados evidencia .omo/evidence/task-11-deprecados-deuda-tecnica.log; failure=columna ya ausente en DB synchronize-era → skip documentado con prueba del spec :39 evidencia mismo log
      Commit: N | —
- [x] 12. Dropear columna llm_config.matching_enabled (destructivo, solo con OK T11) — DONE 2026-09-20 (owner OK "Si vamos"): commit b606b769, migración 1875000000002, PATCH→400, GET omite, 196/2129. Evidencia .omo/evidence/task-12-deprecados-deuda-tecnica.log
      What to do: Migración que dropea columna + alinear entidad dominio/infra + DTO input:195-202 + controller 400-guard:232-238,243-249 + mapper toConfigView omite campo; actualizar specs (llm-config.controller.spec:319,368). Must NOT do: sin OK de T11 no ejecutar.
      Parallelization: Wave 2 | Blocked by: T11 (owner OK) | Blocks: T13
      References: apps/backend/src/telegram/crypto-news-publisher/domain/entities/llm-config.entity.ts:15-21; .../infrastructure/persistence/typeorm/entities/llm-config.entity.ts:36,39-40; .../api/input/llm-config.input.ts:195-202; .../api/http/llm-config.controller.ts:225-249; .../api/http/matching-config.controller.ts:42
      Acceptance criteria: PATCH /llm-config con matchingEnabled → 400 con hint a /crypto-news/matching/config; GET omite campo; migration:show limpio; test:backend verde
      QA scenarios: happy=PATCH 400 + GET sin campo (curl) evidencia .omo/evidence/task-12-deprecados-deuda-tecnica.log; failure=PATCH sin 400 → falla el todo evidencia mismo log
      Commit: Y | feat(db)!: dropea llm_config.matching_enabled (requiere backup T11)
- [x] 13. TELEGRAM_BOT_TOKEN docs + templates — DONE 2026-09-20: commit 20d34f11, generico @deprecated, templates alineados, validator 19/19. Evidencia .omo/evidence/task-13-deprecados-deuda-tecnica.log
      What to do: Marcar TELEGRAM_BOT_TOKEN deprecated en app.config.ts:361 + README shared:268, alinear apps/backend/.env.production.template:66,79-82,111 y .env.staging (sin añadir secretos). Must NOT do: no rotar tokens, no tocar VIP_CALLS/CRYPTO_NEWS/CHAIN_DEXTER tokens.
      Parallelization: Wave 2 | Blocked by: T12 | Blocks: T14
      References: apps/backend/src/shared/common/config/app.config.ts:361; apps/backend/src/shared/README.md:268; apps/backend/.env.staging; apps/backend/.env.production.template
      Acceptance criteria: grep TELEGRAM_BOT_TOKEN solo en nota deprecated + templates por-bot; config-validator spec verde
      QA scenarios: happy=validator PASS evidencia .omo/evidence/task-13-deprecados-deuda-tecnica.log; failure=config con token genérico → warn deprecated evidencia mismo log
      Commit: Y | docs(config): alinea tokens por bot y depreca genérico
- [x] 14. Borrar seeders ingestion + registros (Kol/CryptoNews) — DONE 2026-09-20: commit 9a29b8e1, grep seeder 0, ingestion 43/817. Evidencia .omo/evidence/task-14-deprecados-deuda-tecnica.log
      What to do: Borrar kol.seeder.ts + crypto-news.seeder.ts + registros DEPRECATED en telegram.module.ts:35,42-43,70,117; quitar refresh inefectivo scheduleChannelRefresh:167-171 si queda huérfano. Must NOT do: no tocar BackendChannelProvider vigente (T15) ni StreamService.
      Parallelization: Wave 3 | Blocked by: T13 | Blocks: T15-T16
      References: apps/ingestion-telegram/src/telegram/kol/seeders/kol.seeder.ts:7,46,52-55; apps/ingestion-telegram/src/telegram/crypto-news/seeders/crypto-news.seeder.ts:10,55-60,70-96; apps/ingestion-telegram/src/telegram/telegram.module.ts:30-43,95,167-171,212
      Acceptance criteria: grep seeder/seedKols/seedNews = 0 en src; npm test ingestion verde
      QA scenarios: happy=test verde evidencia .omo/evidence/task-14-deprecados-deuda-tecnica.log; failure=módulo que importa seeder → tsc falla evidencia mismo log
      Commit: Y | feat(ingestion): elimina seeders deprecated
- [x] 15. Seeds históricas + fetchActiveCryptoNewsSourceIds + BACKEND_PORT fallback — DONE 2026-09-20: commit d938adb5, seeds rm, endpoint borrado (no stub), 43/818. Evidencia .omo/evidence/task-15-deprecados-deuda-tecnica.log
      What to do: Borrar o mover a docs/ seeds/crypto-news.seed.ts:1-66 y kol/seeds/kol.seed.ts; convertir fetchActiveCryptoNewsSourceIds en eliminado (no stub []) actualizando callers backend-channel-provider.service.ts:28-37,73-95,146-155 + specs:275,280,332,356; quitar fallback BACKEND_PORT. Must NOT do: no romper canal KOL vigente (fetchActiveKolIds).
      Parallelization: Wave 3 | Blocked by: T14 | Blocks: T16
      References: apps/ingestion-telegram/src/telegram/crypto-news/seeds/crypto-news.seed.ts:1-66; .../kol/seeds/kol.seed.ts; .../shared/services/backend-channel-provider.service.ts:27-37,73-155; .../telegram/crypto-news/api/http/crypto-news.controller.ts:26-27,56; .../application/use-cases/register-news-source.use-case.ts:36-40
      Acceptance criteria: grep CRYPTO_NEWS_SEED/fetchActiveCryptoNewsSourceIds/BACKEND_PORT legacy = 0 salvo nota histórica en docs; tests provider actualizados y verdes
      QA scenarios: happy=tests verdes evidencia .omo/evidence/task-15-deprecados-deuda-tecnica.log; failure=caller restante del endpoint legacy → grep lo detecta evidencia mismo log
      Commit: Y | feat(ingestion): retira seeds y endpoint crypto-news legacy
- [x] 16. Verificar ingestion :3032 como única fuente crypto-news — GREEN 2026-09-20 VPS: sources 200 (13), messages 200, health/ready/live 200. Nota: :3032=ingestion, :3031=staging backend (ready/live 404 por diseño). Evidencia .omo/evidence/task-16-deprecados-deuda-tecnica.log
      What to do: curl GET /api/crypto-news/sources y /messages?limit=2 contra :3032 + backend staging apuntando a ingestion; documentar invariantes 1-7 singleton. Must NOT do: no crear DBs \*\_staging_ingestion, no añadir compose staging/prod.
      Parallelization: Wave 3 | Blocked by: T15 | Blocks: T17
      References: apps/ingestion-telegram/src/telegram/crypto-news/crypto-news.module.ts:17; AGENTS.md invariantes ingestion
      Acceptance criteria: curl :3032 sources+messages 200 con shape esperado; backend lee vía INGESTION_TELEGRAM_URL sin tablas locales
      QA scenarios: happy=curls 200 evidencia .omo/evidence/task-16-deprecados-deuda-tecnica.log; failure=:3032 caído → curl no-200 y se aborta T17 evidencia mismo log
      Commit: N | —
- [x] 17. Frontend: quitar refs legacy matchingEnabled/endpoints — DONE 2026-09-20 VPS (commit 164ba59, 3 files): grep 0 en src no-test, vitest 30/336 PASS = baseline. Evidencia .omo/evidence/task-17-deprecados-deuda-tecnica.log
      What to do: Limpiar endpoints.ts:88 nota deprecated, matching-toggle-button.tsx:20, llm-config-api threads:39, tests legacy matchingEnabled:458-461 y payload:349-360. Must NOT do: no cambiar lógica 3 flags (matching/llm/publishing truth table intacta).
      Parallelization: Wave 3 | Blocked by: T16 | Blocks: T18-T19
      References: apps/frontend/src/shared/api/endpoints.ts:88; .../features/crypto-news-publisher/ui/matching-toggle-button.tsx:20; .../features/threads-publisher/api/llm-config-api.ts:39; .../pages/crypto-news/**tests**/llm-config.test.tsx:458-461; .../crypto-news-page.test.tsx:349-360,1210
      Acceptance criteria: grep matchingEnabled/legacy en frontend src = solo tests negativos que asertan ausencia; vitest verde
      QA scenarios: happy=vitest PASS evidencia .omo/evidence/task-17-deprecados-deuda-tecnica.log; failure=toggle con campo legacy → test lo detecta evidencia mismo log
      Commit: Y | fix(frontend): retira refs legacy matchingEnabled
- [x] 18. Frontend dead URLs + evidencia depcheck/knip (sin prune ciego) — DONE 2026-09-20 VPS: fix backfill→identity, 5 dead defs fuera, feature reprocess + entity dashboard borradas, KpiCards→ingestion-health, nginx /kols fuera; vitest 29/330, build OK. Deps: msw KEEP, recharts/zustand/zod/lucide PRUNE-candidatas (sin desinstalar). Evidencia .omo/evidence/task-18-deprecados-deuda-tecnica.log
      What to do: Eliminar callers muertos (kols.backfill segmento ingestion vs identity, publishing.byToken, reprocess\* 5 rutas, llm-config /api prod, dashboard.kpis comentado, /kols nginx legacy) y correr npx depcheck + npx knip para decidir keep/prune recharts/zustand/lucide-react/zod/msw. Must NOT do: no desinstalar dep con imports (lucide tiene iconos) ni tocar ScoreTier/error-boundaries.
      Parallelization: Wave 3 | Blocked by: T17 | Blocks: T19
      References: apps/frontend/AGENTS.md DEAD URLS 1-6 + UNUSED DEPS + GAPS G7-G11; apps/frontend/package.json; apps/frontend/nginx.conf; apps/frontend/vite.config.ts
      Acceptance criteria: depcheck/knip outputs guardados; 0 fetch a rutas muertas (grep); decisión keep/prune documentada por dep con evidencia
      QA scenarios: happy=depcheck/knip + grep 0 rutas muertas evidencia .omo/evidence/task-18-deprecados-deuda-tecnica.log; failure=dep marcada unused pero con import dinámico → knip/depcheck lo revela y se hace keep evidencia mismo log
      Commit: Y | chore(frontend): elimina dead URLs y documenta deps
- [x] 19. Frontend build + smoke /crypto-news sin 404 muertos — DONE 2026-09-20: N commit (verificación), build 11.72s PASS, Playwright smoke 50 requests / 0 dead-hits / 0 404 / 0 pageerrors en 2 corridas (servidor /tmp PID explícito, solo lectura dev :3040 + :3032). Evidencia .omo/evidence/task-19-deprecados-deuda-tecnica.log
      What to do: vite build + Playwright smoke /crypto-news (konsola sin 404 a backfill/byToken/reprocess/llm-config rota). Must NOT do: no verificación manual con clicks humanos.
      Parallelization: Wave 3 | Blocked by: T18 | Blocks: T20
      References: apps/frontend/src/pages/crypto-news/**tests**/crypto-news-page.test.tsx; apps/frontend/nginx.conf; apps/frontend/vite.config.ts
      Acceptance criteria: vite build PASS; smoke PASS sin requests a endpoints muertos
      QA scenarios: happy=build+smoke PASS evidencia .omo/evidence/task-19-deprecados-deuda-tecnica.log; failure=smoke detecta 404 a ruta muerta → falla evidencia mismo log
      Commit: N | —
- [x] 20. Migrar console.log hot path a Logger — DONE 2026-09-20: commit ec142c9, grep console._ en src/_.ts = 0, backend 197 suites/2133 tests (2130 pass+3 skip), tsc+lint limpios, spec nuevo console-logger.spec.ts (4 tests ruteo error→error nunca debug). Evidencia .omo/evidence/task-20-deprecados-deuda-tecnica.log
      What to do: Sustituir console.log en backend main.ts:60-205, app.module.ts:75, shared-ingestion.module.ts:181, mtproto adapter:102-166 (ya borrado parcial), console-logger.ts:91, embedding.service.spec:42 por Nest Logger con niveles. Must NOT do: no silenciar errores a debug.
      Parallelization: Wave 4 | Blocked by: T19 | Blocks: T21
      References: apps/backend/src/main.ts:60-205; apps/backend/src/app.module.ts:75; apps/backend/src/shared/common/console-logger.ts:91; apps/backend/src/shared/common/persistence/database.module.ts:69
      Acceptance criteria: grep console.log en apps/backend/src = 0 salvo READMEs; test:backend + lint verdes
      QA scenarios: happy=grep 0 + tests verdes evidencia .omo/evidence/task-20-deprecados-deuda-tecnica.log; failure=log de error degradado a debug → test de nivel lo detecta evidencia mismo log
      Commit: Y | refactor(logging): console.log a Nest Logger
- [x] 21. Ruido debug a nivel debug o borrado ([SSE-DEBUG], MSG-TRANSFORM, ADAPTER-SELECTION) — DONE 2026-09-20: commit 03122e4, grep marcadores 0 en src, strays main-debug.ts+test-new.ts git rm (main.backup.ts inexistente), backend 197/2133 = baseline, tsc+lint limpios, specs 30/30+24/24. Ingestion full 39/43 (4 fallos pre-existentes DB/flaky verificados sin cambio vía stash). Evidencia .omo/evidence/task-21-deprecados-deuda-tecnica.log
      What to do: Bajar a logger.debug o borrar [SSE-DEBUG], [MSG-TRANSFORM-DEBUG], ADAPTER-SELECTION-DEBUG, main-debug.ts + test-new.ts + main.backup.ts stray (G5). Must NOT do: no borrar logs de error reales.
      Parallelization: Wave 4 | Blocked by: T20 | Blocks: T22
      References: apps/backend/src/main-debug.ts:5-119; apps/backend/AGENTS.md G5,G20; apps/ingestion-telegram/src/telegram/shared/api/mtproto/telegram-mtproto-listener.adapter.ts:364,384 (nota seed deprecated ya cubierta)
      Acceptance criteria: grep SSE-DEBUG/MSG-TRANSFORM/ADAPTER-SELECTION = 0 en src; stray files borrados; tests verdes
      QA scenarios: happy=grep 0 evidencia .omo/evidence/task-21-deprecados-deuda-tecnica.log; failure=hot path aún loguea en info → grep lo detecta evidencia mismo log
      Commit: Y | chore(logging): elimina ruido debug hot path
- [x] 22. Unificar versiones single-source + corregir AGENTS — DONE 2026-09-20: source of truth = per-app package.json (backend 1.2.0 / frontend 1.1.0 / ingestion 1.1.0, matchean CHANGELOGs); root 1.0.0 placeholder intacto; headers AGENTS corregidos (v1.3.2 nunca existió); docs:check PASS sin warnings. README badges aún divergen → T23. Evidencia .omo/evidence/task-22-deprecados-deuda-tecnica.log
      What to do: Decidir source of truth (package.json raíz vs apps) y alinear root 1.0.0 / backend 1.2.0 / frontend 1.1.0 / ingestion 1.1.0 vs AGENTS 1.3.2; actualizar AGENTS raíz/frontend/backend/ingestion headers. Must NOT do: no cambiar estrategia release manual ni CHANGELOGs en este todo (solo versiones).
      Parallelization: Wave 4 | Blocked by: T20-T21 | Blocks: T23
      References: package.json; apps/backend/package.json; apps/frontend/package.json; apps/ingestion-telegram/package.json; AGENTS.md KNOWN DRIFT version skew; apps/\*/AGENTS.md
      Acceptance criteria: tabla versiones coherente en 4 package.json + 4 AGENTS; docs:check sin warning de versiones
      QA scenarios: happy=tabla coherente evidencia .omo/evidence/task-22-deprecados-deuda-tecnica.log; failure=badge README distinto → T23 lo captura evidencia mismo log
      Commit: Y | docs(versions): unifica versiones single-source
- [x] 23. README + docs stale (badges/tabla/counts/links) — DONE 2026-09-20: commit docs(readme), badges 1.2.0/1.1.0/1.1.0, Apps+Testing counts medidos (backend 197+2e2e, ingestion 43+7e2e, frontend 29 files/330 tests re-medido hoy), 3-app table ya OK, links rotos 0, docs:check PASS. Evidencia .omo/evidence/task-23-deprecados-deuda-tecnica.log
      What to do: Corregir README badges (backend 1.3.2/ingestion 1.0.0/frontend 1.3.2) + tabla Apps (41 entities/35 controllers/173 specs) vs AGENTS post-split (39 entidades backend, 170/1969, 43/815), 2-app table sin ingestion, links frontend.md/kol-refactor.md/optimize.md inexistentes, counts drift G4. Must NOT do: no reescribir arquitectura, solo datos.
      Parallelization: Wave 4 | Blocked by: T22 | Blocks: T24
      References: README.md badges + tabla Apps + counts; AGENTS.md DOCS MAP; apps/backend/AGENTS.md G4; docs/arch/INDEX.md; docs/deployment/BACKUPS.md
      Acceptance criteria: README counts = T1 canónicos; links rotos = 0 (grep); docs:check PASS
      QA scenarios: happy=docs:check PASS evidencia .omo/evidence/task-23-deprecados-deuda-tecnica.log; failure=link roto restante → check lo lista evidencia mismo log
      Commit: Y | docs(readme): corrige badges, counts y links rotos
- [x] 24. Root tooling: dev:ingestion + tsc/lint hooks — DONE 2026-09-20: solo faltaba `dev:ingestion` (build/test/lint:ingestion ya existían; pre-commit tsc 3 apps + lint-staged ingestion src+test ya cubiertos, verificados sin cambios); docs stale corregidos (README + AGENTS root + AGENTS ingestion gap 13); `npm run dev` sin ingestion documentado como sordo a Telegram; docs:check PASS; sin tocar CI/workflows. Evidencia .omo/evidence/task-24-deprecados-deuda-tecnica.log
      What to do: Añadir scripts root dev:ingestion/build:ingestion/test:ingestion faltantes, incluir ingestion en pre-commit tsc + lint-staged, documentar que npm run dev sin ingestion no escucha Telegram. Must NOT do: no cambiar CI Node 24 ni workflows deploy.
      Parallelization: Wave 4 | Blocked by: T23 | Blocks: T25
      References: package.json scripts; .husky/pre-commit; lint-staged.config.js; AGENTS.md KNOWN DRIFT partial root tooling
      Acceptance criteria: npm run dev:ingestion arranca :3031; pre-commit tsc cubre 3 apps; npm run docs:check PASS
      QA scenarios: happy=scripts + hook verificados (bash --dry-run) evidencia .omo/evidence/task-24-deprecados-deuda-tecnica.log; failure=hook sin ingestion → tsc no lo cubre y se detecta evidencia mismo log
      Commit: Y | chore(tooling): añade dev:ingestion y tsc en hooks
- [x] 25. tsconfig alias muertos (discovery/* + settings duplicado) — DONE 2026-09-20: 2 líneas fuera en apps/backend/tsconfig.json, tsc backend verde, grep discovery/* 0 en código, settings/* 1 entrada, frontend @/* intacto. Evidencia .omo/evidence/task-25-deprecados-deuda-tecnica.log
      What to do: Quitar alias discovery/_ (sin src/discovery) + duplicado settings/_ en apps/backend/tsconfig.json, verificar imports. Must NOT do: no tocar @/_ frontend.
      Parallelization: Wave 4 | Blocked by: T24 | Blocks: F1-F4
      References: apps/backend/tsconfig.json; AGENTS.md CONVENTIONS path aliases
      Acceptance criteria: tsc backend verde; grep discovery/\* = 0
      QA scenarios: happy=tsc PASS evidencia .omo/evidence/task-25-deprecados-deuda-tecnica.log; failure=import con alias muerto → tsc falla evidencia mismo log
      Commit: Y | chore(tsconfig): retira alias muertos

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — cada T1-T25 con references+acceptance+QA+commit verificables; waves 6-7-6-6 y matriz dependencias consistente; evidencia .omo/evidence/task-F1-deprecados-deuda-tecnica.log (bash: grep TODO list completa)
- [ ] F2. Code quality review — tsc 3 apps + lint 3 apps + tests 3 apps verdes con conteos T1; sin @deprecated residual (sg) salvo notas históricas en docs; evidencia .omo/evidence/task-F2-deprecados-deuda-tecnica.log
- [ ] F3. Real manual QA — agent-executed: curl :3030/health + :3031 health/ready/live + :3032 messages?limit=2 + PATCH llm-config 400 + Playwright /crypto-news sin 404 muertos; evidencia .omo/evidence/task-F3-deprecados-deuda-tecnica.log (prohibido QA humana)
- [ ] F4. Scope fidelity — Must NOT have respetado (singleton ingestion, sin prune ciego, sin ScoreTier/boundaries, sin terraform/migrations-prod, rama feat/\* + conventional); evidencia .omo/evidence/task-F4-deprecados-deuda-tecnica.log

## Commit strategy

- Rama: feat/cleanup-deprecados desde dev@28c259a7; 1 commit por todo marcado Y (19 commits), N en T1-T3,T11,T16,T19 (evidencia sin commit); squash a dev al final, nunca a master directo.
- Formato conventional (feat:/fix:/refactor:/docs:/chore:) según commitlint; T12 lleva ! (destructivo) y requiere OK T11.
- Push --force-with-lease prohibido salvo rebase acordado; pre-commit (lint+tsc 3 apps) y pre-push (tests) deben pasar.

## Success criteria

- sg --pattern '@deprecated' en apps/\*/src = 0 salvo notas históricas en docs/; grep INGESTION_SERVICE_URL/REMOTE_URL/fetchActiveCryptoNewsSourceIds/CRYPTO_NEWS_SEED/SSE-DEBUG = 0 en src.
- test:backend + ingestion + frontend verdes con conteos T1; tsc 3 apps verde; vite build + Playwright smoke PASS.
- PATCH /llm-config con matchingEnabled → 400; GET omite campo; :3032 sources/messages 200 como única fuente.
- README/AGENTS versiones y counts coherentes; docs:check PASS; hooks cubren 3 apps.
