# market-data owner action queue

> Snapshot 2026-10-19/20. Names only — **never paste values here or in any
> commit**. Every item below was verified read-only (env-name presence via
> `docker exec … printenv <NAME>`, no value printed, no paid quota spent).
> Owner: Bryan. Nothing in this file blocks the staging service from
> serving; it lists what is dark or degraded because credentials/decisions
> are missing.

## 1. Start the 7-day staging soak (no credentials needed)

- Target: market-data **staging** `http://localhost:4001` on Oracle.
- Run one probe per day (the script is read-only):
  `docs/deployment/market-data-staging-soak.md` §3.
- Baseline + day 1 are filled in
  `docs/deployment/market-data-staging-soak.md` §6; keep the JSONL at
  `~/market-data-soak.jsonl`.
- Day 1 (2026-10-21): health 200 / 2 ms; snapshot `ready`;
  `providerErrors` 3; rows 39; TypeORM/429 0. Days 2-7 remain.
- Day-1 `providerErrors` are fast-path metadata/skips, not a staging
  outage: `onchain-direct` partial card plus `dev:fast-path` /
  `honeypot:fast-path` budget skips. Snapshot still served `ready`
  (`degraded=true`, `stale=false`). Track the same keys; 3 consecutive
  runs with the same key escalates per the runbook.
- This is the evidence gate for todo 8 (cutover + cleanup). Do not flip
  `USE_DATA_SERVICE_API` before 7 consecutive healthy days.

## 2. Provider keys — staging container (all empty as of 2026-10-20)

Measured present-but-empty (`len=0`) on
`onchain-bot-market-data-staging`:

| Variable                                    | Effect while empty                                         | Free source (owner action)                        |
| ------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `BIRDEYE_API_KEY`                           | OHLC token-level fallback, holder/dev legs dark            | https://bds.birdeye.so/ (free tier)               |
| `HELIUS_API_KEY` + `HELIUS_RPC_URL_MAINNET` | Solana keyed primary dark; public rotation carries traffic | https://dashboard.helius.dev/                     |
| `MORALIS_API_KEY`                           | EVM quote/security leg dark                                | rotate or close as `wontfix` (todo 27)            |
| `COINGECKO_API_KEY`                         | CoinGecko demo leg dark                                    | https://www.coingecko.com/en/developers/dashboard |
| `COINMARKETCAP_API_KEY`                     | CMC leg dark                                               | https://pro.coinmarketcap.com/account             |
| `ALCHEMY_API_KEY`                           | All EVM keyed RPC tiers dark; public rotation carries      | https://dashboard.alchemy.com/                    |
| `MOBULA_API_KEY`                            | Mobula price/markets legs dark                             | https://app.mobula.io/                            |
| `ETHERSCAN_API_KEY`                         | Holder-count leg dark (`tokenholdercount` is PRO-gated)    | https://etherscan.io/apis                         |
| `DRPC_API_KEY`                              | dRPC tier skipped silently                                 | https://drpc.org/                                 |
| `CHAINSTACK_API_KEY`                        | Chainstack tier skipped (also currently invalid, §3)       | https://console.chainstack.com/                   |
| `SHYFT_API_KEY`                             | Shyft Solana tier dark                                     | https://shyft.to/                                 |
| `PUMPDEV_API_KEY`                           | PumpDev launchpad/trading legs dark                        | owner dashboard                                   |
| `FLUXRPC_API_KEY`                           | FluxRPC tier dark                                          | https://fluxrpc.com/                              |

Free legs (DexScreener, GeckoTerminal, Solana/EVM public rotation) are
already carrying the pipeline; empty keys are **not** a staging outage.

## 3. Known broken / owner decisions (do not re-probe blindly)

1. **Helius keyed routing (todo 28)** — setting `HELIUS_API_KEY` alone
   routes nothing. The exact seam is `HELIUS_RPC_URL_MAINNET=<keyed URL>`
   (hostname-only appears in logs). Today both are empty.
2. **Alchemy networks 403 (todo 23)** — every EVM subdomain answered 403
   from the app's key earlier. Owner must enable the networks in the
   Alchemy dashboard; generating a new key without enabling apps repeats
   the 403.
3. **Chainstack 401 `Access token missing or invalid` (todo 40)** — the
   Platform Bearer is not a node token. Owner must swap in the node token
   or drop the tier; the code already skips it.
4. **Moralis 401 `Free usage paused` (todo 27)** — rotate or mark
   `wontfix`; the code skips it while empty.
5. **Dexter staging `.env.staging` stale credential** — operator-owned on
   Oracle; do not copy prod values into staging.
6. **BSC Liq samples + `carry 1000K → 1M`** — still open from the dexter
   plan; needs an owner decision, not a code change.
7. **Wave 0 gateway `:4070`** — still open; unrelated to the market-data
   staging lane.

## 4. Production lane (do NOT dispatch)

- Artefacts exist: `.github/workflows/deploy-market-data-prod.yml` +
  `apps/market-data/docker-compose.prod.yml` + the updated
  `.env.production.template`.
- The lane is **DORMANT**. Preconditions before any dispatch:
  1. explicit owner approval for the Wave 4 rollout;
  2. `/opt/onchain-bot/apps/market-data/.env.production` placed on Oracle;
  3. `lsof -i :4002 -i :5449 -i :6396` free;
  4. a 7-day staging soak with no unhealthy day;
  5. the credential policy decision (compose defaults vs real prod creds)
     applied to compose + workflow one-offs in the SAME change.
- Nothing was dispatched, no `master` merge was performed.
