# prod-backend-rolling-backup - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Un backup diario automático de la base de datos de producción del backend, con 7 días de historial, copia fuera del servidor en Cloudflare R2 (capa gratuita, ~0.5% de uso) y avisos automáticos si algo falla o el disco se llena. El backup previo a cada despliegue sobrescribe el del mismo día en vez de acumular archivos. Incluye además una investigación que aclara qué son los 122 MB de media del backend (y por qué no se respaldan).

**Why this approach:** Un solo archivo reemplazable era frágil (un volcado corrupto te dejaba sin nada bueno) y los timestamps acumulados llenaban disco; el esquema diario con fecha + poda te da 7 puntos de restauración con costo fijo, y la copia externa convierte el backup en recuperación real ante desastre. Todo va opt-in por variables de entorno para no romper el backup existente de ingestion, que comparte el mismo script.

**What it will NOT do:** No toca los backups de ingestion ni staging, no restaura nada solo (el restore sigue siendo manual y documentado), no guarda ninguna clave en el repositorio, y no cambia la limpieza de fotos/mensajes de 72h.

**Effort:** Medium
**Risk:** Medium - un fallo en el script compartido podría afectar el backup de ingestion; se mitiga con modo opt-in y QA en dev sin tocar producción.
**Decisions to sanity-check:** R2 por defecto (egress $0) con B2 como alternativa solo-config; timer a las 03:00 UTC con espejo a las 03:20; escala única (disco warn ≥80%/fail ≥90%, bucket warn ≥6.4 GB/fail >8 GB); poda local `-mtime +6` = exactamente 7 ficheros.

Your next move: approve to start work, or run the dual high-accuracy review (Momus + Codex) first. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, Medium risk — daily rolling prod-backend backups (7-day) + R2/B2 offsite + health watchdog.

## Scope

### Must have

- `scripts/backup-db.sh`: modo `daily` opt-in (`BACKUP_MODE=daily` + `BACKUP_BASENAME=prod-backend` + `BACKUP_ORIGIN=cron|pre-deploy` — el timer pasa `cron`, el deploy pasa `pre-deploy`; mismo día = last-writer-wins) que produce `prod-backend-YYYYMMDD.dump.gz` + `.meta.txt` (fecha/sha256/tamaño/origen) vía `.tmp` + `mv` atómico en el mismo filesystem, con validación (`gzip -t`, tamaño > 0, `pg_restore --list` si disponible) y guardia anti-vacío: si ya existe un `prod-backend-*.dump.gz` vigente y el nuevo válido pesa <50% de él — caso real del volcado de 55 KB frente a 7.9 MB del 2026-09-14 — NO pisa, exit 4 con línea `suspicious-size`; SIN artefacto de media: `uploads/` del backend queda EXCLUIDO a propósito (ver T8 — son 122 MB de message-media que el backend prod sigue descargando en modo legacy, duplicando a ingestion-telegram; 0 bytes de ads), pre-flight de disco (escala única: warn ≥80%, fail ≥90% o <2 GB libres), lock exclusivo en `/run/lock/onchain-backend-backup.lock` (`flock -n` dentro del script; el perdedor sale con exit 3 y línea `locked`), y poda `find <prefijo> -mtime +6 -delete` (= exactamente 7 ficheros). Comportamiento por defecto (timestamped `pre-deploy-*`) intacto.
- Matriz de aislamiento por DB: el modo diario solo corre en ruta de droplet (`BACKUP_DIR=/opt/onchain-bot/backups` o `/data/backups/...`); en dev (`db:backup` sin env) el default no cambia. El bloque fallback de ingestion en `deploy-ingestion.yml:88-96` se declara deprecado SOLO en docs (T6) — ningún todo edita `deploy-ingestion.yml`; el backend queda aislado por `BACKUP_BASENAME=prod-backend` y su propio `BACKUP_DIR`.
- `deploy.yml` (paso "Backup database"): pasa las 3 vars (`BACKUP_MODE=daily BACKUP_BASENAME=prod-backend BACKUP_ORIGIN=pre-deploy`), publica tabla en `$GITHUB_STEP_SUMMARY` y emite `::warning::`/`::error::`; el fallo del backup aborta el deploy antes de migraciones.
- Timer systemd diario en droplet (03:00 UTC, `User=runner`, `EnvironmentFile=/opt/onchain-bot/.backup-env` con `POSTGRES_PASSWORD`, fichero creado out-of-band con `install -m 600 -o runner /dev/null /opt/onchain-bot/.backup-env`, el service valida `test -s` al arrancar, log a journald, `OnFailure=` documentado — el alerter es T5) + `scripts/sync-backups-offsite.sh` (rclone v1.69.0 linux-amd64, instalado vía .deb pineado de `https://downloads.rclone.com/v1.69.0/` con verificación `sha256sum -c` del `.sha256` publicado junto al .deb; copy del par del día — 2 ficheros: `.dump.gz` + `.meta.txt` — + prune bucket a 7 días con `--include 'prod-backend-*'`; credenciales en `/opt/onchain-bot/.rclone-offsite.env` (chmod 600) + GitHub Secrets `R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY`, creados con `gh secret set`; ownership de borrado: SOLO el script (`rclone delete --min-age 7d --include 'prod-backend-*'`), prohibido configurar lifecycle en el bucket — verificado con `aws --endpoint-url $R2_ENDPOINT s3api get-bucket-lifecycle-configuration --bucket $R2_BUCKET` que debe devolver `NoSuchLifecycleConfiguration`).
- `.github/workflows/backup-health.yml` diario con la ESCALA ÚNICA (idéntica en T1/T2/T5/Success): disco warn ≥80% / fail ≥90% o <2 GB libres; backup más reciente fail si >26h; bucket warn ≥6.4 GB (80% del presupuesto 8 GB) / fail si >8 GB; conteo warn si `prod-backend-*.dump.gz` ≠7 (6 u 8 = ventana transitoria 03:00–03:20, nunca fail por conteo); offsite warn si el objeto más nuevo del bucket va >26h por detrás del local. Falla el workflow solo en los casos fail.
- `docs/deployment/BACKUPS.md` (esquema DB, restore de ambas DBs desde `.gz`, sección de media EXCLUIDA con el hallazgo T8, rotación de keys) + actualización de las secciones restore/disco de `docs/ci-cd.md` en el mismo PR + procedimiento de limpieza legacy `pre-deploy-*`.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO cambiar el comportamiento por defecto del script ni el path de ingestion/staging; NO backups nuevos para staging o ingestion DB.
- NO restore automático (solo comando documentado y drill en efímero).
- NO credenciales en el repo (ni en logs ni en summaries; enmascarar con `::add-mask::`).
- NO doble dueño del borrado: local lo poda el script, bucket lo poda el sync (nunca lifecycle + script a la vez).
- NO tocar retención 72h de media/mensajes ni nada de ingestion-telegram.
- NO respaldar `uploads/` del backend en este plan (exclusión T8: 122 MB duplicados con ingestion-telegram, 0 bytes de ads; su destino se decide con el dossier T8).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after (bash, no framework) + framework existente intacto (no se añaden suites Jest/Vitest).
- Evidence: .omo/evidence/task-<N>-prod-backend-rolling-backup.<ext> (logs de dry-run dev, `gzip -t`, `sha256sum -c`, `pg_restore --list`, `rclone --dry-run`, `systemd-analyze verify`, matriz del health simulada).
- Restore drill obligatorio contra postgres efímero (dev) con `gunzip -c | pg_restore` + `SELECT count(*)` antes de merge.

## Execution strategy

### Parallel execution waves

- Wave 1: 1 (script hardening — contrato de nombres + validación + thresholds + flock).
- Wave 2: 2 (deploy.yml) + 3 (timer systemd) + 4 (offsite rclone) + 8 (media investigation, solo-lectura) en paralelo — 2/3/4 dependen del contrato del 1, 8 es independiente.
- Wave 3: 5 (health workflow) + 6 (docs + ci-cd.md + limpieza legacy + sección media con hallazgo T8) en paralelo.
- Wave Final: 7 (drill end-to-end en dev) + Final Verification Wave.

### Dependency matrix

| Todo                   | Depends on        | Blocks            | Can parallelize with |
| ---------------------- | ----------------- | ----------------- | -------------------- |
| T1 script daily        | —                 | T2,T3,T4,T5,T6,T7 | T8                   |
| T2 deploy.yml          | T1                | T5,T6,T7          | T3,T4,T8             |
| T3 timer systemd       | T1                | T5,T6,T7          | T2,T4,T8             |
| T4 offsite rclone      | T1                | T5,T6,T7          | T2,T3,T8             |
| T5 health workflow     | T1,T2,T3,T4       | T6,T7             | T6,T8                |
| T6 docs + legacy       | T1,T2,T3,T4,T5,T8 | T7                | T5                   |
| T7 drill e2e dev       | T1–T6             | Final Wave        | —                    |
| T8 media investigation | —                 | T6                | T1,T2,T3,T4,T5       |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. backup-db.sh: modo daily + aislamiento por DB + atómico + validación + thresholds + flock
     What to do / Must NOT do: Añadir `BACKUP_MODE=daily` + `BACKUP_BASENAME=prod-backend` + `BACKUP_ORIGIN` (valores permitidos: `cron|pre-deploy`; cualquier otro = exit 2) — opt-in; sin vars, byte-por-byte el comportamiento actual. En daily: fecha vía `date +%Y%m%d` (override `FAKE_DATE` para QA), dump a `$FILE.tmp` en el mismo `BACKUP_DIR` + `mv`; capturar exit de `pg_dump` bajo `pipefail` (si `pg_dump`≠0: borrar `.tmp`, exit≠0, NO pisar); validar `gzip -t` + tamaño>0 + `pg_restore --list` si existe (si falla: borrar `.tmp`, NO pisar, exit≠0); guardia anti-vacío: peso vigente con `stat -f%z || stat -c%s` (portable BSD/GNU como ya hace el script); si nuevo <50% del vigente → borrar `.tmp`, NO pisar, exit 4 con línea `suspicious-size` (sin vigente previo no aplica); escribir `.meta.txt` (fecha/sha/`BACKUP_ORIGIN`/tamaño) y podarlo junto al dump; SIN media: no se toca `UPLOADS_DIR` (exclusión T8); pre-flight `df`: warn ≥80%, fail ≥90% o <2 GB libres (fail = exit≠0 ANTES de dumpear); lock: `exec 9>/run/lock/onchain-backend-backup.lock; flock -n 9 || { echo locked; exit 3; }` al inicio del script (único lock-path del sistema); poda `find "$BACKUP_DIR" -maxdepth 1 -name 'prod-backend-*.dump*' -mtime +6 -delete` (= exactamente 7 ficheros; dry-run con `-print` primero); limpiar `.tmp` stale al inicio; guardia droplet: daily exige `BACKUP_DIR=/opt/onchain-bot/backups` o `/data/backups/*`, si no, aborta ruidoso. Must NOT: tocar el path default, el fallback host pg_dump, la poda `pre-deploy-*`, ni `UPLOADS_DIR`/`uploads/` (exclusión T8).
     Parallelization: Wave 1 | Blocked by: — | Blocks: T2,T3,T4,T5,T6,T7
     References (executor has NO interview context - be exhaustive): scripts/backup-db.sh:1-62 (escribir aquí); .github/workflows/deploy-ingestion.yml:77-96 (no tocar, solo aislar por prefijo); apps/backend/package.json:30 (`db:backup` debe seguir intacto sin env); docs/ci-cd.md:317-327 (formato restore actual a corregir en T6, no aquí)
     Acceptance criteria (agent-executable): `BACKUP_MODE=daily BACKUP_BASENAME=prod-backend BACKUP_DIR=$(mktemp -d) FAKE_DATE=20260916 bash scripts/backup-db.sh` (contra contenedor dev vía `POSTGRES_CONTAINER=onchain-bot-postgres-dev`) → existe `prod-backend-20260916.dump.gz` + `.meta.txt`, `gzip -t` exit 0, `sha256sum -c` OK; re-run mismo `FAKE_DATE` con `BACKUP_ORIGIN=pre-deploy` sobrescribe y el meta contiene `pre-deploy`; `BACKUP_ORIGIN=bogus` → exit 2; enano: vigente de tamaño N + nuevo válido <N/2 → exit 4 sin pisar; bloqueo: con el lock tomado por otro proceso el script sale exit 3 con línea `locked`; sin env → solo `pre-deploy-*.dump.gz`; `bash -n scripts/backup-db.sh` exit 0.
     QA scenarios (name the exact tool + invocation): happy: `bash` dry-run dev descrito arriba, Evidence .omo/evidence/task-1-prod-backend-rolling-backup.log. failure: `FAKE_DATE` con dump corrupto simulado (truncar `.tmp`) → el `.gz` del día NO cambia + exit≠0; `df` simulado al 91% (stub) → abort con línea `::error::`; nuevo al 40% del vigente → exit 4 `suspicious-size` sin pisar; Evidence .omo/evidence/task-1-prod-backend-rolling-backup-failure.log
     Commit: Y | feat(scripts): daily rolling backend backup mode
- [ ] 2. deploy.yml: wiring daily + summary + annotations + abort-on-failure
     What to do / Must NOT do: En el paso "Backup database" pasar `BACKUP_MODE=daily BACKUP_BASENAME=prod-backend BACKUP_ORIGIN=pre-deploy`; tras el script, anexar tabla a `$GITHUB_STEP_SUMMARY` (archivo, tamaño, sha, edad, uso disco, offsite pendiente) y emitir `::warning::` (disco ≥80%) / `::error::` (fallo o disco ≥90% o <2 GB) con la ESCALA ÚNICA del Scope; el step falla (exit≠0) si el backup falla → el deploy no avanza a migraciones. Enmascarar secretos con `::add-mask::` (los valores nunca llegan al summary). Must NOT: tocar jobs de imágenes, prune, migraciones, healthcheck ni `deploy-ingestion.yml`.
     Parallelization: Wave 2 | Blocked by: T1 | Blocks: T5,T6,T7
     References (executor has NO interview context - be exhaustive): .github/workflows/deploy.yml:103-125 (editar el paso Backup + respetar el gate de disco 80% en :125); scripts/backup-db.sh (contrato T1: vars, meta, códigos de salida); docs/ci-cd.md:194-196 (descripción del paso a actualizar en T6)
     Acceptance criteria (agent-executable): `yamllint`/parse del workflow OK + `actionlint` si disponible; `grep` confirma `BACKUP_MODE=daily` en el paso; en un run de prueba se genera `$GITHUB_STEP_SUMMARY` no vacío (evidencia: log con la tabla); con stub de fallo del script el step retorna ≠0.
     QA scenarios (name the exact tool + invocation): happy: simular run con `GITHUB_STEP_SUMMARY=$(mktemp)` + stub de backup OK → tabla presente, Evidence .omo/evidence/task-2-prod-backend-rolling-backup.log. failure: stub de backup con exit 1 → step falla y no se ejecuta el siguiente (migraciones), Evidence .omo/evidence/task-2-prod-backend-rolling-backup-failure.log
     Commit: Y | ci(deploy): daily backend backup with failure signaling
- [ ] 3. Timer systemd diario 03:00 UTC en droplet
     What to do / Must NOT do: Crear `infra/systemd/onchain-backend-backup.service` + `.timer` (`OnCalendar=*-*-* 03:00:00 UTC`, `User=runner`, `EnvironmentFile=/opt/onchain-bot/.backup-env` — fichero con `POSTGRES_PASSWORD`, creado out-of-band con `install -m 600 -o runner /dev/null /opt/onchain-bot/.backup-env`, el service valida `test -s` al arrancar; el service invoca el script con `BACKUP_MODE=daily BACKUP_BASENAME=prod-backend BACKUP_ORIGIN=cron` — el lock vive DENTRO del script (T1, `/run/lock/onchain-backend-backup.lock`), el service no añade otro; log a journald, `OnFailure=` documentado — el alerter es T5). Incluir procedimiento de instalación (copy + `daemon-reload` + `enable --now` + `list-timers`). Must NOT: tocar `onchain-dev-infra.timer` ni timers de prune; TZ siempre explícita UTC; NO leer GitHub Secrets desde systemd (solo fichero on-host).
     Parallelization: Wave 2 | Blocked by: T1 | Blocks: T5,T6,T7
     References (executor has NO interview context - be exhaustive): AGENTS.md (patrón onchain-dev-infra.timer cada 5 min + disciplina de procesos en droplet); scripts/backup-db.sh (contrato T1); docs/ci-cd.md:443-452 (prune 02:00 — el timer va después a propósito)
     Acceptance criteria (agent-executable): `systemd-analyze verify infra/systemd/onchain-backend-backup.service infra/systemd/onchain-backend-backup.timer` exit 0; `grep` confirma `OnCalendar` + `EnvironmentFile=/opt/onchain-bot/.backup-env` + `User=runner` + `BACKUP_ORIGIN=cron`; prueba de lock: tomar el lock en background (`flock -n /run/lock/onchain-backend-backup.lock sleep 30 &`) y correr el script → exit 3 con línea `locked`, sin doble escritura.
     QA scenarios (name the exact tool + invocation): happy: `systemd-analyze verify` + invocación manual del service en dev contra contenedor dev, Evidence .omo/evidence/task-3-prod-backend-rolling-backup.log. failure: `EnvironmentFile` ausente → fallo ruidoso en journal (no dump a medias), Evidence .omo/evidence/task-3-prod-backend-rolling-backup-failure.log
     Commit: Y | feat(infra): daily backend backup systemd timer
- [ ] 4. sync-backups-offsite.sh: rclone R2 (default) / B2 (alternativa) + retención 7
     What to do / Must NOT do: Crear `scripts/sync-backups-offsite.sh` con comandos exactos: `rclone copy "$BACKUP_DIR"/prod-backend-$(date +%Y%m%d).dump.gz "$BACKUP_DIR"/prod-backend-$(date +%Y%m%d).meta.txt "$R2_REMOTE:$R2_BUCKET"/` + `rclone delete --min-age 7d --include 'prod-backend-*' "$R2_REMOTE:$R2_BUCKET"/` — el script es el único dueño del borrado remoto, prohibido lifecycle en el bucket (verificado con `aws --endpoint-url $R2_ENDPOINT s3api get-bucket-lifecycle-configuration --bucket $R2_BUCKET` → `NoSuchLifecycleConfiguration`); rclone v1.69.0 linux-amd64 vía .deb pineado de `https://downloads.rclone.com/v1.69.0/` con `sha256sum -c` del `.sha256` publicado; vars `R2_REMOTE/R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY` leídas de `/opt/onchain-bot/.rclone-offsite.env` (chmod 600, `test -s` al arrancar) y en CI de GitHub Secrets creados con `gh secret set R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY` (B2 = mismo script cambiando remote/endpoint, documentado en BACKUPS.md); soportar `--dry-run`; secretos nunca en logs (`--log-level NOTICE` sin dump de env + `::add-mask::` en CI). Programar a las 03:20 UTC tras el timer.
     Parallelization: Wave 2 | Blocked by: T1 | Blocks: T5,T6,T7
     References (executor has NO interview context - be exhaustive): scripts/backup-db.sh (nombres `.gz`+`.meta.txt` de T1); infra/systemd de T3 (orden 03:00→03:20); docs/ci-cd.md:507-519 (hoy sin observabilidad externa — T5 lo cubre)
     Acceptance criteria (agent-executable): `bash -n scripts/sync-backups-offsite.sh` exit 0; contra remote de prueba o `rclone --dry-run`: el copy subiría exactamente los 2 ficheros del día y el delete llevaría `--include 'prod-backend-*'` (grep del comando); `grep -rE 'R2_SECRET|ACCESS_KEY.*=.{4}' scripts/ infra/` confirma que ninguna key aparece hardcodeada; el check de lifecycle devuelve `NoSuchLifecycleConfiguration`.
     QA scenarios (name the exact tool + invocation): happy: `rclone ... --dry-run` con 8 objetos (7 + 1 de >7d) → 7 restantes, Evidence .omo/evidence/task-4-prod-backend-rolling-backup.log. failure: credenciales ausentes → exit≠0 con mensaje (sin filtrar secretos); bucket simulado con 6.6 GB → warning (≥6.4 GB = 80% de 8 GB); bucket con 8.5 GB → fail (>8 GB). Evidence .omo/evidence/task-4-prod-backend-rolling-backup-failure.log
     Commit: Y | feat(scripts): offsite backup sync to R2/B2
- [ ] 5. backup-health.yml: watchdog diario con escala única de thresholds
     What to do / Must NOT do: Crear `.github/workflows/backup-health.yml` (`schedule` diario + `workflow_dispatch`): vía SSH al droplet + `rclone lsl` al bucket, aplica la ESCALA ÚNICA del Scope — backup más reciente fail si >26h; disco warn ≥80% / fail ≥90% o <2 GB; bucket warn ≥6.4 GB / fail si >8 GB; conteo warn si `prod-backend-*.dump.gz` ≠7 (6 u 8 = ventana transitoria 03:00–03:20, nunca fail por conteo); offsite warn si el objeto más nuevo del bucket va >26h por detrás del local. Publica tabla en `$GITHUB_STEP_SUMMARY` y falla el workflow solo en los casos fail. Must NOT: restaurar nada, borrar nada, tocar credenciales fuera de Secrets.
     Parallelization: Wave 3 | Blocked by: T1,T2,T3,T4 | Blocks: T6,T7
     References (executor has NO interview context - be exhaustive): .github/workflows/deploy.yml:112-125 (escala de disco existente a unificar); scripts/sync-backups-offsite.sh (qué mide el lag); docs/ci-cd.md:250,502 (thresholds 80% a unificar)
     Acceptance criteria (agent-executable): parse YAML OK; matriz simulada (stubs de ssh/rclone) con veredicto exacto por caso: backup 30h→fail, disco 82%→warn, disco 91%→fail, bucket 6.6 GB→warn, bucket 8.5 GB→fail, 6 dumps→warn, offsite 30h por detrás→warn, todo verde→success (evidencia: log de la matriz con los 8 casos).
     QA scenarios (name the exact tool + invocation): happy: todos los stubs en verde → workflow success + summary, Evidence .omo/evidence/task-5-prod-backend-rolling-backup.log. failure: stub backup 30h → workflow fail con `::error::` visible, Evidence .omo/evidence/task-5-prod-backend-rolling-backup-failure.log
     Commit: Y | ci(backup): daily backup health watchdog
- [ ] 6. BACKUPS.md + ci-cd.md + limpieza legacy
     What to do / Must NOT do: Crear `docs/deployment/BACKUPS.md` (esquema diario+7, deploy-pisa-día con `BACKUP_ORIGIN`, timer 03:00 UTC, offsite R2/B2, tabla de la ESCALA ÚNICA del Scope, restore de AMBAS DBs desde `.gz` con `gunzip -c … | pg_restore --clean --if-exists` + `sha256sum -c`, sección de media EXCLUIDA con el hallazgo T8 (qué hay, por qué no se respalda, qué hacer con ello), aprovisionamiento de secretos con comandos exactos `install -m 600` y `gh secret set R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY`, rotación de keys, procedimiento de limpieza legacy con inventario exacto (`ls -lh /opt/onchain-bot/backups/`): `pre-deploy-*.dump*`, más los manuales del 2026-09-10 con otro esquema (`prod-backend-*-*.dump` SIN comprimir — 7.5 MB —, `prod-ingestion-*`, `staging-*` y subdir `staging/`) — formato canónico desde ahora: `.dump.gz`; los `.dump` sin comprimir se recomprimen (`gzip -9`) o se eliminan tras el drill, a elegir documentado — solo tras verificar 7 objetos nuevos + 1 restore drill, y declaración de deprecación SOLO-DOCS del bloque fallback de ingestion `deploy-ingestion.yml:88-96` — sin editar ese workflow). Actualizar `docs/ci-cd.md` §§ restore/disco (hoy referencian `pre-deploy-*.dump` sin gunzip) en el mismo PR. Must NOT: implementar nada nuevo; NO editar `deploy-ingestion.yml`, `deploy-staging.yml` ni `scripts/deploy.sh`.
     Parallelization: Wave 3 | Blocked by: T1,T2,T3,T4,T5 | Blocks: T7
     References (executor has NO interview context - be exhaustive): docs/ci-cd.md:182-211,317-327,429-435,502-519,649 (secciones a actualizar); .github/workflows/deploy-ingestion.yml:77-96 (bloque a deprecar); apps/backend/docs/spydefi/arch si se cita DDD (no tocar)
     Acceptance criteria (agent-executable): `ls docs/deployment/BACKUPS.md` + `grep` de la línea de restore con `gunzip -c` y de la tabla de thresholds; `npm run docs:check` sin errores nuevos (warning preexistente OK); ningún `pre-deploy-*` borrado en este PR (solo procedimiento).
     QA scenarios (name the exact tool + invocation): happy: `node scripts/check-docs-staleness.mjs` exit 0 o solo warnings previos, Evidence .omo/evidence/task-6-prod-backend-rolling-backup.log. failure: restore doc sin `gunzip` → rechazar en revisión (checklist en el propio doc), Evidence .omo/evidence/task-6-prod-backend-rolling-backup-failure.log
     Commit: Y | docs(backups): rolling backup scheme and restore runbook
- [ ] 7. Drill end-to-end en dev (sin tocar prod ni bucket real)
     What to do / Must NOT do: Con `BACKUP_DIR` temporal + contenedor dev: 3 días simulados (`FAKE_DATE=20260914/15/16` con `BACKUP_ORIGIN=cron`), 1 re-run mismo día con `BACKUP_ORIGIN=pre-deploy` (pisa-día, meta=cron→pre-deploy), 1 corrupto (truncar `.tmp` → no-pisa, exit≠0), 1 enano (<50% del vigente → no-pisa, exit 4), poda a 7 (sembrar con `for i in $(seq 1 9); do touch -d "$i days ago" "prod-backend-seed-$i.dump.gz"; done` usando nombres `prod-backend-$(date -d "$i days ago" +%Y%m%d).dump.gz` reales + correr el script → conteo final == 7 por `-mtime +6`), `BACKUP_ORIGIN=bogus` → exit 2, lock tomado → exit 3, `rclone --dry-run` offsite, restore real a postgres efímero (`gunzip -c | pg_restore` + `SELECT count(*)` en ambas DBs con dumps de prueba), y matriz de 8 casos del health con stubs. Guardar todos los logs en evidence. Must NOT: tocar `/opt/onchain-bot/backups`, el droplet, prod, ni el bucket real.
     Parallelization: Wave Final | Blocked by: T1–T6 | Blocks: Final Wave
     References (executor has NO interview context - be exhaustive): scripts/backup-db.sh; scripts/sync-backups-offsite.sh; .github/workflows/backup-health.yml; docs/deployment/BACKUPS.md (seguir el runbook al pie de la letra)
     Acceptance criteria (agent-executable): `gzip -t prod-backend-*.dump.gz` exit 0 en los 3 días; `sha256sum -c *.meta.txt` OK; `pg_restore --list` exit 0; restore drill con `SELECT count(*)` > 0; conteo post-poda == 7 (`ls prod-backend-*.dump.gz | wc -l`); health-matrix 8/8 casos con veredicto esperado (backup 30h→fail, disco 82%→warn, 91%→fail, bucket 6.6 GB→warn, 8.5 GB→fail, 6 dumps→warn, lag 30h→warn, verde→success).
     QA scenarios (name the exact tool + invocation): happy: drill completo verde, Evidence .omo/evidence/task-7-prod-backend-rolling-backup.log. failure: truncar un `.tmp` a mitad del drill → el `.gz` del día intacto + drill aborta con error claro, Evidence .omo/evidence/task-7-prod-backend-rolling-backup-failure.log
     Commit: N | (evidencia únicamente, sin cambios de producto)
- [ ] 8. Media ownership investigation (¿legacy activo o resto olvidado?)
     What to do / Must NOT do: SOLO lectura, sin tocar prod (salvo SSH read-only al droplet ya usado). Determinar con evidencia: (a) en qué modo corre el backend prod (`USE_SSE_INGESTION` — leer valor efectivo: `apps/backend/src/shared/common/config/app.config.ts` defaults + `.env.production.template` + `deploy.yml`, más gap 2 de backend AGENTS.md); (b) qué path de código escribe `uploads/crypto-news/media/{channelId}/{messageId}_{idx}.*` en modo legacy (buscar `MediaDownloaderService`/`TelegramMediaDownloadService` pre-fase-5 y su wiring actual); (c) ownership vigente de ingestion-telegram (sus `uploads/` + janitor 72h); (d) cuantificar duplicación: muestrear 20 ficheros del backend (canal/mensaje de nombre+fecha) y comprobar si existen en ingestion-telegram (vía su API/DB local de dev o el propio filesystem del droplet, solo lectura); (e) uso real de la ads-library (`crypto-news-ads-library/` ausente en droplet + conteo de filas `AdMediaLibrary` en dev). Entregable: `.omo/evidence/task-8-prod-backend-rolling-backup-media-dossier.md` con veredicto (legacy-activo vs resto) + recomendación explícita (migrar prod a SSE + borrar dir vs mantener + documentar) — la decisión se REGISTRA, NO se ejecuta. Must NOT: borrar/mover nada en el droplet, tocar prod, ni cambiar código.
     Parallelization: Wave 2 | Blocked by: — | Blocks: T6
     References (executor has NO interview context - be exhaustive): apps/backend/src/shared/common/config/app.config.ts (defaults `USE_SSE_INGESTION`/`USE_MOCK_INGESTION`); apps/backend/.env.production.template (modo prod); apps/backend/AGENTS.md gaps 2, 25 (MTProto default, download pre-fase-5); apps/backend/docker-compose.prod.yml:90-105,193-200 (bind mount + nota); apps/backend/src/telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-media-library.entity.ts:11 (ruta `crypto-news-ads-library/`); droplet read-only: `/opt/onchain-bot/apps/backend/uploads/` (122 MB, 507 ficheros, frescos 2026-09-16 06:52)
     Acceptance criteria (agent-executable): existe `.omo/evidence/task-8-prod-backend-rolling-backup-media-dossier.md` con: modo efectivo del backend prod citado (archivo:línea), path de código escritor citado, tabla de la muestra de 20 ficheros (nombre/fecha/existe-en-ingestion sí-no), estado de ads-library, y recomendación única explícita; cero cambios fuera de `.omo/evidence/`.
     QA scenarios (name the exact tool + invocation): happy: dossier completo con las 5 secciones, Evidence .omo/evidence/task-8-prod-backend-rolling-backup.log. failure: evidencia inaccesible (p. ej. sin SSH) → dossier con sección `faltante` listando el acceso exacto que falta, sin inventar datos, Evidence .omo/evidence/task-8-prod-backend-rolling-backup-failure.log
     Commit: N | (dossier en evidence; su sección en BACKUPS.md la escribe T6)

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Agent-executed QA (drill T7 + health matrix re-run, evidence-linked, zero human steps)
- [ ] F4. Scope fidelity

## Commit strategy

- Un commit atómico por todo (T1→T6; T7 y T8 no commitean, solo evidencia): `feat(scripts)`, `ci(deploy)`, `feat(infra)`, `feat(scripts)`, `ci(backup)`, `docs(backups)`.
- Convencional + hooks (commitlint/Husky) respetados; cada commit incluye su evidencia en `.omo/evidence/`.
- Orden: T1 primero (contrato), luego T2+T3+T4+T8 (en cualquier orden entre sí; T8 es solo-lectura), luego T5, luego T6, y T7 como verificación sin commit.

## Success criteria

- `BACKUP_MODE=daily` produce `prod-backend-YYYYMMDD.dump.gz` + `.meta.txt` válidos (`gzip -t`, `sha256sum -c`, `pg_restore --list` en verde) y el default sin vars sigue produciendo `pre-deploy-*` (ingestion intacto, `deploy-ingestion.yml` sin editar).
- En disco hay siempre exactamente 7 `prod-backend-*.dump.gz` (poda `-mtime +6` por prefijo) y el deploy con `BACKUP_ORIGIN=pre-deploy` pisa el archivo del día sin crear un segundo fichero.
- El bucket espeja 7 objetos (warn si 6 u 8 por la ventana 03:00–03:20); la ESCALA ÚNICA rige en todas partes — disco warn ≥80% / fail ≥90% o <2 GB, backup >26h fail, bucket warn ≥6.4 GB / fail >8 GB, offsite >26h warn — y el fail de backup bloquea el deploy antes de migraciones. Presupuesto: 7×8 MB ≈ 56 MB ≈ 0.5% de R2.
- Restore documentado funciona en drill efímero para ambas DBs (`gunzip -c | pg_restore` + `SELECT count(*)` > 0); lock ocupado → exit 3; `BACKUP_ORIGIN` inválido → exit 2; volcado <50% del vigente → exit 4 sin pisar (caso 55 KB del 14-sep); formato canónico `.dump.gz`.
- `npm run docs:check` sin errores nuevos; `bash -n` en ambos scripts en verde; `systemd-analyze verify` en verde.
