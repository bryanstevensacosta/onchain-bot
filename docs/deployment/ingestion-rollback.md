# Ingestion Rollback Runbook (fast rollback lane, per-env)

**Scope:** `ingestion-telegram` prod (`:3032` host → `:3031` container) and staging
twin (`:3033` host → `:3031` container). Per-env model: one MTProto triple per
env, never shared (prod = current account, staging twin = old dev account,
dev-local = new account — names of vars only, never values:
`INGESTION_TELEGRAM_MTPROTO_API_ID` / `..._API_HASH` / `..._MTPROTO_SESSION`).

**Lane:** `.github/workflows/deploy-ingestion.yml` jobs `rollback-production`
(dispatch `target=rollback-production`) and `rollback-staging` (dispatch
`target=rollback-staging`). Rollback targets are pinned by item 2 on every GOOD
deploy: prod pins `:prev` / `:prev-1`, staging pins lane-scoped
`:staging-prev` / `:staging-prev-1` (same image repo serves both lanes — a
staging-tested sha must never become prod's rollback target).

## 1. When to roll back (and when NOT to)

Roll back when: the just-deployed ingestion image fails its healthcheck/SSE
smoke, serves 5xx on `/api/feed/sources`, or logs `AUTH_KEY_DUPLICATED` caused
by the deploy itself (second container started by mistake — stop it first, see
§5).

Do NOT roll back when: the failure is the database (restore from
`/data/backups/ingestion*` instead), the failure is one env's triple
(re-generate via `telegram:gen-session` on that env's account, interactive),
or backends misbehave while ingestion health is green (fix the backend lane).

**NO parallel canary — impossible by design.** One MTProto session exists per
triple. Running the old and the new container at the same time with the same
triple causes `AUTH_KEY_DUPLICATED` and logs the session out (Telegram-side,
requires interactive re-login). There is no blue/green, no canary, no
shadow traffic for ingestion. The fast rollback lane (stop → verify stopped →
start previous verified tag, downtime in seconds via SSE reconnect) IS the
safety net. Any proposal to run two ingestion containers on one triple is a
non-starter — cite this section.

## 2. Single-flight discipline (every step, both lanes)

Concurrent runs of the same triple are impossible-by-design via GitHub
`concurrency` (`cancel-in-progress: false`): prod rollback shares group
`deploy-ingestion` (serializes against prod deploys); staging rollback shares
group `deploy-ingestion-staging` (serializes against twin deploys). A second
dispatch queues, never overlaps.

Manual sequence (if Actions is unreachable — same discipline by hand):

```bash
# 0. Record T0 (downtime window starts at the stop, step 1).
date -u +%Y-%m-%dT%H:%M:%SZ

# 1. STOP with a bounded grace period, then VERIFY STOPPED (gate).
#    Prod:
cd /opt/onchain-bot/apps/backend
docker compose -f docker-compose.ingestion.yml stop --timeout 30 ingestion-telegram
docker ps --format '{{.Names}}' | grep -i ingestion && \
  { echo "REFUSE: ingestion still running"; exit 1; } || echo "OK: world empty"
#    Staging twin (names/ports differ, same pattern):
cd /opt/onchain-bot-staging/apps/backend
docker compose -f docker-compose.staging-ingestion.yml stop --timeout 30 ingestion-telegram-staging
docker ps --format '{{.Names}}' | grep -i ingestion-telegram-staging && \
  { echo "REFUSE: twin still running"; exit 1; } || echo "OK: twin stopped"

# 2. START exactly one container from the pinned previous tag.
#    NEVER `docker compose pull` here — it would re-fetch the broken :latest.
#    Prod:
docker pull ghcr.io/<org>/onchain-bot-ingestion-telegram:prev
docker tag ghcr.io/<org>/onchain-bot-ingestion-telegram:prev \
           ghcr.io/<org>/onchain-bot-ingestion-telegram:latest
cd /opt/onchain-bot/apps/backend
docker compose -f docker-compose.ingestion.yml up -d --force-recreate
#    Staging twin: same with `:staging-prev` and
#    `docker-compose.staging-ingestion.yml` (host port :3033).
```

`--timeout 30` gives the GramJS session 30 s to disconnect cleanly; the gate
after it is what enforces single-flight, not the timeout. If the gate fails,
do NOT proceed to start — investigate the stuck container instead.

## 3. What to verify (healthcheck gate)

```bash
# Prod (:3032). Twin: same with :3033.
for i in $(seq 1 12); do
  curl -sf --max-time 8 http://localhost:3032/api/health >/dev/null 2>&1 && \
    { echo "healthy after ~$((i * 5))s"; break; }
  [ "$i" -eq 12 ] && { echo "FAIL: healthcheck"; exit 1; }
  sleep 5
done
curl -s http://localhost:3032/api/health | jq '.'
# SSE stream must serve headers (post-T4 open stream, no backendId gate):
curl -s -o /dev/null -w '%{http_code}' --max-time 8 \
  -H 'Accept: text/event-stream' http://localhost:3032/api/ingestion/stream
# want: 200
# Backends reconnect on their own (SSE backoff 1 s → 30 s); expect
# `clients.connected` to climb back without touching any backend:
curl -s http://localhost:3032/api/health | jq '.clients.connected'
# AUTH check — must be empty:
docker logs onchain-bot-ingestion-telegram --since 10m 2>/dev/null | \
  grep -i 'AUTH_KEY_DUPLICATED' && { echo "FAIL: session conflict"; exit 1; } || echo OK
date -u +%Y-%m-%dT%H:%M:%SZ   # T1 — downtime window T0 → T1
```

If the gate fails after rollback: retry the healthcheck loop once (slow
MTProto handshake), then escalate — do NOT blindly re-run rollback (the
`:prev` image is already live; a second cycle adds downtime without changing
state). Escalation = read the container logs, check DB reachability
(`INGESTION_DATABASE_HOST` per compose `environment:`), then decide between
re-deploy of a fixed sha or DB restore.

## 4. Expected SSE downtime

Stop → start → healthy is seconds-to-tens-of-seconds: container boot +
MTProto handshake dominate (~10–40 s observed locally, see drill evidence
`.omo/evidence/task-6-per-env-ingestion.txt`). SSE consumers (backends) sit in
backoff 1 s → 30 s and reconnect automatically — no backend restart needed, no
manual intervention. The stream is lossy by design (no replay): messages
published during the window are missed, not queued. PASS criterion for drills:
full cycle (stop → first SSE frame back to a subscribed client) < 60 s.

## 5. AUTH_KEY_DUPLICATED recovery (interactive-only)

Cause: two live containers/sessions held the same triple at once (overlap
during deploy, a stray local container with a copied session, or backend
MTProto legacy mode fighting ingestion-telegram).

Recovery:

```bash
# 1. Prove single-flight violated, then restore it — stop EVERYTHING first:
docker ps --format '{{.Names}} {{.Image}}' | grep -i ingestion
docker stop <every-ingestion-container-name>   # exact names, one by one
docker ps --format '{{.Names}}' | grep -i ingestion || echo "OK: world empty"
# 2. NEVER copy the session string anywhere, never `docker start` the frozen
#    old container, never move env files back. The session moves zero times.
# 3. Start exactly ONE container (rollback lane §2) and watch logs:
docker logs -f onchain-bot-ingestion-telegram 2>&1 | grep -i 'auth_key_duplicated\|authorized'
# 4. If Telegram logged the session out (persistent AUTH_KEY_DUPLICATED on a
#    single container), no automation can fix it: re-generate the session
#    INTERACTIVELY on that env's account (`npm run telegram:gen-session` in
#    apps/ingestion-telegram, operator holds the phone), write it to that
#    env's env file only, restart once via §2.
```

There is no `--force` flag past this. Two containers, one triple, is always a
hard stop.

## 6. Tag cheat-sheet

| Lane    | Good-deploy pin        | Rollback target | Health           | Compose file                           |
| ------- | ---------------------- | --------------- | ---------------- | -------------------------------------- |
| Prod    | `:prev` (`:prev-1`)    | `:prev`         | `localhost:3032` | `docker-compose.ingestion.yml`         |
| Staging | `:staging-prev` (`-1`) | `:staging-prev` | `localhost:3033` | `docker-compose.staging-ingestion.yml` |

First-run edge: no `:prev` yet (nothing good deployed) → rollback is
inexecutable by design (the lane fails fast with "no :prev pinned — deploy
instead"). Retention is 2 releases per lane; `:prev-1` is the second resort.

## 7. Drill record

- Local dev drill (this runbook's procedure rehearsed against dev ingestion
  `:3031` on macOS, process-level restart with a subscribed SSE client):
  PASS, full cycle < 60 s — timestamps in
  `.omo/evidence/task-6-per-env-ingestion.txt`.
- Droplet-twin drill (`rollback-staging` dispatch against `:3033`): PENDING —
  blocked on twin deploy (procedure ready in the workflow job, executable later
  without rework: dispatch Actions → Deploy Ingestion Service →
  `target=rollback-staging`).
