---
slug: db-separation
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/db-separation.md
approach: Separación lógica (2 DBs por ambiente en el mismo servidor Postgres, sin contenedores nuevos). Ingestion es dueña de sources/messages/message_media (+ backfill); backend conserva SOLO channel_content_filter_configs sin FK; janitor se muda a ingestion; datos staging/prod se copian con pg_dump+restore; backend elimina path de escritura SSE y lecturas legacy.
---

# Draft: db-separation

## Components (topology ledger)

<!-- id | outcome (one line) | status | evidence path -->

- C1 | Ingestion: nueva DB por ambiente + baseline de migraciones + datos copiados | active | apps/ingestion-service/src/app.module.ts:59-81, src/telegram/crypto-news/.../entities/ (4 idénticas al backend)
- C2 | Backend: recorte (3 entidades fuera de PERSISTED_ENTITIES + migración drop + borrar StoreNewsMessage path y GETs legacy; filters se quedan) | active | apps/backend/src/shared/common/persistence/entities.ts:24-27,78-81; crypto-news.controller.ts:112,160,239,409,475; store-news-message.use-case.ts
- C3 | Backend filters sin FK: drop constraint FK a sources, channel_id opaco, CRUD y FilteredCryptoNewsService intactos | active | channel-content-filter-config.entity.ts:39; create/list/toggle/delete/update-filter.use-case.ts; filtered-crypto-news.service.ts:6,106-107
- C4 | Janitor a ingestion: MediaRetentionCleanupScheduler (EVERY_HOUR, fila+unlink) se re-crea en ingestion, se elimina del backend | active | media-retention-cleanup.scheduler.ts:79,192-196
- C5 | Ops: envs/composes/deploys/pgAdmin/docs/tests | active | docker-compose.{staging,prod,ingestion}.yml; deploy.yml:151-157; deploy-ingestion.yml (sin migraciones); .husky/pre-push (test:ci)

## Open assumptions (announced defaults)

<!-- assumption | adopted default | rationale | reversible? -->

- Solo separación LÓGICA (mismo servidor), no segundo contenedor Postgres | diferir aislamiento físico hasta tener razón de carga/SLA | reversible (una DB más tarde) | sí
- Orden de olas: dev → staging → prod, con cutover por ambiente | minimiza riesgo, prod última | sí
- Nombres nuevas DBs: <base>\_ingestion (dev: alpha_meta_token_scanner_ingestion, staging: ...\_staging_ingestion, prod: ...\_ingestion) | convención existente | sí
- Ingestion baseline = sus 5 entidades (4 crypto + backfill_messages); backend drop-migration elimina 3 tablas tras cutover | entidades idénticas, sin transformación | sí
- Validación de existencia de source en filter CRUD pasa a warn (sin FK, sin check duro) | evita acoplar backend→ingestion en el path de escritura de reglas | sí

## Findings (cited - path:lines)

- Entidades backend↔ingestion idénticas columna por columna: entities/ crypto-news-source/message/message-media/channel-content-filter-config (verificado por grep @Column en ambos árboles).
- Backend escribe vía SSE: StoreNewsMessageUseCase (store-news-message.use-case.ts:65-99) cableado en crypto-news-ingestion.module.ts:110,132.
- Backend lee local: CryptoNewsController GET messages:112, messages/:id:160, sources:239, backfill:409, media/:mediaId:475; POST sources:316 → 501.
- FilteredCryptoNewsService: fetch HTTP (ingestion-client) + keywords/blacklist backend + filtros backend (sourceRepo.findFiltersByChannelId) — el único lector legítimo que se queda.
- Janitor backend EVERY_HOUR borra fila + unlink file_path con advisory lock 7421372; archivos viven en ingestion → en prod (volumen ro) falla y aborta batch.
- Ingestion sin migraciones (0 archivos); deploy.yml:151-157 solo migra backend; deploy-ingestion.yml no migra.
- Droplet ingestion usa apps/ingestion-service/.env.production (NO existe en repo) + red onchain-bot-net → postgres prod.
- Staging: postgres propio :5433, DB alpha_meta_token_scanner_staging (docker-compose.staging.yml:14-25).
- pre-push corre npm run test:ci (backend+frontend+ingestion).

## Decisions (with rationale)

- D1 user: datos staging/prod via pg_dump+restore de las 4 tablas (cero pérdida) — pero con filters QUEDÁNDOSE en backend, solo se copian 3 tablas (sources, messages, message_media). channel_content_filter_configs NO se copia (ya vive y se queda en backend).
- D2 user: content filters son lógica del backend (se aplican post-ingestion, post-keyword-matching al encolar) → se quedan en backend DB; se elimina su FK hacia sources.
- D3 user: tests-after + QA agente en cada todo.
- D4 planner: backend conserva GETs de filters CRUD + FilteredCryptoNewsService sin cambios de lógica; se eliminan GETs messages/sources/media/backfill + POST 501 se mantiene o se elimina con el controller legacy (el worker decide por endpoint con criterio: si frontend ya usa /ingestion-api, borrar).
- D5 planner: frontend sources/messages ya usan /ingestion-api (sin cambio); UI de filters sigue contra backend (sin cambio).
- D6 user (2026-09-08): ingestion es STANDALONE e inamovible — UN solo ingestion en el droplet consumido por staging+prod (prohibido ingestion por entorno); UNA sesión MTProto en droplet + cuenta local en dev; UN storage de media; UNA DB ingestion por servidor; retención 72h de messages (`ingested_at`) y media porque su único propósito es el pipeline queue→LLM→publisher→Telegram. Caveats aceptados: backfill manual >72h re-inserta; queue pausada >72h puede perder media vieja.
- R1 self-review (Metis+Momus inline, 2026-09-08 — subagentes y Codex CLI no disponibles en este entorno): veredicto CHANGES-REQUIRED, 11 fixes aplicados al plan: (1) todo 1: conteo aceptación 4→5 con regex explícito, commit Y→N (.env gitignored), rollback 1-línea; (2) todo 2: generate contra DB vacía scratch (diff-vs-poblada genera vacío), data-source apto para dist; (3) todo 4: inventario previo de importadores, repo filters-only + rewiring DI + smoke boot, borrado janitor backend movido aquí, backup pre-boot; (4) todo 5: generar contra rehearsal restaurada del backup (no contra dev post-cut), down() recrea + FK, nota de conexiones para TEMPLATE; (5) todo 6: sin parte backend; (6) todo 7: waiver si INGESTION_SERVICE_URL staging ya roto (preexistente); (7) todo 9: filter_config → añadir columna a entity ingestion (primario) + migración evolutiva condicional, nota with-ingestion mismo archivo, fallback sin SSH; (8) todo 10: orden estricto ingestion-primero en 2 PRs secuenciales, publish de prueba solo con aprobación; (9) todo 11: templates ingestion explícitos.
- R2 self-review sobre añadidos (invariantes + retención 72h, 2026-09-08): veredicto CHANGES-REQUIRED menores, 3 fixes: (a) regla de edad absoluta en todo 6 (borrado por edad sin excepción de matching — noticia >72h no se publica; única excepción: referencia queue/backfill); (b) todo 9 sin filtrado por edad en restore + conteo post-primer-tick como cierre; (c) todo 10 exige evidencia de AMBAS pasadas del janitor, no solo el log genérico.

## Scope IN

- Nueva DB ingestion por ambiente (dev/staging/prod), baseline migraciones ingestion, pg_dump+restore staging/prod (3 tablas), recorte backend (entidades, drop migration, borrar StoreNewsMessage path + GETs legacy), drop FK filters, janitor movido a ingestion, envs/templates/compose/deploy/pgAdmin/docs, aislamiento tests backend e2e a \*\_test.
- Invariantes 1-5 del plan (instancia única, MTProto único, storage único, una DB ingestion por servidor, retención 72h messages+media con auditoría previa de referencias queue/backfill).

## Scope OUT (Must NOT have)

- Segundo contenedor Postgres / aislamiento físico; cambios en pipeline de matching/LLM/publishing; cambios en UI (solo re-apuntado si hiciera falta, sin rediseño); tocar KOLs u otras tablas; reescribir seeders.

## Open questions

- Ninguna bloqueante. Gate pendiente de okay explícito.

## Approval gate

status: awaiting-approval
pending-action: write .omo/plans/db-separation.md
approach: Separación lógica en 5 componentes (C1–C5), olas dev→staging→prod, pg_dump+restore (3 tablas), filters se quedan en backend sin FK, tests-after + QA agente.
