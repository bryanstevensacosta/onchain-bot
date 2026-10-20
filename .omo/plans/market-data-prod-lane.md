# market-data-prod-lane

## Status

- [x] Drafted (2026-10-19)
- [ ] Approved (owner)
- [ ] Wave 4 — first prod rollout (HARD owner gate)

**DORMANT**: no deploy was executed, nothing was dispatched, `master` was not
merged. The push trigger on `master` exists for readiness only.

## TL;DR (For humans)

**What was built:** the market-data PRODUCTION deploy lane, mirroring the
proven staging lane (`deploy-market-data-staging.yml`, green run 39282630223) and the dexter prod lane: a GitHub Actions workflow that builds
a multi-arch image, self-syncs the repo tree into `/opt/onchain-bot`, backs
up the DB, runs dry-run + real migrations in a throwaway `--target builder`
container, recreates ONLY `market-data`, gates on `:4002/api/health`, pins
`:prod-prev-market-data`, and auto-rolls-back on post-smoke red. Plus the
production compose file and the operator env template.

**Why this approach:** reuse the exact anatomy already proven on staging and
in backend/dexter prod instead of inventing a new deploy shape. Migrations
run in the builder stage so the minimal prod image (no ts-node) is never
polluted; the DB one-off uses an explicit `-e DATABASE_URL` because
`--env-file` proved unreliable and the Docker DNS alias `postgres` is
ambiguous on the shared prod network.

**What it will NOT do:** it does not run today, does not touch backend
(`deploy.yml`), dexter, ingestion, staging, `opencode.json` or any existing
workflow; it never commits secrets; it never reverts migrations
(roll-forward only).

**Effort:** Medium (3 artifacts, no application code).
**Risk:** Low while dormant; Medium at first rollout (new stack, new DB,
new ports on a shared Oracle host).

## Artifacts

| File                                            | Role                                                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/deploy-market-data-prod.yml` | push `master` (paths `apps/market-data/**` + itself) + `workflow_dispatch` (`full` default, `rollback-market-data-prod`), multi-arch GHCR |
| `apps/market-data/docker-compose.prod.yml`      | project `onchain-bot-market-data-prod`, app `:4002→:4000`, pg `:5449`, redis `:6396`, network `onchain-bot-net`                           |
| `apps/market-data/.env.production.template`     | destination + operator-owned contract, container port 4000, unique-host `DATABASE_URL`/`REDIS_URL`, placeholders only                     |

## Hard preconditions (Wave 4 owner gate — check ALL before dispatching)

1. **Owner approval** explicitly given for this rollout (never inferred).
2. **Env file placed** at `/opt/onchain-bot/apps/market-data/.env.production`
   (operator-owned; rsync excludes `.env*` so it is neither synced nor
   deleted; the workflow aborts before any mutation if it is missing).
   Fill at minimum: `MARKET_DATA_API_KEY`, `DATABASE_URL` password,
   provider keys desired in prod.
3. **Ports free on Oracle**: `lsof -i :4002 -i :5449 -i :6396` → no output.
   Repo-wide grep found zero collisions (app `:4002` only in docs/plans;
   pg neighbors 5435–5448 taken; redis neighbors 6382–6395 taken).
4. **Network alias free**: no container on `onchain-bot-net` already answers
   to `onchain-bot-market-data` (only the `-staging` container exists today).
   The compose file adds this alias so dexter prod
   (`MARKET_DATA_URL=http://onchain-bot-market-data:4000`) and the frontend
   nginx upstream (`apps/frontend/nginx.conf:350`) resolve unchanged.
5. **Credentials policy aligned**: compose interpolates `${POSTGRES_*}` from
   the shell/project env, not from `.env.production`. Defaults are
   `onchain_bot`/`onchain_bot` and also initialize the pg volume on first
   run. The workflow's one-off `-e DATABASE_URL` literal pins the same
   defaults. If real prod creds are pinned (shell/project env), update
   compose interpolation + the two workflow literals in the SAME change.
6. **Exposure decision**: `:4002` is published on all interfaces (backend
   prod publishes pg/redis plain too; a loopback bind would be
   `127.0.0.1:4002:4000`). Decide before rollout if the port must stay
   loopback/Tailscale-only.
7. **Redis password decision**: if prod redis needs auth, set
   `MARKET_DATA_REDIS_URL` (single-string form) — otherwise the default
   `redis://onchain-bot-market-data-redis-prod:6379/1` is used.

## First rollout (expected sequence — do not execute until approved)

1. Merge to `master` (or dispatch `lane=full`): build `:sha` + `:prod-latest`
   (multi-arch `linux/amd64,linux/arm64`; Oracle is aarch64).
2. Deploy job: chown → sudo rsync to `/opt/onchain-bot` → precondition
   `.env.production` → pg_dump backup (skipped with a warning on first
   deploy, no container yet) → `docker compose up -d postgres redis` →
   wait healthy.
3. Build `--target builder` one-off → `migration:show` + `SELECT 1` probe →
   `migration:run` (explicit `-e DATABASE_URL`, unique container-name host).
4. Pull + tag `:prod-latest` → recreate ONLY `market-data` → health
   `http://localhost:4002/api/health` (max 5 min).
5. Pin `:prod-prev-market-data` (only after healthy) → smoke marker →
   smoke: `/api/health` hard gate + `/api/v1/chains` informational (401 is
   acceptable with `MARKET_DATA_API_KEY` set).
6. Consumer verification (manual, after the workflow is green): dexter prod
   `MARKET_DATA_URL` resolves and the frontend `/market-data` proxy path
   answers through the alias.

## Rollback (never auto on push)

- **Automatic**: only when the deploy fails AFTER the smoke phase started
  (`failure() && smoke_entered == 'true'`). Pulls
  `:prod-prev-market-data`, stops (verify-stopped gate), retags locally to
  `:prod-latest`, recreates, health-gates `:4002`, reports the measured
  downtime window. A red deploy BEFORE smoke (backup/migrations/health)
  does NOT roll back.
- **Manual escape hatch**: dispatch `workflow_dispatch` with
  `lane=rollback-market-data-prod`. Same mechanics, no build. Dispatch-only,
  never on push.
- **Migrations never revert** (roll-forward). Data restore = explicit HUMAN
  decision from the pre-deploy `pg_dump` artifact
  (`/data/backups/market-data-prod/market-data-prod-backup-*.sql`), never
  automatic and never in a loop.

## Non-goals / guardrails

- NO deploy, NO `docker compose up`, NO `master` merge in this lane.
- NO changes to `apps/market-data/AGENTS.md` / `CHANGELOG.md`.
- NO changes to `docker-compose.staging.yml`,
  `deploy-market-data-staging.yml`, `opencode.json`, `.opencode/`, or
  `apps/dexter-onchain-bot/.env.bak-20261010`.
- NO secrets in git; templates carry placeholders only.
- NO revert of migrations; NO automatic data restore.

## Follow-ups (not blocking Wave 4)

- Provider keys `DRPC_API_KEY`, `CHAINSTACK_API_KEY`, `CHAINSTACK_CHAINS`,
  `SHYFT_API_KEY`, `ETHERSCAN_API_KEY` are documented in `.env.example`
  but absent from both `.env.*.template` files — add them to both templates
  in a separate change.
- Newer optional tunables (`SNAPSHOT_*`, `LAUNCHPAD_*`, `PONS_*`,
  `MARKET_DATA_STREAM_*`, `CHAIN_LOGO_DIR`) are defaulted in code; add to
  the templates only if the operator wants them discoverable.
