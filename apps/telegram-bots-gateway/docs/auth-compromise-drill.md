# Auth compromise drill — telegram-bots-gateway

> Scope: todo 2 service auth (per-client API keys + HMAC). Keys never appear
> in logs or responses — if you see one outside an env file, treat it as
> compromised and run this drill.

## Transport rule (TLS-only)

The gateway serves plain HTTP and MUST sit behind TLS (nginx/ingress) in
staging/prod — HMAC signatures do not encrypt the body, they only prove
authenticity. Never expose `:4071`/`:4072` directly to the internet.
Health (`GET /api/health`) is the ONLY public route; everything else
requires a signed request.

## What a signed request looks like

Headers: `x-api-key` (client id) + `x-timestamp` (unix seconds) +
`x-nonce` (≥8 chars, single use) + `x-signature` (hex HMAC-SHA256 of
`METHOD\npath\ntimestamp\nnonce\nsha256(rawBody)` with the client secret).

Status discipline: bad/unknown/expired/replayed auth → `401`; valid auth
with the wrong scope (`send` key on `/api/vault/*`) → `403`.

## Drill: rotate a leaked client key (no code deploy)

1. Generate a new secret: `openssl rand -hex 32`.
2. On the Oracle host, edit the env file
   (`/opt/onchain-bot[-staging]/apps/telegram-bots-gateway/.env.*`):
   replace ONLY that client's `secret` inside `BOTS_GATEWAY_CLIENTS`.
3. Restart the gateway container/service (env change needs a restart,
   no rebuild).
4. Hand the new secret to the owning app out-of-band (password manager,
   never chat/logs) and restart that app.
5. Verify with the curl matrix below: new secret → `200`, old secret →
   `401`, unsigned → `401`, cross-scope → `403`.

## Drill: rotate ENCRYPTION_KEY (vault master key)

Heavier: vault ciphertexts are bound to the key. Procedure: register every
bot under the new key (parallel `POST /api/vault/bots` with fresh ids on
the rotated instance), cut clients over to the new ids, then delete the old
rows. Never copy plaintext tokens through logs — pipe them directly.

## Curl matrix (replace PORT/ID/TS/NONCE/SIG)

```bash
BASE=http://localhost:4070
# public
curl -s $BASE/api/health | grep -q '"status":"ok"' && echo HEALTH_OK
# unsigned -> 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/bots/<id>/send \
  -H 'content-type: application/json' -d '{"kind":"message","chat_id":"1","text":"x"}'
# signed (compute SIG with the client secret) -> 200
curl -s -X POST $BASE/api/bots/<id>/send \
  -H 'content-type: application/json' \
  -H 'x-api-key: kol-system' -H "x-timestamp: <TS>" -H 'x-nonce: <NONCE>' -H 'x-signature: <SIG>' \
  -d '{"kind":"message","chat_id":"1","text":"x","client_msg_id":"drill-1"}'
# replay same nonce -> 401
# send key on vault -> 403
```

## Audit checklist after any incident

- `grep -r` the leaked secret across the repo + server logs; rotate
  anything it touched.
- Confirm no token/key material in gateway responses (`token: '***'`
  invariant) and no `console.*` in `src/auth/` + `src/send/`.
- Record the rotation in the ops log with time + scope (never the secret).
