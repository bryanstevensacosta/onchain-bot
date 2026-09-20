---
slug: prod-backend-rolling-backup
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/prod-backend-rolling-backup.md
approach: daily date-named backend backup (7-day prune) + pre-deploy overwrites same-day file + offsite R2/B2 via rclone + failure/full signaling in workflows; latest/previous DROPPED per user 2026-09-16
---

# Draft: prod-backend-rolling-backup

## Components (topology ledger)

| id | outcome (one line) | status | evidence path |
| C1-script | `scripts/backup-db.sh` soporta modo diario `prod-backend-YYYYMMDD.dump.gz` (opt-in por env), dump atómico + validación + poda +7 solo de ese prefijo | active | `scripts/backup-db.sh:1-62` |
| C2-deploy | `deploy.yml` (backend prod) usa el modo diario, sobrescribe el archivo del día y señaliza fallo/disco en el workflow | active | `.github/workflows/deploy.yml:103-110` |
| C3-cron | backup diario programado en el droplet (systemd timer, 03:00) aunque no haya deploys | active | nuevo: `infra/systemd/onchain-backend-backup.*` |
| C4-offsite | espejo S3-compatible vía `rclone` a Cloudflare R2 (default, 10 GB free) / Backblaze B2 (alternativa), retención 7 objetos | active | nuevo: `scripts/sync-backups-offsite.sh` + `docs/deployment/BACKUPS.md` |
| C5-health | workflow programado `backup-health.yml` (diario) que FALLA/AVISA si backup viejo, disco lleno u offsite desincronizado | active | nuevo: `.github/workflows/backup-health.yml` |
| C6-qa | QA por agente sin tocar prod (bash -n + dry-run contra contenedor dev + restore de prueba) | active | `apps/backend/package.json` (`db:backup`) |

## Open assumptions (announced defaults)

| assumption | adopted default | rationale | reversible? |
| cómo no romper ingestion (script compartido) | modo diario opt-in (`BACKUP_MODE=daily` + `BACKUP_BASENAME=prod-backend`), default intacto | `deploy-ingestion.yml:83-87` usa el mismo script | sí |
| nombre diario | `prod-backend-YYYYMMDD.dump.gz` (+ `.meta.txt` con fecha/sha256/tamaño/origen) | orden + ventana 7 días, sin colisión con `pre-deploy-*` | sí |
| deploy mismo día | el pre-deploy sobrescribe `prod-backend-<hoy>.dump.gz` | el backup del evento de mayor riesgo debe ser el vigente | sí |
| hora del cron | 03:00 droplet (`OnCalendar=daily`), offsite 03:20 | valle; margen tras el dump | sí |
| offsite | Cloudflare R2 por defecto (10 GB free, $0 egress, S3-compatible, `rclone`); B2 documentado como alternativa cambiando solo el remote | R2 no cobra egress (el restore no cuesta); B2 cobra egress — para backups que casi nunca se descargan pero un restore grande sí duele | sí (solo config) |
| credenciales offsite | bucket + keys en GitHub Secrets (`R2_*`) y env del droplet (gitignored), jamás en repo | seguridad; el repo es privado pero las keys no se versionan | sí |
| señalización | pre-flight `df` (aborta si <2 GB libres o >90% uso) + validación dump + resumen en `$GITHUB_STEP_SUMMARY`+`::warning::`/`::error::`; health diario falla si backup >26h, disco >85% o bucket >80% / objetos ≠ 7± | el usuario pidió "algo en el workflow que indique si falla o se llena"; thresholds explícitos y auditables | sí |
| validación | `gzip -t`+ tamaño > 0 (+`pg_restore --list`si disponible) sobre`.tmp`; si falla, NO pisa el archivo del día | evita pisar un bueno con uno corrupto | sí |

## Findings (cited - path:lines)

- `scripts/backup-db.sh:9-11,57-58` — `pre-deploy-${TIMESTAMP}.dump.gz` + poda `+7 días`.
- `.github/workflows/deploy.yml:103-110` — backup backend prod sin `BACKUP_DIR` (default `/opt/onchain-bot/backups`).
- `.github/workflows/deploy-ingestion.yml:77-96` — mismo script para ingestion → cambio opt-in.
- `scripts/deploy.sh:25`, `apps/backend/package.json` (`db:backup`) — consumidores que siguen igual.
- AGENTS.md — patrón systemd timer (`onchain-dev-infra.timer`) + `docker system prune` nocturno que hace permanente lo borrado.

## Decisions (with rationale)

- SUPERSEDE 2026-09-16: ABANDONADO latest+previous y pull-Tailscale; offsite = R2 (default)/B2 + health en workflows, a petición del usuario.
- Solo backend; ingestion/staging fuera.
- DROPLET-EVIDENCE 2026-09-16 (medido en vivo): cada backup prod ≈7.9 MB, dir total 1.1 GB; hallazgo-1: volcado de 55 KB del 14-sep pasando silencioso → guardia anti-vacío (<50% del vigente, exit 4) en Scope/T1/T7/Success; hallazgo-2: manuales del 10-sep con otro esquema (`prod-backend-*-*.dump` sin comprimir, `prod-ingestion-*`, `staging-*`) → inventario exacto + formato canónico `.dump.gz` en T6.
- MEDIA 2026-09-16 (medido en vivo): `/opt/onchain-bot/apps/backend/uploads/` = 122 MB / 507 ficheros en `crypto-news/media/` con mtimes de HOY (06:52) → NO son leftovers ni ads (`crypto-news-ads-library/` no existe = 0 bytes de ads): el backend prod SIGUE descargando message-media en modo legacy, duplicando a ingestion-telegram y violando "ingestion owns media". DECISIÓN: media EXCLUIDA del backup (caché re-descargable, ownership disputado) + T8 de investigación (dossier + recomendación registrada, no ejecutada: migrar prod a SSE + borrar dir vs mantener + documentar).
- MOMUS-R1 2026-09-16 (7 issues, veredicto NOT-OKAY → corregidos): escala única warn≥80%/fail≥90% disco, bucket warn≥6.4GB/fail>8GB, objetos warn si ≠7 (ventana 03:00–03:20, nunca fail por conteo); F3 renombrado a QA agent-ejecutable; deprecación ingestion SOLO-docs sin editar el workflow; secretos exactos (`/opt/onchain-bot/.backup-env`, `gh secret set R2_*`); lock único `/run/lock/onchain-backend-backup.lock` con exit 3; rclone v1.69.0 pineado + `--include 'prod-backend-*'` + check `NoSuchLifecycleConfiguration`; `BACKUP_ORIGIN=cron|pre-deploy` + last-writer-wins + poda `-mtime +6` (=7 ficheros).

## Scope IN

- `scripts/backup-db.sh`: modo `daily` + atómico + validación + meta + poda por prefijo + pre-flight disco.
- `.github/workflows/deploy.yml`: vars del modo diario + summary/warnings en el paso de backup.
- Timer systemd diario + `scripts/sync-backups-offsite.sh` (rclone R2/B2, prune 7) + `.github/workflows/backup-health.yml` (checks + thresholds).
- `docs/deployment/BACKUPS.md`: esquema, restores, rotación de keys. Limpieza legacy opcional tras verificación.

## Scope OUT (Must NOT have)

- NO tocar `deploy-ingestion.yml`, `deploy-staging.yml`, `scripts/deploy.sh`, ni el default del script.
- NO backups nuevos para staging/ingestion; NO restore automático (solo comando documentado).
- NO tocar retención 72h de media/mensajes.

## Open questions

- Ninguna bloqueante. QA propuesta (default): `bash -n` + dry-run dev (fecha simulada `FAKE_DATE`, poda, pisa-día, corrupto-no-pisa, pre-flight disco simulado, rclone `--dry-run`) + `pg_restore --list` del dump de prueba. Sin tocar prod ni bucket real.

## Approval gate

status: awaiting-approval
pending-action: write .omo/plans/prod-backend-rolling-backup.md (Metis + APPEND todos + TL;DR)
approach: daily date-named backend backup (7-day prune) + pre-deploy overwrites same-day + R2/B2 offsite via rclone + failure/full signaling in workflows
