# Dexter deploy secrets (Wave 2) — NAMES ONLY, values live on the droplet

> NEVER commit real values. `.env.staging` lives at
> `/opt/onchain-bot-staging/apps/dexter-onchain-bot/.env.staging` and
> `.env.production` at `/opt/onchain-bot/apps/dexter-onchain-bot/.env.production`.
> Staging path confirmed present on Oracle 2026-10-18 (operator-owned; the
> deploy workflow rsync excludes `.env*`, so it is never synced or
> deleted). Prod path PENDING — `/opt/onchain-bot/apps/dexter-onchain-bot/`
> is not provisioned yet (prod workflow dormant until the master merge
> gate; operator places the file at the Wave 4 rollout).
> Templates: `.env.staging.template` / `.env.production.template` (placeholders only).

## Verification against templates (2026-10-10)

Every var below exists in BOTH templates (empty placeholder). Compose-level
vars (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DEXTER_REDIS_URL`,
`REDIS_PASSWORD`) resolve via compose defaults (`:-onchain_bot`, `redis://…`)
plus `DATABASE_URL`, byte-identical to the staging canon — no missing template
entries, nothing added.

## Required vars (per env, DISTINCT secrets per env)

| var                                 | staging template                    | prod template                    | notes                                                                            |
| ----------------------------------- | ----------------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| `DEXTER_BOT_TOKEN`                  | empty                               | empty                            | lookup-bot token, direct-leg only (deprecated); gateway leg resolves server-side |
| `BOT_USERNAME`                      | empty                               | empty                            | white-label deep-link username; empty = live-resolved at bootstrap               |
| `DEXTER_WEBHOOK_SECRET`             | empty                               | empty                            | webhook ingress HMAC                                                             |
| `DEXTER_WEBHOOK_URL`                | — (set on droplet)                  | — (set on droplet)               | public URL of the env's webhook endpoint                                         |
| `MARKET_DATA_API_KEY`               | empty                               | empty                            | upstream market-data key (`:4001` staging / `:4002` prod)                        |
| `BOTS_GATEWAY_CLIENT_ID`            | empty                               | empty                            | gateway client id (`admin`-scoped for vault migration)                           |
| `BOTS_GATEWAY_CLIENT_SECRET`        | empty                               | empty                            | gateway client secret                                                            |
| `DEXTER_BOT_VAULT_ID`               | empty                               | empty                            | vault id of the bound bot                                                        |
| `DEXTER_INGRESS_SECRET`             | empty                               | empty                            | gateway→dexter ingress secret                                                    |
| `DATABASE_URL` (PG password inside) | `<STAGING_PG_PASSWORD>` placeholder | `<PROD_PG_PASSWORD>` placeholder | `onchain_bot_dexter_staging` / `onchain_bot_dexter`                              |
| `REDIS_URL` / `REDIS_PASSWORD`      | compose default                     | compose default                  | droplet may set `REDIS_PASSWORD` if redis is locked down                         |

## Non-secret env pins (already in templates, kept in sync per env)

`NODE_ENV`, `DEXTER_ENABLED`, `DEXTER_PORT=4060` (container; host mapping
lives in compose), `DEXTER_INGEST_MODE=webhook`, `BOTS_GATEWAY_URL`
(`:4071` staging / `:4070` prod), `MARKET_DATA_URL` (`:4001`/`:4002` hosts),
`DEXTER_SEND_MODE=gateway`, `DATABASE_ENABLED=true`, `DATABASE_SYNCHRONIZE=false`.
