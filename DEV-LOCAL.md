# DEV-LOCAL — centralized local dev (one command)

> Branch: `feat/mega-refactor-tramos`. Stack: `docker-compose.dev.yml` (this file's companion).
> All secrets below are DUMMIES. Never put real tokens/keys in dev files.

## 0. Prerequisites

- Docker Desktop (or Docker Engine) running, ~8 GB RAM free for the full stack.
- Ports free: `3030 3031 3040 3050 3060 4000 4060 4070 4080 4090 4100 5173 8080`
  - DB ports `5432 5435 5436 5437 5438 5440 5442 5444 5446`
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

# 3) Ingestion DB lives on the shared backend postgres — create it once
#    (volume persists; skip on later boots):
docker exec onchain-dev-pg-backend psql -U onchain_bot -d onchain_bot \
  -c 'CREATE DATABASE onchain_bot_ingestion;'

# 4) Follow the boot, then check health:
docker compose -f docker-compose.dev.yml logs -f backend ingestion
curl -s http://localhost:3030/api/health && echo
```

Partial boot (lighter): `docker compose -f docker-compose.dev.yml up -d pg-backend redis-backend backend ingestion frontend dozzle`

## 2. URLs (app → port → health)

| App                   | URL                   | Health        | DB (host port)                                          |
| --------------------- | --------------------- | ------------- | ------------------------------------------------------- |
| backend               | http://localhost:3030 | `/api/health` | pg `5432` / redis `6379`                                |
| ingestion-telegram    | http://localhost:3031 | `/api/health` | shares backend pg (`onchain_bot_ingestion`, see step 3) |
| feed-publisher        | http://localhost:3040 | `/api/health` | pg `5436` / redis `6383`                                |
| kol-calls             | http://localhost:3050 | `/api/health` | pg `5435` / redis `6382`                                |
| kol-calls-publisher   | http://localhost:3060 | `/api/health` | SHARES kol-calls DB (P51)                               |
| market-data           | http://localhost:4000 | `/api/health` | pg `5438` / redis `6385`                                |
| dexter-onchain-bot    | http://localhost:4060 | `/api/health` | pg `5440` / redis `6387`                                |
| telegram-bots-gateway | http://localhost:4070 | `/api/health` | pg `5437` (see note)                                    |
| scheduling-posts      | http://localhost:4080 | `/api/health` | pg `5442` / redis `6389`                                |
| ai-ml                 | http://localhost:4090 | `/api/health` | pg `5444` / redis `6391`                                |
| threads-publisher     | http://localhost:4100 | `/api/health` | pg `5446` / redis `6393`                                |
| frontend (vite)       | http://localhost:5173 | `/` (200)     | —                                                       |
| Dozzle (logs UI)      | http://localhost:8080 | —             | —                                                       |

Notes:

- Dexter dev is `:4060` and threads dev is `:4100` (verified in `main.ts` +
  Dockerfiles). `:4061`/`:4101` are the STAGING host ports (C-PORTS-01), not dev.
- Gateway postgres is on host `:5437`: its own per-app compose used `:5436`,
  which collides with feed-publisher pg `:5436`. Container port unchanged.
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
