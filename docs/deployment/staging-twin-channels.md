# Staging twin: channel seeding mini-guide (per-env-ingestion T3)

> Twin base URL on the droplet: `http://localhost:3033` (host) → container `:3031`.
> The twin starts EMPTY by design (no seed, no prod mirror). All routes below
> follow `apps/ingestion-telegram/docs/guides/ADD_FEED_SOURCE.md` with `:3033`
> substituted for the singleton ports. NEVER run these against `:3032` (prod
> singleton) — seeding prod from this guide is out of scope and forbidden.

## 0. Preconditions (operator, before seeding)

1. Twin compose up: `docker compose -f docker-compose.staging-ingestion.yml up -d`
   (project `onchain-bot-staging-ingestion`, T1). The twin net is
   `external: true` — it must exist first: boot the staging stack once
   (`docker-compose.staging.yml` creates `onchain-bot-staging-net` as its
   default net), or `docker network create onchain-bot-staging-net` by hand.
2. Twin serves: `curl -sf http://localhost:3033/api/feed/sources` → `200` with
   `[]` (explicit-empty-OK: empty array is the expected fresh-twin state, not
   an error).
3. Staging backend repointed: `INGESTION_TELEGRAM_URL` =
   `http://onchain-bot-ingestion-telegram-staging:3031` in BOTH
   `docker-compose.staging.yml` (`environment:`, wins at runtime) AND the real
   droplet file `/opt/onchain-bot-staging/apps/backend/.env.staging`
   (gitignored — template alone does not run). Verify after recreate:
   `docker exec onchain-bot-backend-staging printenv INGESTION_TELEGRAM_URL`.
4. Staging frontend baked with the twin upstream (image built with
   `VITE_APP_ENV=staging`; see checkpoint §3).

## 1. Seed 2–3 test channels (KOL type, explicit)

Pick 2–3 low-noise test channels. `type:"kol"` MUST be explicit (omitted type
defaults to `crypto-news`, which starts media downloads):

```bash
TWIN=http://localhost:3033
curl -sf -X POST $TWIN/api/feed/sources \
  -H 'Content-Type: application/json' \
  -d '{"channelId":"-100<test1>","handle":"<handle1>","title":"<title1>","type":"kol"}'
curl -sf -X POST $TWIN/api/feed/sources \
  -H 'Content-Type: application/json' \
  -d '{"channelId":"-100<test2>","handle":"<handle2>","title":"<title2>","type":"kol"}'
# → 201 per channel; 409 = already registered (idempotent retry safe);
#   400 = malformed channelId (must be numeric, server adds -100 prefix).
```

Confirm they are live:

```bash
curl -sf "$TWIN/api/feed/sources?type=kol" | head -c 400
curl -sf "$TWIN/api/feed/sources/active/ids?type=kol"
```

## 2. Traffic checkpoint (gate, hard FAIL — not advisory)

1. Twin serves: §0 step 2 already `200`.
2. Backend repointed: §0 step 3 verified via `printenv` inside the container.
3. Traffic OBSERVED within one poll window (≤5 min default, 1 min when
   `USE_SSE_CRYPTO_NEWS=false`):
   - Backend probe: staging backend logs show fetch/match activity against the
     twin, or `curl -sf http://localhost:3031/api/health` healthy AND twin
     `GET /api/feed/stats` shows `totalMessages > 0` for a seeded channel:
     `curl -sf "$TWIN/api/feed/messages/channel/-100<test1>?limit=5"`.
   - UI probe: staging frontend (`:4173`) feed/sources view shows the twin's
     channels/messages (proves the baked `nginx.staging.conf` upstream, not
     the singleton).
4. **FAIL rule: 0 messages after seeding + one full poll window = FAIL.**
   Do not declare green on config inspection alone. Suspects in order:
   twin not listening (channel refresh needs restart — 5-min refresh cannot
   hot-add listeners), wrong `type` (crypto-news vs kol), backend still on
   singleton URL (recreate without the operator-updated real `.env.staging`).

## 3. Baked-image check (no inspection-only pass)

```bash
docker build -f apps/frontend/Dockerfile -t fe-prod-check .
docker build -f apps/frontend/Dockerfile --build-arg VITE_APP_ENV=staging -t fe-staging-check .
docker run --rm fe-prod-check grep 'set $ingestion_api' /etc/nginx/conf.d/default.conf
# → onchain-bot-ingestion-telegram:3031 (singleton, prod intact)
docker run --rm fe-staging-check grep 'set $ingestion_api' /etc/nginx/conf.d/default.conf
# → onchain-bot-ingestion-telegram-staging:3031 (twin)
```

## 4. Rollback (every add is reversible by hand)

Sources are operator data; the janitor never deletes them.

1. **Soft (preferred):** toggle off — ingestion stops listening on next
   channel refresh; rows/files age out via 72 h retention:
   `curl -sf -X PATCH $TWIN/api/feed/sources/-100<test>/toggle`
   → `{"isActive":false}`.
2. **Hard:** delete the row (messages/media remain until retention expires,
   nothing cascades):
   `curl -sf -X DELETE $TWIN/api/feed/sources/-100<test>` → `{"success":true}`.
3. **Wrong type:** no type-change endpoint — `DELETE` + `POST` with the right
   `type`.
4. Verify: `GET /api/feed/sources` count before/after. Never hand-edit the
   twin DB; the API is the only write path.

## 5. Operator checklist: real droplet `.env.staging` (document only)

File: `/opt/onchain-bot-staging/apps/backend/.env.staging` (gitignored — this
repo cannot edit it; the operator applies it before `recreate`).

- Pre: `grep -n INGESTION_TELEGRAM_URL /opt/onchain-bot-staging/apps/backend/.env.staging`
  shows the singleton `http://onchain-bot-ingestion-telegram:3031` (or missing
  → compose `environment:` already wins, still set it for clones).
- Set: `INGESTION_TELEGRAM_URL=http://onchain-bot-ingestion-telegram-staging:3031`
- Post (after `up -d --force-recreate backend`):
  `grep -n INGESTION_TELEGRAM_URL /opt/onchain-bot-staging/apps/backend/.env.staging`
  shows the twin, AND
  `docker exec onchain-bot-backend-staging printenv INGESTION_TELEGRAM_URL`
  shows the twin (runtime proof — compose `environment:` wins).
- `DEFAULT_INGESTION_TELEGRAM_URL` (`app.config.ts:87`, `http://localhost:3031`)
  is the LOCAL default — never edited for staging.
