# add-kol-modal - Work Plan

## TL;DR (For humans)

**What you'll get:** A "+ Add KOL" button in the header of the KOLs page. When clicked, it opens a centered modal with a single field: the KOL's Telegram ID (`kolId`). Submit sends it to the backend, which automatically resolves the display name and handle from Telegram (just like the seeder does on boot). The list refreshes instantly.

**Why this approach:** The backend resolution logic already exists in `KolSeeder.resolveMetadata()` — we just move it into the `RegisterKolUseCase` so the HTTP endpoint also auto-resolves title/handle. The frontend form stays minimal: one field, no guesswork.

**What it will NOT do:** No edit/delete, no bulk-add, no toast notifications, no animations, no refactor of the KolSeeder.

**Effort:** Quick
**Risk:** Low
**Decisions to sanity-check:** None — all adopted from existing codebase patterns

Your next move: approve the plan below so a worker can execute it.

---

> TL;DR (machine): Quick effort, Low risk. Backend: make title optional in RegisterKolInput, inject resolution services into RegisterKolUseCase. Frontend: "+ Add KOL" button + Modal with single kolId field + mutation.

## Scope
### Must have
- **Backend**: `RegisterKolInput.title` becomes optional (`title?: string`)
- **Backend**: `RegisterKolUseCase` injects `ResolvedKolMetadataRepository` + `TelegramListenerPort` to auto-resolve title/handle from kolId
- **Frontend**: Modal component in `shared/ui/modal.tsx`
- **Frontend**: `features/add-kol/` slice with API client, mutation hook, modal UI
- **Frontend**: "+ Add KOL" primary button in KolsPage header (right-aligned)
- **Frontend**: Modal with single `kolId` text input (required)
- **Frontend**: TanStack Query `useMutation` → `httpPost` → on success invalidate `kolKeys.all`
- **Frontend**: Auto-close on success, inline error on failure
- **Tests**: Vitest + React Testing Library for the feature slice

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No bulk-add
- No edit/delete KOLs
- No toast notifications
- No animation libraries
- No persisted form state
- No refactor of KolSeeder (can be follow-up)
- No additional fields in the form beyond kolId

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after + Vitest + React Testing Library
- Evidence: .omo/evidence/task-N-add-kol-modal.<ext>

## Execution strategy
### Parallel execution waves
- Wave 1: Backend changes (RegisterKolInput + RegisterKolUseCase) + Modal component (parallel)
- Wave 2: Frontend feature slice (depends on Wave 1 backend) + KolsPage integration (depends on Modal)
- Wave 3: Tests (depends on everything)

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1. Backend: make title optional + resolve | — | 3 | 2 |
| 2. Frontend: Modal component | — | 4 | 1 |
| 3. Frontend: AddKOL feature slice | 1 | 4 | — |
| 4. Frontend: KolsPage integration | 2, 3 | 5 | — |
| 5. Frontend: Tests | 3, 4 | — | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Backend: make `title` optional in `RegisterKolInput` + auto-resolve in `RegisterKolUseCase`
  What to do:
    - In `RegisterKolInput`: change `title: string` → `title?: string`
    - In `RegisterKolUseCase`: inject `ResolvedKolMetadataRepository` + `TelegramListenerPort`
    - Add a private `resolveMetadata(kolId, title?, handle?)` method mirroring `KolSeeder.resolveMetadata()`:
      - If `title` provided → use it
      - Else check `ResolvedKolMetadataRepository.find(kolId)` for cached title
      - Else call `TelegramListenerPort.resolveChannelMetadata(kolId)` → use returned title/handle/kind (don't filter by kind — the user may add any peer)
      - Else fallback: title = kolId, handle = null
    - Pass resolved title/handle to `Kol.create()` instead of raw input
    - Verify existing `KolSeeder` still works (it calls `registerKol.execute()` with pre-resolved values, so its behavior is unchanged)
  Must NOT do: Do NOT refactor KolSeeder. Do NOT change the Kol.create() domain logic. Do NOT break existing seed flow.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 3
  References:
    - apps/backend/src/kol/identity/api/input/register-kol.input.ts:5 (current interface)
    - apps/backend/src/kol/identity/application/handlers/register-kol.use-case.ts:20-42 (current use case)
    - apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts:161-244 (resolveMetadata to mirror)
    - apps/backend/src/kol/identity/application/ports/resolved-kol-metadata.repository.ts (interface for cache)
    - apps/backend/src/kol/identity/infrastructure/persistence/json-resolved-kol-metadata.repository.ts (implementation)
    - apps/backend/src/telegram/ingestion/domain/ports/telegram-listener.port.ts (TelegramListenerPort interface - resolveChannelMetadata)
    - apps/backend/src/kol/identity/domain/entities/kol.entity.ts:40-57 (Kol.create)
  Acceptance criteria:
    - `POST /telegram-kol/identity/kols` with body `{ "kolId": "some_id" }` returns 201 with a KolView
    - The KOL is created with a non-empty title (resolved from cache, MTProto, or fallback)
    - Existing seed flow (`KolSeeder`) still works — `POST` with explicit `title` still uses the provided title
  QA scenarios:
    - Happy: POST `{ kolId: "123" }` → 201 + KolView with resolved title
    - Happy: POST `{ kolId: "123", title: "My Kol" }` → 201 + title="My Kol" (explicit title wins)
    - Evidence: `.omo/evidence/task-1-backend-resolve.ts`
  Commit: Y | feat(backend): auto-resolve kol title and handle from kolId

- [ ] 2. Frontend: create Modal component in `shared/ui/modal.tsx`
  What to do:
    - Create `apps/frontend/src/shared/ui/modal.tsx`
    - React portal to `document.body`
    - Props: `isOpen: boolean`, `onClose: () => void`, `title: string`, `children: ReactNode`, `size?: 'sm' | 'md' | 'lg'` (default 'md')
    - Overlay: fixed inset-0 bg-black/50 z-50
    - Card: centered, bg-slate-900 border border-slate-700 rounded-lg shadow-xl
    - Header: title left, close button (× unicode) right
    - Body: children
    - ESC key → onClose
    - Backdrop click → onClose
    - When `isOpen=false` → render null
    - Export from `shared/ui/index.ts`
  Must NOT do: No animation library. No external dialog package. No body scroll lock (not needed for MVP).
  Parallelization: Wave 1 | Blocked by: — | Blocks: 4
  References:
    - apps/frontend/src/shared/ui/button.tsx (pattern for shared component)
    - apps/frontend/src/shared/ui/card.tsx (Card styling reference - slate-900 bg, border-slate-700)
    - apps/frontend/src/shared/ui/index.ts (barrel export pattern)
  Acceptance criteria:
    - `import { Modal } from '@/shared/ui'` works
    - `<Modal isOpen={true} onClose={fn} title="Test"><div>content</div></Modal>` renders overlay + title + children
    - `<Modal isOpen={false}>` renders nothing
    - ESC key triggers onClose
    - Backdrop click triggers onClose
    - × button triggers onClose
  QA scenarios:
    - Happy: render with isOpen=true → visible; press ESC → onClose called
    - Failure: isOpen=false → render null (no DOM leftover)
    - Evidence: `.omo/evidence/task-2-modal.tsx`
  Commit: Y | feat(ui): add reusable Modal component

- [ ] 3. Frontend: create AddKOL feature slice
  What to do:
    - Create `features/add-kol/api/add-kol-client.ts`:
      - `export async function addKol(kolId: string): Promise<KolView>`
      - Calls `httpPost(ENDPOINTS.kols.add, { kolId })`
    - Create `features/add-kol/model/use-add-kol.ts`:
      - `export function useAddKol(): UseMutationResult<KolView, Error, string>`
      - `useMutation({ mutationFn: addKol, onSuccess: () => qc.invalidateQueries({ queryKey: kolKeys.all }) })`
    - Create `features/add-kol/ui/add-kol-modal.tsx`:
      - Props: `isOpen: boolean`, `onClose: () => void`
      - Uses `useAddKol()` mutation
      - Form with single `kolId` text input (required, placeholder "Telegram channel ID or username")
      - Client-side validation: submit disabled when kolId empty
      - Submit button: "Add KOL" text, shows "Adding…" when pending
      - Error state: mutation error message displayed inline above the submit button
      - On success: call `onClose()`
    - Create `features/add-kol/index.ts` barrel exporting `AddKolModal`
  Must NOT do: No additional form fields. No handle validation. No title field.
  Parallelization: Wave 2 | Blocked by: 1 (uses the simplified POST body) | Blocks: 4
  References:
    - apps/frontend/src/features/trigger-backfill/ (FSD pattern)
    - apps/frontend/src/features/set-kol-lifecycle/ (FSD pattern)
    - apps/frontend/src/shared/api/endpoints.ts:9 (ENDPOINTS.kols.add)
    - apps/frontend/src/shared/api/http-client.ts:23 (httpPost)
    - apps/frontend/README.md §5 (FSD architecture)
  Acceptance criteria:
    - `features/add-kol/ui/add-kol-modal.tsx` renders a form with kolId input + submit button
    - Submit button disabled when kolId is empty
    - On submit, calls POST /telegram-kol/identity/kols with `{ kolId }`
    - On success, invalidates kols query and calls onClose
    - On error, shows error message in modal
  QA scenarios:
    - Happy: type valid kolId → click submit → mutation fires → success → onClose called
    - Failure: empty kolId → submit disabled, validation hint shown
    - Failure: mock httpPost throws → error message shown in modal
    - Evidence: `.omo/evidence/task-3-add-kol-feature.tsx`
  Commit: Y | feat(kols): add AddKOL feature slice with modal form

- [ ] 4. Frontend: integrate into KolsPage
  What to do:
    - In `apps/frontend/src/pages/kols/index.tsx`:
      - Add `import { AddKolModal } from '@/features/add-kol'`
      - Add `import { useState } from 'react'` (if not already there)
      - Add `const [showAddModal, setShowAddModal] = useState(false)`
      - In the header div (after the `<p>` description, around line 115), add a flex row wrapper around the h1 + description, then a `<Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>+ Add KOL</Button>` with `ml-auto` to push right
      - Render `<AddKolModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />` at the end of the JSX
  Must NOT do: Do not restructure the page. Do not move existing components. Do not add extra imports.
  Parallelization: Wave 2 | Blocked by: 2, 3 | Blocks: 5
  References:
    - apps/frontend/src/pages/kols/index.tsx:107-115 (current header: h1 + description inside a div with space-y-4)
    - apps/frontend/src/pages/kols/index.tsx:89-165 (full page)
  Acceptance criteria:
    - KolsPage header shows "+ Add KOL" button
    - Click opens the modal (single kolId field)
    - Modal closes on × / ESC / backdrop click
    - Submitting a valid kolId → closes modal → list refreshes
  QA scenarios:
    - Happy: navigate to /kols → see "+ Add KOL" → click → modal opens
    - Failure: press ESC → modal closes
    - Evidence: `.omo/evidence/task-4-kolspage.tsx`
  Commit: Y | feat(kols): integrate Add KOL button and modal into KolsPage

- [ ] 5. Frontend: tests for AddKOL flow
  What to do:
    - Create `apps/frontend/src/features/add-kol/ui/__tests__/add-kol-modal.test.tsx`
    - Using Vitest + @testing-library/react
    - Mock `httpPost` to test success and error paths
    - Test cases:
      - Modal renders when isOpen=true, not when false
      - Submit button disabled when kolId is empty
      - Submit button enabled when kolId has text
      - On submit with valid data → httpPost called → onClose fires → query invalidated
      - On HTTP error → error message displayed in modal
    - Run `npm run test:frontend` — all must pass
  Must NOT do: No backend integration tests. No E2E tests.
  Parallelization: Wave 3 | Blocked by: 3, 4 | Blocks: —
  References:
    - apps/frontend/src/features/trigger-backfill/ui/backfill-button.tsx (mutation test pattern)
    - apps/frontend/vitest config (if exists)
  Acceptance criteria:
    - `npm run test:frontend` passes
    - Coverage includes: render states, validation, submit success, submit error
  QA scenarios:
    - Happy: mock httpPost resolves → modal closes, queryClient.invalidateQueries called
    - Failure: mock httpPost rejects → error text visible in modal
    - Evidence: `.omo/evidence/task-5-tests.tsx`
  Commit: Y | test(kols): add tests for AddKOL modal

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit — all todos completed, scope respected
- [ ] F2. Code quality — `npm run lint` passes, no type errors, no regressions
- [ ] F3. Real manual QA — open the KOLs page, click "+ Add KOL", add a KOL, verify it appears in the list
- [ ] F4. Scope fidelity — no toast, no animations, no extra fields, no bulk-add

## Commit strategy
- `feat(backend): auto-resolve kol title and handle from kolId`
- `feat(ui): add reusable Modal component`
- `feat(kols): add AddKOL feature slice with modal form`
- `feat(kols): integrate Add KOL button and modal into KolsPage`
- `test(kols): add tests for AddKOL modal`

## Success criteria
1. Backend auto-resolves title/handle from kolId when not provided
2. "+ Add KOL" button visible in KolsPage header
3. Modal opens with single kolId field
4. Valid submit creates KOL + list refreshes
5. Error responses displayed inline
6. Modal dismissible via × / ESC / backdrop click
7. All tests pass (`npm run test:frontend`)
