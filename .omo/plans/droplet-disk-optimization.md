# droplet-disk-optimization - Work Plan

## TL;DR (For humans)

**What you'll get:** Un droplet que ya no se llena en cada deploy: medirás el disco antes y después, liberarás espacio seguro, harás los builds más flacos, limitarás logs y backups comprimidos, y dejarás una limpieza diaria y alertas — todo sin borrar tu base de datos, cache ni fotos de Telegram.

**Why this approach:** Primero medimos (no adivinamos), luego solo borramos lo reclaimable con filtro de 24h (no volúmenes), y después atacamos la causa: imágenes gordas por devDeps y logs sin límite. Dejamos el cambio grande (mover builds fuera del droplet a un registry) para el final, cuando ya tengas aire.

**What it will NOT do:** No borrará tus datos de postgres/redis/uploads, no borrará backups de menos de 7 días, no cambiará dónde se construye la imagen en las primeras 3 iteraciones, y no agrandará el disco sin evidencia previa.

**Effort:** Medium — 8 pasos chicos, cada uno con evidencia y commit revertible; 1-2 días wall-clock con deploys reales entre olas
**Risk:** Low — todo es filtrado y con límite; el único pruning agresivo queda para un workflow manual separado, no en cada deploy
**Decisions I made for you:** Retención 7 días pero comprimida (gzip), logs a 10MB×3 por contenedor y rotación diaria del runner a 50MB, prune filtrado `until=24h` en vez de borrar todo, y registry GHCR diferido a una cuarta iteración — dime si quieres vetar alguna y la cambio antes de escribir el plan final.

Your next move: Aprueba este borrador y lo convierto en plan final, o veta una decisión de arriba. Full execution detail follows below.

---

> TL;DR (machine): Medium, Low, 8 todos across 4 iterative waves delivering measured reclamation + slim builds + capped logs/backups + scheduled guards

## Scope

### Must have

- Baseline measurement (df, docker system df, du per path) as evidence before any change
- Safe reclamation: filtered prune, runner \_diag + journal + apt clean, no volume loss
- `.dockerignore` + Dockerfile runtime `npm ci --omit=dev` + nginx frontend unchanged
- `docker-compose.prod.yml` logging limits (json-file 10m×3) per service
- `scripts/backup-db.sh` gzip + 7d local retention + size-capped prune
- Runner logrotate (`/etc/logrotate.d/actions-runner`) + daily cron `prune --filter until=24h`
- Workflow guards: deploy.yml prune no --volumes, cleanup.yml scheduled not only dispatch, df>80% alert

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No `docker system prune -af --volumes` without filter on prod, no `docker volume prune`, no delete of `onchain-bot-pg-data`, `onchain-bot-redis-data`, `uploads/`, no backup delete <7d
- No GHCR migration in Wave 1-3 (deferred to Wave 4), no droplet resize without evidence
- No hand-rolled log shipping or external deps in Wave 1-3

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after (no unit tests for infra; verification is agent-run shell + artifact exists) + evidence ledger
- Evidence: `.omo/evidence/droplet-disk-optimization/` — `baseline-<ts>.log`, `after-prune-<ts>.log`, `docker-df-<ts>.log`, `build-size-<ts>.log`, `backup-gzip-<ts>.log`; each todo writes one file named `task-<N>-<slug>.log`
- Happy path: `df` shows reclaimable drop, `docker system df` RECLAIMABLE 0B after prune, `docker images` size delta negative, `ls backups` shows .gz
- Failure path: command non-zero, or `df` Use% not decreasing, or volume missing (`docker volume ls | grep onchain-bot-pg-data` absent → FAIL)

## Execution strategy

### Parallel execution waves

> Living draft loop: each wave → writes evidence → worker implements → draft rewritten from new baseline before next wave. If draft changes, plan todos for next wave are re-appended (never rewrite headers).

- Wave 0 — Triage & baseline (measure, no mutation)
- Wave 1 — Safe reclamation (filtered prune + runner/logs, no build change)
- Wave 2 — Build efficiency (.dockerignore + Dockerfile + compose logging)
- Wave 3 — Retention & guardrails (backup gzip + logrotate + cron + workflow guards)
- Wave 4 — (deferred) Scale — GHCR registry, build on GitHub not droplet

### Dependency matrix

| Todo                         | Depends on | Blocks | Can parallelize with |
| ---------------------------- | ---------- | ------ | -------------------- |
| 1 baseline                   | —          | 2,3    | —                    |
| 2 safe-prune-filtered        | 1          | 5,6    | 3                    |
| 3 dockerignore               | 1          | 4      | 2                    |
| 4 dockerfile-backend-runtime | 3          | 5,7    | —                    |
| 5 compose-logging            | 2,4        | 7      | 6                    |
| 6 backup-gzip                | 2          | 7      | 5                    |
| 7 runner-logrotate-cron      | 5,6        | 8      | —                    |
| 8 workflow-guards            | 7          | F1     | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Capture disk baseline evidence (no mutation)
     What to do: Run via self-hosted `Disk Cleanup` workflow or SSH: `df -h > baseline; docker system df >> baseline; du -sh /opt/onchain-bot/* /opt/actions-runner/_work/* /opt/actions-runner/_diag/* >> baseline; ls -lh /opt/onchain-bot/backups/*.dump >> baseline`. Save to `.omo/evidence/droplet-disk-optimization/baseline-<ts>.log` and commit that evidence dir (not prod code).
     Must NOT do: No prune/delete yet; no prod code change.
     Parallelization: Wave 0 | Blocked by: — | Blocks: 2,3
     References: .github/workflows/cleanup.yml:7-8 (df/docker df), scripts/backup-db.sh:9 (BACKUP_DIR), apps/backend/docker-compose.prod.yml:162-166 (volumes)
     Acceptance criteria: File `.omo/evidence/droplet-disk-optimization/baseline-<ts>.log` exists and contains `Filesystem` + `RECLAIMABLE` + `pre-deploy-`
     QA scenarios: happy: `ls .omo/evidence/droplet-disk-optimization/baseline-*.log && grep -q RECLAIMABLE` → pass. failure: file missing → fail. Evidence: that baseline log
     Commit: Y | chore(evidence): capture droplet disk baseline

- [ ] 2. Safe filtered prune (reclaim without volume loss)
     What to do: Replace `deploy.yml:80 docker system prune -af --volumes` with `docker system prune -af --filter "until=24h"` (no --volumes) + `docker builder prune -af --filter "until=24h"`; keep `docker image prune` only if needed. In `cleanup.yml:13` use same filter. Do NOT touch `docker volume rm`.
     Must NOT do: No `--volumes` on prod, no `docker volume prune`, no pg-data/redis-data touch.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 5,6 | Parallel with: 3
     References: .github/workflows/deploy.yml:74-85, .github/workflows/cleanup.yml:12-14, apps/backend/docker-compose.prod.yml:162-166
     Acceptance criteria: `grep -q 'prune -af --filter' .github/workflows/deploy.yml && ! grep -q 'prune -af --volumes' .github/workflows/deploy.yml`
     QA scenarios: happy: `docker system df` after run shows RECLAIMABLE <100MB. failure: grep still finds `--volumes` in deploy.yml → fail. Evidence: `.omo/evidence/droplet-disk-optimization/task-2-prune.log`
     Commit: Y | fix(deploy): use filtered prune without volumes on prod

- [ ] 3. Add root .dockerignore
     What to do: Create `/.dockerignore` at repo root with: `node_modules`, `dist`, `.git`, `.git/**`, `backups`, `uploads`, `.env*`, `logs`, `npm-debug.log`, `.omo`, `.sisyphus`, `apps/frontend/node_modules`, `apps/backend/node_modules`
     Must NOT do: No ignore of `apps/backend/dist` needed at build time (built inside), no ignore of `package.json`/`package-lock.json`
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4 | Parallel with: 2
     References: apps/backend/Dockerfile:5-8 (COPY package.json etc), apps/frontend/Dockerfile:5-8, missing /.dockerignore
     Acceptance criteria: File `/.dockerignore` exists and `docker build` context sent size drops (check `docker build --progress plain` shows `transferring context: ~2MB` not ~200MB)
     QA scenarios: happy: `ls .dockerignore && grep -q node_modules .dockerignore` → pass. failure: file missing → fail. Evidence: `.omo/evidence/droplet-disk-optimization/task-3-dockerignore.log`
     Commit: Y | chore(docker): add root .dockerignore to slim build context

- [ ] 4. Slim backend runtime (omit devDeps)
     What to do: In `apps/backend/Dockerfile:28` replace `COPY --from=build /repo/node_modules ./node_modules` with `COPY --from=build /repo/apps/backend/package.json ./package.json` + `RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force` in runtime stage. Keep `COPY --from=build /repo/apps/backend/dist ./dist`. Same pattern if needed for frontend (frontend already nginx, no node_modules in runtime — verify).
     Must NOT do: No change to build stage `npm ci` (needs devDeps for build), no touch to `scripts/` copy.
     Parallelization: Wave 2 | Blocked by: 3 | Blocks: 5,7
     References: apps/backend/Dockerfile:19-33, apps/frontend/Dockerfile:20-23 (already slim)
     Acceptance criteria: `docker images onchain-bot-prod-backend --format "{{.Size}}"` after build is >=200MB smaller than before (measure via `docker images` before/after) AND `docker run --rm <image> node -e "require('typescript')"` fails (devDep not present)
     QA scenarios: happy: image builds and `curl localhost:3030/api/health` passes after deploy. failure: image missing `dist/src/main.js` → fail. Evidence: `.omo/evidence/droplet-disk-optimization/task-4-build-size.log`
     Commit: Y | perf(docker): slim backend runtime to omit devDeps

- [ ] 5. Add compose logging limits
     What to do: In `apps/backend/docker-compose.prod.yml` add `logging: {driver: json-file, options: {max-size: "10m", max-file: "3"}}` to each service (postgres:16-alpine, redis:7-alpine, backend, frontend). Keep existing healthcheck/resources.
     Must NOT do: No change to volumes/ports/env_file, no new driver (keep json-file).
     Parallelization: Wave 2 | Blocked by: 2,4 | Blocks: 7 | Parallel with: 6
     References: apps/backend/docker-compose.prod.yml:4-37 (postgres), 39-62 (redis), 64-124 (backend), 126-155 (frontend)
     Acceptance criteria: `grep -A2 'logging:' apps/backend/docker-compose.prod.yml | grep -q 'max-size: "10m"'` passes 4 times
     QA scenarios: happy: `docker compose -f apps/backend/docker-compose.prod.yml config | grep -q max-size` → pass. failure: missing logging on any service → fail. Evidence: `.omo/evidence/droplet-disk-optimization/task-5-logging.log`
     Commit: Y | chore(compose): cap container logs to 10m x3

- [ ] 6. Gzip backups + capped retention
     What to do: In `scripts/backup-db.sh:11` change `DUMP_FILE="$BACKUP_DIR/pre-deploy-${TIMESTAMP}.dump"` to `.dump.gz` and pipe via `gzip`: `docker exec ... pg_dump ... | gzip > "$DUMP_FILE"` and `pg_dump ... | gzip -c > "$DUMP_FILE"`. Change prune to `find "$BACKUP_DIR" -name 'pre-deploy-*.dump*' -mtime +7 -delete` (covers .gz). Keep `ls -lh` but show .gz. Add size check `if [ $(stat -f%z "$DUMP_FILE" 2>/dev/null || stat -c%s "$DUMP_FILE") -gt 1073741824 ]; then echo "WARN dump >1GB"; fi`.
     Must NOT do: No drop of 7d local retention, no Spaces upload yet (Wave 3 = local gzip only).
     Parallelization: Wave 2 | Blocked by: 2 | Blocks: 7 | Parallel with: 5
     References: scripts/backup-db.sh:1-43
     Acceptance criteria: `grep -q '\.gz' scripts/backup-db.sh && grep -q 'gzip' scripts/backup-db.sh && grep -q 'pre-deploy-*.dump\*' scripts/backup-db.sh`
     QA scenarios: happy: run `BACKUP_DIR=/tmp/test BACKUP ... bash scripts/backup-db.sh` (mock) creates .gz + find respects +7. failure: script writes .dump not .gz → fail. Evidence: `.omo/evidence/droplet-disk-optimization/task-6-backup.log`
     Commit: Y | perf(backup): gzip dumps and cap retention

- [ ] 7. Runner logrotate + daily cron
     What to do: Create `/etc/logrotate.d/actions-runner` via droplet setup doc or via `cleanup.yml` step: `echo '/opt/actions-runner/_diag/*.log { daily rotate 3 compress size 50M missingok copytruncate }' | sudo tee /etc/logrotate.d/actions-runner`. Add cron via workflow or droplet: `echo "0 3 * * * docker system prune -af --filter \"until=24h\" >/tmp/prune.log 2>&1" | sudo tee /etc/cron.d/docker-prune` and `journalctl --vacuum-time=3d` weekly.
     Must NOT do: No cron that prunes volumes, no delete of \_diag while runner active without copytruncate.
     Parallelization: Wave 3 | Blocked by: 5,6 | Blocks: 8
     References: .github/workflows/cleanup.yml:16-21, deploy.yml:82-83
     Acceptance criteria: File `/etc/logrotate.d/actions-runner` exists on droplet (evidence via `ls` in cleanup workflow) and cron file exists; workflow `cleanup.yml` adds `prune --filter` not `-af --volumes`
     QA scenarios: happy: `logrotate --debug /etc/logrotate.d/actions-runner` exits 0. failure: file missing → fail. Evidence: `.omo/evidence/droplet-disk-optimization/task-7-logrotate.log`
     Commit: Y | chore(infra): add runner logrotate and daily prune cron

- [ ] 8. Workflow guards + disk alert
     What to do: In `deploy.yml` add step after `Emergency disk cleanup`: `df%` check `PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%'); if [ "$PCT" -gt 80 ]; then echo "::warning::disk ${PCT}% full"; fi` and make `cleanup.yml` `on: [workflow_dispatch, schedule: cron: "0 3 * * *"]`. Ensure both workflows use filtered prune (todo 2).
     Must NOT do: No fail on 80% (warning only), no new external integration.
     Parallelization: Wave 3 | Blocked by: 7 | Blocks: F1
     References: .github/workflows/deploy.yml:74-85, .github/workflows/cleanup.yml:1-3
     Acceptance criteria: `grep -q 'schedule:' .github/workflows/cleanup.yml && grep -q 'disk' .github/workflows/deploy.yml`
     QA scenarios: happy: `act --dry-run` or `gh workflow view` shows schedule present. failure: schedule missing → fail. Evidence: `.omo/evidence/droplet-disk-optimization/task-8-guards.log`
     Commit: Y | chore(ci): add disk guard and scheduled cleanup

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — verify every todo has references + acceptance + QA + commit, each evidence file exists under .omo/evidence/droplet-disk-optimization/
- [ ] F2. Code quality review — `npm run lint` + `npm run test` (backend/frontend) pass, Dockerfiles build, compose config valid
- [ ] F3. Real manual QA — agent runs `df -h` and `docker system df` on droplet via Disk Cleanup workflow; RECLAIMABLE 0B, Use% <80%, no volume loss (`docker volume ls` has pg-data/redis-data), backups .gz exist
- [ ] F4. Scope fidelity — confirm Must NOT have held: no pg-data delete, no volume prune, no backup loss <7d, no GHCR change in waves 1-3

## Commit strategy

- One commit per todo (8 commits) + one per wave evidence capture; squash not required within wave but each todo commit is atomic and revertable
- Commit types: `chore`, `fix`, `perf` as per todo; scope in parens matches file domain (docker, deploy, backup, compose, infra, ci)
- Push per wave after green QA; draft rewritten after each wave with new baseline `df` before next wave

## Success criteria

- Baseline evidence captured, filtered prune removes reclaimable to 0B, .dockerignore present, backend image shrinks ≥200MB, compose logging capped, backups are .gz and `ls backups` shows only .gz, logrotate + cron exist, workflows have guards+schedules, `df Use%` <80% after full run, no data loss on pg-data/redis-data/uploads
