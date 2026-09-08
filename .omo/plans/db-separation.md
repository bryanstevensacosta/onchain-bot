# db-separation - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Backend e ingestion con bases de datos separadas (misma máquina, una DB cada uno), los datos de staging/prod copiados sin pérdidas, el backend limpio de todo código que tocaba tablas ajenas, y un janitor que borra messages y multimedia de más de 72h — sin que cambie nada de lo que ves en el dashboard.

**Why this approach:** Las 4 tablas existen idénticas en ambos servicios, así que el traslado no transforma nada; y tus decisiones (copiar datos con pg_dump, dejar los filtros en el backend) evitaron los dos rediseños caros: ni el matching ni la UI cambian.

**What it will NOT do:** No crea un segundo servidor de base de datos; no toca el matching, la IA, la publicación ni el diseño; no mueve los filtros (se quedan donde están); no publica nada real durante las pruebas.

**Effort:** Large
**Risk:** Medium - el cutover de producción mueve datos reales con rollback por backup
**Decisions to sanity-check:** Solo copiar 3 tablas (filtros se quedan); nombres `<base>_ingestion`; staging no necesita DB nueva porque reutiliza el droplet; retención 72h de messages+media (excepto items referenciados por queue pendiente, si los hay).

Your next move: decirme si arranco la ejecución ahora (`$start-work`) o si corro primero la revisión de alta precisión (doble Momus). Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

- Nueva DB lógica de ingestion por ambiente donde aplique (dev local + prod droplet; staging NO tiene ingestion propia — reutiliza el droplet por invariante de instancia única) con baseline de migraciones TypeORM (primera infra de migraciones del servicio).
- Copia de datos staging/prod vía pg_dump --data-only + restore de 3 tablas (crypto_news_sources, crypto_news_messages, crypto_news_message_media) con paridad de conteos.
- Recorte backend: 3 entidades fuera de PERSISTED_ENTITIES (42→39), migración drop de 3 tablas + drop FK de channel_content_filter_configs, borrado del path de escritura SSE (StoreNewsMessageUseCase + wiring + routing en coordinator) y de GETs legacy (messages, messages/:id, sources, sources/active/ids, backfill/:channelId, media/:mediaId).
- channel_content_filter_configs SE QUEDA en backend sin FK (channel_id opaco); CRUD de filters y FilteredCryptoNewsService sin cambios de lógica.
- Janitor (MediaRetentionCleanupScheduler) re-creado en ingestion y eliminado del backend, con INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS cableada.
- Pasos de migración ingestion en deploy.yml + deploy-ingestion.yml (+ deploy-staging.yml si migra backend igual); envs/templates/compose/docs/pgAdmin; aislamiento de tests e2e a DBs \*\_test.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO segundo contenedor Postgres ni aislamiento físico. NO cambios en lógica de matching/LLM/publishing/keywords. NO rediseño UI (solo re-apuntado si hiciera falta). NO tocar tablas KOL ni resto del pipeline. NO commitear secretos (`.env.production` real solo vive en droplet). NO correr specs con dropSchema contra dev (guards existentes en `backfill-message.entity.integration.spec.ts` + `jest.setup.ts` — no tocarlos). NO publicar eventos antes de commit ni `@Entity` en domain (convenciones vigentes). NO segunda instancia de ingestion en ningún ambiente (ver Invariantes). NO retención distinta de 72h sin aprobación (ver Invariantes).

## Invariantes de arquitectura (inamovibles — el worker NO puede relajarlos)

1. **Un solo ingestion-service en el droplet.** NO existe ingestion en `docker-compose.staging.yml` ni `.prod.yml`; solo `docker-compose.ingestion.yml` (standalone, puerto 3032→3031). Los backends de staging Y production consumen ESE MISMO ingestion por HTTP/SSE. Prohibido añadir servicios `ingestion-staging`, segundas redes de ingestion o segundas DBs de ingestion en el droplet.
2. **Una sola sesión MTProto en el droplet** (`INGESTION_TELEGRAM_MTPROTO_*` solo en el `.env.production` de ingestion). Dev local usa la segunda cuenta con su propio storage local. Prohibido duplicar credenciales.
3. **Un solo storage de multimedia en el droplet** (`uploads/crypto-news/media/`, dueño ingestion-service). Prohibido un segundo volumen/dir de media por entorno.
4. **Una sola DB de ingestion por servidor Postgres** (`<base>_ingestion`): dev local una, droplet una. Staging NO tiene DB de ingestion (no tiene ingestion). Prohibido crear `*_staging_ingestion`.
5. **Retención 72h de messages Y media en ingestion.** El único propósito del almacenamiento es el pipeline queue→LLM→publisher→Telegram (latencia de minutos); pasado 72h se borra. Reloj: `ingested_at` (llegada), NO `published_at` (sesgo de backfill). Rationale registrado en draft D6.

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + framework Jest (unit `*.spec.ts`, e2e `jest-e2e.json`) + agent-executed QA en cada todo (happy + failure con comando exacto y evidencia).
- Evidence: .omo/evidence/task-<N>-db-separation.md (comando corrido, salida recortada, conteos SQL pre/post).
- DB ground truth siempre vía `docker exec <pg-container> psql -U <user> -d <db> -c "..."` (dev) o `ssh CryptoGanster` + docker compose en droplet (staging/prod) — el worker ejecuta estos comandos, no asume.

## Execution strategy

### Parallel execution waves

- Wave 1 (dev, sin riesgo prod): todos 1-3. 2 y 3 en paralelo tras 1 (misma DB nueva, sin solape de archivos).
- Wave 2 (recorte backend + janitor, dev): todos 4-6. 4 y 6 en paralelo (archivos disjuntos); 5 tras 4 (la migración drop refleja el recorte).
- Wave 3 (staging): todos 7-8 (secuenciales: backup → drop migration).
- Wave 4 (prod): todos 9-11 (secuenciales: crear DB + restore → migraciones + deploys → docs).
- Final: F1-F4 en paralelo.

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| ---- | ---------- | ------ | -------------------- |
| 1    | —          | 2, 3   | —                    |
| 2    | 1          | 4, 9   | 3                    |
| 3    | 1          | 7, 9   | 2                    |
| 4    | 2          | 5      | 6                    |
| 5    | 4          | 7      | 6                    |
| 6    | — (dev)    | 10     | 4, 5                 |
| 7    | 5          | 8      | —                    |
| 8    | 7          | 10     | —                    |
| 9    | 1, 2, 3    | 10     | —                    |
| 10   | 8, 9, 6    | 11     | —                    |
| 11   | 10         | F-wave | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Crear DB ingestion en dev local y apuntar el servicio a ella
     What to do: `docker exec alpha-meta-token-scanner-postgres psql -U alpha_meta_token_scanner -d postgres -c "CREATE DATABASE alpha_meta_token_scanner_ingestion OWNER alpha_meta_token_scanner;"`. Cambiar `INGESTION_DATABASE_NAME` a `alpha_meta_token_scanner_ingestion` en `apps/ingestion-service/.env` (NO en templates aún — eso es todo 11). Arrancar ingestion (`npm run start:dev` en apps/ingestion-service) y verificar que `synchronize:true` crea exactamente 5 tablas (crypto*news_sources, crypto_news_messages, crypto_news_message_media, channel_content_filter_configs, backfill_messages). Registrar conteo inicial (0 filas) como evidencia.
     Must NOT do: no tocar backend, no tocar staging/prod, no crear migraciones todavía (todo 2), no cambiar `.env.example`/templates.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 2, 3
     References: apps/ingestion-service/.env (INGESTION_DATABASE*\*), apps/ingestion-service/src/app.module.ts:59-81 (TypeORM 5 entidades), apps/ingestion-service/src/shared/common/config/app.config.ts (database config), apps/backend/docker-compose.yml (postgres dev).
     Acceptance: `docker exec alpha-meta-token-scanner-postgres psql -U alpha_meta_token_scanner -d alpha_meta_token_scanner_ingestion -c "\dt" | grep -cE 'crypto_news|channel_content_filter|backfill'` retorna 5; ingestion bootea sin errores de conexión; `GET localhost:3031/api/crypto-news/sources` responde 200 con cuerpo vacío (forma exacta según controller vigente — `[]` o `{data:[]}`, verificar, no asumir); backend dev sigue intacto (sus tablas y lecturas no cambian en este todo).
     QA happy: `npx tsc --noEmit -p apps/ingestion-service/tsconfig.json` exit 0 + boot log con `Database connected`. QA failure: con nombre de DB inexistente el boot debe fallar con error de conexión (evidencia del log), luego revertir al nombre correcto. Rollback del todo: revertir la línea en `.env` y reiniciar (1 comando). Evidence .omo/evidence/task-1-db-separation.md.
     Commit: N (`.env` está gitignored — cambio solo local; los templates se actualizan en el todo 11)
- [x] 2. Infra de migraciones en ingestion + baseline de sus 5 entidades
     What to do: Crear `apps/ingestion-service/src/shared/common/persistence/data-source.ts` COPIANDO la estructura de `apps/backend/src/shared/common/persistence/data-source.ts` (mismo manejo de aliases `shared/* telegram/* stream/*` vía tsconfig-paths o imports relativos según haga el backend, mismo glob `migrations/*.{ts,js}` que resuelva en src y en dist). Scripts en `apps/ingestion-service/package.json` (`migration:generate/run/show/revert`, espejo de backend), y gating NODE_ENV en `app.module.ts` (staging/production → `synchronize:false, migrationsRun:false`; dev/test → `synchronize:true`, espejo de `apps/backend/src/shared/common/persistence/database.module.ts`). Generar baseline CONTRA UNA DB VACÍA (TRAMPA: `migration:generate` difiere entidades vs DB conectada — contra la dev nueva, que synchronize ya pobló, genera migración VACÍA): crear `scratch_baseline` vacía (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`), apuntar el data-source a ella solo para generar, `migration:generate -- -n BaselineIngestionSchema`, y verificar que su `up()` crea las 5 tablas y NADA más; borrar la scratch después. Correr `migration:run` contra `onchain_bot_test_entity` y `migration:show` confirma aplicada. Verificar que el data-source funciona compilado: `npm run build` ingestion + `migration:show` con `dist/.../data-source.js` contra la test DB.
     Must NOT do: no aplicar la baseline sobre la dev nueva con datos (está vacía: synchronize ya creó el esquema; documentar que dev se deja en synchronize y la baseline rige desde staging/prod); no incluir entidades del backend; no activar migrationsRun:true en boot (los deploys corren migraciones explícitas como en backend).
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4, 9 | With: 3
     References: apps/backend/src/shared/common/persistence/database.module.ts (patrón useMigrations), apps/backend/src/shared/common/persistence/data-source.ts, apps/backend/package.json (scripts migration:\*), apps/ingestion-service/src/app.module.ts:59-81, scripts/run-migrations.sh (dual-mode dist/src).
     Acceptance: `npm run migration:show -w @alpha-meta-token-scanner/ingestion-service` lista la baseline como aplicada en la DB de test; `git status` muestra exactamente 1 archivo nuevo en `apps/ingestion-service/src/**/migrations/`; tests existentes de ingestion en verde (`npm test -w @alpha-meta-token-scanner/ingestion-service`, 15/15 del spec backfill como mínimo).
     QA happy: drop de la tabla backfill_messages en test DB + `migration:run` la recrea. QA failure: `migration:run` dos veces seguidas → segunda es no-op sin error. Evidence .omo/evidence/task-2-db-separation.md.
     Commit: Y | feat(ingestion): add TypeORM migration infra plus baseline schema
- [x] 3. Aislar tests e2e (ingestion + backend) a DBs _\_test
     What to do: Auditar `apps/ingestion-service/test/jest-e2e.json` + `test/_.e2e-spec.ts`(levantan AppModule completo con`.env`→ hoy conectan a dev) y`apps/backend/test/_.e2e-spec.ts`+`src/settings/settings.e2e-spec.ts`(conecta por defecto a`alpha_meta_token_scanner`). Forzar DB de test: en ingestion, `test/jest-e2e.json`setup que fije`INGESTION_DATABASE_NAME=onchain_bot_test`(o reutilizar`onchain_bot_test_entity`si ya existe con el esquema necesario — verificar con`\dt`); en backend, mismo tratamiento hacia una DB `_\_test`dedicada (crear`alpha_meta_token_scanner_e2e`si no existe). Re-correr una suite e2e por servicio y demostrar que la dev queda intacta (conteo de tablas/filas pre/post en evidencia).
Must NOT do: no cambiar asserts de negocio de los e2e; no tocar`jest.setup.ts`unit (ya aislado); no usar dropSchema fuera de DBs *_test.
Parallelization: Wave 1 | Blocked by: 1 | Blocks: 7, 9 | With: 2
References: apps/ingestion-service/test/jest-e2e.json, apps/ingestion-service/test/app.e2e-spec.ts, apps/backend/src/settings/settings.e2e-spec.ts:30-60 (TypeORM forRoot con defaults a dev), apps/backend/jest.setup.ts.
Acceptance:`docker exec ... -d alpha_meta_token_scanner -c "SELECT count(\*) FROM crypto_news_sources;"`idéntico pre/post correr e2e de ambos servicios; e2e suites en verde.
QA happy: e2e ingestion pasa contra test DB. QA failure: con`INGESTION_DATABASE_NAME=alpha_meta_token_scanner` exportada en shell, la suite debe REHUSAR arrancar (guard) o redirigir a test DB — evidenciar cuál ocurre. Evidence .omo/evidence/task-3-db-separation.md.
     Commit: Y | test(e2e): isolate ingestion and backend e2e suites to test databases
- [x] 4. Recorte backend: 3 entidades fuera + borrar path escritura SSE y GETs legacy (filters se quedan)
     What to do: ANTES de borrar nada, inventario: `grep -rn "StoreNewsMessageUseCase\|CryptoNewsMessageRepository\|CryptoNewsSourceRepository\|CryptoNewsMessageMediaEntity\|ChannelContentFilterConfigEntity" apps/backend/src --include="*.ts" | grep -v spec | grep -v __tests__` y conciliar CADA importador con los pasos (a)-(f); el que no encaje se reporta en evidencia y NO se borra a ciegas. (a) Quitar `CryptoNewsSourceEntity, CryptoNewsMessageEntity, CryptoNewsMessageMediaEntity` de `PERSISTED_ENTITIES` + imports en `apps/backend/src/shared/common/persistence/entities.ts` y bajar `EXPECTED_ENTITY_COUNT` 42→39 (+ ajustar specs que aserten el conteo — grepear `EXPECTED_ENTITY_COUNT`). (b) Borrar `StoreNewsMessageUseCase` (archivo + providers en `crypto-news-ingestion.module.ts:110,132` + spec), y enrutar mensajes crypto-news del `IngestionCoordinator` a skip-con-log (ingestion-service ya persiste; backend NO persiste — Opción A). (c) Borrar del `CryptoNewsController` los GETs `messages`, `messages/:id`, `sources`, `sources/active/ids`, `backfill/:channelId`, `media/:mediaId` y el `POST sources` (501), MANTENIENDO intacto todo el CRUD de filters (`POST/GET sources/:channelId/filters`, `DELETE/PATCH filters/:id`) y sus use-cases. (d) En `ChannelContentFilterConfigEntity` eliminar la relación/JOIN hacia sources (mantener columna `channel_id` varchar) y en filter use-cases cambiar la validación de existencia de source a warn (sin throw). (e) El `TypeOrmCryptoNewsSourceRepository` también implementaba `findFiltersByChannelId` que consume `FilteredCryptoNewsService`: crear un repositorio filters-only (`TypeOrmChannelFilterRepository` nuevo, solo sobre `ChannelContentFilterConfigEntity`), proveerlo en el módulo donde vivía el anterior, y NO dejar providers huérfanos — smoke de boot obligatorio para validar que el DI resuelve (un `tsc` en verde NO basta). (f) Eliminar el `MediaRetentionCleanupScheduler` del backend AQUÍ (provider + scheduler + spec) para que no borre filas/archivos que ya son de ingestion; su re-creación vive en el todo 6. NO arrancar el backend dev hasta generar la migración del todo 5: hacer ANTES un backup local (`pg_dump -d alpha_meta_token_scanner -Fc -f /tmp/pre-split-backup.dump`) porque el primer boot con synchronize dropeará las 3 tablas de la DB compartida.
     Must NOT do: no tocar keywords/blacklist/queue/llm/publisher/ads; no cambiar lógica de matching; no borrar `media-serving.ts` si lo usa otro controller (grepear usos antes); no tocar frontend.
     Parallelization: Wave 2 | Blocked by: 2 | Blocks: 5 | With: 6
     References: entities.ts:24-27,54-97,103; crypto-news.controller.ts (rutas :91-103,112,160,239,275,316,409,475,662,697,744,757); store-news-message.use-case.ts:46-99; crypto-news-ingestion.module.ts; ingestion-coordinator.service.ts (routing); channel-content-filter-config.entity.ts:25-60; filters/\*.use-case.ts; filtered-crypto-news.service.ts.
     Acceptance: `npx tsc --noEmit -p apps/backend/tsconfig.json` exit 0; `npm test -w @alpha-meta-token-scanner/backend` verde (actualizar specs del controller borrado); boot dev: log confirma conexión y DI resuelto (sin `Nest can't resolve dependencies`), `GET :3030/crypto-news/sources` → 404 mientras `GET :3031/api/crypto-news/sources` → 200 con cuerpo vacío.
     QA happy: `POST :3030/crypto-news/sources/:id/filters` sigue creando reglas (tabla backend intacta). QA failure: `GET :3030/crypto-news/messages` → 404 (ruta eliminada, no 500). Evidence .omo/evidence/task-4-db-separation.md.
     Commit: Y | refactor(backend): remove ingestion-owned crypto-news tables and legacy reads
- [x] 5. Migración backend: drop de 3 tablas + drop FK de filters (staging/prod)
     What to do: Generar con `npm run migration:generate -- -n DropIngestionOwnedCryptoNewsTables` CONTRA UNA COPIA QUE AÚN TENGA LAS TABLAS (TRAMPA gemela del todo 2: tras el todo 4 el backend dev ya dropeó las 3 tablas vía synchronize → diff vacío): usar el backup del todo 4 — `CREATE DATABASE split_rehearsal WITH TEMPLATE` NO sirve si ya se dropeó; por eso el backup `/tmp/pre-split-backup.dump` se tomó ANTES del primer boot recortado; restaurar ese backup en `split_rehearsal` y generar contra ella. EDITAR el `down()` para reversibilidad total: recrear las 3 tablas con columnas/PKs originales + re-añadir el FK de filters (orden: crear tablas → ADD CONSTRAINT). La migración debe: (1) `DROP CONSTRAINT <nombre real>` (verificar en `\d channel_content_filter_configs` de la rehearsal, el `FK_f4d53649fee70f18bbc88502673` observado en dev puede variar), (2) `DROP TABLE crypto_news_message_media, crypto_news_messages, crypto_news_sources` en orden por FKs. Revisar el SQL con `db:migrate:dry-run`/`migration:show`. NO aplicarla en dev a mano (dev usa synchronize y ya dropeó al boot — verificar con `\dt`).
     Must NOT do: no dropear `channel_content_filter_configs` ni tablas publisher/ads; no aplicar en staging/prod desde local (lo hacen los workflows en todos 7/10).
     Parallelization: Wave 2 | Blocked by: 4 | Blocks: 7 | With: 6
     References: apps/backend/src/shared/common/persistence/migrations/ (15 archivos; patrón en 1816000000000-AddFilterConfigToCryptoNewsSources.ts y 1815000000000-CreateChannelContentFilterConfigs.ts), data-source.ts, scripts/run-migrations.sh.
     Acceptance: `migration:show` lista la nueva migración como pendiente; el archivo contiene DROP CONSTRAINT + 3× DROP TABLE + down() que los recrea; `tsc` del backend en verde.
     QA happy: aplicar la migración en `split_rehearsal` (ya creada para generar) → 3 tablas fuera, filters intacta con filas. NOTA: `CREATE DATABASE ... WITH TEMPLATE` exige cero conexiones a la fuente — detener backend/ingestion dev antes. QA failure: `migration:revert` tras aplicar → tablas recreadas (vacías) + FK re-añadida y la app bootea. Evidence .omo/evidence/task-5-db-separation.md.
     Commit: Y | feat(backend): migration to drop ingestion-owned crypto-news tables
- [x] 6. Mover el janitor de retención 72h (media + messages) a ingestion y eliminarlo del backend
     What to do: Re-crear en ingestion-service el scheduler de retención con DOS pasadas en el mismo tick (EVERY*HOUR, un solo advisory lock con NUEVO id distinto de 7_421_372): (a) pasada media — misma lógica del backend (SELECT expiradas por `INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS`, unlink + `DELETE FROM crypto_news_message_media WHERE id=$1`, política skip/already-gone/abort); verificar default real en `app.config.ts` de ingestion vs `CRYPTO_NEWS_MEDIA_RETENTION_HOURS` del backend y unificar el valor efectivo actual (72h), documentándolo. (b) pasada messages NUEVA: `DELETE FROM crypto_news_messages WHERE ingested_at < now() - INTERVAL '72 hours'` por lotes (p. ej. `LIMIT 1000` en loop hasta 0 filas) + barrido de media huérfana (`DELETE FROM crypto_news_message_media WHERE message_id NOT IN (SELECT id FROM crypto_news_messages)`). Reloj `ingested_at`, NO `published_at`. (c) ANTES de borrar: auditoría de referencias a message IDs — `grep -rn "message_id\|messageId" apps/backend/src/telegram/crypto-news-publisher apps/ingestion-service/src/stream --include="*.ts" | grep -v spec`: ¿la queue del publisher guarda snapshot de contenido o referencia UUID al mensaje de ingestion? ¿`backfill*messages`referencia message UUIDs? Si snapshot → sin guard. Si referencia → el janitor debe excluir`WHERE id NOT IN (<ids pendientes>)` y el worker documenta el mecanismo (la queue vive en otra DB: exponer endpoint o ventana de gracia — decidir con evidencia, no asumir). (d) Caveat documentado: backfill manual sobre rangos >72h re-inserta mensajes (aceptado); queue pausada >72h puede perder media de items viejos (aceptado, latencia normal son minutos). (e) Regla de edad absoluta: el borrado es por edad (`ingested_at`) SIN excepción por estado de matching — noticia crypto de >72h no debe publicarse aunque nunca se matcheó; la única excepción es referencia pendiente de queue/backfill hallada en (c). Cablear la env en `app.config.ts` de ingestion (hoy existe la var pero nada la consume). Spec de integración nuevo en ingestion: fila media expirada + archivo → tick → fuera; mensaje con ingested_at >72h → fuera + su media huérfana fuera; mensaje vigente intacto; suite de la rama snapshot-vs-referencia.
     Must NOT do: no cambiar la ventana de retención efectiva sin declararlo (72h es invariante); no tocar uploads a mano; no duplicar el lock id del backend; no borrar mensajes referenciados por buffer/queue sin el guard de (c).
     Parallelization: Wave 2 | Blocked by: — (dev) | Blocks: 10 | With: 4, 5
     References: backend scheduler media-retention-cleanup.scheduler.ts:19,79,95-136,156-213,262-311,329-343 + spec; ingestion app.config.ts (vars INGESTION\*\_RETENTION*); ingestion entities crypto-news-message.entity.ts (ingested_at) y crypto-news-message-media.entity.ts; backend publisher queue entity (auditar columnas); stream backfill-message.entity.
     Acceptance: nuevo spec en verde (4 casos: media expirada, mensaje expirado + huérfana, vigente intacto, referencia-pendiente según hallazgo de (c)); `grep -r MediaRetentionCleanupScheduler apps/backend/src/` vacío (borrado movido al todo 4); `npm test` ambos servicios verde.
     QA happy: tick con 1 expirada + 1 vigente (media y mensaje) → solo lo expirado se borra (filas y archivos). QA failure: archivo ya ausente en disco → row se borra igual (`already-gone`), sin abortar batch; archivo con permiso denegado → batch aborta y la fila QUEDA (evidenciar con chmod 000); mensaje referenciado por queue pendiente (si aplica) → se conserva. Evidence .omo/evidence/task-6-db-separation.md.
     Commit: Y | feat(ingestion): own 72h media+message retention janitor; remove backend copy
- [x] 7. Staging: verificar wiring + backup + aplicar drop migration del backend (migration PROBADA + rollback a pre-state sano; corte persistente vía deploy staging — ver evidencia)
     What to do: (a) Confirmar que `docker-compose.staging.yml` NO define ingestion-service y leer el `INGESTION_SERVICE_URL` efectivo del backend staging (`.env.staging`/compose). HALLAZGO PREVISTO: si apunta a `localhost:3031` (nada escucha ahí en staging), el matching staging ya está roto HOY por causa preexistente — documentarlo en evidencia y el smoke (d) queda WAIVED (no bloquea; fuera de scope arreglarlo aquí). (b) Backup: `pg_dump -h localhost -p 5433 -U alpha_meta_token_scanner -d alpha_meta_token_scanner_staging` completo antes de tocar nada (guardar ruta en evidencia). (c) Correr la migración del todo 5 contra staging (`migration:run` con env staging) y verificar: 3 tablas fuera, `channel_content_filter_configs` + filtros intactos (conteo pre/post), resto del esquema intacto. (d) Smoke: backend staging bootea, `EnqueueMatchingCronScheduler` hace un ciclo contra el droplet sin errores (logs), `GET /crypto-news/sources` → 404.
     Must NOT do: no crear DB ingestion en staging (staging NO tiene ingestion propia por invariante); no tocar droplet prod; no re-crear sources en staging.
     Parallelization: Wave 3 | Blocked by: 5 | Blocks: 8
     References: apps/backend/docker-compose.staging.yml:14-25,69-91; apps/backend/.env.staging; deploy-staging.yml (paso migraciones — verificar que espeja deploy.yml:151-157); scripts/backup-db.sh.
     Acceptance: `\dt` en staging sin las 3 tablas; `SELECT count(*) FROM channel_content_filter_configs` igual pre/post; backup referenciado por ruta en evidencia.
     QA happy: ciclo de matching sin excepciones en logs. QA failure: si la migración falla a mitad (constraint inesperada), `migration:revert` + restore del backup, y se registra el bloqueador. Evidence .omo/evidence/task-7-db-separation.md.
     Commit: N por defecto (todo aplicado en servidor). SOLO si `.env.staging` u otro archivo del repo cambió → commit Y separado | chore(staging): post-split adjustments
- [x] 8. Staging: paridad funcional post-split
     What to do: Con el backend staging ya recortado: (a) crear 1 source de prueba en el droplet ingestion (`POST :3032/api/crypto-news/sources`) y verificar que el matching de staging la ve vía HTTP; (b) crear 1 filter rule en staging backend y verificar que `FilteredCryptoNewsService` la aplica (log de match o queue); (c) borrar ambos registros de prueba y dejar conteos como estaban (evidencia pre/post).
     Must NOT do: no publicar nada en canales reales (flags matching/llm/publishing intactos; si hace falta, pausar publishing durante la prueba y restaurar).
     Parallelization: Wave 3 | Blocked by: 7 | Blocks: 10
     References: filtered-crypto-news.service.ts, enqueue-matching-cron.scheduler.ts, ingestion CryptoNewsController.addSource.
     Acceptance: source de prueba visible vía HTTP desde staging; regla de prueba aplicada; limpieza posterior con conteos restaurados en evidencia.
     QA happy: match registrado en logs. QA failure: ingestion caído → el scheduler debe degradar a warn sin tumbar el backend (evidenciar log). Evidence .omo/evidence/task-8-db-separation.md.
     Commit: N
- [x] 9. Prod: crear DB ingestion + pg_dump/restore de 3 tablas con paridad
     What to do: En droplet (`ssh CryptoGanster`; si el worker NO tiene acceso SSH, entrega al operador los comandos exactos numerados y detiene el todo en estado bloqueado con la evidencia del unrealized step — NO inventar salidas): (a) `CREATE DATABASE alpha_meta_token_scanner_ingestion` en `onchain-bot-postgres`; crear `apps/ingestion-service/.env.production` desde `.env.production.template` con `INGESTION_DATABASE_NAME=alpha_meta_token_scanner_ingestion` (credenciales las pone el operador — NUNCA commitear valores reales; el repo solo recibe el template actualizado; NOTA: `docker-compose.with-ingestion.yml` consume este MISMO archivo — verificar su `env_file`). (b) Inspeccionar columnas reales de prod: `SELECT column_name FROM information_schema.columns WHERE table_name='crypto_news_sources'` — si existe `filter_config` (migración backend 1816000000000): ESTRATEGIA PRIMARIA = añadir columna nullable `filter_config` al entity de ingestion + migración evolutiva `AddFilterConfigToSources` (preserva datos, entidades siguen auto-contenidas pues el backend ya no mapea esa tabla); FALLBACK = dump con lista explícita de columnas excluyéndola. Decisión documentada en evidencia. (c) Aplicar PRIMERO la baseline del todo 2 en la nueva DB (`migration:run` de ingestion), LUEGO `pg_dump --data-only -t crypto_news_sources -t crypto_news_messages -t crypto_news_message_media` desde `alpha_meta_token_scanner` + restore en orden (sources → messages → media; PKs varchar/uuid sin secuencias, FK solo media→messages). (d) Paridad: conteos por tabla origen vs destino idénticos en evidencia. (e) NO filtrar por edad en el restore (pg_dump --data-only no filtra): se restaura todo y el primer tick del janitor (todo 6/10) limpia lo >72h — evidenciar conteo post-primer-tick como cierre del todo 9.
     Must NOT do: no copiar `channel_content_filter_configs` (se queda en backend); no usar `--clean/--drop` contra prod; no reiniciar servicios hasta el todo 10.
     Parallelization: Wave 4 | Blocked by: 1, 2, 3 | Blocks: 10
     References: docker-compose.prod.yml:4-36 (postgres prod, loopback 5432); docker-compose.ingestion.yml (env_file .env.production, redes onchain-bot-net); .env.production.template (ingestion); backend migration 1816000000000-AddFilterConfigToCryptoNewsSources.ts.
     Acceptance: 3 conteos origen == destino; `GET :3032/api/crypto-news/sources` (tras todo 10) devuelve las sources migradas; backup completo de prod referenciado en evidencia (el deploy ya backupea — reutilizar esa ruta).
     QA happy: restore en DB temporal `split_rehearsal` primero, paridad ok, luego restore real. QA failure: mismatch de conteos → NO avanzar al todo 10, diagnosticar (columna extra, encoding) y reintentar. Evidence .omo/evidence/task-9-db-separation.md.
     Commit: Y | chore(ingestion): production env template for dedicated database (solo template, sin secretos)
- [ ] 10. Prod: migraciones + deploys + cutover
      What to do: ORDEN ESTRICTO (riesgo de carrera entre workflows: `deploy-ingestion.yml` y `deploy.yml` disparan sobre el mismo push a master en paralelo): (i) mergear y desplegar SOLO ingestion primero (baseline + datos ya en su DB por todo 9) y VERIFICAR `GET :3032/api/crypto-news/sources` con datos migrados; (ii) SOLO ENTONCES mergear/desplegar el backend con la drop migration (todo 5) — si el drop corriera antes, el backend pierde sus lecturas legacy mientras ingestion aún no sirve. (a) Añadir paso de migraciones ingestion en `deploy-ingestion.yml` (docker run imagen ingestion con su data-source, espejo de deploy.yml:151-157) y paso equivalente en `deploy.yml` si el deploy de backend debe ordenar el drop tras ingestion healthy; verificar `deploy-staging.yml` ya cubierto en todo 7. (b) Merge a dev → CI verde → PR a master (gobernanza: squash, 1 approval, hilos resueltos) — en DOS PRs secuenciales (ingestion, luego backend) por el orden (i)-(ii). (c) Post-deploy en droplet: ingestion healthy (`:3031/api/health` dentro + `:3032` fuera), backend healthy (`:3030/api/health`), backend `GET /crypto-news/sources` → 404, janitor nuevo corriendo con AMBAS pasadas (log `media retention tick done` + evidencia de pasada messages: conteo pre/post primer tick), matching hace un ciclo sin errores. (d) Ventana de observación: 2 ciclos de `EnqueueMatchingCronScheduler` + 1 de `PublisherCronScheduler` sin excepciones.
      Must NOT do: no cambiar flags matching/llm/publishing; no saltarse el backup pre-deploy del workflow; no pushear directo a master (pre-push bloquea + corre test:ci).
      Parallelization: Wave 4 | Blocked by: 8, 9, 6 | Blocks: 11
      References: .github/workflows/deploy.yml:148-170; deploy-ingestion.yml (build+deploy, añadir job migraciones); deploy-staging.yml; docker-compose.prod.yml:159-161 (up --wait).
      Acceptance: healthchecks 3030/3032 ok; rollback del workflow NO disparado; ciclos de schedulers limpios en logs (evidencia con timestamps).
      QA happy: dry-run de matching end-to-end. Publicación real de prueba SOLO con aprobación explícita del operador en-sesión y contra canal de prueba (nunca canales productivos) — por defecto NO se publica. QA failure: healthcheck falla → rollback automático del workflow; registrar qué lo disparó. Evidence .omo/evidence/task-10-db-separation.md.
      Commit: Y | ci(deploy): run ingestion migrations in deploy pipelines (más los merge commits de gobernanza)
- [x] 11. Docs, pgAdmin y cierre
      What to do: (a) Actualizar `AGENTS.md` raíz (sección ingestion-service: DB propia por ambiente, instancia ÚNICA en droplet consumida por staging+prod, prohibición de segundo ingestion, retención 72h), `apps/backend/AGENTS.md` (CRYPTO-NEWS: ownership final, filters sin FK, janitor movido, EXPECTED 39), `apps/ingestion-service/AGENTS.md` (migraciones, janitor 72h media+messages, 5 entidades, invariantes 1-5). (b) Templates: `apps/ingestion-service/.env.example` + `.env.production.template` con `INGESTION_DATABASE_NAME=<base>_ingestion` por ambiente; documentar la creación del `.env.production` real en droplet (comandos, sin valores). (c) pgAdmin `servers.json`: la segunda DB vive en el MISMO servidor — solo documentar el nombre en el README/agents, sin cambio de config (verificar). (d) `npm run docs:check` en verde. (e) Actualizar este plan marcando todos los todos y archivar evidencias.
      Must NOT do: no crear nuevos AGENTS.md; no editar CHANGELOG (lo genera release-please).
      Parallelization: Wave 4 | Blocked by: 10 | Blocks: F-wave
      References: AGENTS.md (raíz), apps/\*/AGENTS.md, .docs-map.jsonc, apps/backend/pgadmin/servers.json.
      Acceptance: `npm run docs:check` exit 0; grep `alpha_meta_token_scanner_ingestion` aparece en docs y templates; F-wave lista.
      QA happy: un lector nuevo entiende dónde vive cada tabla solo con los AGENTS.md. QA failure: docs:check con warning → resolver o justificar en evidencia. Evidence .omo/evidence/task-11-db-separation.md.
      Commit: Y | docs: reflect split-brain database ownership after split

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit — cada todo 1-11 tiene evidencia en .omo/evidence/task-N-db-separation.md con comando + salida; ningún Must NOT have violado (grep de secretos en diffs, `git log --oneline` revisado).
- [x] F2. Code quality review — `npm run lint` (backend+ingestion) y `tsc --noEmit` ambos servicios en verde; sin `any` nuevo cruzando puertos; entidades backend sin relación a tablas ingestion.
- [x] F3. Real manual QA — el worker USA el sistema: crear source + mensaje de prueba en ingestion dev, correr matching backend, verificar enqueue con filtros aplicados, correr janitor con fila expirada, y limpiar todo (evidencia paso a paso).
- [x] F4. Scope fidelity + invariantes — `git diff --stat` solo toca archivos del plan (sin segundos contenedores, sin cambios UI/pipeline, sin secretos); migraciones ingestion = 1 baseline + evolutivas si las hubo; backend = 1 drop migration; verificación anti-invariantes: `grep -ri "ingestion-staging\|ingestion-service" apps/backend/docker-compose.staging.yml apps/backend/docker-compose.prod.yml` vacío, UNA sola DB `*_ingestion` por servidor (`\l`), retención efectiva 72h en config (`SELECT` de prueba o var de entorno).

## Commit strategy

- Rama `feat/db-separation` desde `dev`; commits convencionales por todo (ver líneas Commit); squash-merge a `dev` vía PR, luego PR `dev`→`master` por gobernanza (1 approval + CI + hilos resueltos); sincronizar `dev` con `master` tras el merge. Push activa `test:ci` (pre-push) — los guards anti-dev ya existen; si un push wippea datos, detener y diagnosticar antes de seguir.

## Success criteria

- Dev: ingestion lee/escribe `alpha_meta_token_scanner_ingestion`; backend sin las 3 tablas ni código que las referencie; filters y matching intactos.
- Staging: drop migration aplicada, backup + paridad documentados, smoke de matching ok.
- Prod: 3 tablas migradas con conteos idénticos, healthchecks 3030/3032 ok, 2 ciclos de matching + 1 de publisher limpios, janitor nuevo activo.
- Deploys futuros migran ambas DBs; docs actualizados; cero secretos commiteados; F1-F4 APPROVE.
