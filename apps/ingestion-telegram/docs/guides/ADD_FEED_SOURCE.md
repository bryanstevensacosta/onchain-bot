# Add a feed source (KOL or crypto-news)

> Base URL below is the env's OWN ingestion: dev `http://localhost:3031`,
> prod droplet host `:3032`, staging twin host `:3033` (each maps to
> container `:3031`). For the twin substitute `:3033` and follow
> `docs/deployment/staging-twin-channels.md` (twin starts EMPTY — never run
> twin seeding against `:3032` prod). Every route here was
> verified by decorator in `src/registry/api/http/sources.controller.ts`
> and `src/feed/api/http/feed.controller.ts`. Design background:
> `../architecture/telegram-feed.md`.

## Add a KOL channel

```bash
curl -sf -X POST http://localhost:3031/api/feed/sources \
  -H 'Content-Type: application/json' \
  -d '{"channelId":"-1001234567890","handle":"somekol","title":"Some KOL","type":"kol"}'
# → 201 {channelId, handle, title, type:'kol', isActive, lifecycleStatus, addedAt}
```

- `type` defaults to `crypto-news` when omitted, so KOL adds MUST pass
  `"type":"kol"` explicitly.
- `channelId` is normalized server-side (channels get the `-100` prefix);
  malformed ids → 400, already-registered → 409.
- `title`/`handle` are auto-resolved from Telegram when omitted.

Confirm it is live:

```bash
curl -sf 'http://localhost:3031/api/feed/sources?type=kol' | head -c 400
curl -sf 'http://localhost:3031/api/feed/sources/active/ids?type=kol'
```

## Add a crypto-news channel

```bash
curl -sf -X POST http://localhost:3031/api/feed/sources \
  -H 'Content-Type: application/json' \
  -d '{"channelId":"-1009876543210","title":"News Outlet"}'
# → 201 (type defaults to 'crypto-news')
```

Same 400/409 rules. Media downloads start automatically for
`crypto-news` rows only (KOL rows never download, by policy).

## Bulk import (backfill path)

`POST /api/feed/sources/batch` upserts up to 500 items by `channel_id`
(existing rows UPDATE `handle`/`title`/`lifecycle` in place, never
duplicate; the whole batch is validated BEFORE any write, so a 400 writes
nothing):

```bash
curl -sf -X POST http://localhost:3031/api/feed/sources/batch \
  -H 'Content-Type: application/json' \
  -d '{"sources":[{"channelId":"-1001","title":"A","type":"kol"},{"channelId":"-1002","title":"B"}]}'
# → 201 {created, updated, total, results}
```

The KOL migration script uses this endpoint:
`apps/ingestion-telegram/scripts/backfill-kols-to-feed.ts` (reads backend
`GET /telegram-kol/identity/kols`, maps `kol_id→channelId`,
`lifecycle→lifecycle_status`, `isActive→is_active`; dry-run lists N
without writing; re-runs never duplicate).

## Pause / resume / edit

```bash
# flip active flag (no single-get endpoint: fetch list, then toggle)
curl -sf -X PATCH http://localhost:3031/api/feed/sources/-1001234567890/toggle
# → 200 {channelId, isActive}

# rename / re-handle (title+handle ONLY; 400 when both missing, 404 unknown)
curl -sf -X PATCH http://localhost:3031/api/feed/sources/-1001234567890 \
  -H 'Content-Type: application/json' \
  -d '{"title":"New name"}'
```

There is NO endpoint for `last_ingested_at`: the backend orchestrator's
old `save-lastIngested` write is a documented no-op (feed PATCH is
title/handle-only by design).

## Verify ingestion is flowing

```bash
curl -sf 'http://localhost:3031/api/feed/messages/channel/-1001234567890?limit=5'
curl -sf http://localhost:3031/api/feed/stats
# → {totalMessages, totalSources, activeSources}
```

## Rollback (mandatory section)

Sources are operator data, the janitor never deletes them, so every add is
reversible by hand:

1. **Single source, soft (preferred):** toggle it off. Ingestion stops
   listening on the next channel refresh; rows and files stay for the 72 h
   window, then the janitor ages them out.
   `PATCH /api/feed/sources/:channelId/toggle` → `{"isActive":false}`.
2. **Single source, hard:** delete the row.
   `DELETE /api/feed/sources/:channelId` → `{"success":true}`.
   Already-persisted messages/media for that channel remain until retention
   expires them (nothing cascades on source delete by operator hand).
3. **Bad batch import:** re-run the batch with corrected payloads (upsert
   updates in place), then `DELETE` any rows that should never have
   existed. Verify with
   `GET /api/feed/sources` count before/after.
4. **Wrong type (`kol` vs `crypto-news`):** there is no type-change
   endpoint. `DELETE` the row and `POST` it again with the right `type`.
   (Media rows only ever exist for `crypto-news`; a re-created KOL row
   starts with zero media by policy.)
5. **Nuclear (dev only):** `DELETE` every row you added and let the 72 h
   janitor plus the hourly disk check reclaim files. Never hand-edit the
   DB on staging/prod; the API is the only write path.
