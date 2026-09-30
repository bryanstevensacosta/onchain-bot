# DEV-LOCAL — centralized local dev (one command)

> Branch: `feat/mega-refactor-tramos`. Stack: `docker-compose.dev.yml` (this file's companion).
> All secrets below are DUMMIES. Never put real tokens/keys in dev files.

## 0. Prerequisites

- Docker Desktop (or Docker Engine) running, ~8 GB RAM free for the full stack.
- Ports free: `3030 3031 3040 3050 3060 4000 4060 4070 4080 4090 4100 5173 8080`
  - DB port `5432` (single postgres, one DB per app — consolidated 2026-09-28)
  - Redis ports `6379 6382 6383 6385 6387 6389 6391 6393`.
- Standard host dev (`npm run dev` on :3030/:5173, `npm run dev:ingestion` on :3031)
  must be STOPPED first — same ports.

## 1. One-command boot

```bash
# 1) Vite proxy fix (one time): vite loadEnv reads env FILES, not process.env,
#    so the container service names must come from root .env.development
#    (gitignored — safe, never committed).
cat > .env.development <<'EOF'
BACKEND_PROXY_TARGET=http://backend:3030
INGESTION_PROXY_TARGET=http://ingestion:3031
KOL_SYSTEM_PROXY_TARGET=http://kol-calls:3050
FEED_PUBLISHER_PROXY_TARGET=http://feed-publisher:3040
MARKET_DATA_PROXY_TARGET=http://market-data:4000
EOF

# 2) Boot everything (first run builds 11 images + frontend npm ci; ~5-10 min)
docker compose -f docker-compose.dev.yml up --build -d

# 3) Create the per-app DBs once (volume persists; skip on later boots).
#    The single pg starts with `backend_db`; the rest are created here
#    (`DATABASE_SYNCHRONIZE=true` creates TABLES, not databases):
for db in ingestion_telegram_db kol_calls_db kol_calls_publisher_db feed_publisher_db market_data_db dexter_db telegram_bots_db scheduling_posts_db ai_ml_db threads_publisher_db; do
  docker exec onchain-dev-pg psql -U onchain_bot -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 || \
  docker exec onchain-dev-pg psql -U onchain_bot -d postgres -c "CREATE DATABASE $db OWNER onchain_bot";
done

# 4) Follow the boot, then check health:
docker compose -f docker-compose.dev.yml logs -f backend ingestion
curl -s http://localhost:3030/api/health && echo
```

Partial boot (lighter): `docker compose -f docker-compose.dev.yml up -d pg redis-backend backend ingestion frontend dozzle`

## 2. URLs (app → port → health)

| App                   | URL                   | Health        | DB (single pg `:5432`)                      |
| --------------------- | --------------------- | ------------- | ------------------------------------------- |
| backend               | http://localhost:3030 | `/api/health` | `backend_db` / redis `6379`                 |
| ingestion-telegram    | http://localhost:3031 | `/api/health` | `ingestion_telegram_db` (see step 3)        |
| feed-publisher        | http://localhost:3040 | `/api/health` | `feed_publisher_db` / redis `6383`          |
| kol-calls             | http://localhost:3050 | `/api/health` | `kol_calls_db` / redis `6382`               |
| kol-calls-publisher   | http://localhost:3060 | `/api/health` | `kol_calls_publisher_db` (split 2026-09-28) |
| market-data           | http://localhost:4000 | `/api/health` | `market_data_db` / redis `6385`             |
| dexter-onchain-bot    | http://localhost:4060 | `/api/health` | `dexter_db` / redis `6387`                  |
| telegram-bots-gateway | http://localhost:4070 | `/api/health` | `telegram_bots_db` (user `onchain_bot`)     |
| scheduling-posts      | http://localhost:4080 | `/api/health` | `scheduling_posts_db` / redis `6389`        |
| ai-ml                 | http://localhost:4090 | `/api/health` | `ai_ml_db` / redis `6391`                   |
| threads-publisher     | http://localhost:4100 | `/api/health` | `threads_publisher_db` / redis `6393`       |
| frontend (vite)       | http://localhost:5173 | `/` (200)     | —                                           |
| Dozzle (logs UI)      | http://localhost:8080 | —             | —                                           |

Notes:

- Dexter dev is `:4060` and threads dev is `:4100` (verified in `main.ts` +
  Dockerfiles). `:4061`/`:4101` are the STAGING host ports (C-PORTS-01), not dev.
- Single postgres `:5432` (service `pg`, container `onchain-dev-pg`) holds one DB
  per app — consolidated 2026-09-28 (was one pg container per app on
  `:5435`-`:5446`). Per-app standalone composes keep their own pg ports.
- Service-to-service URLs inside the network use compose names
  (`http://ingestion:3031`, `http://market-data:4000`, `http://gateway:4070`,
  `http://kol-calls:3050`) — already wired in the compose `environment:`.

## 3. Log UI (Dozzle)

Open http://localhost:8080 — all `onchain-dev-*` containers stream there with
search + split view. No login (local dev only, port not exposed beyond localhost
unless you publish it).

CLI equivalents:

```bash
docker compose -f docker-compose.dev.yml logs -f <service>   # one service
docker compose -f docker-compose.dev.yml logs -f --tail 50   # everything
docker compose -f docker-compose.dev.yml ps                  # health status
```

## 4. Stop / clean

```bash
docker compose -f docker-compose.dev.yml stop     # pause, keep DB volumes
docker compose -f docker-compose.dev.yml up -d    # resume
docker compose -f docker-compose.dev.yml down     # remove containers, KEEP volumes
docker compose -f docker-compose.dev.yml down -v  # NUKE: removes DB volumes too
```

## 5. Troubleshooting

| Symptom                                       | Fix                                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `port is already allocated`                   | Stop host dev (`npm run dev`, `dev:ingestion`) or per-app composes; then `node scripts/cleanup-ports.mjs`                           |
| App restarts after code change outside `src/` | Only `src/` is bind-mounted (live reload). New files/config → `docker compose -f docker-compose.dev.yml build <svc> && up -d <svc>` |
| `npm ci` re-runs for frontend every boot      | `dev-central-frontend-node_modules` volume missing (see `down -v`); first boot only                                                 |
| Ingestion logs MTProto auth errors            | Expected: dummy triple, real Telegram stays OFF in dev. HTTP API + SSE still serve                                                  |
| `relation does not exist` in ingestion        | Step 1.3 (`CREATE DATABASE`) was skipped                                                                                            |
| File watcher misses edits (macOS)             | Restart the service: `up -d --force-recreate <svc>`                                                                                 |
| Change a dependency                           | `docker compose -f docker-compose.dev.yml build <svc> && up -d <svc>`                                                               |

## 6. Host alternative: pm2 (`ecosystem.config.js`)

Same 12 services, natively on the host instead of Docker. Companion file:
`ecosystem.config.js` (repo root). All secrets there are DUMMIES — never put
real tokens/keys in it (same rule as §1: real MTProto triple lives ONLY in
`apps/ingestion-telegram/.env`, never referenced).

Prerequisites: Node 22+, `npm i -g pm2`, and the C-DB-01 infra running
(single pg + per-app redis containers from `docker-compose.dev.yml` — the `env:` blocks
in `ecosystem.config.js` target the HOST-mapped ports, e.g. kol-calls DB
`localhost:5432/kol_calls_db`, NOT the compose service names):

```bash
# 1) Infra only (no app containers):
docker compose -f docker-compose.dev.yml up -d pg redis-backend \
  redis-kol redis-feed redis-market \
  redis-dexter redis-scheduling redis-aiml \
  redis-threads

# 2) Per-app DBs — create once (same as §1 step 3):
for db in ingestion_telegram_db kol_calls_db kol_calls_publisher_db feed_publisher_db market_data_db dexter_db telegram_bots_db scheduling_posts_db ai_ml_db threads_publisher_db; do
  docker exec onchain-dev-pg psql -U onchain_bot -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 || \
  docker exec onchain-dev-pg psql -U onchain_bot -d postgres -c "CREATE DATABASE $db OWNER onchain_bot";
done
```

Lifecycle:

```bash
pm2 start ecosystem.config.js                        # all 12
pm2 start ecosystem.config.js --only backend         # one service
pm2 start ecosystem.config.js --only backend --no-autorestart  # dry-run wiring check
pm2 stop <app> | pm2 restart <app> | pm2 delete <app>
pm2 stop all && pm2 delete all                       # full cleanup (leave nothing running)
pm2 logs <app> --lines 50                            # tail one service
pm2 logs --lines 20                                  # everything (repo-root .logs/*.log)
pm2 monit                                            # cpu/mem dashboard
pm2 describe <app>                                   # resolved cwd/script/env/log paths
```

Notes:

- `watch=false` in the config: Nest (`--watch`) / vite watch THEMSELVES —
  pm2 must not double-watch. `max_memory_restart`: `1G` (Nest), `512M`
  (frontend). Logs: repo-root `.logs/<app>.log` + `.logs/<app>-error.log`
  (absolute paths via `__dirname` — pm2 resolves relative log paths against
  each app's `cwd`, verified 2026-09-27).
- Backend boots DB-less by default (`DATABASE_ENABLED=false`); for a DB-backed
  boot, uncomment the `POSTGRES_*` block in `ecosystem.config.js` (DB
  `backend_db` must exist first). New apps expect their C-DB-01 DBs to exist
  (`DATABASE_SYNCHRONIZE=true` creates TABLES, not databases).
- Either Docker (§1) or pm2 — NEVER both: same host ports. Stop one stack
  fully before starting the other.
- Known host strays (NOT pm2, do NOT kill blindly — verify with
  `lsof -iTCP -sTCP:LISTEN -P` first): detached `node apps/*/dist/main`
  processes from killed shells hold their ports (seen 2026-09-27 on `:4000`
  market-data, `:4060` dexter). `pm2 delete all` does not touch them; stop the
  owning shell/session or kill by explicit PID only.
