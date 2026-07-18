---
slug: mtproto-adapter-decompose
status: drafting
intent: clear
pending-action: write .omo/plans/mtproto-adapter-decompose.md
approach: Extract 6 cohesive modules from the 794-line adapter into separate files under api/mtproto/ and infrastructure/services/. Target ~270 lines for the adapter (66% reduction).
---

# Draft: mtproto-adapter-decompose

## Components (topology ledger)

| id               | outcome                                                                                          | status | evidence path                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| T1-utils         | Extract 152 lines of types + module-level functions → telegram-mtproto.utils.ts                  | active | telegram-mtproto-listener.adapter.ts:31-139, 752-794                                        |
| T2-transformer   | Extract 3× duplicated message-to-TelegramRawMessage conversion → telegram-message-transformer.ts | active | telegram-mtproto-listener.adapter.ts:324-337, 379-392, 431-444                              |
| T3-client-mgr    | Extract TelegramClient lifecycle → services/telegram-client-manager.service.ts                   | active | telegram-mtproto-listener.adapter.ts:174-206, 625-637, 699-708 (66 lines)                   |
| T4-peer-resolver | Extract channel resolution/join → services/telegram-peer-resolver.service.ts                     | active | telegram-mtproto-listener.adapter.ts:449-468, 639-697 (98 lines)                            |
| T5-media-dl      | Extract media download + retry → services/telegram-media-download.service.ts                     | active | telegram-mtproto-listener.adapter.ts:475-623 (149 lines)                                    |
| T6-last-seen     | Extract lastSeenMsgId + Redis persistence → services/last-seen-manager.service.ts                | active | telegram-mtproto-listener.adapter.ts:153, 237-252, 344-349, 740-749 (30 lines)              |
| T7-msg-queue     | Extract queue + waitingResolvers → services/message-queue.service.ts                             | active | telegram-mtproto-listener.adapter.ts:148-149, 258-266, 338-339, 393-394, 627-628 (20 lines) |
| T8-rewire        | Rewire adapter to use all extracted services, remove dead code                                   | active | entire adapter                                                                              |

## Open assumptions (announced defaults)

| assumption                                              | adopted default                                                           | rationale                                                 | reversible?                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------- |
| New files placement                                     | utils/transformer → `api/mtproto/`, services → `infrastructure/services/` | Follows existing structure (FloodWaitHandlerService etc.) | Yes — just import paths             |
| TelegramMessageTransformer as pure functions, not class | No DI needed — pure TypeScript transforms                                 | The conversion is deterministic, stateless                | Yes — can wrap in class later       |
| PeerResolver receives client as parameter (not DI)      | Separates concern: peer resolution uses client, doesn't own it            | avoid circular DI, keeps resolver stateless               | Yes — inject client manager instead |
| ESLint --fix after each file creation                   | Catches import issues immediately                                         | matches existing workflow                                 | N/A                                 |

## Findings (cited - path:lines)

- Port interface `TelegramListenerPort` has 5 methods: `subscribe`, `backfill`, `disconnect`, `resolveChannelMetadata`, `joinChannel` — adapter implements all via `telegram-listener.port.ts`
- `extractMediaAttachments` is PRIVATE — 0 external callers (confirmed by codegraph)
- No other class implements `TelegramListenerPort` — adapter is the single implementation
- Existing services pattern: `@Injectable` classes in `infrastructure/services/` (FloodWaitHandlerService, FloodWaitCounterService, SleepWindowService)
- Module registration in `shared-ingestion.module.ts` — new services must be added to `providers` + `exports`
- `ensureClient()` is called in 6 places — extracting client mgmt changes all of them

## Decisions (with rationale)

1. **Extract PeerResolver as stateless utility class, not @Injectable** — it takes TelegramClient as param, needs no DI. Simpler, no module registration needed.
2. **MediaDownloadService as @Injectable** — needs FloodWaitHandlerService and CryptoNewsMediaDownloader injected. Must be in module providers.
3. **LastSeenManager as @Injectable** — needs RedisService injected. Must be in module providers.
4. **MessageQueue as class (not @Injectable)** — pure data structure, no DI. Constructor-instantiated by adapter.
5. **Keep polling loop in adapter** — tightly coupled to async generator `yield` pattern in `subscribe()`. Extracting would require restructuring the yield flow. Instead, extract sub-logic (per-message transform, media download, lastSeen update) that the loop calls.

## Scope IN

- Extract utils types/MediaExtractor/functions → separate file
- Extract message conversion → shared function
- Extract TelegramClientManager as @Injectable
- Extract PeerResolver as stateless class
- Extract MediaDownloadService as @Injectable
- Extract LastSeenManager as @Injectable
- Extract MessageQueue as plain class
- Rewire adapter to compose all of the above
- Update shared-ingestion.module.ts providers
- ESLint --fix + prettier after each file

## Scope OUT (Must NOT have)

- Do NOT change TelegramListenerPort interface
- Do NOT change TelegramRawMessage, TelegramMediaAttachment types
- Do NOT change any test file (FakeListener, StubListener work at port level)
- Do NOT change the public API: subscribe(), backfill(), disconnect(), resolveChannelMetadata(), joinChannel()
- Do NOT change behavior: polling stagger, flood wait, sleep window, media download retry — all must remain identical
- Do NOT extract the polling loop itself (stays in adapter, only sub-logic moved)
- Do NOT change DI wiring beyond shared-ingestion.module.ts

## Open questions

None — all explored from codebase.

## Approval gate

status: awaiting-approval
