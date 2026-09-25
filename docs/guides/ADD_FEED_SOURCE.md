# How to Add a New Crypto-News Source

> Every endpoint in this guide was verified against controller source on 2026-09-21.
> If a curl here 404s, the code moved: check the "Endpoint reference" table at the
> bottom for the source file each route was verified in.

## Prerequisites

- Telegram channel ID (e.g. `-1001234567890`). The channel must be **public**
  (username-based, e.g. `@feedchannel`) or **private with the ingestion
  account as a member** (admin access not required).
- Two base URLs. They are different services, do not mix them up:
  - Ingestion: `{INGESTION_TELEGRAM_URL}` = `http://localhost:3031` in dev,
    `http://localhost:3032` via the Oracle host mapping (container still
    listens on `:3031`). Owns sources, messages, media.
  - Backend: `http://localhost:3030` in dev. Owns filters, keywords,
    blacklist, matching flag, publisher queue. Owns **zero** feed
    tables since the 2026-09-08 ownership split.

## Step 1. Register the source (ingestion-telegram)

Sources live in the ingestion-telegram's own `<base>_ingestion` DB
(`crypto_news_sources` table). This is the **only** endpoint that creates them:

```bash
curl -X POST http://localhost:3031/api/feed/sources \
  -H 'Content-Type: application/json' \
  -d '{
    "channelId": "-1001234567890",
    "title": "Crypto News Channel",
    "handle": "feedchannel"
  }'
```

Notes:

- `channelId` (required) is normalized to `-100...` prefix format automatically.
  `title` (required) is the display name. `handle` (optional) is the channel
  handle without `@`.
- Success is `201` with
  `{ channelId, handle, title, isActive: true, lifecycleStatus: "ACTIVE", addedAt }`.
- `409 Conflict` means the channel ID is already registered. `400` means empty
  or malformed `channelId`/`title`.
- Wait ~30 s after registering (next MTProto polling cycle), then confirm the
  source appears:

```bash
curl http://localhost:3031/api/feed/sources | jq '.[] | select(.channelId == "-1001234567890")'
```

> **Deprecated: backend `POST /crypto-news/sources`.** The backend endpoint that
> used to create sources was removed in the post-split cleanup (its controller
> header documents `POST sources (501)` among the deleted routes; the live
> backend `FeedController` exposes only filter-rule CRUD). Do not call it:
> it writes nothing. Always create sources on ingestion-telegram as above.

## Step 2. Configure keywords (backend)

Keywords live in the backend (`feed-publisher` BC). A message is
enqueued when it matches keywords (after filters, see step 4) and is not
blocked by the blacklist (step 3).

**Simple keyword (OR logic):**

```bash
curl -X POST http://localhost:3030/crypto-news-publisher/keywords \
  -H 'Content-Type: application/json' \
  -d '{
    "phrase": "bitcoin",
    "sourceChannelIds": ["-1001234567890"]
  }'
```

- `phrase` (required). Optional fields: `caseSensitive` (default `false`),
  `enabled` (default `true`), `sourceChannelIds` (default `[]` = all channels;
  set it to scope the keyword to the new source only), `matchMode`
  (`"exact"` word-boundary regex, the default, or `"substring"` plain
  `includes()`), `requireMedia` (default `false`; when `true`, matches without
  a photo are dropped), `templateId` (`null` = fall back to the global default
  prompt template), `andGroupId` (default `null` = standalone).
- Success is `201`. A duplicate phrase with the same `caseSensitive` +
  `matchMode` (+ same `andGroupId`) is rejected, including cross-table
  duplicates against the blacklist (`PhraseRegistryService`).

**AND-group keywords (ALL must match):**

Do not hand-roll `andGroupId` values. The batch endpoint generates one group
ID for the whole batch:

```bash
curl -X POST http://localhost:3030/crypto-news-publisher/keywords/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "phrases": [
      { "phrase": "airdrop", "sourceChannelIds": ["-1001234567890"] },
      { "phrase": "free", "sourceChannelIds": ["-1001234567890"] }
    ]
  }'
```

Each item accepts the same per-phrase options as the single-create endpoint
(`caseSensitive`, `enabled`, `sourceChannelIds`, `templateId`, `requireMedia`,
`matchMode`); the server assigns one shared `andGroupId` to all of them.

**Matching logic:** a message matches when (ANY standalone keyword matches) OR
(ALL keywords in ANY one AND-group match). Blacklist is evaluated after
keywords and blocks the message when any enabled phrase matches.

List and edit:

```bash
curl http://localhost:3030/crypto-news-publisher/keywords
curl -X PATCH http://localhost:3030/crypto-news-publisher/keywords/<id> \
  -H 'Content-Type: application/json' -d '{"enabled": false}'
```

## Step 3. Configure blacklist phrases (backend, optional)

Blacklist phrases block spam/scam content. They live in the same BC with a
parallel controller:

```bash
curl -X POST http://localhost:3030/crypto-news-publisher/blacklist \
  -H 'Content-Type: application/json' \
  -d '{
    "phrase": "click here to win",
    "sourceChannelIds": ["-1001234567890"]
  }'
```

- Same options as keywords (`caseSensitive`, `matchMode`, `enabled`,
  `sourceChannelIds`, `andGroupId`, `requireMedia`), except there is no
  `templateId`. Same duplicate protection applies in both directions.
- Batch form: `POST /crypto-news-publisher/blacklist/batch` with
  `{ "phrases": [...] }` (server-generated `andGroupId`).
- List: `GET /crypto-news-publisher/blacklist`. Remove one:
  `DELETE /crypto-news-publisher/blacklist/<id>` (expects `204`).

## Step 4. Configure per-channel regex filters (backend, optional)

Content filters transform message text **on-read** before keyword matching
(e.g. strip emojis, normalize whitespace). They are the only thing the backend
`FeedController` still owns. Note the path shape: create/list are nested
under the source, update/delete are not.

```bash
# Create (201)
curl -X POST http://localhost:3030/feed/sources/-1001234567890/filters \
  -H 'Content-Type: application/json' \
  -d '{
    "pattern": "\\s+",
    "replacement": " ",
    "flags": "g",
    "priority": 1,
    "isActive": true
  }'

# List (ordered by priority ASC, then createdAt ASC)
curl http://localhost:3030/feed/sources/-1001234567890/filters

# Update (PUT, not PATCH)
curl -X PUT http://localhost:3030/feed/filters/<id> \
  -H 'Content-Type: application/json' -d '{"isActive": false}'

# Toggle active flag
curl -X PATCH http://localhost:3030/feed/filters/<id>/toggle

# Delete (204)
curl -X DELETE http://localhost:3030/feed/filters/<id>
```

Pattern examples:

| Use case          | Pattern        | Replacement |
| ----------------- | -------------- | ----------- |
| Normalize spacing | `\s+`          | ` `         |
| Remove URLs       | `https?://\S+` | `[URL]`     |
| Remove emojis     | `[\p{Emoji}]+` | (empty)     |

Lower `priority` numbers run first. `ContentFilterService` applies the rules
with a 100 ms ReDoS timeout per rule, so keep patterns simple.

## Step 5. Verify end to end

1. **Messages are ingested.** Per-channel read (there is no `?channelId=`
   query param on the recent-messages endpoint; the response is wrapped as
   `{ timestamp, count, data }`):

```bash
curl "http://localhost:3031/api/feed/messages/channel/-1001234567890?limit=5"
```

If empty after 30+ s, check the source row (`GET /api/feed/sources`),
the ingestion-telegram logs for the channel ID, and the MTProto session
(`cd apps/ingestion-telegram && npm run telegram:gen-session` to regenerate).

2. **Matching fires.** The `EnqueueMatchingCronScheduler` ticks every minute in polling-only mode (SSE off), or every `CRYPTO_NEWS_POLLING_INTERVAL_MINUTES` (default 5) with SSE on — see `docs/architecture/crypto-news-dual-path.md` for the full table
   (skipped while matching is off) and logs one of:

```text
Found N matching messages, enqueuing...
No matching messages found (fetched up to 50)
```

(`FilteredFeedService` also logs
`Filtered <raw> raw messages → <matched> matched (keywords + not blacklisted)`.)
If messages exist but nothing matches: confirm matching is on
(`GET http://localhost:3030/crypto-news/matching/config`, expect
`{ "enabled": true }`; enable with
`PATCH /crypto-news/matching/config -d '{"enabled": true}'`), confirm keywords
exist and are `enabled`, and confirm the blacklist is not blocking the test
message. Live pipeline state is at `GET /crypto-news/matching/health`.

3. **Queue fills, then publishes.** The filtered content lands in the publisher
   queue (cap 36); `PublisherCronScheduler` drains it every minute:

```bash
curl "http://localhost:3030/crypto-news-publisher/queue?status=PENDING&limit=10"
curl http://localhost:3030/crypto-news-publisher/queue/counts
# After a minute:
curl "http://localhost:3030/crypto-news-publisher/queue?status=PUBLISHED&limit=10"
```

If entries sit in `PENDING`, check the master publish switch
(`GET /crypto-news-publisher/llm/config`, expect `publishingEnabled: true`;
LLM generation only runs when **both** `llmEnabled` and `publishingEnabled`
are true) and failures
(`GET /crypto-news-publisher/queue?status=FAILED&limit=10`, see `lastError`).

## Step 6. Rollback

Pick the blast radius you need, smallest first:

```bash
# 1. Stop matching globally (queue stops growing; nothing else changes).
#    Sole source of truth is the matching-config row (id = 1); the legacy
#    LlmConfig.matchingEnabled column was dropped, do not use it.
curl -X PATCH http://localhost:3030/crypto-news/matching/config \
  -H 'Content-Type: application/json' -d '{"enabled": false}'

# 2. Pause just this source, keeping history (toggle flips isActive;
#    there is no direct set-active endpoint).
curl -X PATCH http://localhost:3031/api/feed/sources/-1001234567890/toggle

# 3. Remove the keywords / blacklist phrases / filters added above.
curl -X DELETE http://localhost:3030/crypto-news-publisher/keywords/<id>
curl -X DELETE http://localhost:3030/crypto-news-publisher/blacklist/<id>
curl -X DELETE http://localhost:3030/feed/filters/<id>

# 4. Delete the source entirely (404 if already gone).
curl -X DELETE http://localhost:3031/api/feed/sources/-1001234567890
```

Note the retention janitor: ingestion keeps messages + media for 72 h
(`FeedRetentionCleanupScheduler`), so deleting a source does not
instantly purge its already-ingested messages.

## Endpoint reference (all verified in code)

| Step | Method + path                                                                                                                                                                         | Verified in                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `POST {INGESTION}/api/feed/sources`                                                                                                                                                   | `apps/ingestion-telegram/src/telegram/feed/api/http/feed.controller.ts` (`@Post('sources')`)                                          |
| 1    | `GET {INGESTION}/api/feed/sources`                                                                                                                                                    | same file (`@Get('sources')`)                                                                                                         |
| 1    | `GET {INGESTION}/api/feed/sources/active/ids`                                                                                                                                         | same file                                                                                                                             |
| 1    | `GET {INGESTION}/api/feed/stats`                                                                                                                                                      | same file (`@Get('stats')`)                                                                                                           |
| 1    | `PATCH {INGESTION}/api/feed/sources/:channelId` (title/handle only)                                                                                                                   | same file (`@Patch('sources/:channelId')`)                                                                                            |
| 1/6  | `PATCH {INGESTION}/api/feed/sources/:channelId/toggle`                                                                                                                                | same file                                                                                                                             |
| 6    | `DELETE {INGESTION}/api/feed/sources/:channelId`                                                                                                                                      | same file (`@Delete('sources/:channelId')`)                                                                                           |
| 5    | `GET {INGESTION}/api/feed/messages?limit=50` (wrapped `{timestamp,count,data}`, max 200)                                                                                              | same file (`@Get('messages')`)                                                                                                        |
| 5    | `GET {INGESTION}/api/feed/messages/channel/:channelId?limit=50`                                                                                                                       | same file                                                                                                                             |
| 2    | `GET/POST /feed-publisher/keywords`, `GET/PATCH/DELETE /feed-publisher/keywords/:id`, `POST /crypto-news-publisher/keywords/batch`                                                    | `apps/backend/src/telegram/crypto-news-publisher/api/http/keywords.controller.ts` (`@Controller('crypto-news-publisher/keywords')`)   |
| 3    | `GET/POST /feed-publisher/blacklist`, `GET/PATCH/DELETE /feed-publisher/blacklist/:id`, `POST /crypto-news-publisher/blacklist/batch`                                                 | `apps/backend/src/telegram/crypto-news-publisher/api/http/blacklist.controller.ts` (`@Controller('crypto-news-publisher/blacklist')`) |
| 4    | `POST+GET /crypto-news/sources/:channelId/filters`, `PUT /crypto-news/filters/:id` (201/200), `DELETE /crypto-news/filters/:id` (204), `PATCH /crypto-news/filters/:id/toggle`        | `apps/backend/src/telegram/ingestion/crypto-news/api/http/crypto-news.controller.ts` (`@Controller('crypto-news')`)                   |
| 5    | `GET/PATCH /crypto-news/matching/config`, `GET /crypto-news/matching/health`                                                                                                          | `apps/backend/src/telegram/crypto-news-integration/api/http/matching-config.controller.ts` (`@Controller('crypto-news/matching')`)    |
| 5    | `GET /crypto-news-publisher/queue?status=&limit=`, `GET /crypto-news-publisher/queue/counts`, `DELETE /crypto-news-publisher/queue/:id`, `GET /crypto-news-publisher/queue/:id/media` | `apps/backend/src/telegram/crypto-news-publisher/api/http/queue.controller.ts` (`@Controller('crypto-news-publisher/queue')`)         |
| 5    | `GET/PATCH /feed-publisher/llm/config` (`llmEnabled`, `publishingEnabled`)                                                                                                            | `apps/backend/src/telegram/crypto-news-publisher/api/http/llm-config.controller.ts` (`@Controller('crypto-news-publisher/llm')`)      |

Related guides (sibling tasks, same refactor wave): T1 architecture overview,
T2 environment reference. Frontend operators can also use the
newsroom (`/crypto-news`) and `MatchingToggleButton` instead of curl.
