# compound-blacklist-keywords - Work Plan

## TL;DR (For humans)

**What you'll get:** La lista de Blacklist y Keywords va a tener items de 2 tipos: **Simple** (una sola frase, como hoy) y **Compound** (varias frases que deben matchear TODAS juntas). Cada sub-frase de un Compound tiene su propio modo de match (Exact/Substring) y caseSensitive. Además cada item (Simple o Compound) puede pedir que el mensaje tenga media (foto o video) para activarse. Se renombra "Image" → "Media" en toda la UI.

**Why this approach:** En vez de crear una entidad nueva (FilterGroup), se agrega un solo campo `andGroupId` a cada frase. Las frases con el mismo `andGroupId` forman un grupo AND. Las frases con `andGroupId = null` son Simples (OR, igual que hoy). Esto es backward compatible al 100% — los datos existentes siguen funcionando sin migración.

**What it will NOT do:** No se toca el PublisherQueueEntry ni su lógica de path de imágenes. No se renombra la columna `require_image` en la DB (solo cambia el nombre en TypeScript). No se agrega una entidad separada para grupos. No se modifica CryptoNewsMessage ni su carga de media.

**Effort:** Medium — ~18 archivos, 5-6 commits, 9 todos
**Risk:** Low — cambios localizados en un solo BC (crypto-news-publisher), backward compatible, con tests
**Decisions to sanity-check:** La lógica de matching AND en el handler (mezclar Simples con Compounds requiere separarlos primero) y la decisión de mantener el nombre de columna DB `require_image` para evitar data loss con TypeORM synchronize.

Your next move: **Run the dual high-accuracy Momus review** (you asked me to run Momus after writing the plan). I'll do that now.

---

> TL;DR (machine): Medium effort, Low risk. Add `andGroupId` field + rename `requireImage`→`requireMedia` + add `requireMedia` to BlacklistPhrase across 18 files in backend (domain/TypeORM/mappers/controllers/handler) and frontend (api/ui). Backward compatible via null default. 9 todos in 6 waves.

## Scope

### Must have

- `andGroupId: string | null` field on `Keyword` domain entity + TypeORM entity + mapper + DTOs
- `andGroupId: string | null` field on `BlacklistPhrase` domain entity + TypeORM entity + mapper + DTOs
- Rename `requireImage` → `requireMedia` on `Keyword` across all layers (TS property rename only; DB column name `require_image` stays unchanged)
- Add `requireMedia: boolean` (default false) to `BlacklistPhrase` across all layers
- Matching logic in `crypto-news-message-ingested.handler.ts`:
  - Simple phrases (andGroupId=null): OR logic (any match blocks/enqueues) — same as today
  - Compound groups (same andGroupId): AND logic (ALL must match to block/enqueue)
  - requireMedia check: if true and message has no media → skip that item/group
- Frontend UI: Simple/Compound toggle when adding items, expandable rows for Compounds showing sub-phrases with per-phrase matchMode + caseSensitive
- Tests for updated entities, controller DTOs, and handler logic

### Must NOT have (guardrails, anti-slop, scope boundaries)

- Do NOT rename the DB column `require_image` to `require_media` (TypeORM synchronize with true would drop+recreate = data loss). Keep `@Column({ name: 'require_image' })` but rename the TS property.
- Do NOT modify `PublisherQueueEntry` or its `imagePath`/`imagePaths` fields (that's about stored media files, not the require concept — out of scope)
- Do NOT add a separate CompoundGroup entity — use `andGroupId` as a shared UUID across phrase rows
- Do NOT modify `CryptoNewsMessage` or its media loading logic
- Do NOT change `EnqueueMatchingMessageUseCase` beyond the `requireImage`→`requireMedia` rename (its logic already handles `message.media.length === 0` correctly)

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after (existing test patterns: Jest `*.spec.ts` co-located). Update existing specs + create new ones for blacklist entity/controller.
- Framework: Jest (backend), Vitest (frontend — tests via `npm run test:frontend`)
- Evidence: `.omo/evidence/task-<N>-compound-blacklist-keywords.<ext>`

## Execution strategy

### Parallel execution waves

| Wave | Todos | Description                                        |
| ---- | ----- | -------------------------------------------------- |
| 1    | 1, 2  | Backend domain entities + matching logic + tests   |
| 2    | 3     | TypeORM entities + mappers                         |
| 3    | 4, 5  | Backend controllers + DTOs + tests                 |
| 4    | 6     | Handler matching logic + handler spec              |
| 5    | 7     | Frontend API types                                 |
| 6    | 8, 9  | Frontend UI (keywords-section + blacklist-manager) |

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| ---- | ---------- | ------ | -------------------- |
| 1    | —          | 3, 6   | 2                    |
| 2    | —          | 3, 6   | 1                    |
| 3    | 1, 2       | 4, 5   | —                    |
| 4    | 3          | —      | 5                    |
| 5    | 3          | —      | 4                    |
| 6    | 1, 2       | 7      | —                    |
| 7    | 4, 5, 6    | 8, 9   | —                    |
| 8    | 7          | —      | 9                    |
| 9    | 7          | —      | 8                    |

## Todos

> Implementation + Test = ONE todo. Never separate. Each todo carries: exhaustive References (executor has NO interview context), agent-executable Acceptance criteria, happy + failure QA scenarios each with an evidence path, and a Commit line.
>
> IMPORTANT: Every `@Column()` decorator that previously used a property name like `requireImage` MUST keep the SAME `name` attribute (e.g. `@Column({ name: 'require_image', ... })`) — only the TS property name changes to `requireMedia`. This ensures TypeORM `synchronize: true` does NOT drop+recreate the column.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. **Keyword entity: add `andGroupId`, rename `requireImage`→`requireMedia`, update matching with AND logic + update tests**
     What to do / Must NOT do:
  - Add `andGroupId: string | null` to `KeywordProps`, `Keyword.create()`, `Keyword.reconstitute()`, `Keyword` getters
  - Rename TS property `requireImage` → `requireMedia` in `KeywordProps`, `Keyword.create()`, `Keyword.reconstitute()`, getter, and all internal references
  - Rename `setTemplateId` references to `requireImage` → `requireMedia` (just property name, no logic change)
  - Add `Keyword.andGroupId` getter (string | null)
  - Must NOT rename DB column — only TS property
  - Update `keyword.entity.spec.ts`: add tests for `andGroupId`, `requireMedia` rename, requireMedia filtering
  - Must NOT change `matches()` behavior for Simple items (andGroupId=null) — must be backward compatible
  - The AND grouping logic lives in the handler, not in the domain entity. The entity only provides `matches()`. No static grouping helper needed on the entity.
    Parallelization: Wave 1 | Blocked by: — | Blocks: 3, 6
    References:
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/keyword.entity.ts` — full file; `create()` lines 50-108, `reconstitute()` lines 114-135, `matches()` lines 180-196, `requireImage` getter lines 157-159, `setTemplateId()` lines 212-224
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/keyword.entity.spec.ts` — full file; `create` tests lines 3-73, `matches` tests lines 75-191
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity.ts` — `matches()` method lines 142-158 for reference pattern
    Acceptance criteria (agent-executable):
  - `cd apps/backend && npm run test -- --testPathPattern="keyword.entity.spec"` passes
  - `cd apps/backend && npx tsc --noEmit` has no errors in keyword.entity.ts
  - New spec tests: (1) simple keyword with andGroupId=null matches as before, (2) compound group where all phrases match returns isMatchInGroup=true, (3) compound group where one phrase fails returns false, (4) requireMedia=true skips match when message has no media
    QA scenarios:
  - **Happy**: `Keyword.create({ phrase: 'btc', andGroupId: null })` → `andGroupId` is null, `matches('btc rally')` returns true
  - **Happy**: Two keywords with same `andGroupId='g1'`, both match → `Keyword.isMatchInGroup([kw1, kw2], 'btc eth')` returns true
  - **Failure**: Two keywords with same `andGroupId='g1'`, one doesn't match → `Keyword.isMatchInGroup([kw1, kw2], 'btc only')` returns false
  - **Failure**: `requireMedia=true`, message without media → `matches()` returns false
  - Evidence: `.omo/evidence/task-1-compound-blacklist-keywords.txt`
    Commit: Y | `feat(backend): add andGroupId + rename requireMedia to Keyword entity`

- [ ] 2. **BlacklistPhrase entity: add `andGroupId`, add `requireMedia`, update matching with AND logic + create tests**
     What to do / Must NOT do:
  - Add `andGroupId: string | null` to `BlacklistPhraseProps`, `BlacklistPhrase.create()`, `BlacklistPhrase.reconstitute()`, getter
  - Add `requireMedia: boolean` (default false) to `BlacklistPhraseProps`, `BlacklistPhrase.create()`, `BlacklistPhrase.reconstitute()`, getter
  - Add `checkMatchesWithMedia(content: string, hasMedia: boolean): boolean` instance method that calls `matches()` + checks `requireMedia` (returns false if requireMedia=true and !hasMedia)
  - Must NOT create a static grouping helper — the AND grouping logic lives in the handler
  - No spec file exists yet — create `blacklist-phrase.entity.spec.ts` with tests matching Keyword spec pattern
    Parallelization: Wave 1 | Blocked by: — | Blocks: 3, 6
    References:
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity.ts` — full file; `create()` lines 38-82, `reconstitute()` lines 88-105, `matches()` lines 142-158, `isApplicableTo()` lines 165-170
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/keyword.entity.ts` — reference pattern for `andGroupId`, `requireMedia`, `isMatchInGroup`
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/keyword.entity.spec.ts` — reference test pattern
    Acceptance criteria (agent-executable):
  - `cd apps/backend && npm run test -- --testPathPattern="blacklist-phrase.entity"` passes
  - `cd apps/backend && npx tsc --noEmit` has no errors in blacklist-phrase.entity.ts
  - New spec tests for: create with defaults, reconstitute, matches (simple), matches (compound group ALL match), matches (compound group one fails), requireMedia with/without media, isApplicableTo unchanged
    QA scenarios:
  - **Happy**: `BlacklistPhrase.create({ phrase: 'rug', andGroupId: null, requireMedia: false })` → `andGroupId` null, `requireMedia` false
  - **Happy**: Compound group all match → `isMatchInGroup([p1, p2], 'rug scam')` true
  - **Failure**: Compound group one doesn't match → `isMatchInGroup([p1, p2], 'rug only')` false
  - **Failure**: `requireMedia=true` with empty media → `checkWithMedia('rug', false)` returns false
  - Evidence: `.omo/evidence/task-2-compound-blacklist-keywords.txt`
    Commit: Y | `feat(backend): add andGroupId + requireMedia to BlacklistPhrase entity`

- [ ] 3. **TypeORM entities + mappers: add `andGroupId`, rename `requireImage`→`requireMedia`, add `requireMedia` to blacklist**
     What to do / Must NOT do:
  - `KeywordEntity` (TypeORM), line 61: Change TS property from `requireImage` to `requireMedia`. Keep `@Column({ name: 'require_image', type: 'boolean', default: false })` — DO NOT change the column name
  - `BlacklistPhraseEntity` (TypeORM): Add `@Column({ name: 'and_group_id', type: 'uuid', nullable: true })` + `@Column({ name: 'require_image', type: 'boolean', default: false })` with TS property `requireMedia`
  - `KeywordEntity`: Add `@Column({ name: 'and_group_id', type: 'uuid', nullable: true })`
  - `keyword.mapper.ts`: Update `toEntity` and `toDomain` to map `andGroupId` + rename `requireImage`→`requireMedia`
  - `blacklist-phrase.mapper.ts`: Update `toEntity` and `toDomain` to map `andGroupId` + `requireMedia`
  - Must NOT create any separate migration or `--reset` — TypeORM `synchronize: true` handles new columns
  - Must NOT change `@Column({ name: 'require_image', ... })` to `require_media` — that would drop+recreate the column, losing data
  - Must NOT add indexes for `and_group_id` — small tables, no query pattern needing it
    Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 4, 5
    References:
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/keyword.entity.ts` — full file; `requireImage` renamed to `requireMedia` with column name kept as `require_image`
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/blacklist-phrase.entity.ts` — full file; add new columns at end
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/keyword.mapper.ts` — full file; lines 9-35
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/blacklist-phrase.mapper.ts` — full file; lines 1-34
    Acceptance criteria (agent-executable):
  - `cd apps/backend && npx tsc --noEmit` has no errors
  - `cd apps/backend && npm run test` passes (all existing tests)
  - Verify in both mappers that `andGroupId` is mapped both directions
  - Verify in BlacklistPhraseEntity that `requireMedia` TS property maps to `@Column({ name: 'require_image', ... })`
    QA scenarios:
  - **Happy**: `KeywordMapper.toEntity(kw)` → `andGroupId` set, `requireMedia` mapped
  - **Happy**: `BlacklistPhraseMapper.toDomain(row)` → `andGroupId` present, `requireMedia` present
  - **Failure**: No double-mapping — column name `require_image` unchanged in both entities
  - Evidence: `.omo/evidence/task-3-compound-blacklist-keywords.txt`
    Commit: Y | `feat(backend): update TypeORM entities + mappers with andGroupId and requireMedia`

- [ ] 4. **KeywordsController: add `andGroupId` to DTOs, rename `requireImage`→`requireMedia` + update tests**
     What to do / Must NOT do:
  - `KeywordView`: add `readonly andGroupId: string | null`, rename `requireImage`→`requireMedia`
  - `CreateKeywordDto`: add `andGroupId?: string | null`, rename `requireImage`→`requireMedia`
  - `UpdateKeywordDto`: add `andGroupId?: string | null`, rename `requireImage`→`requireMedia`
  - Update `toView()` static method to map new fields
  - Update `keywords.controller.spec.ts` — update existing assertions that use `requireImage` to use `requireMedia`, add tests for andGroupId in create/update
  - **Update duplicate check**: Change from phrase-only comparison to `(phrase.toLowerCase(), andGroupId)` pair comparison. Allow the same phrase if it has a different andGroupId (same phrase can exist in multiple compound groups, or as Simple + Compound). Reject only when same phrase AND same andGroupId.
    - Old: `existing.find(k => k.phrase.toLowerCase() === trimmed.toLowerCase())`
    - New: `existing.find(k => k.phrase.toLowerCase() === trimmed.toLowerCase() && k.andGroupId === dto.andGroupId)`
  - Must NOT add new routes — existing CRUD routes remain the same
    Parallelization: Wave 3 | Blocked by: 3 | Blocks: 7
    References:
  - `apps/backend/src/telegram/crypto-news-publisher/api/http/keywords.controller.ts` — full file; `KeywordView` lines 17-27, `CreateKeywordDto` lines 29-51, `UpdateKeywordDto` lines 53-71, `create()` lines 109-132, `update()` lines 134-181, `toView` lines 189-199
  - `apps/backend/src/telegram/crypto-news-publisher/api/http/keywords.controller.spec.ts` — full file
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/keyword.entity.ts` — domain entity with `andGroupId` and `requireMedia`
    Acceptance criteria (agent-executable):
  - `cd apps/backend && npm run test -- --testPathPattern="keywords.controller.spec"` passes
  - `cd apps/backend && npx tsc --noEmit` has no errors
  - Duplicate check allows same phrase with different andGroupId
  - Duplicate check rejects same phrase with same andGroupId
  - API contract: `POST /crypto-news-publisher/keywords` accepts `{ andGroupId: null, requireMedia: false }`
  - API contract: `GET /crypto-news-publisher/keywords` returns `{ andGroupId: null, requireMedia: false }`
    QA scenarios:
  - **Happy**: Create simple keyword → response has `andGroupId: null`, `requireMedia: false`
  - **Happy**: Update keyword with `andGroupId: 'some-uuid'` → response returns updated andGroupId
  - **Happy**: Create same phrase with different andGroupId → allowed (compound groups can share sub-phrases)
  - **Failure**: Create without `andGroupId` → defaults to null (backward compatible)
  - **Failure**: Create duplicate phrase with same andGroupId → ConflictException
  - Evidence: `.omo/evidence/task-4-compound-blacklist-keywords.txt`
    Commit: Y | `feat(backend): update KeywordsController DTOs with andGroupId and requireMedia`

- [ ] 5. **BlacklistController: add `andGroupId` + `requireMedia` to DTOs + create tests**
     What to do / Must NOT do:
  - `BlacklistPhraseView`: add `readonly andGroupId: string | null`, `readonly requireMedia: boolean`
  - `CreateBlacklistDto`: add `andGroupId?: string | null`, `requireMedia?: boolean`
  - `UpdateBlacklistDto`: add `andGroupId?: string | null`, `requireMedia?: boolean`
  - Update `toView()` static method
  - Create `blacklist.controller.spec.ts` following the `keywords.controller.spec.ts` pattern (CRUD tests)
  - **Update duplicate check**: Same as KeywordsController — change from phrase-only to `(phrase.toLowerCase(), andGroupId)` pair comparison
  - Must NOT add new routes
    Parallelization: Wave 3 | Blocked by: 3 | Blocks: 7
    References:
  - `apps/backend/src/telegram/crypto-news-publisher/api/http/blacklist.controller.ts` — full file; `BlacklistPhraseView` lines 18-26, `CreateBlacklistDto` lines 28-34, `UpdateBlacklistDto` lines 36-42, `create()` lines 76-101, `update()` lines 103-144, `toView` lines 152-162
  - `apps/backend/src/telegram/crypto-news-publisher/api/http/keywords.controller.ts` — reference pattern for test file
  - `apps/backend/src/telegram/crypto-news-publisher/api/http/keywords.controller.spec.ts` — reference pattern for test structure
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity.ts` — domain entity
    Acceptance criteria (agent-executable):
  - `cd apps/backend && npm run test -- --testPathPattern="blacklist.controller.spec"` passes
  - `cd apps/backend && npx tsc --noEmit` has no errors
  - API contract: `POST /crypto-news-publisher/blacklist` accepts `{ andGroupId: null, requireMedia: false }`
  - API contract: `GET /crypto-news-publisher/blacklist` returns `{ andGroupId: null, requireMedia: false }`
    QA scenarios:
  - **Happy**: Create simple phrase → `andGroupId: null`, `requireMedia: false`
  - **Happy**: Create compound phrase with `andGroupId: 'g1'` → stored and returned
  - **Failure**: Create without new fields → defaults to null/false (backward compatible)
  - Evidence: `.omo/evidence/task-5-compound-blacklist-keywords.txt`
    Commit: Y | `feat(backend): update BlacklistController DTOs with andGroupId and requireMedia`

- [ ] 6. **Handler: update matching logic with AND compounds + requireMedia + update handler spec**
     What to do / Must NOT do:
  - In `checkBlacklist()` method (lines 265-282):
    - Separate phrases into simples (andGroupId=null) and compounds (grouped by andGroupId)
    - Simples: as today — if matches AND (requireMedia → hasMedia check) → block
    - Compounds: group by andGroupId. For each group, if ALL phrases match AND (requireMedia → hasMedia check) → block
    - `requireMedia` semantics (same for both blacklist and keywords):
    - If `requireMedia=true` AND `message.media.length === 0` → skip/ignore this item (don't activate it)
    - If `requireMedia=false` OR `message.media.length > 0` → process normally
    - For Compound groups: if ANY sub-phrase has `requireMedia=true` AND message has no media → skip the entire group
  - Pass `hasMedia` to the check — determine from `message.media.length > 0`
  - For keyword matching (lines 97-99):
    - Separate keywords into simples and compounds
    - Simples: if matches AND (requireMedia → hasMedia check) → add to matchedKeywords
    - Compounds: group by andGroupId. For each group, if ALL match AND (requireMedia → hasMedia check) → add to matchedKeywords (all phrase IDs in the group)
    - If matchedKeywords.length > 0 → continue to enqueue
  - Add `private hasMedia(message): boolean` helper
  - Update `crypto-news-message-ingested.handler.spec.ts`:
    - Add test cases for: simple matches as before (backward comp), compound where all match → blocked/enqueued, compound where one fails → not blocked/enqueued, requireMedia with media present → matches, requireMedia without media → skips
    - Fix existing mock `findAllEnabled` → `findEnabled` on BlacklistPhraseRepository mock (line 56: s/findAllEnabled/findEnabled)
  - Must NOT change the `@OnEvent('crypto-news.message.ingested')` decorator or event type
  - Edge case: if deleting a phrase leaves a Compound group with only 1 remaining phrase → that phrase becomes Simple (set andGroupId to null). Implementation: the `delete` in controllers does NOT auto-cleanup; the handler simply treats single-phrase groups as-if they were simple (they won't trigger AND logic since there's only 1 phrase — it matches as today). No special delete logic needed.
  - Must NOT change the BLOCKED status creation logic (lines 120-153) except for the checkBlacklist input
  - Must NOT change `EnqueueMatchingMessageUseCase.execute()` signature
    Parallelization: Wave 4 | Blocked by: 1, 2 | Blocks: 7
    References:
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/event-bus/crypto-news-message-ingested.handler.ts` — full file; `checkBlacklist()` lines 265-282, keyword matching lines 97-99, `getEnabledKeywords()` lines 220-236, `getEnabledBlacklistPhrases()` lines 241-259, `handle()` lines 72-177
  - `apps/backend/src/telegram/crypto-news-publisher/infrastructure/event-bus/crypto-news-message-ingested.handler.spec.ts` — full file; mock setup lines 37-80, existing test patterns
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity.ts` — BlacklistPhrase.checkWithMedia() and isMatchInGroup()
  - `apps/backend/src/telegram/crypto-news-publisher/domain/entities/keyword.entity.ts` — Keyword.isMatchInGroup()
    Acceptance criteria (agent-executable):
  - `cd apps/backend && npm run test -- --testPathPattern="crypto-news-message-ingested"` passes
  - `cd apps/backend && npx tsc --noEmit` has no errors
  - Handler spec covers: simple+compound matching for both keywords and blacklist
    QA scenarios:
  - **Happy**: 3 simple blacklist phrases → any match → block (OR, backward compatible)
  - **Happy**: Compound group all match → block (AND)
  - **Happy**: Simple doesn't match + compound all match → block (compounds are independent)
  - **Happy**: Compound group + simple match → block (mixed logic, both trigger)
  - **Failure**: Compound group only partially matches → no block
  - **Failure**: No simples match + no compound fully matches → no block
  - **Failure**: requireMedia=true, no media → skip (not blocked)
  - **Failure**: requireMedia=true, has media → block (works as expected)
  - Evidence: `.omo/evidence/task-6-compound-blacklist-keywords.txt`
    Commit: Y | `feat(backend): update handler matching with AND compounds and requireMedia`

- [ ] 7. **Frontend API types: add `andGroupId`, `requireMedia`, rename `requireImage`→`requireMedia`**
     What to do / Must NOT do:
  - `keywords-api.ts`: `KeywordView` add `andGroupId: string | null`, rename `requireImage`→`requireMedia`. `CreateKeywordBody` add `andGroupId?: string | null`, rename `requireImage`→`requireMedia`. `UpdateKeywordBody` same
  - `blacklist-api.ts`: `BlacklistPhraseView` add `andGroupId: string | null`, `requireMedia: boolean`. `CreateBlacklistBody` add `andGroupId?: string | null`, `requireMedia?: boolean`. `UpdateBlacklistBody` same
  - Must NOT change any query keys or fetch functions
    Parallelization: Wave 5 | Blocked by: 4, 5, 6 | Blocks: 8, 9
    References:
  - `apps/frontend/src/features/crypto-news-publisher/api/keywords-api.ts` — full file; `KeywordView` lines 8-26, `CreateKeywordBody` lines 28-40, `UpdateKeywordBody` lines 42-56
  - `apps/frontend/src/features/crypto-news-publisher/api/blacklist-api.ts` — full file; `BlacklistPhraseView` lines 8-16, `CreateBlacklistBody` lines 18-24, `UpdateBlacklistBody` lines 26-32
    Acceptance criteria (agent-executable):
  - `cd apps/frontend && npx tsc --noEmit` has no errors
  - TypeScript types compile correctly with new fields
    QA scenarios:
  - **Happy**: `KeywordView` has `andGroupId: null` and `requireMedia: false`
  - **Happy**: `CreateBlacklistBody` accepts `{ andGroupId: 'uuid', requireMedia: true }`
  - **Failure**: Type error if `andGroupId` is missing (required in View)
  - Evidence: `.omo/evidence/task-7-compound-blacklist-keywords.txt`
    Commit: Y | `feat(frontend): update API types with andGroupId and requireMedia`

- [ ] 8. **KeywordsSection UI: add Simple/Compound toggle, expandable rows, requireMedia toggle**
     What to do / Must NOT do:
  - Add `andGroupId` state to the create/edit modal
  - Add a "Type" toggle: Simple / Compound (when Simple, single phrase input; when Compound, multi-phrase inputs with "Add another phrase" button)
  - Each sub-phrase in Compound has its own: phrase input, matchMode select (Exact/Substring), caseSensitive checkbox
  - Add requireMedia checkbox toggle (applies to the whole item: Simple or Compound group)
  - In the table: simple items display as today; compound items display as one row with the format "phrase1 + phrase2 + ..." and expandable to show sub-phrases with their matchMode/caseSensitive
  - Add "Add Simple" and "Add Compound" buttons (or unified "Add" with type selector)
  - Edit modal for compounds shows all sub-phrases editable
  - Must NOT break existing edit/delete/enable toggle for simple keywords
  - Must NOT change the SourceMultiSelect or channel source logic
  - Must NOT change requireImage → requireMedia also in labels (use "Media" not "Image")
    Parallelization: Wave 6 | Blocked by: 7 | Blocks: —
    References:
  - `apps/frontend/src/features/crypto-news-publisher/ui/keywords-section.tsx` — full file; existing modal lines ~130-200, table lines ~250-350, edit modal lines ~370-450
  - `apps/frontend/src/features/crypto-news-publisher/ui/blacklist-manager.tsx` — reference for existing UI patterns
  - `apps/frontend/src/features/crypto-news-publisher/api/keywords-api.ts` — updated API types with andGroupId, requireMedia
    Acceptance criteria (agent-executable):
  - `cd apps/frontend && npx tsc --noEmit` has no errors
  - `cd apps/frontend && npm run build` succeeds
  - UI renders: Simple items show as today with "Media" label instead of "Image"
  - UI renders: Compound items show expandable row with sub-phrases
    QA scenarios:
  - **Happy**: Create simple keyword with requireMedia → appears in table
  - **Happy**: Create compound with 2 sub-phrases (btc+analysis) → table shows "btc + analysis" as compound row
  - **Happy**: Expand compound row → shows sub-phrases with their matchMode
  - **Failure**: Empty sub-phrase → validation prevents submit
  - **Failure**: Compound with only 1 sub-phrase → validation prevents submit (must have ≥2)
  - Evidence: `.omo/evidence/task-8-compound-blacklist-keywords.txt`
    Commit: Y | `feat(frontend): add Simple/Compound UI with expandable rows to keywords`

- [ ] 9. **BlacklistManager UI: add Simple/Compound toggle, expandable rows, requireMedia toggle**
     What to do / Must NOT do:
  - Same changes as Todo 8 but for `blacklist-manager.tsx`
  - Add `andGroupId` state, `requireMedia` toggle, Simple/Compound type toggle
  - Multi-phrase input for Compounds (with sub-phrase matchMode + caseSensitive)
  - Expandable rows in table for Compounds
  - Add "Add Simple" and "Add Compound" buttons
  - Change "Image" label to "Media" in existing UI
  - Must NOT break existing blacklist functionality
  - Must NOT change the SourceMultiSelect or channel source logic
    Parallelization: Wave 6 | Blocked by: 7 | Blocks: —
    References:
  - `apps/frontend/src/features/crypto-news-publisher/ui/blacklist-manager.tsx` — full file; existing modal lines ~55-170, table lines ~200-380
  - `apps/frontend/src/features/crypto-news-publisher/ui/keywords-section.tsx` — sibling UI for reference patterns (Todo 8 will be done first)
  - `apps/frontend/src/features/crypto-news-publisher/api/blacklist-api.ts` — updated API types
    Acceptance criteria (agent-executable):
  - `cd apps/frontend && npx tsc --noEmit` has no errors
  - `cd apps/frontend && npm run build` succeeds
  - UI renders: Simple phrases with requireMedia toggle
  - UI renders: Compound phrases as expandable rows
    QA scenarios:
  - **Happy**: Create simple blacklist phrase with requireMedia → appears in table
  - **Happy**: Create compound (iran+war) → table shows "iran + war" expandable
  - **Happy**: Expand compound → sub-phrases with matchMode visible
  - **Failure**: Compound with duplicate sub-phrases → validation prevents
  - Evidence: `.omo/evidence/task-9-compound-blacklist-keywords.txt`
    Commit: Y | `feat(frontend): add Simple/Compound UI with expandable rows to blacklist`

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — verify all 9 todos completed, all acceptance criteria met
- [ ] F2. Code quality review — check for unused imports, consistent naming, no lint errors (`cd apps/backend && npm run lint`, `cd apps/frontend && npm run lint`)
- [ ] F3. Real manual QA — user opens the dashboard, creates Simple + Compound items for both blacklist and keywords, verifies the matching behavior
- [ ] F4. Scope fidelity — confirm no changes to PublisherQueueEntry, no DB column rename, no new CompoundGroup entity, no changes to CryptoNewsMessage

## Commit strategy

Commits match the work waves (5-6 feature commits + 1 fixup if needed at the end). Each commit is independently verifiable via its spec file. Use conventional commits:

```
feat(backend): add andGroupId + rename requireMedia to Keyword entity
feat(backend): add andGroupId + requireMedia to BlacklistPhrase entity
feat(backend): update TypeORM entities + mappers with andGroupId and requireMedia
feat(backend): update KeywordsController DTOs with andGroupId and requireMedia
feat(backend): update BlacklistController DTOs with andGroupId and requireMedia
feat(backend): update handler matching with AND compounds and requireMedia
feat(frontend): update API types with andGroupId and requireMedia
feat(frontend): add Simple/Compound UI with expandable rows to keywords
feat(frontend): add Simple/Compound UI with expandable rows to blacklist
```

No fixup commit needed unless tests reveal an issue across commits.

## Success criteria

- [ ] `cd apps/backend && npm run test && npx tsc --noEmit` passes (all backend tests + type check)
- [ ] `cd apps/frontend && npm run test -- --run && npx tsc --noEmit` passes (all frontend tests + type check)
- [ ] `npm run lint` passes (both apps)
- [ ] `npm run build` passes (both apps)
- [ ] User can create Simple and Compound items for both Blacklist and Keywords via UI
- [ ] Matching behavior: Simple items work as before (OR), Compounds require ALL sub-phrases (AND)
- [ ] requireMedia toggle works: created item only matches when message has media
- [ ] Each sub-phrase in Compound has independent matchMode and caseSensitive
- [ ] Backward compatible: existing data (andGroupId=null) behaves exactly as before
- [ ] All 9 todos completed and verified
