# Backend/Frontend Rollback Runbook (per-lane, per-env)

**Scope:** backend + frontend in prod (`:3030` + `:5173`, `/opt/onchain-bot`)
and staging (`:3031` + `:4173`, `/opt/onchain-bot-staging`). Mirrors the
discipline of `docs/deployment/ingestion-rollback.md` §§2-5 (stop →
verify-stopped → start, no pull in rollback) adapted to stateless HTTP
services: no MTProto session here, so no AUTH single-flight — the shared
concurrency group is what serializes a rollback against a live deploy.

**Lanes** (all dispatch-only, never auto):

| Lane             | Workflow job (dispatch `lane=`) | Good-deploy pin          | Rollback target          | Health           | Compose file                 |
| ---------------- | ------------------------------- | ------------------------ | ------------------------ | ---------------- | ---------------------------- |
| backend-prod     | `rollback-backend-prod`         | `:prev-backend`          | `:prev-backend`          | `localhost:3030` | `docker-compose.prod.yml`    |
| frontend-prod    | `rollback-frontend-prod`        | `:prev-frontend`         | `:prev-frontend`         | `localhost:5173` | `docker-compose.prod.yml`    |
| backend-staging  | `rollback-backend-staging`      | `:staging-prev-backend`  | `:staging-prev-backend`  | `localhost:3031` | `docker-compose.staging.yml` |
| frontend-staging | `rollback-frontend-staging`     | `:staging-prev-frontend` | `:staging-prev-frontend` | `localhost:4173` | `docker-compose.staging.yml` |

Pins are namespaced per lane, never bare `:prev` / `:staging-prev` (those pin
the INGESTION image in sibling jobs of the same GHCR repo — a shared tag
would let a frontend-tested sha become the backend rollback target). Pins are
pushed to GHCR on every GOOD deploy (health/smoke passed) and re-pulled after
each `docker image prune -af` by the exemption step, so pruning never GCs a
rollback target.

## 1. When to roll back (and when NOT to)

Roll back when: the just-deployed backend/frontend image fails its
healthcheck/smoke, serves 5xx on versioned probes, or boot-loops (DB reachable
but migration/schema mismatch from the new code).

Do NOT roll back when: the failure is the database (restore from the pg_dump
pre-deploy artifact instead, §5), the failure is the twin/singleton ingestion
(fix the ingestion lane — the backend ordering gate already aborts deploys
when ingestion is down), or only one lane is red (roll back that lane only;
lanes are independent — backend rollback never touches frontend and vice
versa).

**No parallel canary for the same reason as ingestion, minus the session:**
backend/frontend are stateless, but two versions share one DB schema —
running old+new code against one schema during a migration window is the
equivalent hazard. The fast per-lane rollback (stop → verify stopped → start
previous verified tag, downtime in seconds) IS the safety net.

## 2. Single-flight discipline (every step, all four lanes)

Concurrent runs on one target are impossible-by-design via GitHub
`concurrency` (`cancel-in-progress: false`): prod lanes share group
`ingestion-production-target` (serializes against prod deploys AND the prod
ingestion lane); staging lanes share `ingestion-staging-target` (serializes
against staging deploys AND the twin lane). A second dispatch queues, never
overlaps. Queued-not-running runs may be cancelled by hand; a RUNNING lane is
never cancelled (migration lanes).

Manual sequence (if Actions is unreachable — same discipline by hand):

```bash
# 0. Record T0 (downtime window starts at the stop, step 1).
date -u +%Y-%m-%dT%H:%M:%SZ

# 1. STOP with a bounded grace period, then VERIFY STOPPED (gate).
#    Prod backend (staging: /opt/onchain-bot-staging + docker-compose.staging.yml
#    + service names backend/frontend, containers onchain-bot-*-staging):
cd /opt/onchain-bot/apps/backend
docker compose -f docker-compose.prod.yml stop --timeout 30 backend
docker ps --format '{{.Names}}' | grep -qx 'onchain-bot-backend-production' && \
  { echo "REFUSE: backend still running"; exit 1; } || echo "OK: backend stopped"

# 2. START exactly one service from the pinned previous tag.
#    NEVER `docker compose pull` here — compose pins `:latest`, and pull would
#    re-fetch the broken image. Local retag wins:
#    Prod backend (staging: `:staging-prev-backend` → `:staging-latest`):
docker pull ghcr.io/<org>/onchain-bot-backend:prev-backend
docker tag ghcr.io/<org>/onchain-bot-backend:prev-backend \
           ghcr.io/<org>/onchain-bot-backend:latest
cd /opt/onchain-bot/apps/backend
docker compose -f docker-compose.prod.yml up -d --force-recreate backend
#    Frontend lanes: same with `:prev-frontend` / `:staging-prev-frontend`
#    and service name `frontend` (health `:5173` prod / `:4173` staging).
```

`--timeout 30` drains in-flight requests; the gate after it is what enforces
single-flight, not the timeout. If the gate fails, do NOT proceed to start —
investigate the stuck container instead.

## 3. What to verify (healthcheck gate + post-rollback asserts)

```bash
# Prod backend (:3030). Staging backend: :3031. Frontend: :5173 prod / :4173 staging.
for i in $(seq 1 12); do
  curl -sf --max-time 8 http://localhost:3030/api/health >/dev/null 2>&1 && \
    { echo "healthy after ~$((i * 5))s"; break; }
  [ "$i" -eq 12 ] && { echo "FAIL: healthcheck"; exit 1; }
  sleep 5
done
curl -s http://localhost:3030/api/health | jq '.'
# Backend lanes only — schema state assert (read-only, never migrates):
docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml run --rm backend \
  npx typeorm --dataSource dist/backend/src/shared/common/persistence/data-source.js migration:show
# Counts probe (read-only reachability of the money path):
curl -sf --max-time 10 'http://localhost:3030/api/vip-calls/calls/recent?limit=1' >/dev/null \
  && echo "recent reachable" || echo "FAIL: recent unreachable"
# Pins present (rollback targets survive pruning via the exemption step):
docker images | grep -E 'prev-backend|prev-frontend'
date -u +%Y-%m-%dT%H:%M:%SZ   # T1 — downtime window T0 → T1
```

If the gate fails after rollback: retry the healthcheck loop once (slow boot),
then escalate — do NOT blindly re-run rollback (the `:prev-*` image is
already live; a second cycle adds downtime without changing state).
Escalation = read the service logs, check DB reachability, then decide
between re-deploy of a fixed sha or DB restore (§5).

## 4. Expected downtime

Stop → start → healthy is seconds-to-tens-of-seconds: container boot +
migration-free start dominate. Frontend has zero consumers to drain (static
serve); backend drains in-flight HTTP (30 s grace max). PASS criterion for
drills: full cycle (stop → health 200) < 60 s per lane.

## 5. Data doctrine (closed): rollback = code-only

- **Migrations NEVER revert automatically.** A rollback swaps the IMAGE only;
  schema stays at the newest migrated version (roll-forward). If the new code
  shipped a breaking migration that the old code cannot run against, rollback
  alone is INSUFFICIENT — that is a forward-fix or DB-restore decision, never
  an automated `migration:revert` (revert destroys data on non-nullable/drop
  migrations).
- **Data = restore from the pg_dump pre-deploy artifact.** Every deploy lane
  dumps BEFORE migrating; artifact paths (host-local, never secrets):
  - prod backend DB: `/opt/onchain-bot/backups/prod-backend-*.dump.gz` (+ `.meta.txt` with sha)
  - staging backend DB: `/data/backups/staging/staging-backup-*.sql`
  - ingestion DBs: `/data/backups/ingestion*` (untouched by THESE lanes)
    Restore = stop service → `pg_restore`/`psql` from the artifact → start
    service → `migration:show` + counts asserts (§3). The artifact filename/sha
    is printed in the deploy summary — quote it in the incident record.
- **Post-rollback asserts are mandatory, not advisory:** health 200 +
  `migration:show` (backend lanes) + recent-reachable + `docker images | grep
prev` (pins survived). A rollback without asserts is an anecdote.

## 6. Tag cheat-sheet

| Env     | Service  | Good-deploy pin          | Rollback target          | Compose `:latest` retag target |
| ------- | -------- | ------------------------ | ------------------------ | ------------------------------ |
| Prod    | backend  | `:prev-backend`          | `:prev-backend`          | `:latest`                      |
| Prod    | frontend | `:prev-frontend`         | `:prev-frontend`         | `:latest`                      |
| Staging | backend  | `:staging-prev-backend`  | `:staging-prev-backend`  | `:staging-latest`              |
| Staging | frontend | `:staging-prev-frontend` | `:staging-prev-frontend` | `:staging-latest`              |

First-run edge: no pin yet (nothing good deployed) → rollback is
inexecutable by design (the lane fails fast with "no pin — deploy instead").

## 7. Drill record

- Backend/frontend lane drills = procedure + dry verification (twin-proven
  pattern from the ingestion drill): the workflow jobs are dispatch-only and
  verified by yaml-parse + step inspection + `migration:show` semantics, but
  NO prod drills are ever run (prod rollback is proven by procedure, exercised
  only in a real incident). Staging lanes may be drilled on demand via
  dispatch (`lane=rollback-backend-staging` / `lane=rollback-frontend-staging`);
  the twin drill does NOT substitute a backend/frontend drill (different
  services, different asserts) — record staging drills here when executed.
- Dry verification for this item: `python3 -c "import yaml..."` exit 0 +
  `grep -n 'prev-'` namespaced tags + prune-exemption inspection + asserts
  listed in `.omo/evidence/task-9-per-env-ingestion.txt`.
