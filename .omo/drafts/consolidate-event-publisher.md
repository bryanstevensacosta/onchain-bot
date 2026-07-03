---
slug: consolidate-event-publisher
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/consolidate-event-publisher.md (done) — wait for user approval
approach: 4-wave refactor; create shared abstract + in-process impl in shared/common/; migrate 13 BCs to alias-and-replace pattern; full type-check + test suite after each phase
---

# Draft: consolidate-event-publisher

## Components (topology ledger)
| id | outcome (one line) | status | evidence path |
|----|--------------------|--------|---------------|
| C1 | shared/common/ports/domain-event.publisher.ts created | active | `.omo/evidence/task-1.diff` |
| C2 | shared/common/messaging/in-process-domain-event.publisher.ts created | active | `.omo/evidence/task-2.diff` |
| C3 | 13 per-BC abstracts replaced with aliases | active | `.omo/evidence/task-3.diff` |
| C4 | 13 per-BC in-process impls replaced + 13 module wirings updated | active | `.omo/evidence/task-4.diff` |
| C5 | Trees green after cleanup | active | `.omo/evidence/task-5.md` |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|------------|-----------------|-----------|-------------|
| Naming strategy | Keep per-BC abstract alias (e.g., `KolEventPublisher`) extending shared | Zero breakage: type signatures, DI tokens, mock imports unchanged | yes — can fully consolidate later |
| DI wiring | Change `useClass` in modules from per-BC to shared `InProcessDomainEventPublisher` | All 13 BCs use EventEmitter2 with same constructor; one impl fits all | yes — a new BC could subclass the shared impl |
| `InProcessPublishingEventPublisher` bug fix | **NO** — the redundant `publishAll` override stays in Phase 3? Actually, the shared impl will NOT have the redundant override, and the old impl WILL be deleted, so the bug goes away for free | No extra effort | N/A |
| `telegram/vip-calls/shared/` vs `telegram/shared/` | Treated as two separate but both follow the same pattern (both are in the 13) | No special handling needed | N/A |

## Findings (cited — path:lines)
- 13 abstract event publishers found (identical body, different name):
  1. `token/classification/application/ports/classification-event.publisher.ts`
  2. `token/achievement/application/ports/achievement-event.publisher.ts`
  3. `token/normalization/application/ports/normalization-event.publisher.ts`
  4. `token/vip-call-approval/application/ports/vip-call-approval-event.publisher.ts`
  5. `token/intake/parsing/application/ports/parsing-event.publisher.ts`
  6. `token/intake/extraction/application/ports/extraction-event.publisher.ts`
  7. `token/scoring/application/ports/scoring-event.publisher.ts`
  8. `token/enrichment/application/ports/enrichment-event.publisher.ts`
  9. `chain/detection/application/ports/chain-detection-event.publisher.ts`
  10. `kol/identity/application/ports/kol-event.publisher.ts`
  11. `dashboard/application/ports/kpis-updated-event.publisher.ts`
  12. `telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher.ts`
  13. `telegram/shared/application/ports/publishing-event.publisher.ts`

- 13 in-process EventEmitter2 implementations (identical body, different name):
  1. `token/classification/infrastructure/messaging/in-process-classification-event.publisher.ts`
  2. `token/achievement/infrastructure/messaging/in-process-achievement-event.publisher.ts`
  3. `token/normalization/infrastructure/messaging/in-process-normalization-event.publisher.ts`
  4. `token/vip-call-approval/infrastructure/messaging/in-process-vip-call-approval-event.publisher.ts`
  5. `token/intake/parsing/infrastructure/messaging/in-process-parsing-event.publisher.ts`
  6. `token/intake/extraction/infrastructure/messaging/in-process-extraction-event.publisher.ts`
  7. `token/scoring/infrastructure/messaging/in-process-scoring-event.publisher.ts`
  8. `token/enrichment/infrastructure/messaging/in-process-enrichment-event.publisher.ts`
  9. `chain/detection/infrastructure/messaging/in-process-chain-detection-event.publisher.ts`
  10. `kol/identity/infrastructure/messaging/in-process-kol-event.publisher.ts`
  11. `dashboard/infrastructure/messaging/in-process-kpis-updated-event.publisher.ts`
  12. `telegram/ingestion/crypto-news/infrastructure/messaging/in-process-crypto-news-event.publisher.ts`
  13. `telegram/shared/infrastructure/messaging/in-process-publishing-event.publisher.ts`

- 13 modules wiring the publisher (via `useClass` or `useExisting`):
  1. `token/classification/classification.module.ts`:50
  2. `token/normalization/normalization.module.ts`:47
  3. `token/vip-call-approval/vip-call-approval.module.ts`:62
  4. `token/intake/parsing/parsing.module.ts`:41
  5. `token/intake/extraction/extraction.module.ts`:52
  6. `token/scoring/scoring.module.ts`:69
  7. `token/enrichment/enrichment.module.ts`:137
  8. `chain/detection/chain-detection.module.ts`:59
  9. `kol/identity/identity.module.ts`:76
  10. `dashboard/dashboard.module.ts` (uses `useExisting`)
  11. `token/achievement/achievement.module.ts` (uses `useExisting`)
  12. `telegram/ingestion/crypto-news/crypto-news-ingestion.module.ts`:81
  13. `telegram/vip-calls/vip-channel/vip-channel.module.ts`:66

- Existing empty dirs (`shared/common/` has `ports` dir): NO — `cache/`, `config/`, `persistence/`, `utils/`, `value-objects/` exist but no `ports/` or `messaging/`. Both need creation.
- `shared/common/ports/` path: NOT initialized. Will create alongside `shared/common/messaging/`.

## Decisions (with rationale)
- **Approach A (alias) over B (rename)**: Zero breakage. DI tokens use the abstract class name (e.g., `KolEventPublisher`) as `provide:` key; renaming would change every module's DI wiring. With alias: every existing import, `provide:`, `useExisting`, and mock stays unchanged.
- **4 waves over 1 mega-PR**: Each wave leaves `npm run test:backend` green. Gradual, reviewable, low risk of cascading failures.
- **No per-BC concrete tests for the publisher**: The abstract and in-process impl are trivial (10-20 LOC). The real test of this refactor is the existing 306 backend tests still passing, plus `npx tsc --noEmit`.
- **`shared/common/ports/` + `shared/common/messaging/`** over creating a new `shared/common/event-publisher/` subdir: Fits the existing structure. `ports/` for abstracts, `messaging/` for impls. Matches per-BC convention.

## Scope IN
- 2 new files in `shared/common/`
- Edit 13 abstract files (add import + change class to one-liner extending shared)
- Delete 13 in-process impl files OR replace with one-liner re-exporting shared
- Edit 13 module provider arrays
- Full `npm run test:backend` after each wave

## Scope OUT (Must NOT have)
- No change to use case or handler logic
- No change to domain event payloads or signatures
- No change to `shared/kernel/` (DomainEvent base class untouched)
- No change to other infrastructure (repos, controllers, adapters — only event publishers)
- No change to test files (unless module wiring change requires mocks to be adjusted)
- No attempt to merge the two `telegram/*/shared` folders (different domains)
- No removal of per-BC abstract alias files (Phase 4 is optional; keep them for backwards compat)

## Open questions
- None blocking. The approach, scope, and sequencing are fully specified.

## Approval gate
status: awaiting-approval
