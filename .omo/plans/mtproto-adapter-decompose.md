# mtproto-adapter-decompose - Work Plan

## TL;DR (For humans)

**What you'll get:** El archivo `telegram-mtproto-listener.adapter.ts` pasa de 794 líneas (~270 después) — se divide en 6 archivos más pequeños y enfocados. El adaptador principal queda como una fachada delgada que compone servicios especializados.

**Why this approach:** Extracción gradual — cada fase es un paso atómico y reversible. Las dependencias entre fases son lineales (T1→T2→T5), así que no hay merge hell. Usamos el patrón NestJS existente (`@Injectable` en `infrastructure/services/`).

**What it will NOT do:** No cambia la API pública del adaptador, no cambia la interfaz `TelegramListenerPort`, no modifica tests, no altera el comportamiento de polling/download/join.

**Effort:** Medium
**Risk:** Low-Medium — los módulos extraídos son puramente mecánicos (sin lógica nueva); el riesgo está en atar todos los imports y providers del módulo NestJS correctamente.
**Decisions to sanity-check:** 1) Queue/lastSeen/polling loop se quedan en el adaptador (acoplados al yield). 2) PeerResolver como clase plana (no @Injectable).

Your next move: **approve** the plan to proceed, or request a high-accuracy review (Momus).

---

> TL;DR (machine): Medium effort, Low-Medium risk — 7 extraction todos + 1 rewire + 1 verify. 794→~270 loc for adapter. 5 new files. 3 new @Injectable in module.

## Scope

### Must have

- Extract utils types + module-level functions → `telegram-mtproto.utils.ts`
- Extract 3× duplicated message transform → `telegram-message-transformer.ts`
- Extract TelegramClient lifecycle → `services/telegram-client-manager.service.ts` (@Injectable)
- Extract channel resolution + join → `services/telegram-peer-resolver.service.ts` (plain class)
- Extract media download + retry → `services/telegram-media-download.service.ts` (@Injectable)
- Extract lastSeen Redis persistence → `services/last-seen-manager.service.ts` (@Injectable)
- Extract queue + waitingResolvers → `services/message-queue.ts` (plain class)
- Rewire adapter + update `shared-ingestion.module.ts`
- ESLint + tsc + tests must pass

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No changes to `TelegramListenerPort` / `TelegramRawMessage` / `TelegramMediaAttachment`
- No changes to test files (FakeListener, StubListener are at port level — unaffected)
- No changes to public adapter methods
- No extraction of the polling loop itself (stays in adapter)
- No behavior changes — extract, don't refactor

## Verification strategy

> Zero human intervention — all verification is agent-executed.

- Test decision: tests-after — existing test suite + ESLint + tsc --noEmit
- Evidence: `.omo/evidence/mtproto-adapter-decompose/`

## Execution strategy

### Parallel execution waves

- **Wave 1** (parallel — independent): T1, T3, T6, T7
- **Wave 2** (depends on Wave 1): T2 (needs T1 types), T4 (needs T3 client)
- **Wave 3** (depends on Wave 2): T5 (needs T3 + T4)
- **Wave 4**: T8 — Rewire adapter (depends on T1-T7)
- **Wave 5**: Final verification

### Dependency matrix

| Todo             | Depends on | Blocks     | Can parallelize with |
| ---------------- | ---------- | ---------- | -------------------- |
| T1-utils         | —          | T2, T8     | T3, T6, T7           |
| T2-transformer   | T1         | T8         | T4                   |
| T3-client-mgr    | —          | T4, T5, T8 | T1, T6, T7           |
| T4-peer-resolver | T3         | T5, T8     | T2                   |
| T5-media-dl      | T3, T4     | T8         | —                    |
| T6-last-seen     | —          | T8         | T1, T3, T7           |
| T7-msg-queue     | —          | T8         | T1, T3, T6           |
| T8-rewire        | T1-T7      | T9         | —                    |
| T9-verify        | T8         | —          | —                    |

## Todos

- [x] 1. **Extract utils to `telegram-mtproto.utils.ts`**
     What to do / Must NOT do:
     Create `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto.utils.ts` and MOVE:
  - `GramjsMessageEntity` interface (lines 31-36)
  - `RawTelegramMessage` interface (lines 38-45)
  - `MediaSlot` type (lines 47-51)
  - `RawMediaObject` interface (lines 53-60)
  - `MediaExtractor` class (lines 62-139)
  - `safeToString` function (lines 752-760)
  - `fileReferenceToBuffer` function (lines 762-767)
  - `coerceToString` function (lines 769-777)
  - `coerceToLong` function (lines 779-782)
  - `isRefreshableDownloadError` function (lines 784-794)

  In the adapter file, DELETE all moved code and REPLACE with:

  ```typescript
  import type {
    GramjsMessageEntity,
    RawTelegramMessage,
    RawMediaObject,
    TelegramMediaAttachment,
  } from './telegram-mtproto.utils';
  import {
    MediaExtractor,
    safeToString,
    coerceToLong,
    isRefreshableDownloadError,
  } from './telegram-mtproto.utils';
  ```

  (Keep the `TelegramMediaAttachment` import from the port — it must stay as `import type` from `telegram-listener.port`.)

  Must NOT: Export `MediaSlot` (it's internal to `telegram-mtproto.utils.ts`).

  Parallelization: Wave 1 | Blocked by: — | Blocks: T2, T8
  References: `telegram-mtproto-listener.adapter.ts:31-139`, `:752-794`
  Acceptance criteria: `tsc --noEmit` succeeds, adapter still works
  QA: happy — ESLint 0 err on both files; failure — missing import breaks `tsc --noEmit`
  Commit: `refactor(telegram): extract utils/MediaExtractor/safeToString to telegram-mtproto.utils.ts`

- [x] 2. **Extract `TelegramMessageTransformer` to `telegram-message-transformer.ts`**
     What to do / Must NOT do:
     Create `apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-message-transformer.ts` with:

  ```typescript
  import type { TelegramRawMessage } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
  import type {
    GramjsMessageEntity,
    RawTelegramMessage,
  } from './telegram-mtproto.utils';
  import { MediaExtractor } from './telegram-mtproto.utils';

  export function transformMessage(
    peerId: string,
    rawMsg: RawTelegramMessage,
    media: ReadonlyArray<TelegramMediaAttachment> | undefined,
  ): TelegramRawMessage {
    return {
      peerId,
      messageId: rawMsg.id,
      text: rawMsg.message ?? '',
      occurredAt: new Date(rawMsg.date * 1000),
      entities: (rawMsg.entities ?? []).map((e) => ({
        offset: e.offset,
        length: e.length,
        type: normalizeEntityType(e.className),
        ...(e.url ? { url: e.url } : {}),
      })),
      ...(media ? { media } : {}),
      groupedId: rawMsg.groupedId,
    };
  }
  ```

  Also move `normalizeEntityType` function into this file.

  In the adapter, REPLACE all 3 duplicated conversion blocks (polling loop ~324-337, handleEvent ~379-392, backfill ~431-444) with a single call to `transformMessage()`.

  Must NOT: Change `normalizeEntityType` mapping dictionary.

  Parallelization: Wave 2 | Blocked by: T1 | Blocks: T8
  References: `telegram-mtproto-listener.adapter.ts:324-337`, `:379-392`, `:431-444`, `:714-730`
  Acceptance criteria: All 3 call sites use `transformMessage()`, same output shape
  QA: grep -n `normalizeEntityType` — only 1 definition (in new file), 3 references (in adapter)
  Commit: `refactor(telegram): extract message transform + entity normalizer to telegram-message-transformer.ts`

- [x] 3. **Extract `TelegramClientManager` to `services/telegram-client-manager.service.ts`**
     What to do / Must NOT do:
     Create `apps/backend/src/telegram/ingestion/shared/infrastructure/services/telegram-client-manager.service.ts`:

  ```typescript
  @Injectable()
  export class TelegramClientManager {
    private client: TelegramClient | null = null;
    private authorizedAtLeastOnce = false;

    constructor(private readonly config: ConfigService) {}

    getClient(): TelegramClient | null { ... }
    ensureClient(): TelegramClient { ... }  // same impl as adapter
    async connect(): Promise<void> { ... }   // ensureClient + connect
    async disconnect(): Promise<void> { ... } // disconnect + null
    async markAuthorizedIfTrue(): Promise<void> { ... }
    isAuthorized(): boolean { return this.authorizedAtLeastOnce; }
  }
  ```

  Move logic from: `getClient` (174-176), `ensureClient` (188-206), `onModuleInit`->`markAuthorizedIfTrue` (178-182), `disconnect` (625-637), `markAuthorizedIfTrue` (699-708).

  In adapter: inject `TelegramClientManager`, replace all `this.client` with `this.clientManager.getClient()`, replace `this.ensureClient()` with `this.clientManager.ensureClient()`, replace `this.markAuthorizedIfTrue()` with `this.clientManager.markAuthorizedIfTrue()`, replace `this.disconnect()` in onModuleDestroy with `this.clientManager.disconnect()`.

  Must NOT: Change how TelegramClient is created (same config, same gramjs logger config).
  Must NOT: Expose `client` field publicly (wrap in getter).

  Parallelization: Wave 1 | Blocked by: — | Blocks: T4, T5, T8
  References: `telegram-mtproto-listener.adapter.ts:146`, `:151`, `:174-206`, `:625-637`, `:699-708`
  Acceptance criteria: Adapter injects `TelegramClientManager`, no direct `this.client` field
  QA: grep -n 'private client:' adapter — 0 matches; grep 'clientManager' — 6+ matches
  Commit: `refactor(telegram): extract TelegramClient lifecycle to TelegramClientManager`

- [x] 4. **Extract `TelegramPeerResolver` to `services/telegram-peer-resolver.ts`**
     What to do / Must NOT do:
     Create `apps/backend/src/telegram/ingestion/shared/infrastructure/services/telegram-peer-resolver.ts` (plain class, no @Injectable):

  ```typescript
  export class TelegramPeerResolver {
    async resolvePeerAsChannel(client: TelegramClient, channelId: string) { ... }
    async resolveChannelMetadata(client: TelegramClient, channelId: string): Promise<ResolvedChannelMetadata> { ... }
    async joinChannel(client: TelegramClient, peerId: string): Promise<JoinChannelResult> { ... }
  }
  ```

  Move logic from: `resolvePeerAsChannel` (449-468), `resolveChannelMetadata` (639-661), `joinChannel` (663-697).
  NOTE: `resolveChannelMetadata` and `joinChannel` call `resolvePeerAsChannel` internally — these stay method calls on `this`.

  In adapter: inject `TelegramPeerResolver`, replace calls:
  - `this.resolvePeerAsChannel(peerId)` → `this.peerResolver.resolvePeerAsChannel(this.clientManager.getClient()!, peerId)`
  - `this.resolveChannelMetadata(channelId)` → `this.peerResolver.resolveChannelMetadata(this.clientManager.getClient()!, channelId)`
  - `this.joinChannel(peerId)` → `this.peerResolver.joinChannel(this.clientManager.getClient()!, peerId)`

  Must NOT: Make `TelegramPeerResolver` an @Injectable (no DI needed).
  Must NOT: Change channel resolution logic.

  Parallelization: Wave 2 | Blocked by: T3 (uses TelegramClient) | Blocks: T5, T8
  References: `telegram-mtproto-listener.adapter.ts:449-468`, `:639-697`
  Acceptance criteria: All 3 methods moved, callers updated in adapter
  QA: `tsc --noEmit` passes
  Commit: `refactor(telegram): extract peer resolution and channel join to TelegramPeerResolver`

- [x] 5. **Extract `TelegramMediaDownloadService` to `services/telegram-media-download.service.ts`**
     What to do / Must NOT do:
     Create `apps/backend/src/telegram/ingestion/shared/infrastructure/services/telegram-media-download.service.ts`:

  ```typescript
  @Injectable()
  export class TelegramMediaDownloadService {
    constructor(
      private readonly floodWaitHandler: FloodWaitHandlerService,
      @Inject(forwardRef(() => CryptoNewsMediaDownloader))
      private readonly mediaDownloader: CryptoNewsMediaDownloader,
      private readonly peerResolver: TelegramPeerResolver,
      private readonly clientManager: TelegramClientManager,
    ) {}

    async downloadAndSave(
      msgId: number,
      peerId: string,
      attachment: TelegramMediaAttachment,
      rawMedia: Api.TypeMessageMedia | undefined,
    ): Promise<TelegramMediaAttachment | undefined> { ... }
  }
  ```

  Move ALL logic from `extractMediaAttachments` (475-623) — the download, retry, refresh mechanism.
  This includes the full try/catch block with `isRefreshableDownloadError`, the `Api.MessageMediaPhoto` reconstruction, and `coerceToLong`/`safeToString` calls for fresh photo.

  In adapter: replace `extractMediaAttachments` body with:

  ```typescript
  const attachment = new MediaExtractor().extract(msg.media);
  if (!attachment) return undefined;
  return this.mediaDownloadService.downloadAndSave(
    msg.id,
    peerId,
    attachment,
    msg.media as Api.TypeMessageMedia | undefined,
  );
  ```

  Must NOT: Change the download/retry logic at all — moving it, not changing behavior.
  Must NOT: Remove the `forwardRef(() => CryptoNewsMediaDownloader)` — circular dep exists.

  Parallelization: Wave 3 | Blocked by: T3, T4 | Blocks: T8
  References: `telegram-mtproto-listener.adapter.ts:475-623`
  Acceptance criteria: All download logic moved to service, adapter calls service
  QA: Tests pass (5/5), tsc passes
  Commit: `refactor(telegram): extract media download with retry/refresh to TelegramMediaDownloadService`

- [x] 6. **Extract `LastSeenManager` to `services/last-seen-manager.service.ts`**
     What to do / Must NOT do:
     Create `apps/backend/src/telegram/ingestion/shared/infrastructure/services/last-seen-manager.service.ts`:

  ```typescript
  @Injectable()
  export class LastSeenManager {
    private lastSeenMessageId = new Map<string, number>();
    private readonly logger = new Logger(LastSeenManager.name);

    constructor(private readonly redis: RedisService) {}

    get(peerId: string): number { return this.lastSeenMessageId.get(peerId) ?? -1; }
    set(peerId: string, id: number): void { this.lastSeenMessageId.set(peerId, id); }
    async load(channelIds: string[]): Promise<void> { ... } // from Redis
    async persist(peerId: string, messageId: number): Promise<void> { ... } // to Redis via safeRedisSet
    size(): number { return this.lastSeenMessageId.size; }
  }
  ```

  Move: `lastSeenMessageId` Map (153), Redis loading in `subscribe` (237-252), Redis save in polling loop (344-349), `safeRedisSet` (740-749), `normalizePeerId` (732-738).

  In adapter: inject `LastSeenManager`, replace `this.lastSeenMessageId` calls with `this.lastSeenManager`.

  Must NOT: Change Redis key format (`ingestion:lastSeen:${normalizedPeerId}`).

  Parallelization: Wave 1 | Blocked by: — | Blocks: T8
  References: `telegram-mtproto-listener.adapter.ts:153`, `:237-252`, `:344-349`, `:732-749`
  Acceptance criteria: All Redis lastSeen operations go through LastSeenManager
  QA: `grep -n 'lastSeenMessageId' adapter` — 0 matches
  Commit: `refactor(telegram): extract LastSeenManager for Redis-backed message ID tracking`

- [x] 7. **Extract `MessageQueue` to `services/message-queue.ts`**
     What to do / Must NOT do:
     Create `apps/backend/src/telegram/ingestion/shared/infrastructure/services/message-queue.ts`:

  ```typescript
  export class MessageQueue<T> {
    private queue: T[] = [];
    private waitingResolvers: Array<() => void> = [];

    push(item: T): void {
      this.queue.push(item);
      const resolver = this.waitingResolvers.shift();
      if (resolver) resolver();
    }

    shift(): T | undefined {
      return this.queue.shift();
    }

    get length(): number {
      return this.queue.length;
    }

    waitForItem(): Promise<void> {
      return new Promise((resolve) =>
        this.waitingResolvers.push(() => resolve()),
      );
    }

    flush(): void {
      const resolver = this.waitingResolvers.shift();
      if (resolver) resolver();
    }

    clear(): void {
      this.queue = [];
      this.waitingResolvers = [];
    }
  }
  ```

  Move: `queue`, `waitingResolvers` fields + push/shift/flush usage from adapter.
  In adapter: `private readonly messageQueue = new MessageQueue<TelegramRawMessage>()`.
  Replace `this.queue` with `this.messageQueue`, `this.waitingResolvers` with messageQueue methods.
  Replace the await pattern in subscribe (258-266) with `await this.messageQueue.waitForItem()`.
  Replace disconnect resolver flush (627-628) with `this.messageQueue.flush()`.

  Must NOT: Change the blocking behavior (async generator must still wait for items).

  Parallelization: Wave 1 | Blocked by: — | Blocks: T8
  References: `telegram-mtproto-listener.adapter.ts:148-149`, `:258-266`, `:338-339`, `:393-394`, `:627-628`
  Acceptance criteria: Adapter uses MessageQueue, same push/wait behavior
  Commit: `refactor(telegram): extract async message queue from adapter`

- [x] 8. **Rewire adapter**
     What to do / Must NOT do:
     After all T1-T7 are done:
  1. Remove all `private` fields from adapter that moved to services (client, lastSeenMessageId, queue, waitingResolvers, authorizedAtLeastOnce)
  1. Remove all `private` methods that moved to services/utilities (getClient, ensureClient, markAuthorizedIfTrue, resolvePeerAsChannel, resolveChannelMetadata, joinChannel, normalizeEntityType, normalizePeerId, safeRedisSet, extractMediaAttachments)
  1. Remove `normalizeEntityType`, `normalizePeerId` from adapter
  1. Remove `coerceToLong`, `safeToString` imports (no longer needed in adapter)
  1. Inject all new services in constructor: `TelegramClientManager`, `TelegramPeerResolver`, `TelegramMediaDownloadService`, `LastSeenManager`
  1. Add `private readonly messageQueue = new MessageQueue<TelegramRawMessage>()` as field
  1. Remove `bigInt`, `Api` from imports if no longer used directly (check refresh path)
  1. Run `npx eslint --fix` on adapter
  1. Delete now-unnecessary standalone functions from bottom of file

  Update `shared-ingestion.module.ts`:
  - Add to `providers`: `TelegramClientManager`, `TelegramMediaDownloadService`, `LastSeenManager`
  - Add to `exports`: `TelegramClientManager` (needed elsewhere? check callers)
  - Keep: `TelegramPeerResolver` and `MessageQueue` are NOT @Injectable — no registration needed

  Must NOT: Change public method signatures or behavior.

  Parallelization: Wave 4 | Blocked by: T1-T7 | Blocks: T9
  References: entire adapter file
  Acceptance criteria: Adapter compiles, imports clean (0 unused), ESLint 0 err
  QA: `npx eslint --fix` passes, `tsc --noEmit` passes
  Commit: `refactor(telegram): rewire adapter to compose extracted services`

- [x] 9. **Final verification**
     What to do:
  1. `wc -l` on adapter → target ~270 lines
  1. `npx eslint apps/backend/src/telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter.ts` → 0 errors, 0 warnings
  1. `npx tsc --noEmit` → 0 errors
  1. `npx jest --testPathPatterns="telegram-mtproto-listener|ingestion-coordinator"` → all pass
  1. Verify each new file exists and has correct exports:
     - `telegram-mtproto.utils.ts`
     - `telegram-message-transformer.ts`
     - `services/telegram-client-manager.service.ts`
     - `services/telegram-peer-resolver.ts`
     - `services/telegram-media-download.service.ts`
     - `services/last-seen-manager.service.ts`
     - `services/message-queue.ts`

  Parallelization: Wave 5 | Blocked by: T8 | Blocks: —
  References: all files
  Acceptance criteria: All 5 checks pass
  Commit: (no separate commit — squashed with T8)

## Final verification wave

- [x] 10. Plan compliance audit — verify all todos completed
- [x] 11. ESLint 0 err on all new + modified files
- [x] 12. Tests: 5/5 ingestion-coordinator tests pass
- [x] 13. `wc -l adapter` ~270 lines

## Commit strategy

- 7 atomic commits (one per Todo T1-T7) + 1 rewire commit (T8)
- Squash T9 into T8 if clean
- All commits on feature branch, merge to dev

## Success criteria

- Adapter: 794 → ~270 lines (-66%)
- 7 new files, each with single responsibility
- `shared-ingestion.module.ts` has 3 new providers
- ESLint 0, tsc 0, tests 5/5
- Zero behavior changes verified by existing tests
