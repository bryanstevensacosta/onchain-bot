# RUNBOOK — Rename Oracle Postgres DBs/roles `alpha_meta_token_scanner*` → `onchain_bot*`

**STATUS: NOT EXECUTED.** Staging-first, prod needs a downtime window.
Phase 3 of the `alpha-meta-token-scanner → onchain-bot` rename (code phases 1–2 done,
evidence `.omo/evidence/rename-onchain-bot.log`). No step below has been run on any Oracle DB.
Live READ-ONLY inventory taken 2026-09-25 (commands + redacted results in
`.omo/evidence/vps-naming-audit.log`; summary in §6 below). Inventory changed the
scope: §8 (role password rotation), §9 (redis), §10 (table-prefix verified zero),
§11 (approval gate) are new and REQUIRED reading before execution.

## 0. Mapping (roles are shared per server: one role owns that server's DBs)

| Server / env              | Kind | BEFORE (live, do not touch until execution)  | AFTER (target)                  |
| ------------------------- | ---- | -------------------------------------------- | ------------------------------- |
| Oracle prod, shared role  | role | `alpha_meta_token_scanner`                   | `onchain_bot`                   |
| Oracle prod, backend      | db   | `alpha_meta_token_scanner`                   | `onchain_bot`                   |
| Oracle prod, ingestion    | db   | `alpha_meta_token_scanner_ingestion`         | `onchain_bot_ingestion`         |
| Twin staging, shared role | role | `alpha_meta_token_scanner`                   | `onchain_bot`                   |
| Twin staging, backend     | db   | `alpha_meta_token_scanner_staging`           | `onchain_bot_staging`           |
| Twin staging, ingestion   | db   | `alpha_meta_token_scanner_staging_ingestion` | `onchain_bot_staging_ingestion` |

(kol-system DBs `onchain_bot_kol_system[_staging]` are already new-style — no action.)

## 1. Preconditions (both phases)

1. Full backups FIRST via the normal path (`scripts/backup-db.sh` on each host; prod
   backend+ingestion, twin backend+ingestion) and confirm the dumps restore-parse
   (`pg_restore --list` non-empty, sizes sane). Record pre-counts:
   `SELECT count(*) FROM <key tables>` per DB (backend: vip/calls tables; ingestion:
   `crypto_news_messages`).
2. Merge the code side of this rename (phases 1–2) and deploy it once WITHOUT the DB
   rename: it is proven inert (env-wins dual check — prod steps `source .env.production`
   before compose; staging intentionally holds OLD fallbacks in
   `apps/backend/docker-compose.staging.yml`, see its LIVE-DATA HOLD comment).
3. `ALTER DATABASE … RENAME` refuses with open sessions; `ALTER ROLE … RENAME` refuses
   with open sessions for that role. Stop ALL writers per env before renaming:
   backend + ingestion-telegram containers (publisher crons live inside the backend).

## 2. Phase A — staging twin FIRST (no prod impact)

1. `docker compose -f docker-compose.staging.yml stop backend` and
   `docker-compose.staging-ingestion.yml stop` (twin host), verify zero sessions:
   `SELECT pid, usename, datname FROM pg_stat_activity WHERE datname LIKE '%staging%';`
2. Backups (twin backend + twin ingestion DBs).
3. Rename (as superuser, `postgres` maintenance DB):
   `ALTER DATABASE alpha_meta_token_scanner_staging RENAME TO onchain_bot_staging;`
   `ALTER DATABASE alpha_meta_token_scanner_staging_ingestion RENAME TO onchain_bot_staging_ingestion;`
   `ALTER ROLE alpha_meta_token_scanner RENAME TO onchain_bot;`
4. Lockstep consumer flip on the twin host (values in live files, never in git):
   twin `.env.staging` files (backend `POSTGRES_*`, ingestion `INGESTION_DATABASE_*`),
   then repo files: `docker-compose.staging.yml` fallbacks → new names + DELETE the
   LIVE-DATA HOLD comment; `deploy-staging.yml` `-e POSTGRES_*` flags; `deploy-ingestion.yml`
   staging-lane `INGESTION_DATABASE_*` fallbacks.
5. `up -d` twin postgres/backend/ingestion; verify: `:3031/api/health`, twin backend
   `/api/health`, `GET :3033/api/feed/sources`, SSE stream connects, one probe
   crypto-news cycle logs `Found N matching messages`.
6. Soak ≥24h before Phase B. Any anomaly → §4 rollback on the twin only.

## 3. Phase B — prod (downtime window; announce first)

1. Stop prod backend + prod ingestion (`docker-compose.prod.yml`, `docker-compose.ingestion.yml`).
   Confirm zero sessions on both prod DBs + the shared role.
2. Backups (prod backend + prod ingestion DBs) + pre-counts.
3. Rename:
   `ALTER DATABASE alpha_meta_token_scanner RENAME TO onchain_bot;`
   `ALTER DATABASE alpha_meta_token_scanner_ingestion RENAME TO onchain_bot_ingestion;`
   `ALTER ROLE alpha_meta_token_scanner RENAME TO onchain_bot;`
4. Lockstep consumer flip: prod `.env.production` files (backend + ingestion values);
   repo files: `deploy.yml` migration-container `-e POSTGRES_*`; `deploy-ingestion.yml`
   prod-lane fallbacks; `infra/systemd/onchain-backend-backup.service` `Environment=`;
   `apps/backend/pgadmin/servers.json` `MaintenanceDB`/`Username` + `queries/README.md`
   click path; operational docs (`docs/deployment/*`, `CRYPTO_NEWS_ENV_REFERENCE.md`,
   both `docs/proyect/DEPLOY.md`, `docs/ci-cd.md`, `.omo/runbooks/rollback.md`).
   Decide: delete legacy `scripts/deploy.sh` (unreferenced) or flip its defaults too;
   flip `scripts/sync-*.sh` defaults + sync docs (or retire them — they target the
   suspended DO host).
5. Redeploy prod backend + ingestion via the normal workflows (migration one-off
   containers now resolve new names), verify: `:3030/api/health`
   (`"service":"onchain-bot"`), `:3032/api/feed/sources`, recent/failed-calls endpoints,
   publisher queue drains, post-counts match pre-counts.
6. Keep the previous dumps until the next successful backup cycle.

## 4. Rollback (per env, reverse order)

Reverse-renames (`TO` swapped), restore previous repo file versions (`git log` the
flip commit), restore live `.env` values from the operator's password manager,
restart. If data diverged after the flip, `pg_restore` the §1 dumps instead
(accept write-loss window — announce it).

## 5. Cleanup (after both envs green ≥1 backup cycle)

- Local dev: `docker compose down -v` + recreate (dev volumes still carry pre-rename
  names/roles; compose/template defaults are already new). Old volumes are orphaned,
  not deleted — recoverable via `docker volume ls`.
- Remove this runbook's "pending" qualifiers in `AGENTS.md` (root invariant 3, backend
  staging caveat, ingestion persistencia/invariantes/README table), kol-system AGENTS +
  templates + staging compose comments, and the servers.json `Comment`.
- Executed-migration plans/drafts under `.omo/plans|drafts` stay byte-stable as history.

## 6. Live inventory snapshot (READ-ONLY audit 2026-09-25, OracleDroplet)

Full redacted command log: `.omo/evidence/vps-naming-audit.log`. Zero writes were
performed (no ALTER, no restarts, no file edits; `.env` files were read by variable
NAME only, `grep -oE '^[A-Za-z_][A-Za-z0-9_]*='`, values never printed).

| #   | Item                                              | Live value (redacted)                                                                                                                                                                                                                                                                                                      | Rename relevance                                                                                                                                                         |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Compose projects (`docker compose ls`)            | `onchain-bot-prod`, `onchain-bot-staging`, `onchain-bot-ingestion-telegram`, `onchain-bot-staging-ingestion`, `onchain-bot-kol-system-staging`, `onchain-bot-dev`, `llm-gateway`                                                                                                                                           | All new-style. No action                                                                                                                                                 |
| 2   | Containers (15)                                   | `onchain-bot-{backend,frontend,postgres,redis}-{production,staging}`, `onchain-bot-ingestion-telegram{,-staging}`, `onchain-bot-kol-system-{,postgres-,redis-}staging`, `onchain-bot-postgres/redis-{dev,staging}`, `litellm-*`                                                                                            | All new-style. Prod ingestion image resolves to `ghcr.io/.../onchain-bot-ingestion-telegram:latest` (via image id `773800b94a7e`). No action                             |
| 3   | GHCR tags in use                                  | `-backend`/`-frontend` `:latest` (prod) + `:staging-latest` (staging); old repo name `onchain-bot-ingestion:*` tags still present on host (same image IDs as `-telegram` tags, e.g. `staging-prev`)                                                                                                                        | Dangling old repo-name tags: registry/host cleanup only, safe-now                                                                                                        |
| 4   | Prod postgres (`onchain-bot-postgres-production`) | DBs: `alpha_meta_token_scanner`, `alpha_meta_token_scanner_ingestion`, `postgres`. Non-system role: ONLY `alpha_meta_token_scanner` (superuser `postgres` does not exist)                                                                                                                                                  | §2/§3 renames + §8 rotation                                                                                                                                              |
| 5   | Staging postgres (`onchain-bot-postgres-staging`) | DBs: `alpha_meta_token_scanner_staging`, `alpha_meta_token_scanner_staging_ingestion`, `postgres`. Non-system role: ONLY `alpha_meta_token_scanner`                                                                                                                                                                        | Phase A renames + §8 rotation                                                                                                                                            |
| 6   | kol-system staging postgres                       | DB: `onchain_bot_kol_system_staging` (already new-style). Role: `alpha_meta_token_scanner` (STILL LEGACY — owns the new-style DB)                                                                                                                                                                                          | Role rename + rotation (no DB rename). NEW scope vs §0                                                                                                                   |
| 7   | Tables with `alpha_meta*` prefix                  | ZERO in all 5 DBs (grep -ci alpha over full `pg_tables` = 0,0,0 per server pair + kol-system)                                                                                                                                                                                                                              | §10: verify-and-skip                                                                                                                                                     |
| 8   | Redis prod                                        | Auth REQUIRED, single user `default`, no custom ACL users (v7.4.11)                                                                                                                                                                                                                                                        | §9 rotation (prod only)                                                                                                                                                  |
| 9   | Redis staging/dev (+ kol-system staging)          | NOAUTH (no password configured), single user `default`                                                                                                                                                                                                                                                                     | Out of rotation scope; optional hardening = separate gated decision                                                                                                      |
| 10  | Live `.env` files                                 | Prod: `apps/backend/.env.production` (+ `.bak-20260916`), `apps/ingestion-telegram/.env.production`; staging twins under `/opt/onchain-bot-staging/.../.env.staging`; kol-system `.env.staging`. Consumer keys confirmed by NAME: backend `POSTGRES_*` / `REDIS_*`, ingestion `INGESTION_DATABASE_*` / `INGESTION_REDIS_*` | Lockstep flip files for §§2–3, §8, §9                                                                                                                                    |
| 11  | Orphan legacy dir                                 | `/opt/onchain-bot/apps/ingestion-service/` contains ONLY `.env.production` (no code, no container references it)                                                                                                                                                                                                           | Delete (or archive) AFTER successful rename; safe-now to leave                                                                                                           |
| 12  | Volumes                                           | Legacy `alpha-meta-token-scanner-{pg,redis}-data` are ATTACHED to live dev containers (`onchain-bot-postgres-dev`, `onchain-bot-redis-dev`); prod/staging use new-style `onchain-bot-{pg,redis}-data`, `onchain-bot-staging-{pg,redis}-data`, `onchain-bot-kol-system-staging-*`                                           | Live rename = volume migrate (no in-place rename in docker); dev-only, gated-mild                                                                                        |
| 13  | Compose fallbacks (live host copies)              | `docker-compose.prod.yml` defaults `alpha_meta_token_scanner`; `docker-compose.staging.yml` defaults user+password+db legacy (incl. weak default `POSTGRES_PASSWORD:-alpha_meta_token_scanner` — fallback only, live value comes from `.env.staging`); ingestion compose files contain NO alpha refs                       | Flip lockstep per §§2–3 (repo files are code-side, safe-now to edit; EFFECT gated until deployed)                                                                        |
| 14  | systemd                                           | `onchain-backend-backup.service` has `Environment=POSTGRES_USER/DB=alpha_meta_token_scanner*` AND is currently **failed (`Result: resources`, since 2026-09-23)** — backups may NOT be running                                                                                                                             | Repair backup service BEFORE any execution (precondition, §1). Staging socat units still bind retired Tailscale IP `100.84.4.28` (stale ref, safe-now to fix separately) |
| 15  | pgAdmin `servers.json` (repo)                     | `Name: alpha-meta-token-scanner`, `MaintenanceDB`/`Username: alpha_meta_token_scanner`                                                                                                                                                                                                                                     | Label = safe-now; MaintenanceDB/Username flip lockstep with rename                                                                                                       |
| 16  | Host nginx                                        | None (`/etc/nginx/sites-enabled` absent; frontends served from containers `:80`)                                                                                                                                                                                                                                           | No action                                                                                                                                                                |
| 17  | Backups present                                   | `/opt/onchain-bot/backups/pre-deploy-*.dump.gz` (prod) + `backups/staging/staging-backup-*.sql`                                                                                                                                                                                                                            | Existence only; freshness/restore-parse must be re-verified at execution (§1)                                                                                            |
| 18  | Local repo alpha refs (34 files)                  | Docs (`docs/deployment/*`, `docs/proyect/DEPLOY.md`, `docs/ci-cd.md`, `docs-money/*`), scripts (`sync-*.sh`, `deploy.sh`), frozen backfills (`*.sql`, `2026-0*`), `docker-compose.staging.yml`, `pgadmin/*`, `infra/systemd/*`, `FEED_ENV_REFERENCE.md`                                                                    | All safe-now (normal PR flow); frozen backfills/docs-history stay byte-stable                                                                                            |

## 7. Classification: safe-now vs gated

SAFE-NOW (no live data/creds touched; normal PR flow, no approval gate):

- S1. Local repo doc/script/label edits (row 18), including repo templates
  (`infra/systemd/onchain-backend-backup.service`, compose fallbacks, pgAdmin
  `Name` label) — EFFECT stays gated until deployed via workflows.
- S2. GHCR/host dangling-tag cleanup of old `onchain-bot-ingestion:*` repo name.
- S3. Staging socat stale-IP fix + backup-service repair work (repair itself is a
  PRECONDITION for execution, not part of it).
- S4. Leaving the orphan `ingestion-service/.env.production` in place (deletion
  deferred to post-rename cleanup).

GATED (approval gate §11 + staging-first + rollback rehearsed):

- G1. DB renames (4 DBs, §§2–3).
- G2. Role renames (3 servers: prod, staging, kol-system-staging — §0 + row 6).
- G3. Postgres password rotation per server (§8).
- G4. Redis prod password rotation (§9). Staging/dev redis hardening explicitly
  OUT of scope unless separately approved.
- G5. Live `.env` value flips (all 5 consumer files, §8/§9 order).
- G6. Live dev volume migration off legacy names (row 12; dev data at stake).
- G7. Live systemd unit flip + daemon-reload (row 14).

## 8. Postgres role/user + password rotation (per server, staging-first)

SCOPE: 3 servers — staging pg, prod pg, kol-system-staging pg. On prod/staging
the role owns 2 DBs each; on kol-system it owns 1 new-style DB (rename role,
no DB rename there). COMBINE with the Phase A/B rename window on the same
server (one drain covers rename + rotation), but rotation is INDEPENDENTLY
reversible (password can be rolled back without touching names).

Preconditions (per server, in order):

1. §1 backups done + restore-parse verified + pre-counts recorded.
2. New password generated (operator password manager, ≥32 chars) AND old
   password retained in manager (rollback needs it). NEVER in chat/logs/tickets.
3. Writers identified: staging = `backend-staging` + `ingestion-telegram-staging`
   containers; prod = `backend-production` + `ingestion-telegram` containers;
   kol-system server = `kol-system-staging` container (+ its redis is separate).

Procedure (per server; staging servers first, prod LAST under §11 gate):

1. DRAIN: `stop` all writer containers for that server. Verify zero sessions:
   `SELECT pid, usename, datname FROM pg_stat_activity WHERE usename = '<role>';`
   → expect 0 rows. Terminate stragglers ONLY with explicit PID
   (`SELECT pg_terminate_backend(<pid>)`) — never `pg_terminate_backend` by query
   without listing PIDs first.
   ROLLBACK: `start` writers back; nothing changed yet.
2. RENAME (skip on kol-system ONLY if already done — it still needs it):
   as the admin user via the stopped-compose network (one-off container or
   `docker exec` on the pg container):
   `ALTER ROLE alpha_meta_token_scanner RENAME TO onchain_bot;`
   (+ `ALTER DATABASE … RENAME …` per §§2–3 on backend/ingestion servers).
   ROLLBACK: reverse `RENAME TO` while still drained (names only, no data move).
3. ROTATE: `ALTER ROLE onchain_bot WITH PASSWORD '<new-from-manager>';`
   (value never echoed; run with `PGPASSWORD` from manager, `psql -c` history
   disabled). Verify: fresh `psql` login with new password succeeds; old
   password login FAILS (expected).
   ROLLBACK: `ALTER ROLE onchain_bot WITH PASSWORD '<old-from-manager>';`
4. CONSUMER FLIP (all writers still stopped; order matters — flip ALL before
   starting ANY): (1) backend `.env*` (`POSTGRES_USER`, `POSTGRES_DB`,
   `POSTGRES_PASSWORD`); (2) ingestion `.env*` (`INGESTION_DATABASE_USER`,
   `INGESTION_DATABASE_NAME`, `INGESTION_DATABASE_PASSWORD`); (3) kol-system
   `.env.staging` on its server. Then repo files per §§2–3 step 4 (fallbacks).
   ROLLBACK: restore previous file versions from manager/git; nothing restarted yet.
5. RESTART writers one by one (backend first, confirm `/api/health`, then
   ingestion, confirm `/api/feed/sources` + SSE connect), watch logs for
   `password authentication failed` (means a consumer was missed → stop it, fix
   its file, restart it; DB/role stay as-is).
   ROLLBACK (post-start auth failure confined to one consumer): stop that
   consumer, restore its file, restart. ROLLBACK (whole server): stop all,
   reverse §8.3 + §8.2 + §4 files, restart (or `pg_restore` §1 dumps if data
   diverged — announce the write-loss window).
6. SOAK: staging ≥24h before the next server; prod per §11 window. Keep §1 dumps
   until the next successful backup cycle (note: backup service was FAILED at
   inventory — it MUST be green before step 1, otherwise "next successful cycle"
   never arrives).

## 9. Redis credential procedure (prod ONLY)

SCOPE: `onchain-bot-redis-production` (auth required, single `default` user,
no custom ACLs — nothing to rename, only the password rotates). Staging/dev/
kol-system redis have NO password (NOAUTH verified) → explicitly OUT of scope;
adding passwords there is a separate hardening decision (requires consumer
flips + restarts) and is NOT approved by this runbook.

Pre-step (at execution time, read-only): confirm how the password is injected —
`docker inspect onchain-bot-redis-production --format '{{.Config.Cmd}} {{.Config.Entrypoint}}'`
and the prod compose `command:`/`environment:` for redis (expect
`--requirepass ${REDIS_PASSWORD...}` or env-file). The rotation path depends on it:

- (a) `--requirepass` via env: flip `REDIS_PASSWORD` in prod backend `.env.production`
  - ingestion `.env.production`, then `recreate` the redis container (brief
    cache/queue loss: bookmarks + publisher queue are in redis — schedule with the
    Phase B window, publishers stopped).
- (b) config-file + `CONFIG REWRITE` capable: `CONFIG SET requirepass '<new>'`
  at runtime (zero restart), then flip consumer files + rolling restart of
  consumers, then `CONFIG REWRITE` (or update the file) so the new value survives
  a container recreate.
  Verify: `redis-cli -a '<new>' PING` → PONG; old password → NOAUTH/WRONGPASS.
  Consumers healthy + no `WRONGPASS` in backend/ingestion logs.
  ROLLBACK: reverse to old password (runtime `CONFIG SET` or container recreate
  with old env) + restore consumer files + restart consumers. Cache/queue content
  lost during the window is NOT recoverable — announce it (same class as §4
  write-loss; publisher queue drains, it does not persist).

## 10. Table/DB prefix renames (`alpha_meta_token_scanner*` → `onchain_bot*`)

- TABLES: verified ZERO tables carry the prefix in all 5 live DBs (2026-09-25,
  full `pg_tables` scan per DB, evidence log §E). NO table renames needed.
  At execution time, re-run the 30-second check BEFORE the rename window
  (one command per DB, see evidence log §E) — if any appear, STOP and re-plan.
- DBs: exactly the 4 renames in §0 (staging-first Phase A, then prod Phase B),
  plus the kol-system role-only rename (row 6, no DB rename).
- ORDER: staging backend+ingestion DBs → staging soak → kol-system role
  (staging footprint, pairs with staging soak) → APPROVAL GATE §11 → prod
  backend+ingestion DBs.

## 11. APPROVAL GATE — required before ANY prod (Phase B / G1–G5 on prod) execution

NO prod step runs without ALL boxes checked AND an explicit operator message
`APPROVED Phase B` naming the date/window. Staging Phase A may proceed on
maintainer judgment once §1 preconditions hold.

- [ ] Staging Phase A executed + soaked ≥24h with zero anomalies (link evidence).
- [ ] kol-system staging role renamed + rotated, service healthy.
- [ ] `onchain-backend-backup.service` repaired and ONE successful cycle AFTER
      the repair (it was FAILED/`resources` at 2026-09-25 inventory).
- [ ] Fresh Phase B backups + restore-parse + pre-counts recorded in the
      execution log (date/time + dump paths + sizes).
- [ ] Old AND new postgres passwords + redis passwords in the operator's password
      manager (rotation rollback depends on the old values).
- [ ] Downtime window announced (prod backend+ingestion stop; publisher queue +
      redis cache loss accepted for the window).
- [ ] Rollback rehearsed on the twin (at least the reverse-RENAME path §8.2/§4).
- [ ] Operator message: `APPROVED Phase B <YYYY-MM-DD> <window UTC>`.

Post-prod: keep Phase B dumps until the next successful backup cycle; run §5-style
verification; schedule S1–S4 + G6/G7 follow-ups as normal work (no gate).
