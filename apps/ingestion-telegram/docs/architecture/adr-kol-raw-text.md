# ADR: KOL raw text persisted + carried in SSE (Q1-B)

- **Date:** 2026-09-22
- **Status:** Accepted (telegram-feed-unification item 7)
- **Decision (Q1-B):** KOL raw Telegram text IS persisted RAW into
  `telegram_feed_messages` (type='kol', no media rows, no download) AND
  carried in the SSE `MessagePayload.text` for KOL frames.
- **Operator:** amendment to the fix-1 ToS invariant, approved per plan review
  (metis blast-radius note: SSE-text).

## What changed

| Before (fix-1) | After (Q1-B) |
| --- | --- |
| `KolTextExtractor` returned `''` always | 4-source cascade (`message` → `text` → `media.caption` → `fwdFrom.message`), same as crypto-news |
| Coordinator persisted ONLY crypto-news rows | `persistFeedMessage(raw, type)` persists BOTH types; KOL rows carry `content = raw.text`, `media = []` |
| SSE `payload.text` present ONLY for crypto-news | `payload.text = raw.text ?? ''` for BOTH types |
| Channels from backend HTTP (`BackendChannelProviderService`) + `newsIds`-membership classification | Channels from LOCAL `telegram_feed_sources` (`findAllActiveWithTypes()`); classification by registry row type; unknown channel → `'kol'` (previous default, kept) |
| `BackendChannelProviderService` (HTTP fetch half) | DELETED. Registration-store half moved to `BackendRegistryService` (stream home, next to its only consumers) |
| Refresh gated `updateSubscribedChannels` on `previousTotal > 0`; cold-start empty DB never listened, never scheduled recovery | Refresh ALWAYS scheduled; `updateSubscribedChannels` called unconditionally (incl. empty snapshot); 0 → N transition starts the listener; `subscribe()` called EXACTLY ONCE (gap 15) |
| `[PAYLOAD-TRANSFORM-DEBUG]` logs printed raw text to disk | REDACTED to shape-only (lengths). Raw text MUST NEVER be logged (disk log = text store) |

## Blast radius

- **Ingestion SSE consumers (all backends):** KOL frames now contain `text`.
  Backend `payloadToRawMessage` already passes `payload.text ?? ''` through —
  no backend logic change; backend specs rewritten to the new shape.
- **Backend event bus / WS:** UNCHANGED. `KolMessageIngestedEvent`
  (`telegram.message.ingested`) still carries NO text (fix-1 holds); WS
  `EVENT_MAP` forwards the event without text (asserted in
  `kol-message-ingested.event.spec.ts`). Raw KOL text reaches the backend
  pipeline ONLY via the direct SSE-adapter → orchestrator handoff.
- **Media:** KOL NEVER downloads (adapter `isCryptoNewsChannel` gate intact +
  coordinator persists `media = []` for kol as defense-in-depth).
- **Dedup:** `isDuplicate()` wired in `route()` for BOTH types (cursor +
  in-memory cache) — realtime+polling double-delivery → 1 row + 1 frame.
  Item 9 hardens windows/prune later; thresholds untouched here.
- **Retention:** untouched (item 10 owns the janitor re-point); KOL rows share
  the 72h `ingested_at` lifecycle by table design.

## Invariant specs rewritten to the new shape (evidence §5)

- Ingestion: `message-payload.spec.ts` (KOL text present), `kol-text-extractor.spec.ts`,
  `kol-message-transformer.spec.ts`, `message-persistence.coordinator.integration.spec.ts`
  (dedup-active), `full-message-flow.e2e-spec.ts` (`text` key expected on KOL frames).
- Backend: `transformation-import.spec.ts:53` (`toBe('')` → `toBe('Test message')`),
  `telegram-sse-listener.adapter.spec.ts` (KOL frames WITH text → passthrough),
  NEW `kol-message-ingested.event.spec.ts` (no-`text` WS/event invariant).

## Rollback

Revert this todo's commit. KOL rows already persisted keep `content` (harmless —
readers filter by `type`); SSE consumers tolerate an extra `text` key.
