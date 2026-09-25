# C1 — Threads de-stubbing contract (Tramo 1 ↔ Tramo 2)

> Version: 2026-09-25 · Status: v1 skeleton (both stubs pinned 501).
> Owner: `apps/feed-publisher/src/threads/` (Tramo 2, todo 8).
> Consumer: template service (`apps/kol-system/src/templates/`, Tramo 1, todo 10).
> Plan refs: `.omo/plans/mega-refactor-content-publisher.md` todo 8 ·
> `.omo/drafts/mega-refactor-tramos.md` §7.6 C1 · spec
> `.kiro/specs/refactor-content-publisher/11-refactor.md` §9.

## 1. v1 status (both sides stubbed, pinned by tests)

| Side                               | Stub                                                                                                                                                                                        | Pinning spec                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Template service (Tramo 1)         | `:id/threads` + `:id/threads/*` → `501 THREADS_NOT_IMPLEMENTED`; `threadConfig: null` ALWAYS on the template aggregate; no thread domain/service/repo exists there                          | `apps/kol-system/src/templates/api/http/threads-stub.controller.spec.ts` |
| Feed-publisher (this app, Tramo 2) | `/api/threads` + `/api/threads/:id` + `/api/threads/:id/*` → `501 THREADS_NOT_IMPLEMENTED` (same code); domain skeleton (builder/scheduler/use-cases/cron) tested directly, never over HTTP | `src/threads/api/http/threads.controller.spec.ts`                        |

Rule: nobody half-implements threads on the template side — thread
state lives ONLY here from v2 on.

## 2. v2 endpoint activation (this app)

| v2 endpoint                     | v1 today | v2 behavior                                                                                                                                                             |
| ------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/threads`             | 501      | `CreateThreadUseCase` with `CreateThreadDto` (`messages[]`: `content` + `mediaUrls[]` + `delaySeconds`, `api/input/threads.input.ts` — shape frozen now) → DRAFT thread |
| `GET /api/threads/:id`          | 501      | Thread view (status + per-message progress + publish state)                                                                                                             |
| `POST /api/threads/:id/enqueue` | 501      | `EnqueueThreadUseCase` (DRAFT → QUEUED)                                                                                                                                 |
| `POST /api/threads/:id/publish` | 501      | `PublishThreadUseCase` (manual trigger; same resume/backoff rules as the cron)                                                                                          |
| `GET /api/threads`              | 501      | List threads (newest first, `?status`, `?limit` — mirrors `GET /api/queue`)                                                                                             |

Activation checklist (v2 todo): bind `ThreadsBotApiAdapter`
(exported by `TelegramModule` — todo 7 DONE, second C-SHARED-01 move)
to `ThreadMessagePublisherPort`, flip the controller handlers from
stub to use-cases, add the list view +
`ThreadsHealthIndicator` to the composite probe.

## 3. What the template side consumes (v2)

- `threadConfig` (owned by the template aggregate, `null` in v1):
  ```ts
  interface ThreadConfig {
    enabled: boolean; // template opts into thread publishing
    defaultDelayMs: number; // gap between consecutive messages (>= 0)
    maxMessages: number; // cap per thread (skeleton default: no cap enforced)
  }
  ```
  The template service validates + stores this config; it NEVER stores
  thread runtime state (progress, retries) — that lives in
  `feed_threads` / `feed_thread_messages` here.
- Threads bot: `THREADS_BOT_TOKEN` is owned by this app's telegram
  module (`TelegramModule`, todo 7 DONE — `ThreadsBotApiAdapter`
  exported, same send semantics as crypto with its own rate budget).
  The template side holds no threads token, not even as config —
  per-template threads targets arrive later via the sessions model
  (P34), referencing threads by id. v2 binds `ThreadsBotApiAdapter`
  to `ThreadMessagePublisherPort` (one-line provider swap, the
  use-case does not change).
- Publish-state read model (spec §9, `Thread.toPublishState()`):
  ```ts
  interface ThreadPublishState {
    threadId: string;
    messagesPublished: number; // 0..N
    lastPublishedMessageIndex: number; // -1 when nothing published
    status: 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
    failureReason?: string;
  }
  ```

## 4. Failure matrix (pinned by `publish-thread.use-case.spec.ts`)

- **Partial publish** — message 1 ok, message 2 transient-fails →
  `PARTIAL`; retry resumes from message 2 (`resumeIndex ===
messagesPublished`), message 1 is never reposted.
- **Critical failure** — bad token/config → `FAILED`, terminal, no
  retry (fix the token first).
- **Transient failure** — rate limit on the first message →
  `IN_PROGRESS` with `nextAttemptAt = now + backoff` (1s doubling,
  30s cap); ticks inside the window attempt nothing.
- **Sequencing** — a message whose cumulative `delaySeconds` has not
  elapsed pauses the run as `IN_PROGRESS` awaiting its due time
  (burns no attempt).
- Threads skip matching/keywords/blacklist by design (straight to the
  publish path); per-message dedup (not whole-thread) is a v2 concern
  against the deduplication module.

## 5. Storage + runtime (v1 ships unwired shapes)

- Tables `feed_threads` + `feed_thread_messages` (FK-less: message rows
  carry `threadId`, never a DB FK — same pattern as the unified
  queue). TypeORM shapes + mapper in
  `infrastructure/persistence/typeorm/` are UNWIRED (GAP-1); live reads
  use `InMemoryThreadRepository` (oldest-first due order).
- Cron `feed-threads-publisher` every minute, master switch
  `THREADS_CRON_ENABLED` (default `true`), overlap guard, batch limit
  10 per tick; per-thread failures are recorded, never kill the tick.
- Out of scope v1 (spec §9 futuro): thread templates, analytics,
  editing pending threads, cancellation.

## 6. Cross-tramo references

- Template stub: `apps/kol-system/src/templates/api/http/threads-stub.controller.ts`
  (+ `.spec.ts` pinning the same 501s).
- Template aggregate field: `threadConfig: null` in the publishing
  template entity (Tramo 1, todo 10).
- Threads bot transport: `apps/feed-publisher/src/telegram/` (todo 7).
- NOTE (2026-09-25): this contract is linked from
  `apps/feed-publisher/AGENTS.md` (P25 living doc). The mirror link
  from `apps/kol-system/AGENTS.md` is pending — this todo is
  read-only outside `apps/feed-publisher/` by constraint.
