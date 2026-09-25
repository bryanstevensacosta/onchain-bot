# RUNBOOK — Rename Oracle Postgres DBs/roles `alpha_meta_token_scanner*` → `onchain_bot*`

**STATUS: NOT EXECUTED.** Staging-first, prod needs a downtime window.
Phase 3 of the `alpha-meta-token-scanner → onchain-bot` rename (code phases 1–2 done,
evidence `.omo/evidence/rename-onchain-bot.log`). No step below has been run on any Oracle DB.

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
