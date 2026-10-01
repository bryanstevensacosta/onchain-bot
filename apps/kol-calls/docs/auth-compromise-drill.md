# Auth compromise drill — kol-calls (P50, todo 23; renamed from kol-system)

What this covers: a leaked `KOL_CALLS_API_KEY` (pre-rename `KOL_SYSTEM_API_KEY`, a leaked bot token from the
`telegram_bots` catalog, or a suspected foreign-binding publish attempt.
Keys live ONLY in env files (gitignored) and bot tokens ONLY as AES-256-GCM
ciphertext in the DB — never in logs, audit entries or responses
(secret-scan gate: `src/telegram/publish-secret-scan.spec.ts`).

## 1. Detect

- `GET /api/publishing/audit?limit=200` (needs the current API key): look for
  `action: 'denied'` bursts (foreign/missing bindings) and `publish`/`manual`
  entries with unexpected `actor` or `channelTarget`.
- Entries carry who/what/where only — no tokens, so a leaked audit dump alone
  grants nothing.

## 2. Contain (minutes)

1. Rotate the API key: set a fresh `KOL_CALLS_API_KEY` in the env file of the
   affected env (dev/staging/prod each have their own), restart kol-calls.
   Old key stops working instantly (guard reads env per request; no redeploy
   of code needed).
2. If a bot token leaked: rotate it via BotFather, then
   `PATCH /api/telegram-bots/:id` with the new token (re-encrypts in the
   catalog). Every template bound to that bot keeps working; nothing else
   stores the token.
3. If abuse is ongoing: `POST /api/templates/:id/deactivate` for the abused
   template (publishing flips to dashboard-only immediately), or lower
   `PUBLISH_RATE_LIMIT_PER_MIN` and restart.

## 3. Eradicate + recover

- `ENCRYPTION_KEY` compromise (worst case: catalog decryptable): generate a
  new key per env (`openssl rand -hex 32`), re-create bot entries with the new
  key, revoke old BotFather tokens. Old ciphertext becomes unreadable
  (fail-closed decrypt), so re-entry is mandatory, not optional.
- Re-verify channels: `PATCH /api/templates/:id/channel` re-runs
  `getChatMember` admin verification (`adminVerifiedAt` resets on re-assign).

## 4. Verify

- Curl matrix (all must hold):
  `GET /api/health` without key → 200;
  any other route without/wrong key → 401;
  `POST /api/publishing/publish` with a foreign `x-owner-id` → 403 + `denied`
  audit entry + zero Telegram calls;
  owner publish on an unverified template → 201 `published:false` + `blocked`
  entry.
- `npx jest` green (76 suites / 302 tests incl. the 401/403/blocked matrix
  and the secret-scan gate) + `npx tsc --noEmit` clean.

## 5. Lessons

Append a dated entry below with actor, scope, root cause and the rotated
material. Never paste keys or tokens here.

- 2026-09-25: drill documented (todo 23). No incident — baseline procedure.
