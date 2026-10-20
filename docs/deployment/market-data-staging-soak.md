# market-data staging 7-day soak

> Purpose: produce the evidence the Tramo 3 plan requires for todo 8
> ("Staging 7d + cutover + cleanup"): seven consecutive days of healthy
> market-data staging at `:4001` before any `USE_DATA_SERVICE_API` cutover
> or cleanup. This runbook is read-only: no deploys, no flag flips, no
> schema or data changes.

## 1. Scope

- **Target:** market-data **staging only** — `http://localhost:4001` on
  Oracle (compose project `onchain-bot-market-data-staging`, service
  `market-data`, container `onchain-bot-market-data-staging`).
- **Probes (GET only):** `/api/health`, `/api/v1/chains`, and
  `/api/market-data/snapshot?chain=bsc&address=<CAKE>`.
- **DB (read-only count):** `onchain_bot_market_data_staging` on container
  `onchain-bot-market-data-postgres-staging` — `SELECT count(*) FROM
snapshot_history`.
- **Out of scope:** production, `USE_DATA_SERVICE_API` flips, migrations,
  deploys, provider-key rotation, backfills.
- **Auth:** `MARKET_DATA_API_KEY` is read on the host from the RUNNING
  container env (`docker exec … printenv`) into the shell and is never
  printed. `.env.staging` is operator-owned and NOT readable by the SSH
  user — do not chmod it to run this probe. Values never leave the host.

## 2. One-time setup

The script is tracked at `scripts/market-data-soak-check.sh` and is
materialized on the host by the staging deploy (verified
`/opt/onchain-bot-staging/scripts/market-data-soak-check.sh`, run
`af8611ad`, 2026-10-20). If it is missing, copy it once:

```bash
scp scripts/market-data-soak-check.sh OracleDroplet:/tmp/market-data-soak-check.sh
```

Probe values (all optional, defaults in the script header):

| Variable              | Default                                      | Notes                                      |
| --------------------- | -------------------------------------------- | ------------------------------------------ |
| `BASE_URL`            | `http://localhost:4001`                      | loopback on the Oracle host                |
| `MARKET_DATA_API_KEY` | unset                                        | sent as `x-api-key`, never echoed          |
| `OUT_FILE`            | `logs/market-data-soak.jsonl`                | one JSON line appended per run             |
| `SNAPSHOT_CHAIN`      | `bsc`                                        | CAKE token probe                           |
| `SNAPSHOT_ADDRESS`    | `0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82` | CAKE on bsc                                |
| `PSQL_CONTAINER`      | unset (DB probe skipped)                     | set to enable the `snapshot_history` count |
| `TIMEOUT`             | `15`                                         | seconds per request                        |

## 3. Daily command

Run once per day (or more often; every run appends one line — the daily
table takes one row per day):

```bash
ssh OracleDroplet

export MARKET_DATA_API_KEY="$(docker exec \
  onchain-bot-market-data-staging printenv MARKET_DATA_API_KEY)"

PSQL_CONTAINER=onchain-bot-market-data-postgres-staging \
  OUT_FILE="$HOME/market-data-soak.jsonl" \
  bash /opt/onchain-bot-staging/scripts/market-data-soak-check.sh
```

- Exit `0` = health returned HTTP 200 (the only fatal probe).
- Exit `1` = health failed; the JSON line is still written with
  `health_ok:false` and `health_http` set (`0` = connection failed).
- Chains/snapshot failures (`401` without a key, `5xx`, timeouts) are
  recorded, never fatal.
- If the script is still under `/tmp`, use
  `bash /tmp/market-data-soak-check.sh` instead.

Optional helper to print the last run compactly:

```bash
tail -n 1 "$HOME/market-data-soak.jsonl" | jq .
```

## 4. Daily log checks (fill the TypeORM/429 columns)

```bash
# TypeORM / DB connectivity (expect 0 lines)
docker logs --since 24h onchain-bot-market-data-staging 2>&1 \
  | grep -icE 'QueryFailedError|ECONNREFUSED|Connection terminated|reconnect'

# Provider 429 / quota pressure (expect 0 lines; fail-open is by design,
# but a storm means a provider budget is exhausted)
docker logs --since 24h onchain-bot-market-data-staging 2>&1 \
  | grep -icE '429|rate limit|quota'
```

## 5. JSONL record

Each line is self-contained; fields the parser could not recover are
`null` (the run still records). `jq` is used when present and is not
required.

| Field                                         | Meaning                                              |
| --------------------------------------------- | ---------------------------------------------------- |
| `ts`                                          | UTC ISO-8601 timestamp of the run                    |
| `base_url`                                    | probe target                                         |
| `health_http`, `health_ms`, `health_ok`       | health code, latency, code == 200                    |
| `chains_http`, `chains_count`, `chains_keyed` | chains code, array length, key was sent              |
| `snapshot_chain`, `snapshot_address`          | token probed                                         |
| `snapshot_http`, `snapshot_ms`                | snapshot code and latency                            |
| `snapshot_status`                             | `ready`, `pending`, or `invalid` (response `status`) |
| `snapshot_sources`                            | response `sources` array                             |
| `snapshot_provider_errors`                    | number of keys in response `providerErrors`          |
| `snapshot_degraded`, `snapshot_stale`         | response booleans                                    |
| `db_snapshot_history_rows`                    | `snapshot_history` row count, `null` when skipped    |

## 6. Results table

Baseline is intentionally empty: fill each cell from the measured run.
Do **not** pre-fill or reconstruct values from memory.

| Day | Date | Health | Latency (ms) | Snapshot status | providerErrors | TypeORM errors | Rows | Notes |
| --- | ---- | ------ | ------------ | --------------- | -------------- | -------------- | ---- | ----- |
| 1   | —    | —      | —            | —               | —              | —              | —    | —     |
| 2   | —    | —      | —            | —               | —              | —              | —    | —     |
| 3   | —    | —      | —            | —               | —              | —              | —    | —     |
| 4   | —    | —      | —            | —               | —              | —              | —    | —     |
| 5   | —    | —      | —            | —               | —              | —              | —    | —     |
| 6   | —    | —      | —            | —               | —              | —              | —    | —     |
| 7   | —    | —      | —            | —               | —              | —              | —    | —     |

## 7. Thresholds and escalation

| Signal                          | Trigger                                                                                                      | Action                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health                          | Any run with `health_http != 200`                                                                            | Check `docker ps` / `docker logs --tail 200 onchain-bot-market-data-staging`; if not healthy within 10 minutes, use the rollback lane (§8).               |
| Latency regression              | `health_ms` above 1000 ms on 3 consecutive days, or above 2× the trailing 3-day median on 3 consecutive days | Compare with container logs and host load; investigate before cutover even if health stays 200.                                                           |
| TypeORM errors                  | Any `QueryFailedError`, `ECONNREFUSED`, `Connection terminated`, or reconnect line                           | Restart/inspect postgres; if it recurs on 2 consecutive days, roll back and investigate. Record every occurrence in Notes.                                |
| Provider 429 / quota storm      | ≥ 20 matching log lines in 24 h, or the same `snapshot_provider_errors` key on 3 consecutive runs            | Confirm fail-open (`snapshot_status` should still serve `ready`/{stale}); check provider quota/keys. A storm with unexplained non-ready status escalates. |
| Snapshot not `ready`            | `snapshot_status != ready` on 3 consecutive daily runs for CAKE                                              | Inspect `snapshot_sources`/`snapshot_provider_errors` and provider keys; do not cut over while the canary token is not `ready`.                           |
| Chains count drift              | `chains_http != 200`, or `chains_count` differs from the catalog in `apps/market-data/AGENTS.md` (6 today)   | Verify the deployment and the catalog; record the observed count.                                                                                         |
| Rollback happened in the window | Any rollback dispatch                                                                                        | The 7-day count restarts on the first healthy day after the rollback; keep the prior observations in Notes.                                               |

## 8. Rollback lane

Dispatch-only (never automatic; staging rollbacks are operator decisions):

```bash
gh workflow run deploy-market-data-staging.yml --ref dev \
  -f lane=rollback-market-data-staging

gh run list --workflow=deploy-market-data-staging.yml --limit 3
```

The lane re-raises the pinned `:staging-prev-market-data` image with a
local retag and recreate (no `docker compose pull`), gates on
`:4001/api/health`, and reports the measured downtime window. Use it when
health cannot be restored within 10 minutes, or when the TypeORM/DB
checks fail twice consecutively.

## 9. Evidence path

Evidence lives outside git (`.omo/evidence/` is gitignored):

```text
.omo/evidence/market-data-staging-soak/
├── soak.jsonl        # copy of $HOME/market-data-soak.jsonl (all runs)
└── soak-report.md    # completed §6 table + incident notes + decision
```

Archive at the end of the window (or after any incident):

```bash
mkdir -p .omo/evidence/market-data-staging-soak
scp OracleDroplet:~/market-data-soak.jsonl \
  .omo/evidence/market-data-staging-soak/soak.jsonl
```

Keep the host JSONL in place until the todo-8 decision is recorded.

## 10. Exit criteria for todo 8

The soak closes only when **all** of the following hold:

1. **7 consecutive days** with at least one recorded run per day (one JSON
   line per day minimum in `soak.jsonl`; no gaps in the §6 table).
2. **No unexplained errors** in the window: no health failure, no TypeORM
   reconnect/query errors, no provider 429 storm, and no non-`ready`
   snapshot beyond documented transients. Every incident has a written
   explanation and resolution in Notes; a rollback restarts the 7-day
   count per §7.
3. **Smoke green** at the end of the window: the health probe returns
   `{"status":"ok"}` (`curl -sf http://localhost:4001/api/health`), and
   the deploy workflow's post-deploy smoke (health + informational
   `/api/v1/chains` probe) is green on the last deploy of the window.
4. **Rollback rehearsal recorded** once (plan todo 8): dispatch the §8 lane
   in a controlled window, record the run id and measured downtime in
   Notes.
5. **Report completed:** every §6 cell filled with measured values (no
   `—` in Date/Health/Latency/Snapshot status/providerErrors/TypeORM
   errors/Rows) and `soak.jsonl` archived at the evidence path.

Only then may todo 8 proceed to the cutover/cleanup steps (the
`USE_DATA_SERVICE_API` flip itself is a separate operator action and is
not part of this runbook).
