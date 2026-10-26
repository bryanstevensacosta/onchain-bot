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

**Re-baseline 2026-10-20 (post-fix).** The day-0 probe caught a real
schema drift: `snapshot_history.sources` was `text` while the entity maps
`text[]`, so the 01:19Z line served `sources` as single characters. The
fix (`a5fd38e0`: migration `1775000000000-FixSnapshotHistorySourcesArray`
plus `normalizeHistorySources`) is live; the validated baseline is the
01:33Z run — `stale:true`, `sources: [dexscreener, geckoterminal,
evm-rpc]`, 33 rows, health 3 ms. Start day 1 after that deploy and ignore
the pre-fix line.

| Day | Date       | Health | Latency (ms) | Snapshot status | providerErrors | TypeORM errors | Rows | Notes                                                                                                                                                                         |
| --- | ---------- | ------ | ------------ | --------------- | -------------- | -------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 2026-10-21 | 200    | 2            | ready           | 3              | 0              | 39   | chains=7; providerErrors keys `onchain-direct`/`dev:fast-path`/`honeypot:fast-path`; snapshot_ms=1593; degraded=true; stale=false                                             |
| 2   | 2026-10-22 | 200    | 1            | ready           | 1              | 0              | 48   | chains=7; providerErrors key `swr-now`; snapshot_ms=39; degraded=false; stale=true; sources `dexscreener`/`geckoterminal`/`evm-rpc`; 429-log-lines=5 (<20 threshold)          |
| 3   | 2026-10-23 | 200    | 3            | ready           | 4              | 0              | 80   | chains=7; snapshot_ms=1257; degraded=true; stale=false; 429-log-lines=2; deploy 39942801522 (fix 5) green; health p95 9.9 ms n=22 (20.1 h window, incomplete)                 |
| 4   | 2026-10-24 | —      | —            | —               | —              | —              | —    | **NO RUN** — daily soak did not execute (gap; see continuity note)                                                                                                            |
| 5   | 2026-10-25 | —      | —            | —               | —              | —              | —    | **NO RUN** — daily soak did not execute (gap; see continuity note)                                                                                                            |
| 6   | 2026-10-26 | 200    | 3            | ready           | 9              | 0              | 84   | chains=7; snapshot_ms=2203; degraded=false; stale=false; sources `dexscreener`/`evm-rpc`; 429-log-lines=9 (<20); deploys 40308277602 (dexter) + 40308277696 (1H fields) green |
| 7   | 2026-10-27 | —      | —            | —               | —              | —              | —    | —                                                                                                                                                                             |

**Continuity gap (days 4-5, 2026-10-24 / 2026-10-25).** The daily soak
run did not execute on either day: `~/market-data-soak.jsonl` has no
line between `2026-10-23T11:06:02Z` and `2026-10-26T10:43:52Z`. The
hourly health sampler kept running through the whole gap (93 lines on
host, 24/24 hours present in the 24 h window read on 2026-10-26), so
liveness evidence exists — but §10 exit criterion #1 asks for one
recorded run per consecutive day, and reconstructing the missing lines
is forbidden (measured values only). Consequence: as written, the
streak restarts at day 6 and the earliest honest close is
**2026-11-01**. Owner decision pending: either accept the sampler as
continuity proof for a reworded criterion, or run the daily script
through 2026-11-01 before the cutover review.

**Validation note (2026-10-22) — how to read a staging snapshot.**
`status`/`stale` describe the SERVE, not the code version. When the
newest `ready` row is older than 30 s, the service answers with the
SWR-now latency path and, by design (`LATENCY PACKAGE` in
`apps/market-data/AGENTS.md`), that body carries `venue: null`,
`pairCreatedAt: null` and `launchpad: null` while the background refresh
runs. Verify live extras only on a NON-stale body (request once, then
again inside the 30 s cache window). Likewise, a live
`geckoterminal: retry exhausted (… http 429)` line means the Gecko legs
were fail-open that pass: price/FDV/change/volume/liquidity come back
`null` and the card is honest-thin (it is not a regression). Two such
passes on 2026-10-22 produced `venue: pancakeswap_v2` +
`pairCreatedAt: 2026-10-14T14:30:02.000Z` on the non-stale body and
`null` on the Gecko-abandoned one — same build, different upstream.

**Card-data verification note (2026-10-22, post-deploy).** The dexter
staging preview of the v16 compact body against KODA
(`0xd377…49cF`) rendered every target row — header icon, name link,
`[FDV/change] $SYMBOL`, chain/venue, USD, FDV ⇨ ATH [`age`], Liq +
`⚠️🔒`, Vol ⋅ Age, and the `🍯 SIM: OK ⋅ T:` line — with
`truncated=false` and all 15 placeholders used. It was PREVIEW ONLY:
no template body was written and nothing was activated. Live values
differ from the Rick reference only in the data itself: native change
`0%` (Rick `-3%`), volume `2` vs `32`, liquidity `389` vs `396`, and
ATH `2.5K [8d]` vs `2.6K [7d]` (one day of capture time plus the
seeded peak-day candle). The same window caught a real defect: the
todo-68 ATH seed stored the caller's checksummed EVM address while
`findFdvAth`/`findAnchorAt` query case-SENSITIVE lowercase identities,
so every seeded ATH row was invisible on the DB path — `seeded`
stayed `false`, the seed retried on each request, and the card fell
back to the live max. Fixed the same day (`6ddbe5f3`): writes
normalize `key`/`chain`/`address`, migration
`1776000000000-NormalizeSnapshotHistoryAddressCase` repaired the
pre-fix rows (staging: 33 mixed-case rows → 0 of 69), and KODA then
served `2483.97 at 2026-10-14T00:00:00.001Z` instead of `751.39`.
The repair is data-only and can raise ATH on any token whose
historical seed was previously invisible — expected, never a
regression to "fix".

**Hourly health sampler (installed 2026-10-22).** The daily table alone
cannot support the 24 h p95 < 500 ms cutover gate, so the staging host
now runs `onchain-market-data-health-probe.timer` (sources:
`scripts/market-data-health-probe.sh` +
`infra/systemd/onchain-market-data-health-probe.{service,timer}`). It
performs ONE loopback `GET :4001/api/health` per hour — no provider
calls, no DB access — and appends one JSONL line to
`/home/ubuntu/market-data-health-24h.jsonl`. Read the window with:

```bash
ssh OracleDroplet 'jq -r "select(.ts > (now - 86400 | todate)) | .ms" \
  /home/ubuntu/market-data-health-24h.jsonl | sort -n | \
  awk "{a[NR]=\$1} END{ i=int(NR*0.95); if (i < NR*0.95) i++; \
    print \"p95_ms=\" a[i] \" n=\" NR }"'
```

The sampler only measures the health edge; snapshot latency stays a
daily-soak number (`snapshot_ms` in §6).

**Day 3 — fix 5 (Flap BSC launchpad) + deploy `39942801522`.** Staging
redeployed green at ~11:03Z (image `staging-latest`, container healthy,
health `{"status":"ok"}`). The Rick-reference token `0xcEb8…7777` (BSC)
now serves `launchpad: {id: flap, name: Flap, url: https://flap.sh/bnb/…}`
on a non-stale body, with `venue: pancakeswap v2` and
`pairCreatedAt: 2026-10-14T18:08:53.000Z` intact. First resolve rode the
keyless page fallback (Alchemy `alchemy_getAssetTransfers` was canceled at
the 2s detector deadline on the free tier; log `flap page corroborated`);
the 14d positive cache then made the next resolves instant
(`flap-cache hit`, `tailMs=400`). Residual, data-only: the todo-68 ATH
seed row for this token is absent on staging (`snapshot_history` shows
only live rows), so `fdvAth` is the live clamp (≈2.1K, ~1 min) instead of
the 60.5K peak seeded in dev; Gecko day calls remain under 429 pressure
(2 matching log lines in 24 h). Not a template defect — the v16 body was
not changed. v16 stays written to the INACTIVE `RickBurpBot` row
(sha256 `6bc4f1b1…c51354`, `version=17`, `isActive=false`); no activation.
Health sampler read at `2026-10-26T10:45Z`: **p95 13.9 ms, n=24** over
`2026-10-25T11:00Z → 2026-10-26T10:00Z` — a FULL 24 h window (min
1.4 ms, max 14.3 ms), far under the 500 ms cutover gate. Supersedes the
partial read of `2026-10-23` (p95 9.9 ms, n=22, 20.1 h).

**1-hour row lane (2026-10-26, staging only).** `market-data` now
carries `volume1hUsd`/`priceChange1h`/`txns1hBuys`/`txns1hSells` on the
snapshot quote (pair-level, absent → `null`) and dexter renders the
composed `{{market1hRow}}`; deploys `40308277602` (dexter) and
`40308277696` (market-data) are green. Live staging probe
(`solana:48hn…pump`): `volume1hUsd=192.71`, `priceChange1h=-0.85`,
`txns1hBuys=5`, `txns1hSells=5` → `📉 1H: 193 ⋅ -0.8% 🅑 5 Ⓢ 5` in the
preview. DATA GAP (not a template defect): for the BSC Flap token
`0xcEb8…7777` DexScreener returns `pairs: null` (validated against
`token-pairs`, `latest/dex/tokens` and `search`), so all four fields
stay `null` and the row is silent by contract; GeckoTerminal's best
pool does carry `volume_usd.h1="0.0"`, `price_change_percentage.h1="0"`
and `transactions.h1={0,0}` but the pool harvest only reads `h24`
(todo 72 scope) — extending it is an owner decision, not a bug.

## 7. Thresholds and escalation

| Signal                          | Trigger                                                                                                                                                               | Action                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health                          | Any run with `health_http != 200`                                                                                                                                     | Check `docker ps` / `docker logs --tail 200 onchain-bot-market-data-staging`; if not healthy within 10 minutes, use the rollback lane (§8).               |
| Latency regression              | `health_ms` above 1000 ms on 3 consecutive days, or above 2× the trailing 3-day median on 3 consecutive days                                                          | Compare with container logs and host load; investigate before cutover even if health stays 200.                                                           |
| TypeORM errors                  | Any `QueryFailedError`, `ECONNREFUSED`, `Connection terminated`, or reconnect line                                                                                    | Restart/inspect postgres; if it recurs on 2 consecutive days, roll back and investigate. Record every occurrence in Notes.                                |
| Provider 429 / quota storm      | ≥ 20 matching log lines in 24 h, or the same `snapshot_provider_errors` key on 3 consecutive runs                                                                     | Confirm fail-open (`snapshot_status` should still serve `ready`/{stale}); check provider quota/keys. A storm with unexplained non-ready status escalates. |
| Snapshot not `ready`            | `snapshot_status != ready` on 3 consecutive daily runs for CAKE                                                                                                       | Inspect `snapshot_sources`/`snapshot_provider_errors` and provider keys; do not cut over while the canary token is not `ready`.                           |
| Chains count drift              | `chains_http != 200`, or `chains_count` differs from the catalog in `apps/market-data/AGENTS.md` (7 today: ethereum, solana, bsc, base, arbitrum, polygon, robinhood) | Verify the deployment and the catalog; record the observed count.                                                                                         |
| Rollback happened in the window | Any rollback dispatch                                                                                                                                                 | The 7-day count restarts on the first healthy day after the rollback; keep the prior observations in Notes.                                               |

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
