# Compromise Drill — feed-publisher (todo 14, P50)

> If a bot token, the inbound API key, or the encryption key leaks:
> follow this runbook in order. Target: stop abuse in < 15 min,
> rotate in < 1 h, full audit in < 24 h.

## 1. Stop the bleeding (minutes)

1. **Revoke the leaked Bot API token** at @BotFather (`/revoke`) —
   Telegram kills the old token instantly. Publishing with it starts
   failing closed (`not configured` / API 401); nothing posts.
2. **Rotate the inbound key**: set a new `FEED_PUBLISHER_API_KEY` on the
   host and restart. Old key holders get 401 on every route except
   `/api/health`. (Fail-open reminder: an EMPTY key disables auth —
   never run staging/prod with it empty.)
3. **Deactivate hot sessions**: `PATCH /api/sessions/:id/deactivate` for
   any tab bound to the compromised bot. Inactive sessions consume and
   publish nothing (spec-pinned).

## 2.Audit (same hour)

1. Pull the publish audit: `GET /api/publish-audit` (key required).
   Entries are routing facts only (`sessionId/target/botId/chatId/mode/
result/reason`) — no tokens, safe to paste into tickets.
2. Look for `result: 'blocked'` spikes (exploit attempts: foreign
   bindings, unverified bots, channel hijacks) and any `published`
   entries on sessions you do not recognize.
3. Cross-check Bot API: @BotFather `/mybots` shows recent activity per
   bot; compare against the audit `seq` order.

## 3. Rotate and re-verify (same day)

1. Register the fresh token: `POST /api/content-template-bots`
   (`token` persists AES-256-GCM ciphertext only; reads are `***`).
2. Re-bind sessions to the new `botId`, then admin-verify:
   `PATCH /api/content-template-bots/:id/verify`. Publishing stays
   403-blocked until the bot is verified AND the chat equals the
   verified channel (`defaultChatId`) — this is the ownership rule
   doing its job, not an outage.
3. If `ENCRYPTION_KEY` leaked instead: re-encrypt every catalog token
   (create replacement bots, re-bind, verify, delete the old ones),
   then rotate `ENCRYPTION_KEY`. There is no decrypt-in-place.

## 4. Confirm clean

1. `GET /api/publish-audit` shows only expected `published` rows.
2. Secret-scan gate green: `npm test -w @onchain-bot/feed-publisher --
secret-scan` (fails on committed bot tokens, private keys,
   `ghp_`/`sk-live`/`AKIA`/`xox` material).
3. Exploit simulation matrix green (adversarial): no key → 401,
   foreign bot → 403, unverified bot → 403, hijacked channel → 403,
   over-budget → 429, owned + verified + in-budget → 201.
   See `.omo/evidence/task-14-mega-refactor-content-publisher.log`.

## Contacts and ownership

- Owner: feed-publisher sessions/template BCs (this app).
- Bot tokens live ONLY as ciphertext in the `TemplateBot` catalog or
  as env vars on the host — never in git, never in the audit log,
  never in chat.
