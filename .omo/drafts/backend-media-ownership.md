---
slug: backend-media-ownership
status: drafting
intent: clear
pending-action: write .omo/plans/backend-media-ownership.md
approach: <fill: kill the unbounded publish-time cache (tmp-download-and-delete vs TTL janitor) + one-time verified cleanup of the 122 MB>
---

# Draft: backend-media-ownership

## Components (topology ledger)

| id | outcome (one line) | status | evidence path |
| C1-writer | confirm exact writer + read path of backend `uploads/crypto-news/media/` | done | `process-next-queued-article.use-case.ts:398,441-449,460-498`, `enqueue-matching-cron.scheduler.ts:267-299` |
| C2-fix | bounded or zero-growth media handling in publisher (no unbounded cache) | active | same files + specs |
| C3-cleanup | one-time verified cleanup of existing 122 MB (only what ingestion still holds) | active | droplet `/opt/onchain-bot/apps/backend/uploads/` |
| C4-qa | QA by agent in dev (publish with media, growth, retry, cleanup dry-run) | active | — |

## Open assumptions (announced defaults)

| assumption | adopted default | rationale | reversible? |
| estrategia | B: descargar a tmp + borrar tras publicar (crecimiento cero) | elimina la categoría de problema; sin janitor que mantener; el reintento re-descarga (barato, red local) | sí (código) |
| limpieza 122 MB | solo lo verificable contra ingestion-telegram, en el mismo plan | borrar a ciegas es irreversible si ingestion ya janitoreó (72h) algún original | n/a (irreversible — por eso verificado) |
| ads-library | fuera de alcance (vacía en droplet, 0 bytes) | nada que arreglar hoy; el backup plan ya la excluye | sí (plan futuro) |

## Findings (cited - path:lines)

- Escritor real: `ProcessNextQueuedArticleUseCase.ensureLocalFiles` → `downloadFileFromIngestion` (:398) / `downloadFromIngestionService` (:412-449): en cada publish con media descarga los bytes de ingestion-telegram y los guarda en `uploads/crypto-news/media/{channel}/{msg}_{idx}.{ext}` (:441-443, `fs.writeFile` :446). Es un read-through CACHE sin evicción — no el downloader legacy.
- El downloader legacy MTProto está muerto: `StubCryptoNewsMediaDownloader` lanza error descriptivo (`shared-ingestion.module.ts:34-46`, Phase 5). La hipótesis "modo legacy activo" queda DESCARTADA.
- El scheduler solo reconstruye paths (`enqueue-matching-cron.scheduler.ts:267-299`, caso 3) para que el fallback `downloadFileFromIngestion` (:460-498) los convierta a `GET /api/media/...` — no escribe nada.
- Droplet 2026-09-16: 122 MB / 507 ficheros, mtimes de hoy 06:52 (actividad del publisher-cron, no leftovers olvidados). `crypto-news-ads-library/` no existe → 0 bytes de ads.
- ingestion-telegram es el dueño vigente (sus `uploads` + janitor 72h `CryptoNewsRetentionCleanupScheduler`, lock `9_421_373`); el caché del backend vive más que los originales (72h) sin janitor propio → crecimiento ilimitado + riesgo de servir/pinear ficheros huérfanos.
- `docker-compose.prod.yml:90-105,193-200` (bind mount `./uploads` + nota que ya anticipa backup) y `UPLOADS_ROOT=<cwd>/uploads` (default en `app.config.ts`).

## Media ownership (distinción explícita)

| dir | dueño | qué es | este plan |
| `uploads/crypto-news/media/` (backend) | ingestion-telegram (vía `GET /api/media/...`) | caché temporal de publish, re-descargable | fix B (tmp+borrar) + limpieza verificada |
| `uploads/` en ingestion-telegram | ingestion-telegram | fuente de verdad + janitor 72h | NO tocar |
| `uploads/crypto-news-ads-library/` (backend) | backend (`local-ad-media-storage.adapter`, `ad-media-path-builder`) | librería propia de ads | NO tocar (vacía hoy, 0 bytes) |

## Decisions (with rationale)

- No se respalda `uploads/` en el plan de backups (decidido 2026-09-16, T8): es caché re-descargable, no fuente de verdad.
- Fix propuesto (a aprobar): estrategia B + limpieza verificada; alternativa A (caché con TTL 24h + janitor) documentada como descartada por defecto.

## Scope IN

- `process-next-queued-article.use-case.ts`: tmp-download-and-delete (o TTL si el usuario elige A) + specs.
- Limpieza one-time verificada de `/opt/onchain-bot/apps/backend/uploads/crypto-news/media/` en droplet.
- Doc corto en `docs/deployment/` con tabla de propiedad: `crypto-news/media/` → ingestion-telegram (caché, NO respaldar) vs `crypto-news-ads-library/` → backend (propia, fuera de este plan).

## Scope OUT (Must NOT have)

- NO tocar ingestion-telegram (sus uploads + janitor 72h se quedan).
- NO cambiar ownership ni lógica de `crypto-news-ads-library/` (propiedad del backend, vacía hoy) ni `sync-ad-images.sh`.
- NO cambiar el modo de ingesta (SSE/polling) ni flags.
- NO restore automático de media.

## Open questions

- Q1 (estrategia): ¿B (tmp+borrar, crecimiento cero) o A (caché con TTL 24h + janitor)? Default adoptado: B.
- Q2 (limpieza): ¿limpiar los 122 MB en este plan (solo lo verificable contra ingestion) o solo frenar el crecimiento y limpiar después? Default: limpiar lo verificable ahora.

## Approval gate

status: awaiting-approval
pending-action: write .omo/plans/backend-media-ownership.md (Metis + APPEND todos + TL;DR)
approach: kill the unbounded publish-time cache (tmp-download-and-delete by default) + one-time verified cleanup of the 122 MB
