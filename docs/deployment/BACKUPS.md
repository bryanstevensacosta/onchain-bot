# Prod Backend Rolling Backups — Scheme + Restore Runbook

> **Scope:** prod backend DB (`alpha_meta_token_scanner`) on the Oracle server.
> **Canonical format from this scheme on:** `prod-backend-YYYYMMDD.dump.gz` (+ `.meta.txt`).
> **Out of scope:** ingestion DB + staging DB (untouched by this scheme — see §9);
> automatic restore (restore is manual-only, documented below); `uploads/` media
> (explicitly EXCLUDED — see §6).
>
> Plan: `.omo/plans/prod-backend-rolling-backup.md` · Media dossier (T8):
> `.omo/evidence/task-8-prod-backend-rolling-backup-media-dossier.md`.

---

## 1. Daily scheme + 7-day retention

`scripts/backup-db.sh` in opt-in daily mode:

```bash
BACKUP_MODE=daily BACKUP_BASENAME=prod-backend BACKUP_ORIGIN=cron|pre-deploy \
  bash scripts/backup-db.sh
```

| Item                          | Value                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| File name                     | `prod-backend-YYYYMMDD.dump.gz` (date via `date +%Y%m%d`; QA override `FAKE_DATE`)                                                                                                                                 |
| Sidecar                       | `prod-backend-YYYYMMDD.meta.txt` (date / sha256 / size / `BACKUP_ORIGIN`)                                                                                                                                          |
| Directory (Oracle server)     | `/opt/onchain-bot/backups/` (daily mode refuses any other `BACKUP_DIR` except `/data/backups/*` QA paths)                                                                                                          |
| Write path                    | dump to `$FILE.tmp` in the same filesystem → validate → atomic `mv`                                                                                                                                                |
| Validation (before overwrite) | `gzip -t` + size > 0 + `pg_restore --list` when available; `pg_dump` non-zero → delete `.tmp`, never overwrite                                                                                                     |
| Anti-empty guard              | if a current `prod-backend-*.dump.gz` exists and the new valid dump weighs **< 50%** of it → delete `.tmp`, do NOT overwrite, exit 4 with a `suspicious-size` line (real case: 55 KB dump vs 7.9 MB of 2026-09-14) |
| Disk pre-flight               | warn ≥ 80%, fail ≥ 90% or < 2 GB free (fail aborts BEFORE dumping)                                                                                                                                                 |
| Lock                          | exclusive `flock -n` on `/run/lock/onchain-backend-backup.lock` inside the script; loser exits 3 with a `locked` line                                                                                              |
| Prune                         | `find "$BACKUP_DIR" -maxdepth 1 -name 'prod-backend-*.dump*' -mtime +6 -delete` = **exactly 7 files** on disk                                                                                                      |
| Default (no env)              | byte-for-byte the old behavior: timestamped `pre-deploy-*` (ingestion path intact)                                                                                                                                 |

Exit codes: `0` ok · `2` invalid `BACKUP_ORIGIN` (only `cron|pre-deploy` allowed) ·
`3` lock held (`locked`) · `4` suspicious size (`suspicious-size`) · other non-zero on validation/disk failure.

## 2. Deploy overwrites the day (`BACKUP_ORIGIN` pisa-día)

Two writers share the same day-file; **same day = last-writer-wins**:

| Writer                              | `BACKUP_ORIGIN` | When                                 |
| ----------------------------------- | --------------- | ------------------------------------ |
| systemd timer (§3)                  | `cron`          | 03:00 UTC daily                      |
| `deploy.yml` step "Backup database" | `pre-deploy`    | every prod deploy, before migrations |

A deploy on day D **overwrites** `prod-backend-D.dump.gz` (no second file is created)
and the `.meta.txt` flips to `origin=pre-deploy`. Backup failure aborts the deploy
before migrations (`::error::` + non-zero step). Disk ≥ 80% emits `::warning::`;
≥ 90% or < 2 GB free emits `::error::` and aborts.

## 3. Timer 03:00 UTC + offsite mirror 03:20

- `infra/systemd/onchain-backend-backup.service` + `.timer`:
  `OnCalendar=*-*-* 03:00:00 UTC`, `User=runner`,
  `EnvironmentFile=/opt/onchain-bot/.backup-env` (holds `POSTGRES_PASSWORD`;
  the service validates `test -s` at start), logs to journald.
  The lock lives INSIDE the script (§1) — the unit adds no second lock.
- Install (on Oracle server, idempotent):

```bash
sudo cp infra/systemd/onchain-backend-backup.service infra/systemd/onchain-backend-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now onchain-backend-backup.timer
systemctl list-timers onchain-backend-backup.timer
```

- Offsite mirror at **03:20 UTC** (after the timer): `scripts/sync-backups-offsite.sh`
  copies the day-pair (2 files: `.dump.gz` + `.meta.txt`) and prunes the bucket to
  7 days with `rclone delete --min-age 7d --include 'prod-backend-*'`.
  Supports `--dry-run`. The script is the SOLE owner of remote deletion —
  **never configure bucket lifecycle** (verify with
  `aws --endpoint-url "$R2_ENDPOINT" s3api get-bucket-lifecycle-configuration --bucket "$R2_BUCKET"`,
  expected: `NoSuchLifecycleConfiguration`).

## 4. Offsite: R2 (default) / B2 (alternative, config-only)

- rclone **v1.69.0 linux-amd64**, installed from the pinned `.deb` at
  `https://downloads.rclone.com/v1.69.0/` with `sha256sum -c` of the published
  `.sha256` next to the `.deb`.
- Budget: 7 × ~8 MB ≈ 56 MB ≈ **~0.5% of the 10 GB R2 free tier**
  (R2 egress $0 — why R2 is the default; B2 = same script, different remote/endpoint).
- Credentials live in `/opt/onchain-bot/.rclone-offsite.env` (chmod 600,
  `test -s` at start) and in CI as GitHub Secrets. Secrets are masked
  (`::add-mask::`), never logged (`--log-level NOTICE`, no env dumps).

## 5. ESCALA ÚNICA — single threshold scale (T1 = T2 = T5)

One scale governs the script, the deploy step, and the daily health watchdog
(`.github/workflows/backup-health.yml`). **Fail cases fail the workflow; warn cases don't.**

| Signal                                             | Warn                                                                             | Fail                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------- |
| Disk                                               | ≥ 80% full                                                                       | ≥ 90% full **or** < 2 GB free |
| Newest local backup                                | —                                                                                | older than **26 h**           |
| Bucket size (of ~8 GB budget)                      | ≥ **6.4 GB** (80%)                                                               | **> 8 GB**                    |
| Local count `prod-backend-*.dump.gz`               | **≠ 7** (6 or 8 = transient 03:00–03:20 window, warn only — NEVER fail on count) | —                             |
| Offsite lag (newest bucket object vs newest local) | **> 26 h** behind                                                                | —                             |

## 6. EXCLUDED: backend `uploads/` media (T8 finding — RESTO-ACTIVO)

**`uploads/` is deliberately NOT backed up. Nothing in this scheme reads or writes it.**

### What is there (T8 dossier, read-only evidence 2026-09-19)

- `/opt/onchain-bot/apps/backend/uploads/` = **780 files / 242 MB**, still growing
  (~+273 files / +120 MB in 3 days — active daily writes, not a static leftover).
- Prod backend **already runs SSE** (`USE_SSE_INGESTION=true` effective in container
  `onchain-bot-backend-production`; legacy MTProto doubly dead:
  `INGESTION_TELEGRAM_MTPROTO_ENABLED=false` + `StubFeedMediaDownloader`
  throws since Fase 5 `dcf5342a`).
- The writer is the **pre-`1df4b8b9` persistent SSE cache** in the deployed image
  (`ghcr.io/...-backend:latest` built 2026-09-18T14:19:03Z):
  `process-next-queued-article.use-case.ts:441-442` (`1df4b8b9^`) saved to
  `uploads/crypto-news/media/<channelId>/`. The fix `1df4b8b9`
  (`fix(feed-publisher): tmp-download-and-delete media cache`, 2026-09-19)
  moved the cache to `os.tmpdir()/backend-media-<uuid>/` with `finally` cleanup —
  **not yet deployed at dossier time**.
- **No physical duplication on Oracle server:** backend-prod and ingestion-telegram mount
  the SAME host dir (`/opt/onchain-bot/apps/backend/uploads` → `/app/uploads` in
  both containers); 20/20 sampled backend files answer `200` on ingestion's
  `GET /api/media/...` (`127.0.0.1:3032`).
- Ads-library **IS in use** (prod: 8 rows `crypto_news_ad_media_library`, 2 ads,
  2 files in `uploads/crypto-news-ads-library/`) — the "0 bytes of ads" premise
  applies only to `uploads/crypto-news/media/`, not to the ads library.

### Why it is not backed up

1. `uploads/crypto-news/media/` is **ingestion-owned**: the owner (writer of record +
   72 h janitor `FeedRetentionCleanupScheduler`, lock `9_421_373`) is
   ingestion-telegram; the backend copy is a transient cache on a **shared mount** —
   backing it up would snapshot somebody else's data through a side window.
2. Deleting anything from the shared dir would damage ingestion serving (same bind-mount).
   The "duplication" extinguishes itself: write-stop (deploy image with `1df4b8b9`) + 72 h janitor.
3. The ads-library (few MB, backend-owned, no other copy) is a **future-backup candidate**,
   not a definitive exclusion — tracked as what-next below.

### What next (registered, NOT executed here)

1. Deploy the backend image containing `1df4b8b9`, verify **1 publish** with cache in `os.tmpdir`.
2. Declare `uploads/crypto-news/media/` exclusive property of ingestion-telegram (this section is that declaration).
3. **Delete nothing** from the shared volume.
4. Separately evaluate backing up `uploads/crypto-news-ads-library/` (small, backend-owned).

## 7. Restore runbook — BOTH DBs from `.gz`

> **Review checklist (mandatory):** any restore doc that shows `pg_restore < file.dump`
> WITHOUT `gunzip -c` is REJECTED — canonical format is `.dump.gz`, always decompress
> on the pipe. Verify integrity FIRST (`sha256sum -c`), restore SECOND.

### 7a. Backend DB (`alpha_meta_token_scanner`)

```bash
# 1. List + pick the day
ssh <Oracle> 'ls -lh /opt/onchain-bot/backups/prod-backend-*.dump.gz'
# 2. Verify integrity against the sidecar (date/sha256/size/origin)
ssh <Oracle> 'cd /opt/onchain-bot/backups && sha256sum -c prod-backend-YYYYMMDD.meta.txt'
# 3. Restore (decompress on the pipe — NEVER redirect the .gz straight into pg_restore)
gunzip -c /opt/onchain-bot/backups/prod-backend-YYYYMMDD.dump.gz | pg_restore --clean --if-exists -U alpha_meta_token_scanner -d alpha_meta_token_scanner --role=alpha_meta_token_scanner
# 4. Sanity
psql -U alpha_meta_token_scanner -d alpha_meta_token_scanner -c 'SELECT count(*) FROM typeorm_migrations;'
```

On the Oracle server the canonical invocation runs `pg_restore` inside the postgres
container (`docker exec -e PGPASSWORD=... onchain-bot-postgres-production ...`)
with the same `gunzip -c … | pg_restore --clean --if-exists` shape; for a data-loss
incident prefer the newest verified `.dump.gz` (≤ 26 h old per ESCALA ÚNICA §5).

### 7b. Ingestion DB (`alpha_meta_token_scanner_ingestion`)

Covered by its own path (NOT this scheme): `deploy-ingestion.yml` step
"Backup ingestion database" writes timestamped dumps to `/data/backups/ingestion/`
(`ingestion-backup-*.dump`, 7-day prune). Same pipe shape applies:

```bash
ssh <Oracle> 'ls -lh /data/backups/ingestion/ | tail -10'
gunzip -c /data/backups/ingestion/<file-if-gzipped> | pg_restore --clean --if-exists -U alpha_meta_token_scanner -d alpha_meta_token_scanner_ingestion --role=alpha_meta_token_scanner
# Uncompressed legacy dumps: pg_restore --clean --if-exists -d <db> < file.dump  (no gunzip)
```

## 8. Secrets provisioning + key rotation

Out-of-band on the Oracle server (never in repo, never in logs/summaries):

```bash
# On-host env files (owner runner, mode 600)
sudo install -m 600 -o runner /dev/null /opt/onchain-bot/.backup-env
sudo install -m 600 -o runner /dev/null /opt/onchain-bot/.rclone-offsite.env
# Then fill: POSTGRES_PASSWORD=...  /  R2_REMOTE/R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY=...
```

GitHub Secrets (CI reads them; offsite sync runs after deploys):

```bash
gh secret set R2_ENDPOINT
gh secret set R2_BUCKET
gh secret set R2_ACCESS_KEY_ID
gh secret set R2_SECRET_ACCESS_KEY
```

**Rotation:** generate the new key at the provider → `gh secret set` the changed
value(s) → rewrite the on-host file in place (`sudo tee` / editor, keep mode 600)
→ `rclone lsl "$R2_REMOTE:$R2_BUCKET"/` smoke-check (or `--dry-run` sync) →
revoke the old key at the provider. No redeploy needed (files are read at run time);
systemd units read them via `EnvironmentFile`, CI via Secrets.

## 9. DEPRECATED (docs-only): ingestion fallback block `deploy-ingestion.yml:88-96`

> **Docs-only deprecation — `deploy-ingestion.yml` was NOT edited in this change.**

The `|| { pg_dump … > ingestion-backup-$(date …).dump }` fallback inside the
"Backup ingestion database" step is deprecated: on fallback failure the step must
fail loudly instead of silently writing a second-format file. The backend daily
scheme is isolated from it by `BACKUP_BASENAME=prod-backend` + its own `BACKUP_DIR`.
(No staging/backup consumer depends on the fallback shape.)

## 10. Legacy cleanup — AUTOMATIC with gates (T11, live since 2026-09-20)

`scripts/cleanup-backups-legacy.sh`, weekly via
`infra/systemd/onchain-backup-legacy-cleanup.timer`
(**Sun 05:30 UTC**, after the drill so gate (b) reads a fresh result).
Exit code is ALWAYS 0: gates fail safe to no-op with a logged
`cleanup-skipped-<reason>` line. `DRY_RUN=1` prints the plan without
deleting or compressing. Per-file lines (`deleted/compressed/kept/skipped`)
plus a final summary with bytes reclaimed go to stdout/stderr (journald).
Lock-aware: when `/run/lock/onchain-backend-backup.lock` is HELD by a running
dump, the run skips everything (`cleanup-skipped-lock-held`); the script never
takes the lock itself.

Inventory (`ls -lh /opt/onchain-bot/backups/` at plan time):

| Entry                                        | Shape                     | Notes                                              |
| -------------------------------------------- | ------------------------- | -------------------------------------------------- |
| `pre-deploy-*.dump*`                         | timestamped, mixed        | old default-mode series, superseded by daily files |
| `prod-backend-*-*.dump` (2026-09-10 manuals) | **UNCOMPRESSED**, ~7.5 MB | manual dumps, other naming scheme, no `.gz`        |
| `prod-ingestion-*`                           | other basename            | top-level files only, in allowlist                 |
| `staging-*` (top-level files only)           | other scope               | in allowlist; subdir `staging/` NEVER touched      |

Exact allowlist (anything else on disk is untouched; rolling
`prod-backend-YYYYMMDD.dump.gz` / `.meta.txt` are NEVER matched even if a
glob could reach them; `find "$BACKUP_DIR" -maxdepth 1`, top-level regular
files only — subdirectories such as `ingestion/` and `staging/` are never
touched):

- `pre-deploy-*.dump.gz` older than 7 days (`-mtime +7`; keeps the week's
  deploy backups as extra net)
- `prod-backend-*-*.dump` UNCOMPRESSED legacy: `gzip -9` to a new `.gz` +
  `gzip -t` verify + sha BEFORE deleting the original (reversible first,
  the `.gz` stays on disk; never a bare delete)
- `prod-ingestion-*` top-level files only, any age
- `staging*` top-level files only, any age

All 3 gates (machine-verified every run, ALL must pass or nothing happens):

- (a) **>= 7 valid** `prod-backend-*.dump.gz` present (`gzip -t` each) AND the
  latest one's `.meta.txt` passes `sha256sum -c`.
- (b) **Drill fresh**: `$BACKUP_DIR/.rolling-status.json` exists with
  `last_drill.result=pass` AND drill age **< 10 days** (§12).
- (c) **Allowlist only** (§10 list above).

Live evidence 2026-09-20: cleanup ran against 2 valid rolling dumps —
gate (a) failed (`2 < 7`), zero deletions, `cleanup-skipped` logged. Correct
behavior: the gate held until the 7-day rolling window fills.

## 11. Review checklist (for this doc + future edits)

- [ ] Every restore line decompresses on the pipe (`gunzip -c … | pg_restore`) — a restore doc WITHOUT `gunzip` is REJECTED.
- [ ] Every restore line carries `--clean --if-exists`.
- [ ] Integrity (`sha256sum -c` + `.meta.txt`) precedes restore.
- [ ] Thresholds table matches ESCALA ÚNICA (§5) exactly — one scale everywhere.
- [ ] No `pre-deploy-*` file deleted outside the §10 allowlist + gates
      (automatic cleanup only; uncompressed legacy is compressed first, never bare-deleted).
- [ ] No workflow/script/systemd file edited in a docs change (`deploy-ingestion.yml`, `deploy-staging.yml`, `scripts/deploy.sh`, `scripts/backup-db.sh`, `deploy.yml`, systemd units, rclone script).
- [ ] No secret value in repo, logs, or summaries (names only; `::add-mask::` in CI).
- [ ] Media exclusion (§6) still declares ingestion ownership + deletes nothing.

## 12. Weekly restore drill (T10, live since 2026-09-20)

`scripts/backup-drill.sh`, weekly via
`infra/systemd/onchain-backup-drill.timer` (**Sun 05:00 UTC** — after the
04:00 daily health watchdog and clear of the 03:00 daily backup / 03:20
offsite sync; no overlap by design).

What it does:

1. Picks the latest `prod-backend-*.dump.gz` in `BACKUP_DIR`.
2. Verifies integrity: `gzip -t` + sha256 against the `.meta.txt` sidecar
   (meta line 1 is `<sha>  <basename>`, same contract `backup-db.sh` writes).
3. Restores it (`gunzip -c` on the pipe, NEVER straight `.gz` into
   `pg_restore`) into an EPHEMERAL `postgres:16-alpine` container (`--rm`,
   isolated, shifted host port 55433 — never 5432/5433/5434, never
   prod/staging/dev).
4. Asserts `pg_restore` exit 0 AND user-table count > 0 AND a row spot-check
   (largest public table returns >= 1 row).
5. Writes `$BACKUP_DIR/.rolling-status.json` (atomic `.tmp` + `mv`) for the
   dashboard widget (§13) and the cleanup gate (§10, gate b). Keys are STABLE:

```json
{
  "updated_at": "<ISO-8601>",
  "latest_file": "prod-backend-YYYYMMDD.dump.gz",
  "latest_age_h": 2.3,
  "count": 7,
  "disk_pct": 42,
  "last_drill": {
    "at": "<ISO-8601>",
    "result": "pass",
    "restored_tables": 52,
    "restored_rows": 174777
  }
}
```

Lock-aware: if `/run/lock/onchain-backend-backup.lock` is held by a running
dump, the drill exits 0 with a `drill-skipped-locked` notice instead of
competing (no second lock is taken). Any failure is loud in journal
(exit 1) and writes `result=fail` so the gate/widget never see a stale
green. Age/disk are reported with the ESCALA UNICA thresholds (§5) but the
proof itself runs regardless of age (staleness is the watchdog's job).

Live evidence 2026-09-20: **pass, 52 tables / 174777 rows** restored into the
ephemeral container.

## 13. Local-only mode + dashboard widget (T13)

**Offsite is pluggable, not required.** Until R2/B2 credentials are
provisioned (§4, §8), the scheme runs fully local: daily timer (§3) +
watchdog + drill (§12) + auto-cleanup (§10) need no bucket. The watchdog
(`backup-health.yml`) skips green with a `::notice::` when the `DROPLET_*`
secrets are missing, and degrades bucket/lag to warn-skip (never fail) once
SSH works but R2 does not; local backup age, count, and disk still enforce
the ESCALA UNICA (§5). Adding an offsite provider later is config-only
(env file + Secrets, §8) — zero code changes, and the "never configure
bucket lifecycle" rule (§3) still applies.

The `BackupHealthWidget` (dashboard, 30 s polling) renders the status JSON
(§12): verdict badge (GREEN/AMBER/RED), disk bar (`disk_pct`) + dump count,
newest file + age, bucket + offsite lag (`—` when unknown/local-only), last
drill time + result, and a stale-data notice when no recent backup exists.
Offline (fetch error) renders `Offline`, never a fake green.

## 14. Responsibilities — zero recurring

Recurring human responsibilities: **none**. The loop is closed:

- Daily backup 03:00 + offsite mirror 03:20 (§3), health watchdog 04:00 daily
  (§5), drill Sun 05:00 (§12), auto-cleanup Sun 05:30 (§10) — all scheduled,
  all fail-safe (cleanup no-ops, drill fails loud, watchdog fails the
  workflow only on fail cases).
- One-time human gates already passed: scheme design + drill live-pass
  (52 tables / 174777 rows, 2026-09-20) + cleanup live-skip verified
  (2 < 7, zero deletions) + timers enabled.

Operator decisions remaining (not recurring chores):

1. Offsite provider choice (R2 default vs B2, §4) + credential provisioning
   (§8) — local-only until then, by design.
2. PR approvals for future backup-scheme changes (thresholds, schedules,
   and contracts change only by reviewed PR — this doc documents, never
   redefines).

## 15. Portability note — GNU-first `stat`

Oracle scripts must try GNU `stat -c` FIRST and BSD `stat -f` second.
Reason (seen live 2026-09-20): on Linux `stat -f %m <file>` succeeds but
prints multi-line filesystem info (first line `File: "..."`), which breaks
`$(( ))` arithmetic under `set -u` (`File: unbound variable`) and aborts the
drill before any restore. `scripts/backup-drill.sh`, `cleanup-backups-legacy.sh`,
and `backup-db.sh` all follow the GNU-first order (`stat -c… || stat -f…`);
keep it that way in any new backup script.
