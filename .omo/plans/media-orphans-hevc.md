# media-orphans-hevc - Work Plan

## TL;DR (For humans)

**What you'll get:** Limpieza de 14k huérfanos (99.5% de 18G, ~25G) + HEVC para videos (50-60% de 12G→5G) + retención 48h→24h (50% a largo plazo), todo sin S3, manteniendo Telegram compatible (H.265 CRF 28 en .mp4, transparente).

**Why this approach:** Los 14k huérfanos bloquean cualquier otra optimización — limpiarlos libera ~25G inmediato (0$). HEVC solo al descargar con fallback evita perder calidad y es soportado por Telegram desde 2017. Retención 24h ya maneja el frontend (<24h) y el mismo config cubre read+cleanup.

**What it will NOT do:** No S3/Spaces, no carpeta compartida staging/prod (sin ingestión centralizada), no pérdida >CRF 28, no cambio de contenedor (.mp4), no toca queue dailyCap.

**Effort:** Medium
**Risk:** Low - huérfanos solo borra no-referenciados, HEVC con fallback, 24h ya testeado
**Decisions to sanity-check:** HEVC CRF 28 para Telegram, retención 24h, TTL publisher 7-30d separado, no compartir media

Your next move: Approve para ejecutar Ola 0 (medir huérfanos) → Ola 1 (limpiar) → reescribir draft con nuevo baseline antes de Ola 2 (HEVC).

---

> TL;DR (machine): Medium, Low, orphans 14k→25G + HEVC 50-60% + 48h→24h → 18G→8G, Telegram H.265, no S3

## Scope

### Must have

- Script huérfanos: find vs SELECT file_path, dry-run, delete, log, evidencia
- ffmpeg en Dockerfile build+runtime, HEVC transcode en MtprotoMediaDownloader.doSaveToDisk para video/\* (libx265 -crf 28 -preset fast -c:a copy, fallback)
- Retención 48h→24h en app.config.ts + config-validator.ts + tests (controller + scheduler) + frontend label 48h→24h
- isVideoPath add .webm, frontend formatRelativeTime verify <24h
- No carpeta compartida: documentar por qué (volúmenes separados, ingestión no centralizada)
- Verificación Telegram: HEVC .mp4 con sendVideo

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No S3/Spaces — user constraint
- No carpeta compartida staging/prod — sin ingestión centralizada
- No pérdida >CRF 28 — transparente
- No cambio contenedor — keep .mp4
- No tocar queue dailyCap/logic

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: TDD for cleanup script (dry-run + delete), tests-after for HEVC (fallback), existing 1866 tests for retention
- Evidence: `.omo/evidence/media-orphans-hevc/` — `orphans-dry-run.log`, `orphans-delete.log`, `hevc-transcode.log`, `retention-24h.log`, `frontend-24h.log`
- Happy path: huérfanos 14202→0, HEVC 12G→5G, retention 24h borra >24h, frontend "hace Xh" <24h, Telegram H.265 playable
- Failure path: huérfano no borrable → log warn, HEVC ffmpeg fail → fallback original, retention 24h no borra → log

## Execution strategy

### Parallel execution waves

> Living draft: Ola 0 mide huérfanos (no muta) → Ola 1 limpia huérfanos (25G) → reescribe draft con nuevo df antes de Ola 2 (HEVC) → Ola 2-3 retención/frontend → Ola 4 publisher TTL separado.

### Dependency matrix

| Todo                                                    | Depends on | Blocks | Can parallelize with |
| ------------------------------------------------------- | ---------- | ------ | -------------------- |
| T0: Medir huérfanos (dry-run)                           | —          | T1     | —                    |
| T1: Limpiar huérfanos (delete)                          | T0         | T2,T3  | —                    |
| T2: ffmpeg Dockerfile build+runtime                     | T1         | T3     | T4                   |
| T3: HEVC transcode en MtprotoMediaDownloader            | T2         | T5     | T4                   |
| T4: Retención 48h→24h (config+validator+tests+frontend) | T1         | T5     | T2,T3                |
| T5: isVideoPath .webm + Telegram verify                 | T3,T4      | F1     | —                    |

### Parallel execution waves

- Wave 0: T0 (measure orphans, no mutation)
- Wave 1: T1 (clean orphans, 25G)
- Wave 2: T2 (ffmpeg), T4 (retention) — parallel
- Wave 3: T3 (HEVC)
- Wave 4: T5 (isVideoPath + verify)

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 0. Medir huérfanos (dry-run, no muta)
     What to do: SSH: `find /opt/.../media -type f` vs `SELECT file_path FROM media`, comm -23, du -sh, log a `.omo/evidence/media-orphans-hevc/orphans-dry-run.log`, no delete.
     Must NOT do: No delete, solo medir y loggear.
     Parallelization: Wave 0 | Blocked by: — | Blocks: 1
     References: /opt/onchain-bot/apps/backend/uploads/crypto-news/media (14273), DB 71 rows, media-retention-cleanup.scheduler.ts:79-141
     Acceptance criteria: Log con `14202 orphans, 26G` y lista de 5 ejemplos
     QA scenarios: happy: `wc -l` 14202. failure: no log → fail. Evidence: orphans-dry-run.log
     Commit: N | — | —

- [ ] 1. Limpiar huérfanos (delete, 25G)
     What to do: Script: `comm -23 disk_files db_files | xargs rm`, log `deleted: 14202, reclaimed: 25G`, run en droplet con dry-run false, evidencia `orphans-delete.log` + `df -h` antes/después.
     Must NOT do: No borrar DB-referenciados, solo huérfanos.
     Parallelization: Wave 1 | Blocked by: 0 | Blocks: 2,4
     References: /opt/.../media, DB 71 rows, mtproto-media-downloader.ts:108-144
     Acceptance criteria: `find ... | wc -l` == 71, `du -sh` 26G→1G, `df` 89%→~65%
     QA scenarios: happy: 71 files left. failure: >71 → log. Evidence: orphans-delete.log
     Commit: Y | perf(media): clean 14k orphan files (99.5%)

- [ ] 2. ffmpeg en Dockerfile build+runtime
     What to do: `apt-get install ffmpeg` en build (antes npm ci) y runtime (con wget/gosu/libvips) en `apps/backend/Dockerfile`.
     Must NOT do: Cambiar base image, quitar libvips.
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3
     References: apps/backend/Dockerfile:1-44
     Acceptance criteria: `docker build` success, `ffmpeg -version` con libx265
     QA scenarios: happy: `ffmpeg -encoders | grep libx265`. failure: build fail → fix. Evidence: hevc-transcode.log
     Commit: Y | perf(docker): add ffmpeg for HEVC

- [ ] 3. HEVC transcode en MtprotoMediaDownloader.doSaveToDisk
     What to do: En `doSaveToDisk`, si `mimeType.startsWith('video/')` → `transcodeToHevc(buffer)` con `ffmpeg -i - -c:v libx265 -crf 28 -preset fast -c:a copy -f mp4 -`, fallback a original, ext .mp4.
     Must NOT do: Cambiar .mp4, perder audio, >CRF 28, tocar imagen.
     Parallelization: Wave 3 | Blocked by: 2 | Blocks: 5
     References: mtproto-media-downloader.ts:108-144, 388-430
     Acceptance criteria: Video → HEVC .mp4, `ffprobe` H.265, Telegram playable, fallback ok
     QA scenarios: happy: `ffprobe` HEVC. failure: ffmpeg fail → original. Evidence: hevc-transcode.log
     Commit: Y | feat(media): HEVC transcode for videos (CRF 28)

- [ ] 4. Retención 48h→24h (config+validator+tests+frontend)
     What to do: `CRYPTO_NEWS_MEDIA_RETENTION_HOURS` default 48→24 en `app.config.ts:550`, `config-validator.ts:110`, tests `controller.spec, scheduler.spec` (48h→24h), frontend `index.tsx:171` 48h→24h, tests frontend 48h→24h.
     Must NOT do: Quitar config, romper deploy.
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5
     References: app.config.ts:550-556, config-validator.ts:110-120, media-retention-cleanup.scheduler.ts:106, frontend/index.tsx:171
     Acceptance criteria: Default 24h, validator 24h, tests 24h, `df` 26G→9G long-term, frontend "hace Xh" <24h
     QA scenarios: happy: tests 24h. failure: 48h hardcode → fix. Evidence: retention-24h.log
     Commit: Y | feat(config): media retention 48h→24h

- [ ] 5. isVideoPath .webm + Telegram verify
     What to do: `isVideoPath` add `ext === 'webm'`, verify `sendVideo` con HEVC .mp4 (adapter bot-api:226-281, isVideoPath:173-176).
     Must NOT do: Quitar ext, cambiar sendVideo logic.
     Parallelization: Wave 4 | Blocked by: 3,4 | Blocks: F1
     References: process-next-queued-article.use-case.ts:173-176, bot-api adapter:226-281
     Acceptance criteria: `.mp4/.mov/.mkv/.webm` → sendVideo, HEVC .mp4 playable
     QA scenarios: happy: HEVC .mp4 → sendVideo. failure: Telegram reject → fallback H.264. Evidence: hevc-verify.log
     Commit: Y | fix(publisher): HEVC .webm support

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

- One commit per todo (6 inc T0 no-commit) + evidence per wave; push per wave, draft rewrite with new df before next wave

## Success criteria

- Huérfanos 14202→0, 26G→1G, df 89%→65%, HEVC 12G→5G, retention 24h borra >24h, frontend 24h, Telegram H.265 playable, no S3, no shared
