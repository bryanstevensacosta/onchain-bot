# Ingestion BC (`kol/ingestion/`)

Owns the **ingest loop** — subscribe to a set of KOL channels on
Telegram and emit `KolMessageIngestedEvent` for every new message.

## Ports

- `KolListenerPort` — abstract class; methods: `subscribe(kolIds)`,
  `backfill(kolId, limit)`, `disconnect()`, `resolveKolMetadata(kolId)`.
- `KolEventPublisher` — abstract class; `publish(event)` + `publishAll(events)`.

## Adapters

- `KolTelegramMtprotoAdapter` (in `api/mtproto/`) — gramjs client that
  implements `KolListenerPort`. Single source of truth for Telegram
  MTProto credentials (`TELEGRAM_MTPROTO_API_ID/HASH/SESSION`).
- `InProcessKolEventPublisher` (in `infrastructure/messaging/`) —
  NestJS EventEmitter2-based publisher.

## Use cases

- `StartKolIngestionUseCase` — kicks off the real-time listener on a
  set of KOL ids, marks them `listening`, then consumes the stream in
  the background and emits `KolMessageIngestedEvent` per message.
  Includes `backfillKol(kolId, limit)` for warm-up.

## Events

- `KolMessageIngestedEvent` — emitted per message. Wire event name
  `telegram.message.ingested` (kept for backward compat with any
  handler bound by string).

## See also

- `kol-refactor.md` — plan that moved this BC out of `telegram/ingestion/`.
- `kol/identity/` — owns the `Kol` aggregate that the ingestion
  flow reads + updates.
- `kol/source/` — consumes the resulting mentions via `Source`.
