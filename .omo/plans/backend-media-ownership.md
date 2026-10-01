# backend-media-ownership - Work Plan

## TL;DR (For humans)

**What you'll get:** El backend deja de acumular fotos de noticias para siempre y queda escrito quién es dueño de cada carpeta de media.

**Why this approach:** En vez de un janitor con TTL que hay que mantener, cada publicación descarga a temporal y borra al terminar (crecimiento cero); el reintento re-descarga de ingestion-telegram por red local, que es barato.

**What it will NOT do:** No toca ingestion-telegram ni su janitor de 72h, no cambia la librería de ads (que sí es del backend), no cambia el modo de ingesta ni restaura media automáticamente.

**Effort:** Short
**Risk:** Medium - toca el path de publish con media + limpieza irreversible en droplet (solo lo verificable)
**Decisions to sanity-check:** Estrategia B (tmp+borrar) vs A (TTL+janitor) descartada; limpieza solo verificada contra ingestion; ads-library fuera por vacía (0 bytes).

Your next move: approve, o pide revisión Momus. Full execution detail follows below.

---

> TL;DR (machine): Short / Medium — tmp-download-and-delete en publisher + cleanup verificado 122MB + doc de propiedad ads-vs-news.

## Scope

### Must have

- `uploads/crypto-news/media/` del backend pasa a crecimiento cero (tmp-download-and-delete en `ProcessNextQueuedArticleUseCase`).
- Limpieza one-time verificada de `/opt/onchain-bot/apps/backend/uploads/crypto-news/media/` (122 MB / 507 ficheros, solo lo que ingestion-telegram aún conserva).
- Doc `docs/deployment/media-ownership.md` con tabla de propiedad explícita (news → ingestion-telegram, ads → backend).
- Specs Jest que prueban crecimiento cero, retry re-descarga, y fallo cuando ingestion ya janitoreó.
- Mensajes del stub `StubFeedMediaDownloader` renombrados `ingestion-service` → `ingestion-telegram`.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO tocar ingestion-telegram (sus `uploads` + janitor 72h `FeedRetentionCleanupScheduler`, lock `9_421_373` se quedan).
- NO cambiar ownership ni lógica de `feed-ads-library/` (propiedad del backend: `local-ad-media-storage.adapter`, `ad-media-path-builder`); ni `sync-ad-images.sh`.
- NO cambiar el modo de ingesta (SSE/polling) ni flags (`USE_SSE_INGESTION`, `USE_SSE_CRYPTO_NEWS`, `matchingEnabled`, `llmEnabled`, `publishingEnabled`).
- NO restore automático de media ni backup de `uploads/crypto-news/media/` (caché re-descargable, T8 2026-09-16).
- NO TTL-janitor propio en backend (alternativa A descartada); NO `as any` / `@ts-ignore`; NO borrar specs para pasar.

## Media ownership (distinción explícita — contract del plan)

| dir | dueño | qué es | este plan |
| `uploads/crypto-news/media/` (backend) | ingestion-telegram vía `GET /api/media/...` | caché temporal de publish, re-descargable | fix B (tmp+borrar) + limpieza verificada |
| `uploads/` en ingestion-telegram | ingestion-telegram | fuente de verdad + janitor 72h | NO tocar |
| `uploads/crypto-news-ads-library/` (backend) | backend (`local-ad-media-storage.adapter`, `ad-media-path-builder`) | librería propia de ads | NO tocar (vacía hoy, 0 bytes) |

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + Jest (co-located `*.spec.ts`, `testRegex .*\.spec\.ts$`, `--forceExit`, 30s timeout). Implementation + Test = ONE todo.
- Evidence: `.omo/evidence/task-<N>-backend-media-ownership.<ext>` (logs, `ls` before/after, spec output).
- Gates: `npx tsc --noEmit` en backend, `npm run lint:backend` en ficheros tocados, `npm test -- <spec tocado>` verde.

## Execution strategy

### Parallel execution waves

- Wave 1 (código + doc, 5 todos): 1, 2, 3, 4, 5 — sin dependencias entre sí salvo 4 que reusa el contrato de 1 (puede arrancar en paralelo con mocks del contrato).
- Wave 2 (cleanup + QA + backup, 3 todos): 6, 7, 8 — 7 bloqueado por 1+4, 6 independiente, 8 independiente.

### Dependency matrix

| Todo                 | Depends on | Blocks | Can parallelize with |
| -------------------- | ---------- | ------ | -------------------- |
| 1 fix publisher tmp  | —          | 4, 7   | 2, 3, 5, 6, 8        |
| 2 scheduler contract | —          | 4      | 1, 3, 5, 6, 8        |
| 3 stub rename        | —          | —      | 1, 2, 4, 5, 6, 8     |
| 4 specs zero-growth  | 1, 2       | 7      | 3, 5, 6, 8           |
| 5 doc ownership      | —          | —      | 1, 2, 3, 4, 6, 8     |
| 6 cleanup inventario | —          | 7      | 1, 2, 3, 4, 5, 8     |
| 7 QA dev e2e         | 1, 4       | —      | 6, 8                 |
| 8 backup exclusión   | —          | —      | 1, 2, 3, 4, 5, 6     |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Publisher tmp-download-and-delete (crecimiento cero)
     What to do / Must NOT do: En `process-next-queued-article.use-case.ts` cambiar `ensureLocalFiles` (:372-408) + `downloadFromIngestionService` (:413-455) + `downloadFileFromIngestion` (:461-510) a: descargar a `os.tmpdir()/backend-media-<uuid>/`, devolver paths tmp, y borrar en `finally` tras `sendMessage/sendPhoto` (éxito y fallo). NO dejar restos en `uploads/crypto-news/media/`; NO cambiar firma pública del use-case; NO tocar ads.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 4, 7
     References (executor has NO interview context - be exhaustive): `apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts:372-408,413-455,461-510,515-525`; `apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts:267-299`; `apps/backend/src/shared/common/config/app.config.ts` (`UPLOADS_ROOT`); `apps/backend/docker-compose.prod.yml:90-105,193-200`
     Acceptance criteria (agent-executable): `npx tsc --noEmit -p apps/backend/tsconfig.json` verde; `rg -n "uploads/crypto-news/media" apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts` solo en regex de parseo fallback, cero `fs.writeFile` a `uploads/`
     QA scenarios (name the exact tool + invocation): happy: publish con 1 foto → tmp existe durante send y desaparece después; failure: ingestion 404 → queue `markFailed` sin archivo residual. Evidence `.omo/evidence/task-1-backend-media-ownership.log`
     Commit: N

- [x] 2. Scheduler contract check (sin escritura nueva)
     What to do / Must NOT do: Verificar que `resolveMediaFilePath` (:282-299) + `extensionFor` (:301-318) siguen devolviendo `uploads/crypto-news/media/<ch>/<msg>_<idx>.<ext>` o URL http para que el fallback del todo 1 lo convierta a `GET /api/media/...`. Solo comentarios si hace falta; NO escribir ficheros; NO añadir config.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 4
     References (executor has NO interview context - be exhaustive): `apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts:252-299,301-318`
     Acceptance criteria (agent-executable): `npm test -- enqueue-matching-cron.scheduler.spec` verde; `rg -n "resolveMediaFilePath|downloadFileFromIngestion" apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts` documenta el contrato en comentario
     QA scenarios (name the exact tool + invocation): happy: DTO sin filePath ni URL absoluta → path reconstruido parseable por regex `:465-467` del publisher; failure: mime desconocido → `.bin` y descarga igual. Evidence `.omo/evidence/task-2-backend-media-ownership.log`
     Commit: N

- [x] 3. Stub rename ingestion-service → ingestion-telegram
     What to do / Must NOT do: En `shared-ingestion.module.ts` cambiar los dos mensajes de `StubFeedMediaDownloader` (:36-51) de `migrated to ingestion-service` a `migrated to ingestion-telegram`; actualizar comentarios Phase 5 (:24-33) igual. NO cambiar lógica DI; NO tocar adapters.
     Parallelization: Wave 1 | Blocked by: — | Blocks: —
     References (executor has NO interview context - be exhaustive): `apps/backend/src/telegram/ingestion/shared/shared-ingestion.module.ts:24-52`
     Acceptance criteria (agent-executable): `rg -n "ingestion-service" apps/backend/src/telegram/ingestion/shared/shared-ingestion.module.ts` cero hits; `npx tsc --noEmit -p apps/backend/tsconfig.json` verde
     QA scenarios (name the exact tool + invocation): happy: importar módulo en MTProto-deprecated arranca; failure: llamar `download()` lanza error con texto `ingestion-telegram`. Evidence `.omo/evidence/task-3-backend-media-ownership.log`
     Commit: N

- [x] 4. Specs crecimiento-cero + retry + huérfano
     What to do / Must NOT do: Extender `process-next-queued-article.use-case.spec.ts` con: (a) publish con media no deja ficheros en `uploads/` ni tmp; (b) retry re-descarga de ingestion (mock `fetch` 2 llamadas); (c) ingestion 404 → `file not found` + `markFailed`, sin crash. Usar tmpdir real + `fetch` mockeado; NO tocar specs de ads; NO `as any`.
     Parallelization: Wave 1 | Blocked by: 1, 2 | Blocks: 7
     References (executor has NO interview context - be exhaustive): `apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.spec.ts`; `apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts:372-510`
     Acceptance criteria (agent-executable): `npm test -- process-next-queued-article.use-case.spec` verde (incluye los 3 casos nuevos por nombre)
     QA scenarios (name the exact tool + invocation): happy + failure cubiertos como casos (a)(b)(c) arriba. Evidence `.omo/evidence/task-4-backend-media-ownership.log`
     Commit: Y | `fix(feed-publisher): tmp-download-and-delete media cache`

- [x] 5. Doc docs/deployment/media-ownership.md
     What to do / Must NOT do: Crear doc corto con la tabla de propiedad (news → ingestion-telegram, ads → backend), qué NO respaldar (`crypto-news/media/` caché), y punteros a janitor 72h + `INGESTION_TELEGRAM_URL`. NO mover ficheros; NO tocar runbooks existentes.
     Parallelization: Wave 1 | Blocked by: — | Blocks: —
     References (executor has NO interview context - be exhaustive): `.omo/drafts/backend-media-ownership.md:32-51`; `apps/backend/docker-compose.prod.yml:90-105,193-200`
     Acceptance criteria (agent-executable): fichero existe con tabla de 3 filas + sección `Qué NO respaldar`; `npx prettier --check docs/deployment/media-ownership.md` verde
     QA scenarios (name the exact tool + invocation): happy: lector distingue news vs ads en <1min; failure: N/A (doc). Evidence `.omo/evidence/task-5-backend-media-ownership.md`
     Commit: Y | `docs(deployment): media ownership news vs ads`

- [x] 6. Cleanup inventario + dry-run (droplet 122MB)
     What to do / Must NOT do: Producir script de inventario (lista `find /opt/onchain-bot/apps/backend/uploads/crypto-news/media -type f | wc -l`, `du -sh`, `stat -c %y`) + verificación contra `GET {INGESTION_TELEGRAM_URL}/api/crypto-news/messages?limit=50` y `GET /api/media/{ch}/{msg}/{idx}` (HEAD): solo borrar lo que ingestion aún conserva (200). Default dry-run; borrar real SOLO con flag explícito + evidencia. NO borrar a ciegas; NO tocar ads-library; NO tocar ingestion.
     Parallelization: Wave 2 | Blocked by: — | Blocks: 7 (informa la lista verificada)
     References (executor has NO interview context - be exhaustive): `.omo/drafts/backend-media-ownership.md:28-29`; `apps/ingestion-telegram/src/media/api/http/media.controller.ts:88`
     Acceptance criteria (agent-executable): script `--dry-run` imprime `total / verificable / huérfano-post-72h` sin borrar nada; `bash -n <script>` verde
     QA scenarios (name the exact tool + invocation): happy: fichero con original vivo → marcado borrable; failure: original 404 (ya janitoreado) → marcado NO-borrable + razón. Evidence `.omo/evidence/task-6-backend-media-ownership.log`
     Commit: N

- [x] 7. QA dev e2e (publish con media, crecimiento cero, retry, ads intacto)
     What to do / Must NOT do: En dev (`USE_MOCK_INGESTION` o SSE contra :3031): publicar 1 artículo con foto, assert `du` de `uploads/crypto-news/media/` idéntico antes/después, retry publica igual (re-descarga), `uploads/crypto-news-ads-library/` intacta. Usar `npm run dev:mock` o backend dev + `curl` a queue; NO tocar prod/staging; NO segunda sesión MTProto.
     Parallelization: Wave 2 | Blocked by: 1, 4 | Blocks: —
     References (executor has NO interview context - be exhaustive): todos 1, 4; `apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts:372-510`
     Acceptance criteria (agent-executable): log con `before_bytes == after_bytes` + `specs todo 4` verdes + `ls ads-library` sin cambios
     QA scenarios (name the exact tool + invocation): happy: publish con foto OK y disco igual; failure: tumbar ingestion mock → `markFailed` sin residuo. Evidence `.omo/evidence/task-7-backend-media-ownership.log`
     Commit: N

- [x] 8. Backup exclusión (caché fuera, ads decisión)
     What to do / Must NOT do: Verificar `scripts/backup-db.sh` + workflow deploy excluyen `uploads/crypto-news/media/` (caché) y documentar decisión de `ads-library/` en el doc del todo 5. NO cambiar el plan de backups (T8 2026-09-16 ya decidió); solo verificación + nota.
     Parallelization: Wave 2 | Blocked by: — | Blocks: —
     References (executor has NO interview context - be exhaustive): `scripts/backup-db.sh`; `.github/workflows/deploy.yml`; `apps/backend/docker-compose.prod.yml:193-200`
     Acceptance criteria (agent-executable): `rg -n "uploads" scripts/backup-db.sh .github/workflows/deploy.yml` muestra exclusión de `crypto-news/media` o nota equivalente en el doc
     QA scenarios (name the exact tool + invocation): happy: dry-run de backup no incluye `media/`; failure: N/A. Evidence `.omo/evidence/task-8-backend-media-ownership.log`
     Commit: N

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit
- [x] F2. Code quality review
- [x] F3. Real manual QA
- [x] F4. Scope fidelity

## Commit strategy

- Todos 4 y 5 commitean por separado (fix + docs); 1-3, 6-8 sin commit (trabajo en árbol, se squashea al merge a `dev` por GOVERNANCE). Nunca commitear en `master`. Mensajes conventional-commits.

## Success criteria

- `uploads/crypto-news/media/` del backend no crece tras publishes (before==after) y specs del todo 4 verdes.
- Limpieza solo-verificada ejecutada o lista con dry-run + lista borrable/no-borrable.
- `docs/deployment/media-ownership.md` existe con tabla news-vs-ads.
- Cero `ingestion-service` en los ficheros tocados; `tsc` + `lint` verdes en backend.
