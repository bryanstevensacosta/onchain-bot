---
slug: droplet-disk-optimization
status: drafting
intent: unclear
pending-action: write .omo/plans/droplet-disk-optimization.md
approach: Iterative living-draft disk optimization — Wave 0 triage + measure, Wave 1 safe reclamation, Wave 2 build & log efficiency, Wave 3 retention & monitoring, Wave 4 off-droplet scale. Each wave writes evidence ledger, worker implements, next iteration rewrites draft from new baseline (write→implement→rewrite loop). No data loss: pg-data, redis-data, uploads, 7d backups preserved.
---

# Draft: droplet-disk-optimization

## Components (topology ledger)

| id  | outcome                                                                             | status   | evidence                                          |
| --- | ----------------------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| C1  | Measure & triage — baseline df, docker system df, backup sizes captured             | active   | .omo/evidence/disk-baseline-<date>.log            |
| C2  | Safe reclamation — prune reclaimable without touching pg-data/redis-data/uploads    | active   | .omo/evidence/prune-\*.log                        |
| C3  | Build efficiency — Dockerfiles + .dockerignore + build cache reduce image bloat     | active   | apps/backend/Dockerfile, apps/frontend/Dockerfile |
| C4  | Retention & rotation — backups gzip+Spaces, logs json-file limits, runner logrotate | active   | scripts/backup-db.sh, docker-compose.prod.yml     |
| C5  | Monitoring & guardrails — df>80% alert + daily cron + workflow guards               | active   | .github/workflows/cleanup.yml, deploy.yml         |
| C6  | Off-droplet scale — GHCR registry (build on GitHub, pull on droplet)                | deferred | .github/workflows/deploy.yml (future wave)        |

## Open assumptions (announced defaults)

| assumption       | adopted default                                                                                            | rationale                                         | reversible?         |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------- |
| Droplet size     | 25GB Basic, ~5-8GB free baseline (inferred from prune need)                                                | Prune frees 2-4GB per deploy implies tight margin | yes — resize via DO |
| Risk tolerance   | Never delete named volumes (pg-data, redis-data) nor uploads, never --volumes on prod prune without filter | Data loss > disk cost                             | yes                 |
| Backup retention | 7d local + gzip + async to DO Spaces (3d local)                                                            | 7d dump \* 500MB = 3.5GB; gzip ~70% saving        | yes                 |
| Log policy       | json-file max-size 10m max-file 3 per service + journal vacuum 100M + runner logrotate 50M×3               | Composer default json-file is unbounded           | yes                 |
| Build cache      | Keep BuildKit cache, never --no-cache each deploy; use --pull + layer reuse                                | --no-cache bloats builder cache                   | yes                 |
| Registry         | Defer GHCR to Wave 4 (after local optimizations proven)                                                    | Keeps Wave 1-3 non-breaking, reversible           | yes                 |

## Findings (cited - path:lines)

- deploy.yml:74-85 Emergency disk cleanup runs prune -af --volumes + builder prune -af + journal vacuum 3d + rm \_diag/\*.log — too late (during deploy) and --volumes risky on prod
- cleanup.yml:12-14 prune -af --volumes + image prune -af — redundant, no filter, no schedule
- apps/backend/Dockerfile:28 COPY --from=build /repo/node_modules ./node_modules — copies devDeps (npm ci without --omit=dev) → ~400-600MB bloat
- apps/frontend/Dockerfile:20 runtime is nginx:1.27-alpine — good, but build stage copies entire node_modules again
- .dockerignore: missing at repo root — context sends node_modules/dist/.git each build
- scripts/backup-db.sh:40 find -mtime +7 -delete — only time-based, no gzip, no size cap, dumps to /opt/onchain-bot/backups (same disk)
- docker-compose.prod.yml: no logging options — json-file unbounded; no deploy resources for build cache
- package.json: workspaces apps/\*, no docker:prune scripts

## Decisions (with rationale)

- D1: .dockerignore first (wave 1) — zero-risk, instant context size drop
- D2: Dockerfile runtime npm ci --omit=dev + cache clean — biggest single saving, reversible
- D3: gzip backups + keep 7d local as 3d after Spaces sync — safe reclamation without backup loss
- D4: json-file logging limits in compose — prevents container logs filling host
- D5: prune filter until=24h + daily cron instead of -af each deploy — less churn, more predictable
- D6: Living draft — each wave commits evidence log so next rewrite has new df baseline

## Scope IN

- Measure baseline, safe prune, Dockerfile, .dockerignore, compose logging, backup gzip/retention, runner logrotate, cron, workflow guards, monitoring alert

## Scope OUT (Must NOT have)

- Delete pg-data/redis-data/uploads, `docker volume prune` without filter on prod, drop backups <7d without Spaces copy, switch to GHCR in Wave 1-3, resize droplet without measurement

## Open questions

- Q1: Actual df baseline? — answered by C1 evidence log before any prune
- Q2: Spaces bucket exists for backups? — deferred to Wave 4, Wave 3 uses gzip locally only

## Approval gate

status: approved — non-breaking only (Wave 0-3)
pending-action: worker executes Wave 0-3; Wave 4 GHCR deferred
approach: Iterative living-draft non-breaking: Wave 0 baseline → Wave 1 safe filtered prune → Wave 2 slim builds+logging → Wave 3 retention+rotation+guards → evidence after each wave rewrites draft before next iteration. No data loss, GHCR deferred to later iteration.
gate-presented-at: 2026-08-25T07:55Z
approved-at: 2026-08-25T08:00Z
re-approved-at: 2026-08-25T08:05Z — "ok procede con eso que no es breaking"
scope-approved: Wave 0-3 (filtered prune, .dockerignore, Dockerfile omit devDeps, compose logging 10m×3, backup gzip, logrotate+cron, guards). Wave 4 GHCR explicitly OUT.
note: Momus skipped (quota). Self-review done; run Momus before Wave 4 if later needed.
