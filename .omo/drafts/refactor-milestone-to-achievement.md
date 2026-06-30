---
slug: refactor-milestone-to-achievement
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/refactor-milestone-to-achievement.md
approach: "7-wave migration: (1) rename token/milestone→achievement, (2) rename token/token-gating→token/vip-call-approval, (3) restructure telegram/vip-calls, (4) create vip-decisions orchestrator, (5) enrichment on extraction for ALL tokens, (6) achievement mcAtCall from snapshot, (7) telegram_message_id"
---

# Draft: refactor-milestone-to-achievement

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| id | outcome | status | evidence |
|---|---|---|---|
| C1 | token/milestone/ → token/achievement/ with all renames | active | codegraph_explore |
| C2 | token/token-gating/ → token/vip-call-approval/ (renamed classes, events, DB tables, routes) | active | user decision |
| C3 | Restructure telegram/vip-calls/ with vip-decisions/vip-channel/vip-achievement/shared | active | user spec |
| C4 | New telegram/vip-calls/shared/ with Bot API publisher + shared types | active | user decision |
| C5 | New telegram/vip-calls/vip-decisions/ as orchestrator (approved/rejected consumers) | active | user decision |
| C6 | Extract milestone→achievement to telegram/vip-calls/vip-achievement/ | active | user spec |
| C7 | Trigger EnrichTokenUseCase on extraction for ALL tokens (no esperar normalization) | active | user spec |
| C8 | Change achievement mcAtCall baseline from publish time to enrichment snapshot | active | user spec |
| C9 | Add telegram_message_id to NotifiedAchievementEntity + repos + handlers | active | user spec |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| Event names | `milestone.*` → `achievement.*` | Consistent with directory rename | Breaking for external consumers, but there are none |
| DB table names | `milestone_thresholds` → `achievement_thresholds`, `notified_milestones` → `notified_achievements`, `monitored_calls` unchanged | Consistent with rename; `synchronize:true` handles migration | Yes, but requires backfill if production data exists |
| Redis key prefix | `milestone:notified:` → `achievement:notified:` | Consistent rename | Yes, but invalidates cache |
| vip-calls module file | `vip-calls.module.ts` stays as is at `vip-calls/channel/vip-calls.module.ts` | Keep NestJS module name stable | Yes |
| telegram/index.ts export | Change import path, keep public API symbol names | Backward compat for consumers | Yes |
| Controller route prefix | `/milestones` → `/achievements` | Consistent rename | Breaking for API consumers - none in production yet |

## Findings (cited - path:lines)

### token/milestone/ - 60 files reference "milestone"
- 34 files inside `token/milestone/` itself
- 26 external files import milestone symbols (app.module.ts:22, call-tracking call-tracking.module.ts:4, database.module.ts:25-28, vip-calls-publish.use-case.ts:14, vip-calls.module.ts:21, telegram/vip-calls-channel/infrastructure/event-bus/milestone-reached.handler.ts:3)
- 3 DB tables: `milestone_thresholds`, `monitored_calls`, `notified_milestones`
- 2 events: `milestone.register.call`, `milestone.call.reached`
- 1 Redis key prefix: `milestone:notified:`
- 1 API controller route: `GET/PUT/POST/DELETE /milestones/thresholds`, `POST /milestones/admin/tick`
- Config section: `app.milestone.*` in app.config.ts:320-332

### telegram/vip-calls-channel/ - 5 external files reference it
- `app.module.ts:19` (as `VipCallsModule` alias `TelegramPublishingModule`)
- `dashboard/dashboard.module.ts:5`
- `database.module.ts:28` (PublishedCallEntity import)
- `telegram/index.ts:1` (re-exports VipCallsModule)
- `call-tracking/call-tracking.module.ts:6`

### NotifiedMilestoneEntity current schema (notified-milestone.entity.ts:1-20)
- id: UUID PK
- callId: varchar
- threshold: float
- notifiedAt: timestamptz
- **NO telegram_message_id** — needs to be added

### Enrichment flow — triggered after normalization, NOT at extraction
Currently `EnrichTokenUseCase` is triggered by `normalization.call.normalized` event (via event handler). This means enrichment only happens for tokens that successfully normalize (pass parsing+normalization). Tokens that fail earlier never get snapshots.

Enrichment needs `chain` + `address` — available at extraction step. The `ExtractFromMessageUseCase` (`token/intake/extraction/application/handlers/extract-from-message.use-case.ts`) already extracts CAs and emits `extraction.candidates.extracted`.

### telegram/vip-calls channel milestone logic to extract
- `infrastructure/event-bus/milestone-reached.handler.ts` (41 lines) — listens to `CallMilestoneReachedEvent`, formats message via `formatMilestoneMessage()`, sends via Bot API
- `infrastructure/formatters/vip-message-formatter.adapter.ts:94-113` — `formatMilestoneMessage()` helper
- `vip-calls.module.ts:45` — registers `MilestoneReachedHandler`

## Decisions (with rationale)

1. **8 sequential waves** — dependency graph is:
   - W1: token/milestone → token/achievement (rename + imports, includes 13 spec files)
   - W2: token/token-gating → token/vip-call-approval (rename + imports + frontend + dashboard + ws)
   - W3: Restructure telegram/vip-calls/ with vip-decisions/vip-channel/vip-achievement/shared
   - W4: Define vip-call-publishing port in shared/ — vip-channel implements it, vip-decisions uses it (decoupled)
   - W5: Create vip-decisions orchestrator (consumes approval events, calls via port, delegates)
   - W6: Trigger enrichment on extraction for ALL tokens (parallel enrichment pipeline)
   - W7: Change achievement mcAtCall from publish-time to enrichment-snapshot baseline
   - W8: Add telegram_message_id to notified_achievements

2. **monitored_calls table NOT renamed** — concept is "call monitoring" not "milestone monitoring", used across milestone AND call-tracking BCs.

3. **Keep tsconfig path aliases unchanged** — `token/*`, `telegram/*` aliases already cover new paths. Only bare imports need updating.

4. **synchronize:true + manual migration for table renames** — synchronize doesn't handle table renames safely. Add directive: rename tables via SQL migration (ALTER TABLE ... RENAME TO) before starting the new build.

5. **Enrichment at extraction is event-driven** — new handler `@OnEvent('extraction.candidates.extracted')` calls `EnrichTokenUseCase.execute()` for each extracted CA. This is NON-BLOCKING to the main pipeline (fire-and-forget with error catching). The existing normalization→enrichment path stays for pipeline use; this is an EARLY enrichment for snapshot purposes.

6. **Achievement mcAtCall from snapshot** — `RegisterMonitoredCallUseCase` currently receives `mcAtCall` from the publish use case. Change it to look up the enrichment snapshot (`TokenSnapshotRepository.findByChainAndAddress()`) instead. If snapshot has no `marketCapUsd`, fall back to the published `mcAtCall`.

7. **vip-decisions decoupled via ports in shared/** — Instead of vip-decisions importing vip-channel's use case directly, we define a `VipCallPublishingPort` in `vip-calls/shared/`. vip-channel implements it. vip-decisions only depends on the port. vip-achievement similarly has its own port.

8. **vip-calls/shared/ contains only: BotApiPublisherAdapter, VipCallPublishingPort, VipAchievementPublishingPort** — no implementation, only contracts. Implementations stay in their respective sub-BCs (vip-channel implements VipCallPublishingPort, vip-achievement has its own internal publisher).

## Scope IN

- Rename ALL milestone→achievement in token/achievement/ (classes, files, events, DB tables, Redis keys, config, routes, ALL spec files too)
- Rename ALL token/token-gating→token/vip-call-approval (classes, files, events, DB tables, routes, ALL spec files too)
  - Includes SOURCE + SPEC files
  - Includes FRONTEND API endpoints in `apps/frontend/src/shared/api/endpoints.ts` + queries
  - Includes DASHBOARD `refresh-kpis.service.ts` event listeners
  - Includes WS GATEWAY `ws.gateway.ts` event mapping
- Move telegram/vip-calls-channel/ → telegram/vip-calls/ + restructure:
  - `vip-calls/shared/` — BotApiPublisherAdapter (extracted from telegram/shared/) + ports only:
    - `VipCallPublishingPort` (abstract class — vip-channel implements)
    - `VipAchievementPublishingPort` (abstract class — vip-achievement implements)
  - `vip-calls/vip-decisions/` — orchestrator ONLY depends on ports in shared/. Never imports vip-channel or vip-achievement use cases directly
  - `vip-calls/vip-channel/` — implements VipCallPublishingPort + approved call publication (controller, use cases, formatter, repository)
  - `vip-calls/vip-achievement/` — implements VipAchievementPublishingPort + achievement handler
- Create new handler `@OnEvent('extraction.candidates.extracted')` that calls `EnrichTokenUseCase.execute()` for each extracted CA
- Change `RegisterMonitoredCallUseCase` (→ `RegisterMonitoredCallForAchievementsUseCase`) to get `mcAtCall` from enrichment snapshot
- Add `telegram_message_id` column to `NotifiedAchievementEntity`
- DB migration: run ALTER TABLE ... RENAME TO for renamed tables BEFORE starting the new build
- Update ALL external imports across the backend (source + spec files)
- Run full test suite after each wave

## Scope OUT (Must NOT have)

- NOT rename `monitored_calls` table or `MonitoredCallEntity`
- NOT rename `milestonesHit` field in call-tracking (tracking metric, not achievement concept)
- NOT modify `telegram/ingestion/`, `telegram/chain-dexter-bot/`
- NOT remove existing normalization→enrichment event chain (both paths coexist)
- NOT change VIP call message format or channel configuration
- NOT rename existing `telegram/shared/` — keep it for cross-telegram shared code
- NOT create circular dependencies (enrichment must NOT import from telegram/)

## Open questions
None — decisions adopted from user's answers.

## Approval gate
status: approved
<!-- El usuario aprobó el plan el 2026-06-29 -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
