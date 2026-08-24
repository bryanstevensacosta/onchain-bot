# CI/CD Pipeline & Runbook

> **Owner:** Solo maintainer. **Topology:** CI on GitHub-hosted runners, CD on self-hosted droplet. **Automation:** [release-please](https://github.com/googleapis/release-please) for SemVer + changelog.

This document is the operational source of truth for how code travels from a
local commit to production traffic on the CryptoGanster droplet, and what to
do when something goes wrong. Pair it with:

- [Branch Protection Policy](./branch-protection.md) — the gates
- [Release Process](./release-process.md) — the SemVer + tagging flow
- [GOVERNANCE.md](../GOVERNANCE.md) — overall branching model

---

## TL;DR

```
git commit on dev → git push origin dev
  → CI (ubuntu-latest: Tests · Lint · TypeScript Check · Build)
  → Deploy to staging on droplet (port 3031)

gh pr create (dev → master) → CI + Branch Governance
  → (review/merge is a one-click squash; 0 approvals required)
  → CI (re-runs against master)
  → Deploy to production on droplet (port 3030)
  → release-please PR opens "chore(main): release X.Y.Z"
  → squash-merge release-please PR → tag vX.Y.Z + GitHub Release
```

The pipeline separates **CI** (validation, GitHub-hosted) from **CD** (deploy,
self-hosted) so the droplet's 20 GB disk is never consumed by `node_modules`
compiles, and so concurrent deploys can never race.

---

## Pipeline diagram

```mermaid
flowchart LR
    %% ===== Triggers =====
    DevCommit([git commit on dev]) --> DevPush[git push origin dev]
    PRCreate[gh pr create<br/>dev → master] --> CI2{{CI<br/>ubuntu-latest}}
    MergeSquash([Squash & merge PR]) --> MasterPush[push to origin/master]

    %% ===== CI stage =====
    subgraph CI[" CI — GitHub-hosted · ubuntu-latest "]
        direction TB
        Tests["Tests<br/>(Jest + Vitest)"]
        Lint["Lint<br/>(ESLint flat)"]
        Tsc["TypeScript Check<br/>(tsc --noEmit)"]
        Build["Build<br/>(nest build + vite build)"]
        Tests ~~~ Lint
        Lint ~~~ Tsc
        Tsc ~~~ Build
    end

    %% ===== CD staging =====
    subgraph CDStaging[" CD — self-hosted droplet (CryptoGanster) "]
        direction TB
        SyncStg[rsync source<br/>→ /opt/onchain-bot-staging]
        MigrateStg[typeorm migration:run]
        UpStg[docker compose up -d<br/>backend + frontend]
        HcStg{healthcheck<br/>localhost:3031<br/>60×2s = 120s}
        TailscaleStg[Tailscale probes<br/>100.84.4.28:3031 + :4173]
    end

    %% ===== CD prod =====
    subgraph CDProd[" CD — self-hosted droplet (CryptoGanster) "]
        direction TB
        BackupProd[scripts/backup-db.sh<br/>+ chown runner:runner]
        MigrateProd[typeorm migration:run]
        UpProd[docker compose up -d<br/>--force-recreate backend]
        HcProd{healthcheck<br/>localhost:3030<br/>curl -v}
        FrontendProd[frontend build + recreate<br/>:5173 non-blocking]
    end

    %% ===== Releases =====
    subgraph Releases[" Release automation (master only) "]
        direction TB
        RpTrigger[release-please.yml<br/>on push to master]
        RpPR([chore(main): release X.Y.Z])
        RpTag[tag vX.Y.Z<br/>+ GitHub Release]
    end

    %% ===== Environments =====
    DevPush --> CI
    CI -- all green --> SyncStg
    SyncStg --> MigrateStg --> UpStg --> HcStg
    HcStg -- pass --> TailscaleStg
    HcStg -- fail --> Rollback1[deploy job fails<br/>manual intervention]
    TailscaleStg -.live.-> StagingEnv[(Staging<br/>localhost:3031<br/>Tailscale :3031)]

    PRCreate --> CI2
    CI2 -- green --> BranchGov[branch-governance.yml<br/>Rule1..Rule4]
    BranchGov -- pass --> PRReady([PR mergeable])
    PRReady -- squash --> MergeSquash
    MasterPush --> CI3{{CI re-run<br/>on master}}
    CI3 -- green --> BackupProd --> MigrateProd --> UpProd --> HcProd
    HcProd -- pass --> FrontendProd
    HcProd -- fail --> Rollback2[docker compose up -d --force-recreate<br/>+ exit 1]
    FrontendProd -.live.-> ProdEnv[(Production<br/>localhost:3030<br/>public :3030)]

    MasterPush --> RpTrigger
    RpTrigger --> RpPR
    RpPR -- squash --> RpTag
```

### What this diagram does NOT show

- **Concurrency**: both `Deploy to staging` and `Deploy to production` use
  `concurrency: group: deploy-{staging,prod}` with `cancel-in-progress: true`,
  so a second push to the same branch mid-deploy will cancel the in-flight run
  rather than race against it.
- **Healthcheck budgets**: staging is 60 attempts × 2 s = 120 s; production is
  a single `sleep 180` followed by a `curl -v` (with a `--force-recreate`
  retry path on failure).
- **Self-hosted runner isolation**: `Deploy to *` jobs run on the droplet's
  GitHub Actions runner (`runs-on: self-hosted`); CI jobs run on ephemeral
  `ubuntu-latest`. This means the droplet's 20 GB disk only ever sees
  _built artifacts_ + `node_modules` for migrations, never the source build.
- **release-please triggers on `push` to master**, _after_ CI has gone green
  on the merge commit. It is not a gate on prod deploy.

---

## Stages, in order

### 1. CI (`.github/workflows/ci.yml`)

Runs on every push to `dev` or `master` and every PR targeting either. Four
parallel jobs on `ubuntu-latest`, all Node 24, all `npm ci` with
`actions/cache@v4` keyed on `package-lock.json`:

| Job                | Command                                                                                     | Wall-clock budget |
| ------------------ | ------------------------------------------------------------------------------------------- | ----------------- |
| `Tests`            | `npm run test:backend` + `test:frontend`                                                    | ≤ 4 min           |
| `Lint`             | `npm run lint`                                                                              | ≤ 1 min           |
| `TypeScript Check` | `npm run build` (compiles + tsc)                                                            | ≤ 3 min           |
| `Build`            | `npm run build:backend` + `build:frontend` + `actions/upload-artifact@v4` (7-day retention) | ≤ 4 min           |

A `Build` job depends on `tests`, `lint`, and `typescript-check` so we never
upload an artifact that would have failed one of the cheaper checks. The
artifacts are _not_ consumed by the CD workflows — the self-hosted runner
does its own `npm ci` against the rsynced source tree (because `rsync
--exclude=node_modules` is part of the deploy).

### 2. CD — staging (`.github/workflows/deploy-staging.yml`)

Triggered by `push` to `dev` or by `workflow_dispatch`. Runs on the droplet's
self-hosted runner, with `environment: staging`.

Key steps:

1. `actions/checkout@v4` + `actions/setup-node@v4` (Node 24, npm cache).
2. `actions/cache@v4` for `node_modules` and `~/.npm` (key: `runner.os-npm-staging-`).
3. **rsync** the source tree to `/opt/onchain-bot-staging` (excludes `.git`,
   `node_modules`, `dist`, `backups`, `logs`, `.env*`).
4. `find ... -name node_modules -prune -exec rm -rf {} +` to clear stale
   `node_modules` that `rsync --exclude` cannot delete.
5. `cp .env.staging.template .env.staging` if missing (first deploy only).
6. Inject `USE_MOCK_AI=true` if not already present (staging uses mocks).
7. `pg_dump` the existing staging DB to `/tmp/staging-backup-*.sql` if the
   container is running.
8. `chown -R runner:runner /opt/onchain-bot-staging` (host-side `npm ci`).
9. `npm ci --no-audit --no-fund` (host-side for migrations; **not** piped
   through `tail` — full error output is preserved).
10. `typeorm migration:run` (host-side, against staging DB on port 5433).
11. `docker compose -f docker-compose.staging.yml up -d --no-deps backend`.
12. `Wait for backend healthcheck` — 60 × 2 s = 120 s, `curl -v` is logged at
    attempts 5/15/30/45 plus on failure.
13. `docker compose ... up -d frontend` + `Wait for frontend healthcheck`
    (60 × 2 s against `:4173`).
14. `install-socat-services.sh staging` (idempotent — ensures `:3031` is
    socat-forwarded to backend, `:4173` to frontend).
15. **Tailscale probes** against `100.84.4.28:3031` and `100.84.4.28:4173`.
16. `if: always()` → `docker image prune --force --filter "until=24h"` +
    `docker system df` (so the deploy itself doesn't leak disk on staging).

A separate `restart-services` job (also `if: always()`) restarts
`litellm-gateway` + `onchainbot staging start` so any zombie gateway process
is replaced.

### 3. CD — production (`.github/workflows/deploy.yml`)

Triggered by `push` to `master` (i.e. after a squash-merge of a PR) or
`workflow_dispatch`. Runs on the same self-hosted runner, with
`environment: production` (enforcement is _not_ via GitHub environment
secrets — the deploy script uses the production env file directly).

Key steps:

1. `actions/checkout@v4` + `actions/setup-node@v4` (Node 24).
2. **rsync** to `/opt/onchain-bot` (excludes `uploads` in addition to the
   staging excludes — uploads persist across deploys).
3. `scripts/backup-db.sh` (uses `POSTGRES_PASSWORD` from
   `apps/backend/.env.production`, keeps 7 days of dumps in
   `/opt/onchain-bot/backups/`).
4. `chown -R runner:runner /opt/onchain-bot` (host-side `npm ci`).
5. `docker compose ... build backend` + `npm run migration:run` (host-side
   against prod DB).
6. `docker compose ... up -d --force-recreate backend` then `sleep 180`
   (the model of embeddings takes ~120 s to warm up — see also
   `docs/spydefi/arch/`).
7. `curl -v http://localhost:3030/api/health` — on failure, the workflow
   itself does a `docker compose up -d --force-recreate backend` retry
   (no `git revert` — the deploy script trusts the previous container image
   already on disk). If the retry also fails, it dumps `logs backend --tail
50` and `exit 1`.
8. Frontend build + recreate is non-blocking (`|| echo 'WARNING: …'`).
9. Frontend healthcheck: 30 × 2 s against `:5173` (Vite dev server port —
   yes, prod runs Vite dev with PM2/systemd; see
   `apps/backend/docker-compose.prod.yml`).

### 4. Release (`.github/workflows/release-please.yml`)

Triggers on `push` to `master` _in parallel_ with the prod deploy. The
release-please bot reads `.github/release-please-manifest.json` (current
version), scans conventional commits since that version, opens a PR
`chore(main): release X.Y.Z` with the auto-generated `CHANGELOG.md` section
and the bumped manifest. The maintainer reviews and squash-merges — that
merge commit then triggers another `release-please` run which _creates_ the
tag and the GitHub Release and sets `isLatest: true`. See
[docs/release-process.md](./release-process.md) for full details.

---

## Environment matrix

| Env        | Host / Port                                                         | Branch   | Deploy workflow             | DB port       | `USE_MOCK_AI`   |
| ---------- | ------------------------------------------------------------------- | -------- | --------------------------- | ------------- | --------------- |
| Local dev  | `localhost:3030` + `:5173`                                          | `dev`    | none (manual `npm run dev`) | 5432 (docker) | n/a             |
| Staging    | `localhost:3031` + `:4173` (Tailscale `100.84.4.28:3031` + `:4173`) | `dev`    | `deploy-staging.yml`        | 5433          | `true`          |
| Production | `localhost:3030` + `:5173`                                          | `master` | `deploy.yml`                | 5432          | unset (real AI) |

> **Why two ports on prod?** Production's `:3030` is the NestJS backend
> container; `:5173` is the Vite dev server the frontend container serves.
> This is intentional — the frontend uses Vite's HMR for fast content
> iteration. See `apps/backend/docker-compose.prod.yml` for the wiring.

---

## Runbook

### 🩺 Oncall

You are the oncall. There is no rotation. The expected oncall surface is:

| Signal                         | Where to look                                                 | First action                                                                      |
| ------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Telegram calls stop publishing | `production.telegram.published` event counter in `/dashboard` | SSH to droplet, `docker logs backend --tail 100`                                  |
| Staging healthcheck failing    | `gh run list --workflow="Deploy to staging" --limit 3`        | Click the failed run, read step output                                            |
| Prod healthcheck failing       | `gh run list --workflow="Deploy to production" --limit 3`     | Same — plus check droplet disk (`df -h`)                                          |
| MTProto listener wedge         | `kol/ingestion` logs                                          | `docker restart backend` (Task 8 documents the deterministic wedge)               |
| Disk > 80%                     | SSH `df -h`                                                   | See **Disk full** below                                                           |
| Release tag wrong / missing    | `gh release list`                                             | See [docs/release-process.md §Recovery](./release-process.md#recovery-procedures) |

Escalation: there is no escalation. You are it.

**Quick health matrix** (run from your laptop):

```bash
# Staging
gh run list --workflow="Deploy to staging" --limit 3 --json conclusion,headBranch,createdAt
ssh CryptoGanster 'curl -sf http://localhost:3031/api/health && echo OK || echo FAIL'
ssh CryptoGanster 'curl -sf -o /dev/null http://localhost:4173/ && echo OK || echo FAIL'

# Production
gh run list --workflow="Deploy to production" --limit 3 --json conclusion,headBranch,createdAt
ssh CryptoGanster 'curl -sf http://localhost:3030/api/health && echo OK || echo FAIL'
ssh CryptoGanster 'docker ps --format "table {{.Names}}\t{{.Status}}"'
ssh CryptoGanster 'df -h / /var/lib/docker 2>/dev/null'
```

### ⏪ Rollback

**Default: `git revert` + redeploy.** Do not `git reset --hard` on `master`.
The droplet's `git -C /opt/onchain-bot rev-parse HEAD` after each deploy
gives you the exact deployed SHA, so:

```bash
# 1. Identify the bad commit
ssh CryptoGanster 'git -C /opt/onchain-bot log --oneline -5'

# 2. Revert it locally on dev (Husky blocks direct commits on master)
git checkout dev
git pull origin dev
git revert --no-edit <bad-sha>     # creates a new commit that undoes bad-sha
git push origin dev

# 3. Wait for CI + staging deploy to validate the revert
gh run watch                                      # or check the CI run
ssh CryptoGanster 'curl -sf http://localhost:3031/api/health'

# 4. Open PR dev → master, squash-merge
gh pr create --base master --head dev --title "revert: <original-commit-subject>"
gh pr merge --squash --delete-branch=false
```

The squash-merge creates a _new_ commit on master (no history rewriting), and
the prod deploy workflow will rebuild + restart the containers from the
reverted source. Because `--force-recreate` is part of the deploy, the bad
image is replaced with the reverted one within ~3 min of the squash-merge.

**Emergency: redeploy the previous container without a git revert.** Only
do this if you cannot immediately write a revert (e.g. the issue is in
`master` history itself, or CI is wedged):

```bash
# Re-run the last successful prod deploy workflow
gh run list --workflow="Deploy to production" --limit 10 --json databaseId,conclusion \
  | jq -r '.[] | select(.conclusion=="success") | .databaseId' | head -1
gh workflow run deploy.yml --ref master    # picks up the current master tip,
                                          # which is what you want unless
                                          # master has moved since.
```

This re-runs the same `rsync + build + recreate` against the current `master`
HEAD. It is not a "rollback" in the strict sense — it is a redeploy of the
last known-good commit on the running branch.

**For data-loss incidents**, the source of truth is
`/opt/onchain-bot/backups/pre-deploy-*.dump` (7-day retention,
`scripts/backup-db.sh`):

```bash
ssh CryptoGanster 'ls -lh /opt/onchain-bot/backups/ | tail -10'
ssh CryptoGanster 'docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" \
  alpha-meta-token-scanner-postgres pg_restore -U alpha_meta_token_scanner \
  -d alpha_meta_token_scanner --clean --if-exists \
  --role=alpha_meta_token_scanner < /opt/onchain-bot/backups/pre-deploy-20260824_031500.dump'
```

### 💾 Disk full

The droplet is a 20 GB VPS. The four biggest disk consumers, in order, are:

1. **Docker images + build cache** — `docker images` shows layers from each
   `docker compose build`. Mitigated by the `docker image prune` step in
   `deploy-staging.yml` (line 208) and the cron below.
2. **Crypto-news media downloads** — photo attachments downloaded by the
   crypto-news ingestion BC into `$UPLOADS_ROOT` (default `./uploads`).
   Mitigated by `CRYPTO_NEWS_MEDIA_RETENTION_HOURS` (default `48`, see
   `apps/backend/src/shared/common/config/app.config.ts:555`).
3. **Postgres WAL + base backups** — `/var/lib/postgresql` inside the
   container. Mitigated by `scripts/backup-db.sh` pruning > 7 days.
4. **`/opt/onchain-bot-staging` and `/opt/onchain-bot` source trees** —
   rsynced fresh on every deploy; only the `node_modules` and `dist`
   accumulate, and those are excluded by the rsync flags.

**Triage commands** (run on the droplet):

```bash
# Top-level disk usage
df -h / /var/lib/docker /opt/onchain-bot /opt/onchain-bot-staging 2>/dev/null

# Biggest directories
sudo du -h --max-depth=1 /opt/onchain-bot /opt/onchain-bot-staging 2>/dev/null | sort -hr | head -20
sudo du -sh /var/lib/docker/* 2>/dev/null | sort -hr | head -10

# Docker-specific
docker system df
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" | sort -k4 -hr | head -20

# App-specific
sudo du -sh /opt/onchain-bot-staging/uploads/* 2>/dev/null | sort -hr | head -10
sudo du -sh /opt/onchain-bot/backups/* 2>/dev/null | sort -hr | head -10
```

**Mitigations, in order of safety:**

1. **Increase retention backoff (low risk).** Lower
   `CRYPTO_NEWS_MEDIA_RETENTION_HOURS` to `24` in
   `apps/backend/.env.production`. The
   `MediaRetentionCleanupScheduler` runs on a cron inside the backend
   process and prunes `$UPLOADS_ROOT` on the configured cadence. Setting
   it lower halves (or more) the media footprint immediately on next
   scheduler tick.

   ```bash
   # On the droplet
   grep -E '^CRYPTO_NEWS_MEDIA_RETENTION_HOURS=' /opt/onchain-bot/apps/backend/.env.production
   sudo sed -i 's/^CRYPTO_NEWS_MEDIA_RETENTION_HOURS=.*/CRYPTO_NEWS_MEDIA_RETENTION_HOURS=24/' \
     /opt/onchain-bot/apps/backend/.env.production
   # No restart needed — the env is read by the scheduler on each tick.
   ```

   > The plan's todo noted `CRYPTO_NEWS_MEDIA_RETENTION_HOURS=24` as
   > "already set" — at the time of writing (commit 4df782d) it is **not**
   > set in `apps/backend/.env.production`; the live value is the
   > `app.config.ts:555` default of `48`. The override above is the
   > production-ready 24 h value.

2. **Prune dangling Docker images (low risk).** Removes images older than
   72 h that are not referenced by any container:

   ```bash
   docker image prune --force --filter "until=72h"
   docker container prune --force
   docker network prune --force
   ```

3. **Full `docker system prune` (medium risk).** Removes **all** unused
   images, containers, networks, and build cache. Safe between deploys
   (the next `docker compose build` will rebuild), but it is also why we
   schedule it (see cron below) rather than running it ad-hoc:

   ```bash
   docker system prune --force
   ```

4. **Manual media prune (medium risk).** Force the retention scheduler to
   run _now_ and shrink the uploads tree. Use this if disk is critical
   and you cannot wait for the next tick:

   ```bash
   # From your laptop, hit the admin endpoint that triggers immediate retention cleanup
   curl -X POST -H "x-admin-token: $ADMIN_TOKEN" \
     http://localhost:3030/api/crypto-news/admin/retention/run
   ```

   If that endpoint does not exist, the manual fallback is:

   ```bash
   ssh CryptoGanster \
     'find /opt/onchain-bot-staging/uploads -type f -mtime +1 -delete 2>/dev/null; \
      find /opt/onchain-bot-staging/uploads -type d -empty -delete 2>/dev/null'
   ```

   This is _not_ the same as the scheduler — it ignores
   `CRYPTO_NEWS_MEDIA_RETENTION_HOURS` and just deletes anything older
   than 24 h. It is intended for emergencies only.

5. **Prune old DB backups (low risk).** The deploy script already prunes

   > 7 days, but if you have an out-of-band backup, you can prune more
   > aggressively:

   ```bash
   ssh CryptoGanster 'find /opt/onchain-bot/backups -maxdepth 1 -name "pre-deploy-*.dump" -mtime +3 -delete'
   ```

**Automated mitigation: cron job for `docker system prune`.** See the next
section.

---

## Cron: nightly `docker system prune`

`crontab` for the user that owns the self-hosted runner (`runner`):

```cron
# Nightly docker system prune at 02:00 UTC — reclaims ~1-3 GB/day
# --filter until=72h protects images built in the last 3 days (one full
# deploy cycle) from being pruned while a still-running container
# references them. Adjust the hour on droplet-time, not UTC.
0 2 * * * /usr/bin/docker system prune --force --filter "until=72h" >> /var/log/docker-prune.log 2>&1
```

**How to install (idempotent):**

```bash
# On the droplet
crontab -u runner -l 2>/dev/null | grep -q 'docker system prune' \
  || ( crontab -u runner -l 2>/dev/null; \
       echo '0 2 * * * /usr/bin/docker system prune --force --filter "until=72h" >> /var/log/docker-prune.log 2>&1' ) \
     | crontab -u runner -

# Verify
crontab -u runner -l 2>/dev/null | grep -E 'docker system prune'
# expected output:
#   0 2 * * * /usr/bin/docker system prune --force --filter "until=72h" >> /var/log/docker-prune.log 2>&1
```

**Why `--filter "until=72h"` and not the default?** `docker system prune`
removes all dangling images, but it also removes _untagged_ images that
might be in the middle of a `docker compose build` for an in-flight deploy.
The 72 h filter is a conservative backstop that aligns with the staging
deploy's `until=24h` filter (line 208 of `deploy-staging.yml`) plus a 48 h
margin for an in-progress prod deploy.

**Log location:** `/var/log/docker-prune.log` is rotated weekly by
`logrotate`'s default docker config (if installed). If you need to
diagnose, tail the log:

```bash
ssh CryptoGanster 'tail -50 /var/log/docker-prune.log'
```

**Expected nightly reclaim:** 1–3 GB, dominated by `<none>:<none>` images
left behind by `docker compose build` after a `up -d` that does not use
`--force-recreate`.

---

## Failure modes & first-responder steps

| Symptom                                                        | Cause                                                 | First action                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| CI `Tests` job fails on `dev` push                             | Backend or frontend unit test regression              | `gh run view --log-failed` — fix on a feature branch, push, re-run                                |
| CI `TypeScript Check` fails                                    | Type drift between BCs (often after a refactor)       | `npm run build` locally, fix, commit, push                                                        |
| `Branch Governance Check` fails on PR                          | Force-push on PR branch, or non-linear history        | `gh pr view --json commits` — rebase or recreate the branch                                       |
| Staging deploy fails on `Wait for backend healthcheck` (120 s) | Container stuck on migrations, env misconfig          | `ssh CryptoGanster 'docker logs onchain-bot-staging-backend --tail 100'`                          |
| Staging deploy fails on Tailscale probe                        | Tailscale daemon down, or socat service crashed       | `ssh CryptoGanster 'systemctl status tailscaled; systemctl status socat-backend-staging.service'` |
| Prod healthcheck fails, retry also fails                       | Bad migration, OOM, broken image                      | `ssh CryptoGanster 'docker logs onchain-bot-backend --tail 50'` — see **Rollback** above          |
| `release-please` does not open a PR                            | All commits since the last tag are `chore:` / `docs:` | Expected — no SemVer bump is warranted. Push a `feat:` or `fix:` to trigger the next cycle        |
| `release-please` opens a PR with a wrong version               | Conventional-commit prefix mis-classification         | See [docs/release-process.md §Recovery](./release-process.md#recovery-procedures)                 |
| Disk > 80%                                                     | See **Disk full** above                               | `df -h` then triage                                                                               |
| `Cannot connect to the Docker daemon` on droplet               | Docker daemon crashed                                 | `ssh CryptoGanster 'sudo systemctl restart docker'` (runner reconnects automatically)             |

---

## What this pipeline does NOT do

- **No preview environments per PR.** The droplet is too small to host
  ephemeral environments; staging is the only non-prod target.
- **No canary or blue/green deploys.** A single prod container is recreated
  in place via `docker compose up -d --force-recreate`.
- **No autoscaling self-hosted runner.** The runner is the droplet itself.
- **No external observability (Datadog, Sentry, etc.).** The only signal
  sources are GH Actions logs + `docker logs` + `df -h`.
- **No migration rollback automation.** Migrations are forward-only
  (TypeORM `synchronize: true` is dev-only). To revert a schema change,
  write a new migration that undoes it.

---

## Solo-developer branching workflow

This repository is maintained by a **single developer**. The branching
model is intentionally minimal and optimised for that constraint — it is
not a multi-team Git Flow. Every rule in
[`docs/branch-protection.md`](./branch-protection.md) and
[`GOVERNANCE.md`](../GOVERNANCE.md) is justified by this single-actor
model.

### The two and only two branches

| Branch (remote) | Role                                                        | Lifetime   |
| --------------- | ----------------------------------------------------------- | ---------- |
| `origin/master` | **Production source of truth.** Read-only mirror of `dev`.  | Permanent. |
| `origin/dev`    | **Working branch.** Every commit, every feature, every fix. | Permanent. |

Anything else on `origin/*` is drift and must be pruned. The
**Branch Governance Check** workflow fails any PR that introduces extra
remote branches.

### Local branch policy

| Local branch                                     | Role                                                                                                                                                    | May push?                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `dev`                                            | **The only branch you ever check out, commit on, or push from.** All work happens here.                                                                 | Yes                                                   |
| `master`                                         | **Optional read-only local mirror of `origin/master`.** Created by `git branch --track master origin/master` if you want to inspect production locally. | **Never.**                                            |
| `feat/*`, `fix/*`, `ci/*`, `chore/*`, `backup/*` | **Transient feature branches.** Always created off `dev`, always merged back to `dev`, always deleted after merge (locally and remotely).               | Only back to `origin/dev` — never to `origin/master`. |

### Why `dev` is the only working branch

For a solo developer:

- **No merge conflicts between feature branches** — there is only one
  branch.
- **No long-lived drift** — `master` and `dev` differ by exactly the
  squash-merge of the last release PR.
- **Husky + branch protection are belt-and-suspenders**, not a
  collaboration tool. They guard against accidents (pushing to the wrong
  ref) and against AI agents that try to commit straight to `master`.
- **The PR `dev → master` is the only promotion step.** It is also where
  `release-please` runs and where production deploys from.

### Day-to-day workflow

```bash
# 1. Always work on dev
git checkout dev
git pull --rebase origin dev

# 2. (Optional) Feature branch off dev for review isolation
git checkout -b feat/some-isolated-change
# ... work, commit, push
git push -u origin feat/some-isolated-change
gh pr create --base dev --head feat/some-isolated-change
# merge the PR (squash), then:
git branch -d feat/some-isolated-change
git push origin --delete feat/some-isolated-change

# 3. Promote dev to production
gh pr create --base master --head dev --title "chore(release): promote dev to master"
# merge (squash) — release-please + prod deploy fire automatically
```

### Why `master` exists locally (and why you must never push to it)

`master` is a **read-only mirror of `origin/master`**. It exists
locally so you can `git checkout master && git log` to inspect what is
running in production without an extra network round-trip. It is
**never** the target of:

- `git commit` (Husky pre-commit blocks this with a hard error).
- `git push` (Husky pre-push blocks this with a hard error).
- Any workflow that runs deploys — deploys are triggered by
  `merge → master` on GitHub, never by local pushes.

If you accidentally create commits on `master`:

```bash
git checkout master
git reset --hard origin/master   # ONLY when you are 100% sure you did not push
```

(`reset --hard` is destructive but safe here because Husky guarantees
nothing on `master` was ever pushed, and `origin/master` is the
authoritative source.)

### Branch hygiene (run weekly or when governance fails)

```bash
# 1. Prune deleted remote tracking refs
git fetch --prune

# 2. List local branches that are not dev or master
git branch | grep -vE '^\* dev$|^  master$'

# 3. Delete any local stale branches (safe — only deletes merged refs)
git branch -d feat/old-feature

# 4. If -d refuses (unmerged), force-delete only after confirming
#    the work is on origin/dev or already shipped:
git branch -D fix/abandoned-experiment

# 5. Confirm only the two expected remote branches exist
git ls-remote --heads origin
# expected: exactly two lines — refs/heads/dev and refs/heads/master
```

### Anti-patterns (solo-dev)

- **Do not create long-lived `feat/*` branches.** Squash-merge back to
  `dev` as soon as the change is reviewable. Long branches rot.
- **Do not push to `origin/master` from anywhere.** Use the PR. Always.
- **Do not keep `origin/feat/*`, `origin/fix/*`, `origin/ci/*`, etc.**
  They are governance failures. The workflow fails CI on them.
- **Do not create `release/*` branches.** `release-please` opens a PR
  onto `master` automatically; you just review and squash-merge it.

---

## Related documents

- [Branch Protection Policy](./branch-protection.md) — gate rules
- [Release Process](./release-process.md) — SemVer + tag flow
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — CI workflow
- [`.github/workflows/deploy-staging.yml`](../.github/workflows/deploy-staging.yml) — staging CD
- [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) — prod CD
- [`.github/workflows/branch-governance.yml`](../.github/workflows/branch-governance.yml) — governance check
- [`.github/workflows/release-please.yml`](../.github/workflows/release-please.yml) — release automation
- [`scripts/backup-db.sh`](../scripts/backup-db.sh) — pre-prod backup
- [`apps/backend/src/shared/common/config/app.config.ts`](../apps/backend/src/shared/common/config/app.config.ts) — env reference
- [`GOVERNANCE.md`](../GOVERNANCE.md) — overall branching model
