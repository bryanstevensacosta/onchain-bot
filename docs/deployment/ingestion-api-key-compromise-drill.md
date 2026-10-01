# Ingestion-telegram API-key compromise drill (rotation ONLY)

> Placeholders only (`***`, `<...>`) — never paste a real key, session, or
> secret into this doc, the evidence log, or chat. API-key rotation ONLY:
> zero MTProto triple/session steps (those belong to the session runbook).

## 1. Detect (minutes)

- Signal: unexpected 401s in backend logs (`Invalid or missing API key`),
  unknown IPs in `auth:access:decision` deny lines, or a key pasted where
  it should not be (chat, ticket, screenshot).
- Confirm scope: which env? `dev` (`:3031`), staging (`:3033`), prod (`:3032`)
  — each env has its OWN `INGESTION_API_KEY`; a leak in one env never
  affects the others. Do NOT rotate all envs blindly.

## 2. Revoke (minutes)

1. Generate the replacement (on the target host, never locally):
   `openssl rand -hex 32` → `<new-key-***>`
2. Keep the OLD value handy as `<old-key-***>` for the overlap window.

## 3. Rotate (per-env `.env` + backend, one env at a time)

1. Ingestion instance: set `INGESTION_API_KEY=<new-key-***>` in THAT env's
   own `.env` (prod `.env.production`, staging `.env.staging`, local `.env`)
   and restart ONLY that instance.
2. Its backend: set `INGESTION_TELEGRAM_API_KEY=<new-key-***>` (same env)
   and restart/reload so SSE + feed clients send the new header.
3. Overlap: guarded endpoints accept exactly ONE key — plan a 2-minute
   window where backend + ingestion restart back-to-back (queue the
   backend restart first if it retries SSE with backoff 1s→30s; it will
   reconnect with the new key automatically).

## 4. Verify (401/200 matrix, key set)

Against THAT env's ingestion host (dev `:3031`, staging `:3033`, prod `:3032`):

- `curl -s -o /dev/null -w '%{http_code}\n' <host>/api/feed/sources`
  → expect `401` (no key).
- Same URL with `-H 'x-api-key: <old-key-***>'` → expect `401` (revoked).
- Same URL with `-H 'x-api-key: <new-key-***>'` → expect `200`.
- `curl <host>/api/health` → expect `200` (public trio untouched).
- Backend logs: SSE `connection:established` again, no 401 lines.

## 5. Audit window (T3 logs)

- Pull logs since detection: every `auth:access:decision` line carries
  `method`, `path` (query-stripped), `decision`, `guard`, `clientIp` —
  and NEVER key material (pino-http redacts `x-api-key` / `?apiKey=`).
- List distinct `clientIp` on `deny` lines during the window; any
  `allow` line from an unknown IP BEFORE rotation = data accessed —
  escalate per incident process.
- Assert no leak in the trail itself:
  `grep -riE 'sk-|BEGIN .*PRIVATE|eyJ[A-Za-z0-9_-]{10,}' <log-slice>`
  → zero hits expected.

## 6. Close

- Delete `<old-key-***>` from scratch notes/shell history
  (`history -d` the `openssl` line if echoed).
- Record rotation (date, env, reason) WITHOUT the values.
- If the same key was ever shared across envs: treat ALL of them as
  compromised and repeat per env (then stop sharing — one key per env).
