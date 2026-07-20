# blacklist-channel-selector - Work Plan

## TL;DR (For humans)

**What you'll get:** The "Source Channel IDs" text field in the Blacklist Phrase modal will be replaced by a multi-select dropdown showing all available crypto-news sources — same component Keywords already uses.

**Why this approach:** The `SourceMultiSelect` component already exists and is battle-tested in Keywords. Zero new UI code, zero backend changes — just swap the input.

**What it will NOT do:** No backend changes, no API changes, no changes to Keywords or the SourceMultiSelect component itself.

**Effort:** Quick (~1 file change)
**Risk:** Low — purely a UI swap, data shape is already compatible (`string[]`)
**Decisions to sanity-check:** None — 1:1 copy of the Keywords pattern

Your next move: Approve, then start work.

---

> TL;DR (machine): Quick | Low | Replace text input with SourceMultiSelect in `blacklist-manager.tsx`

## Scope

### Must have

1. Replace the `<input type="text">` for `sourceChannelIds` with `<SourceMultiSelect>` in `BlacklistModal`
2. Change `initialSourceChannelIds` prop from `string` to `string[]`
3. Remove comma-split logic from `handleSubmit`
4. Update edit modal to pass `string[]` instead of `join(', ')`
5. Frontend tests pass

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No backend changes (controllers, DTOs, use cases, repos, entities)
- No changes to `source-multi-select.tsx`, `keywords-section.tsx`, `keywords-api.ts`, `blacklist-api.ts`, `use-blacklist.ts`
- No CSS or styling beyond what SourceMultiSelect provides

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after | Vitest
- Evidence: `.omo/evidence/task-1-blacklist-channel-selector.console`

## Execution strategy

### Parallel execution waves

Wave 1: single todo (only one file changes meaningfully)

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| ---- | ---------- | ------ | -------------------- |
| 1    | —          | —      | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Replace channel ID text input with SourceMultiSelect in BlacklistModal
     What to do / Must NOT do:
  1. Add import: `import { SourceMultiSelect } from './source-multi-select';` (after line 14, with the other feature imports)
  1. Change `BlacklistModalProps.initialSourceChannelIds` type from `string` to `string[]` (line 27)
  1. Update `BlacklistModal` state: change `useState(initialSourceChannelIds)` — type becomes `string[]` (line 48-49)
  1. Before the `<form>`, derive `sourceOptions` from the API data (already fetched at line ~183): add `const sourceOptions = sources ?? [];` — exact pattern from `keywords-section.tsx:77`
  1. Replace the `<input id="bl-sources">` block (lines 102-121) with `<SourceMultiSelect ids={sourceChannelIds} onChange={setSourceChannelIds} sourceOptions={sourceOptions} disabled={pending} />`
  1. In `handleSubmit` (lines 68-77): remove the comma-split logic. The existing `const sourceIds = sourceChannelIds.split(',').map(...).filter(...)` block becomes redundant. Replace the full block with:
     ```
     onSubmit({
       phrase: trimmedPhrase,
       caseSensitive,
       enabled,
       sourceChannelIds: sourceChannelIds.length > 0 ? sourceChannelIds : undefined,
     });
     ```
     CRITICAL: empty array `[]` must become `undefined` (same API contract as before).
  1. In `BlacklistManager` (create modal): change `initialSourceChannelIds=""` → `initialSourceChannelIds={[]}`
  1. In `BlacklistManager` (edit modal): change `initialSourceChannelIds={editingItem?.sourceChannelIds.join(', ') ?? ''}` → `initialSourceChannelIds={editingItem?.sourceChannelIds ?? []}`
  1. MUST NOT: change backend, API hooks, keywords, SourceMultiSelect component, or add any CSS
     Parallelization: Wave 1 | Blocked by: — | Blocks: —
     References (executor has NO interview context - be exhaustive):
  - Target file: `apps/frontend/src/features/crypto-news-publisher/ui/blacklist-manager.tsx:1-427` (the full file)
  - SourceMultiSelect component: `apps/frontend/src/features/crypto-news-publisher/ui/source-multi-select.tsx:13-110` (accepts `ids: string[]`, `onChange: (ids: string[]) => void`, `sourceOptions`, `disabled`)
  - Keywords usage reference: `apps/frontend/src/features/crypto-news-publisher/ui/keywords-section.tsx:77` (`const sourceOptions = sources ?? [];`) and `:200-205` (`<SourceMultiSelect ids={newSourceChannelIds} onChange={setNewSourceChannelIds} sourceOptions={sourceOptions} disabled={createMut.isPending} />`)
  - `sources` is fetched at: `blacklist-manager.tsx:183` (`const { data: sources } = useCryptoNewsSources()`)
  - Frontend tests: `npm run test:frontend` (Vitest)
    Acceptance criteria (agent-executable):
  - `npm run test:frontend` passes
  - `npx tsc --noEmit --incremental false` passes in `apps/frontend/`
  - The "Sources" field in the modal now renders a dropdown button (not a text input)
    QA scenarios (name the exact tool + invocation):
  - Happy: `npm run test:frontend` — all 14 suites pass
  - Failure: n/a (no error paths introduced; the SourceMultiSelect is already tested via Keywords)
  - Evidence: `.omo/evidence/task-1-blacklist-channel-selector.console`
    Commit: Y | `refactor(frontend): replace blacklist channel text input with SourceMultiSelect dropdown`

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — verify only `blacklist-manager.tsx` changed, no backend files
- [ ] F2. Code quality review — verify SourceMultiSelect is used correctly (no unused imports, no comma-split remnants)
- [ ] F3. Real manual QA — verify the modal renders with the dropdown in dev
- [ ] F4. Scope fidelity — confirm no changes to backend, API hooks, or Keywords

## Commit strategy

Single commit with the change.

## Success criteria

1. `npm run test:frontend` passes (14 suites, 154 tests)
2. `tsc --noEmit` passes
3. Blacklist modal shows SourceMultiSelect dropdown instead of text input
4. Create and edit flows submit `sourceChannelIds` as `string[]` (same as Keywords)
