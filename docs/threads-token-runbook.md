# Threads Token Runbook (60-day long-lived token)

How to create, validate, refresh, and revoke the Threads Graph API user token
used by `ThreadsApiPublisherAdapter` + `ThreadsTokenRefresher` (T3).

> NEVER commit real tokens. `THREADS_ACCESS_TOKEN` lives ONLY in local
> `.env` files (gitignored) and in the `threads_oauth_tokens` table (id=1).
> It is NEVER logged (masked `***`) and NEVER returned by any API response.

## 1. Create the token (Meta developer dashboard, step by step)

1. Create a Meta App at https://developers.facebook.com/apps with the
   **Threads Use Case** (guide:
   https://developers.facebook.com/docs/development/create-an-app/threads-use-case/).
   Note the **Threads App ID** (not the generic App ID).
2. Add a **Threads Tester**: App roles > Roles > Add people > Threads Tester,
   invite your Threads account, and accept the invite from that account.
   No App Review is needed for testers.
3. Register the exact `redirect_uri` in the app (for local testing
   `https://localhost/cb` works if registered verbatim). The app form also
   requires Deauthorize + Delete callback URLs (the same URL is fine).
   Scopes: `threads_basic,threads_content_publish`.
4. Build the authorize URL (offline, no network):
   `node threads-meta-test/auth-url.mjs --dry-run` (reads
   `threads-meta-test/.env`: `THREADS_APP_ID`, `THREADS_REDIRECT_URI`).
   Open it, authorize, and copy the `code` from the redirect.
5. Exchange `code` -> short-lived (~1h) -> long-lived (60d):
   `node threads-meta-test/exchange.mjs --code <CODE>` (needs
   `THREADS_APP_SECRET`). Save the resulting long token as
   `THREADS_ACCESS_TOKEN` in `apps/backend/.env` (dev) or the droplet env.
   Set `THREADS_USER_ID` to your numeric user id (`me` also works).
6. Verify with a dry run (zero network):
   `THREADS_ACCESS_TOKEN=FAKE node threads-meta-test/publish.mjs --text "spike" --dry-run`
   then a live post:
   `node threads-meta-test/publish.mjs --text "Hola desde el spike de Threads, post 1"`.

Reference: https://developers.facebook.com/docs/threads/get-started/long-lived-tokens/

## 2. 60-day expiry note

- Short-lived token: ~1 hour (`expires_in` ~3600).
- Long-lived token: **60 days** (`expires_in=5184000`). Store it as
  `THREADS_ACCESS_TOKEN`; the refresher persists refreshes into
  `threads_oauth_tokens` (id=1) with fresh `obtained_at`/`expires_in_s`.
- Public accounts: refresh auto-extends the grant (up to ~90 days) without
  re-authorizing. Private accounts: refresh does NOT extend — repeat the
  full step-1 flow (~every 90 days or at expiry) and store the new
  `THREADS_ACCESS_TOKEN`.
- Refresh preconditions (Meta side): only when the token has 24h+ left
  (`expires_in >= 86400`). Our refresher triggers earlier (7-day window) so
  there is always margin.

## 3. Refresh behavior (automatic)

`ThreadsTokenRefresher` runs `@Cron('0 0 * * *')` (daily at midnight):

1. No `THREADS_ACCESS_TOKEN` (empty/`FAKE`/`PASTE_ME`) ->
   `logger.warn('THREADS skipped: no token')`, return, ZERO network.
2. Validate via `GET https://graph.threads.net/debug_token`
   (`input_token` + `access_token`); remaining lifetime derived from
   `data.expires_at` (fallback `data.expires_in`). Token masked `***` in logs.
3. If remaining >= 7 days -> log and stop (refresh not due).
4. If remaining < 7 days ->
   `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token`,
   then upsert `threads_oauth_tokens` id=1
   (`access_token`, `threads_user_id`, `obtained_at=NOW`, `expires_in_s`).
   Without a wired store the refresh still succeeds but persistence is
   skipped with a warning (T4 wires the TypeORM store).

## 4. Health check (curl)

Read-only quota probe (never publishes):

```bash
curl -s "https://graph.threads.net/v1.0/me/threads_publishing_limit?fields=quota_usage,config&access_token=${THREADS_ACCESS_TOKEN}" | head -c 500
```

Expected: JSON with `quota_usage` (e.g. `used: 0/250`, 250 posts/24h).
If it returns HTTP 4xx, the token is expired/revoked or missing the
`threads_content_publish` scope -> refresh (section 3) or re-auth (section 1).

Backend-side check (no token needed):

```bash
curl -s http://localhost:3030/api/health
```

## 5. Teardown

1. Delete the test post from the Threads app (API `DELETE /{media-id}` is
   NOT implemented in the spike; delete it in the Threads UI).
2. Revoke the token: Threads Settings > App permissions > remove the app,
   or remove the tester from the Meta App. Afterwards the curl probe in
   section 4 must fail with HTTP 4xx and the publisher must refuse.
3. Remove local secrets and confirm nothing sensitive remains:
   `rm threads-meta-test/.env` (and any `apps/backend/.env.test` used),
   then `grep -r 'THREADS_ACCESS_TOKEN=.\{10,\}' apps/backend/src docs/threads-token-runbook.md || echo CLEAN`.

## 6. Env reference

| Variable | Required | Default | Used by |
| --- | --- | --- | --- |
| `THREADS_ACCESS_TOKEN` | yes (publish/refresh) | `''` (refuse without network) | adapter + refresher |
| `THREADS_USER_ID` | no | `''` -> `me` | adapter + refresher |
| `THREADS_POLLING_INTERVAL_MINUTES` | no | `5` (clamped 1-60) | `AppConfig.threads` (operator mirror) |
| `THREADS_DAILY_CAP` | no | `60` (clamped 1-250, Meta allows 250/24h) | `AppConfig.threads` (operator mirror) |

Placeholders with EMPTY values ship in `apps/backend/.env.staging.template`
and `apps/backend/.env.production.template`. Real values go ONLY in the
gitignored `.env` files on each host. Never paste tokens in chats, issues,
or commits; if a token touches the shell history, clear it afterwards.
