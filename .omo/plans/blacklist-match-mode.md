# blacklist-match-mode - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** A "Match" dropdown (Exact / Substring) for every blacklist phrase — same selector that Keywords already has. Create and edit modals include it, the table shows it, and you can change it inline when editing.

**Why this approach:** The backend already fully supports `matchMode` on blacklist phrases (domain entity, controller DTOs, TypeORM column — all wired). Only the frontend form is missing the control. This is a pure UI addition in one file, zero backend changes.

**What it will NOT do:** No backend changes (controllers, repos, entities, DB migrations). No changes to `blacklist-api.ts`, `use-blacklist.ts`, or Keywords.

**Effort:** Quick — 1 file, 1 todo
**Risk:** Low — pure UI addition, backend already validated
**Decisions to sanity-check:** Default for new phrases is `exact` (same as Keywords default)

Your next move: Approve, then start work.

---

> TL;DR (machine): Quick | Low | Add matchMode select to blacklist-manager.tsx create/edit/table UI

## Scope

### Must have

1. Add `initialMatchMode` prop to `BlacklistModalProps` interface
2. Add `matchMode` state in `BlacklistModal`
3. Add matchMode `<select>` in the create modal form (between caseSensitive checkbox and Save button)
4. Add "Match" column header in the blacklist table
5. Add matchMode display in table rows (read mode: uppercase label; edit mode: select)
6. Pass `matchMode` in `handleSubmit` body to backend
7. Handle `handleClose` reset
8. Wire create modal caller with `initialMatchMode={'exact'}`
9. Wire edit modal caller with `initialMatchMode={editingItem?.matchMode ?? 'substring'}`

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No backend changes (controllers, domain entities, TypeORM entities, repos)
- No changes to `blacklist-api.ts`, `use-blacklist.ts`, `keywords-section.tsx`, `keywords-api.ts`
- No DB migrations (column already exists with default `'substring'`)

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after | Vitest (frontend)
- Evidence: .omo/evidence/task-1-blacklist-match-mode.console

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

- [ ] 1. Add matchMode (exact/substring) UI to blacklist-manager.tsx
     What to do / Must NOT do:
  1. Add `initialMatchMode` prop to `BlacklistModalProps` (type: `'exact' | 'substring'`)
  1. Destructure `initialMatchMode` in `BlacklistModal` function params
  1. Add state: `const [matchMode, setMatchMode] = useState<'exact' | 'substring'>(initialMatchMode);`
  1. In `handleClose`: add `setMatchMode(initialMatchMode);`
  1. In `handleSubmit`: add `matchMode` to the submit body object
  1. In the form JSX: after the `<div className="flex flex-wrap items-center gap-4">` checkboxes, add a matchMode select:
     ```
     <label className="flex items-center gap-2 text-sm text-slate-300">
       <span className="text-xs uppercase text-slate-500">Match</span>
       <select
         value={matchMode}
         onChange={(e) => setMatchMode(e.target.value as 'exact' | 'substring')}
         disabled={pending}
         className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
       >
         <option value="exact">Exact</option>
         <option value="substring">Substring</option>
       </select>
     </label>
     ```
  1. In the `<thead>`: add `<th className="py-2 pr-3">Match</th>` between "Sources" and "Enabled"
  1. In the `<tbody>` row: add a `<td className="py-2 pr-3"><span className="text-xs font-mono text-slate-400 uppercase">{item.matchMode}</span></td>` between sources and enabled toggle cells
  1. Create modal caller: add `initialMatchMode="exact"`
  1. Edit modal caller: add `initialMatchMode={editingItem?.matchMode ?? 'substring'}`
  1. MUST NOT: change backend, blacklist-api.ts, use-blacklist.ts, keywords-section.tsx
     Parallelization: Wave 1 | Blocked by: — | Blocks: —
     References (executor has NO interview context - be exhaustive):
  - Target file: `apps/frontend/src/features/crypto-news-publisher/ui/blacklist-manager.tsx:1-418`
  - Keywords pattern (create form): `apps/frontend/src/features/crypto-news-publisher/ui/keywords-section.tsx:226-238`
  - Keywords pattern (table): `apps/frontend/src/features/crypto-news-publisher/ui/keywords-section.tsx:390-412`
  - Frontend API types (already have matchMode): `apps/frontend/src/features/crypto-news-publisher/api/blacklist-api.ts:11,20,28`
  - Frontend tests: `npm run test:frontend` (Vitest)
    Acceptance criteria (agent-executable):
  - `npm run test:frontend` passes (14 suites, 154+ tests)
  - `npx tsc --noEmit --incremental false` passes in `apps/frontend/`
  - Create modal shows "Match" select with Exact/Substring options
  - Table shows "Match" column with uppercase values
  - Submitting create sends `matchMode` in the body
  - Editing preserves and updates `matchMode`
    QA scenarios (name the exact tool + invocation):
  - Happy: `npm run test:frontend` — all suites pass
  - Evidence: `.omo/evidence/task-1-blacklist-match-mode.console`
    Commit: Y | `feat(frontend): add matchMode selector to blacklist phrase UI`

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — verify only `blacklist-manager.tsx` changed, no backend files
- [ ] F2. Code quality review — verify matchMode select matches Keywords pattern, no unused imports
- [ ] F3. Real manual QA — verify the modal shows "Match" select in dev, table shows column
- [ ] F4. Scope fidelity — confirm no changes to backend, API hooks, keywords

## Commit strategy

Single commit with the change.

## Success criteria

1. `npm run test:frontend` passes (14+ suites)
2. `tsc --noEmit` passes
3. Blacklist create/edit modal has "Match" select (Exact/Substring)
4. Blacklist table has "Match" column displaying match mode
5. Create and edit flows send/update `matchMode` correctly
