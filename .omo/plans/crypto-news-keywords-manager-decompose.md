# crypto-news-keywords-manager-decompose - Work Plan

## TL;DR (For humans)

**What you'll get:** El archivo `keywords-manager.tsx` pasa de 1,194 líneas (~300 después) — se divide en 2 nuevos archivos enfocados. El componente principal queda como una fachada delgada que compone `KeywordsSection` + el ya existente `BlacklistManager`.

**Why this approach:** Extracción gradual — cada paso es atómico y reversible. Reutilizamos el `BlacklistManager` ya existente (426 líneas, patrón Modal) que estaba desconectado, y extraemos el `SourceMultiSelect` que estaba duplicado conceptualmente. Usamos exactamente el mismo patrón FSD existente (`features/*/ui/`).

**What it will NOT do:** No cambia la API pública de `KeywordsManager` (sigue exportándose desde `index.ts`), no cambia la página (`crypto-news/index.tsx`), no altera comportamiento, no introduce tests nuevos.

**Effort:** Low-Medium
**Risk:** Low — las extracciones son puramente mecánicas (cortar y pegar + import); el riesgo está en atar los imports de los tipos compartidos correctamente.
**Decisions to sanity-check:** 1) `BlacklistManager` se renderiza dentro del mismo contenedor que `KeywordsSection` (elegido por el usuario). 2) `SourceMultiSelect` se queda en `ui/` de la feature (no sube a `shared/ui/` porque usa tipos de `crypto-news-publisher`).

Your next move: **approve** the plan to proceed, or request a high-accuracy review (Momus).

---

> TL;DR (machine): Low-Medium effort, Low risk — 3 extraction todos + 1 rewire + 1 verify. 1,194→~300 loc for keywords-manager. 2 new files. Zero page changes.

## Scope

### Must have

- Extract `SourceMultiSelect` component + helpers → `source-multi-select.tsx` (shared between keywords and blacklist sections)
- Extract keywords CRUD section → `keywords-section.tsx` (keywords state, form, table, pagination)
- Remove ~903 lines of blacklist code from `keywords-manager.tsx` (replaced with existing `BlacklistManager`)
- Rewire `keywords-manager.tsx` as thin facade composing `KeywordsSection` + `BlacklistManager`
- ESLint + tsc + tests must pass

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No changes to `crypto-news/index.tsx` page layout (the page imports `KeywordsManager` — it stays the same)
- No changes to `index.ts` barrel exports
- No changes to `BlacklistManager` itself (already clean, Modal-based, 426 lines)
- No changes to model hooks (`use-keywords.ts`, `use-blacklist.ts`)
- No changes to API files (`keywords-api.ts`, `blacklist-api.ts`)
- No behavior changes — extract, don't refactor

## Verification strategy

> Zero human intervention — all verification is agent-executed.

- Test decision: tests-after — existing test suite + ESLint + tsc --noEmit
- Evidence: `.omo/evidence/crypto-news-keywords-manager-decompose/`

## Execution strategy

### Parallel execution waves

- **Wave 1** (parallel — independent): T1, T2
- **Wave 2** (depends on Wave 1): T3 (rewire, needs T1+T2)
- **Wave 3**: Final verification

### Dependency matrix

| Todo                | Depends on | Blocks | Can parallelize with |
| ------------------- | ---------- | ------ | -------------------- |
| T1-source-select    | —          | T3     | T2                   |
| T2-keywords-section | —          | T3     | T1                   |
| T3-rewire           | T1, T2     | T4     | —                    |
| T4-verify           | T3         | —      | —                    |

## Todos

- [x] 1. **Extract `SourceMultiSelect` to `source-multi-select.tsx`**
     What to do / Must NOT do:
     Create `apps/frontend/src/features/crypto-news-publisher/ui/source-multi-select.tsx` and MOVE:

  ```
  Lines 41-49:  SourceOption interface + sourceLabel() helper
  Lines 51-148: SourceMultiSelect component (98 lines — the core extraction)
  Lines 150-159: templateLabel() helper
  ```

  The new file looks like:

  ```typescript
  import { type KeyboardEvent, useCallback } from 'react';

  export interface SourceOption {
    channelId: string;
    title: string;
  }

  export function sourceLabel(
    src: string,
    srcOptions: ReadonlyArray<SourceOption>,
  ): string {
    return srcOptions.find((s) => s.channelId === src)?.title ?? src;
  }

  export function templateLabel(
    tplId: string | null,
    templates: ReadonlyArray<{ id: string; name: string }>,
  ): string {
    if (!tplId) return '(none)';
    return templates.find((t) => t.id === tplId)?.name ?? tplId;
  }

  interface SourceMultiSelectProps {
    ids: ReadonlyArray<string>;
    onChange: (ids: ReadonlyArray<string>) => void;
    sourceOptions: ReadonlyArray<SourceOption>;
    disabled: boolean;
  }

  export function SourceMultiSelect({
    ids,
    onChange,
    sourceOptions,
    disabled,
  }: SourceMultiSelectProps): React.ReactElement {
    // ... exactly as in lines 51-148
  }
  ```

  In `keywords-manager.tsx`, DELETE all moved code (lines 41-159) and REPLACE with:

  ```typescript
  import {
    SourceMultiSelect,
    sourceLabel,
    templateLabel,
    type SourceOption,
  } from './source-multi-select';
  ```

  Must NOT: Change `SourceMultiSelect` behavior (same keyboard navigation, same chip rendering, same dark theme styling).
  Must NOT: Move `SourceOption` to shared types — it's only used within this feature.

  Parallelization: Wave 1 | Blocked by: — | Blocks: T3
  References: `keywords-manager.tsx:41-159`
  Acceptance criteria: `tsc --noEmit` succeeds, component renders identically
  QA: happy — ESLint 0 err on both files; failure — missing import breaks `tsc --noEmit`
  Commit: `refactor(frontend): extract SourceMultiSelect component to source-multi-select.tsx`

- [x] 2. **Extract keywords section to `keywords-section.tsx`**
     What to do / Must NOT do:
     Create `apps/frontend/src/features/crypto-news-publisher/ui/keywords-section.tsx` and MOVE:

  **State/handlers (keywords-specific only):**
  - All keyword-specific `useState` calls (newPhrase, newTemplateId, newCaseSensitive, newSourceChannelIds, newEnabled, editing, searchQuery, kwPage, KW_PAGE_SIZE)
  - All keyword query/mutation hooks and their handlers (handleCreate, handleSaveEdit, handleToggle, handleDelete)
  - Filtering/search logic (`kwQ`, `filteredKeywords`, `kwIsDuplicate`, `kwTotalPages`)

  **Imports to move:**
  - From `react`: `useState`, `useEffect`, `type FormEvent`
  - From `@/shared/ui/card`: `Card`
  - From `@/shared/ui/button`: `Button`
  - From feature model: `useKeywords`, `useCreateKeyword`, `useUpdateKeyword`, `useDeleteKeyword`
  - From feature api types: `KeywordView`, `CreateKeywordBody`, `UpdateKeywordBody`
  - From entity: `useCryptoNewsSources`, `type CryptoNewsSource`
  - From `use-llm-config` model: template hooks
  - From local: `SourceMultiSelect`, `sourceLabel`, `templateLabel`, `type SourceOption`

  **JSX to move (from inside the single `<Card>`):**
  - Keywords title section (lines 386-393)
  - Keywords create form (lines 395-500) — with inline editing row toggle
  - Keywords error display (lines 502-508)
  - Keywords loading/empty/error states (lines 509-537)
  - Keywords table rows (lines 538-820) — with inline editing, SourceMultiSelect, pagination

  The new component wraps everything in its OWN `<Card>`:

  ```typescript
  export function KeywordsSection(): React.ReactElement {
    // ... all keyword-specific state and handlers moved here
    return (
      <Card>
        {/* keywords title, form, search, table, pagination — same JSX */}
      </Card>
    );
  }
  ```

  In `keywords-manager.tsx`, DELETE all keywords-specific state, handlers, and JSX. REPLACE with import + usage.

  Must NOT: Include any blacklist-related code in this file.
  Must NOT: Change the inline-editing pattern (stays as-is, even though BlacklistManager uses Modal — different scope).

  Parallelization: Wave 1 | Blocked by: — | Blocks: T3
  References: `keywords-manager.tsx:161-823` (roughly — the keywords state + handlers + JSX within the Card before the `<hr />` divider)
  Acceptance criteria: Keywords section works identically, blacklist is not affected
  QA: `grep -n 'useKeywords\|useCreateKeyword\|useUpdateKeyword\|useDeleteKeyword' keywords-manager.tsx` — 0 matches after extraction
  Commit: `refactor(frontend): extract KeywordsSection from keywords-manager.tsx`

- [x] 3. **Rewire `keywords-manager.tsx`**
     What to do / Must NOT do:
     After T1 and T2 are done:

  1. **Remove ALL blacklist code** from `keywords-manager.tsx`:
     - Remove blacklist state (blNewPhrase, blNewTemplateId, blNewCaseSensitive, blNewSourceChannelIds, blNewEnabled, blEditing, blSearchQuery, blPage, BL_PAGE_SIZE — lines 280-285)
     - Remove blacklist data computation (blacklist sort, blQ, filteredBlacklist, blIsDuplicate, blNewPhraseTrimmed — lines 287-307)
     - Remove blacklist useEffect for page clamping (lines 308-310)
     - Remove all blacklist handlers (handleBlCreate, handleBlSaveEdit, handleBlToggle, handleBlDelete, sourceDisplay — lines 312-382)
     - Remove all blacklist imports: `useBlacklist`, `useCreateBlacklist`, `useUpdateBlacklist`, `useDeleteBlacklist`, `type BlacklistPhraseView`, `type CreateBlacklistBody`, `type UpdateBlacklistBody`
     - Remove the entire blacklist render section: the `<hr />` divider (line 828) + blacklist title/form/search/table/pagination (lines 830-1192)
     - Remove `</Card>` (line 1192) and closing `}` (line 1193)

  1. **Add imports** for the new extracted components:

     ```typescript
     import { KeywordsSection } from './keywords-section';
     import { BlacklistManager } from './blacklist-manager';
     ```

  1. **Rewrite the render** as a thin composition:

     ```typescript
     export function KeywordsManager(): React.ReactElement {
       return (
         <>
           <KeywordsSection />
           <BlacklistManager />
         </>
       );
     }
     ```

  1. **Clean up remaining imports**:
     - Remove: `Card`, `Button`, `useKeywords`, `useCreateKeyword`, `useUpdateKeyword`, `useDeleteKeyword`, `useBlacklist`, `useCreateBlacklist`, `useUpdateBlacklist`, `useDeleteBlacklist`, `useCryptoNewsSources`, template hooks, all API types
     - Keep only: `React` (implicit from JSX), `KeywordsSection`, `BlacklistManager`

  1. Run `npx eslint --fix` on the file

  The final `keywords-manager.tsx` is ~15 lines:

  ```typescript
  import { KeywordsSection } from './keywords-section';
  import { BlacklistManager } from './blacklist-manager';

  export function KeywordsManager(): React.ReactElement {
    return (
      <>
        <KeywordsSection />
        <BlacklistManager />
      </>
    );
  }
  ```

  Must NOT: Change `crypto-news/index.tsx` or `index.ts` barrel exports.
  Must NOT: Change `src/pages/crypto-news/index.tsx` — it still imports `KeywordsManager` and renders it the same way.

  Parallelization: Wave 2 | Blocked by: T1, T2 | Blocks: T4
  References: entire `keywords-manager.tsx` file
  Acceptance criteria: `KeywordsManager` compiles, composition renders identically to before (keywords Card + blacklist Card inside same container)
  QA: `npx eslint --fix` passes, `tsc --noEmit` passes
  Commit: `refactor(frontend): rewire KeywordsManager as thin facade composing KeywordsSection + BlacklistManager`

- [x] 4. **Final verification**
     What to do:
  1. `wc -l apps/frontend/src/features/crypto-news-publisher/ui/keywords-manager.tsx` → target ~15 lines (was 1,194)
  1. `npx eslint apps/frontend/src/features/crypto-news-publisher/ui/` → 0 errors, 0 warnings
  1. `npx tsc --noEmit` (from apps/frontend) → 0 errors
  1. `npx vitest run` (from apps/frontend) → all 154 tests pass
  1. Verify each new file exists and has correct exports:
     - `source-multi-select.tsx` — exports `SourceMultiSelect`, `sourceLabel`, `templateLabel`, `SourceOption`
     - `keywords-section.tsx` — exports `KeywordsSection`
  1. Verify `keywords-manager.tsx` no longer contains blacklist code:
     - `grep -n 'blacklist\|blacklist\|useBlacklist\|handleBl\|blNew\|blEditing\|blSearch\|blPage\|BL_PAGE\|blQ\|blIsDuplicate\|blCreate\|blUpdate\|blDelete' keywords-manager.tsx` → 0 matches

  Parallelization: Wave 3 | Blocked by: T3 | Blocks: —
  References: all files
  Acceptance criteria: All 6 checks pass

## Final verification wave

- [x] F1. Plan compliance audit — verify all todos completed
- [x] F2. ESLint 0 err on all new + modified files
- [x] F3. Tests: 154/154 frontend Vitest tests pass
- [x] F4. `wc -l keywords-manager.tsx` ~15 lines

## Commit strategy

- 3 atomic commits (one per Todo T1-T3)
- Squash T4 into T3 if clean
- All commits directly on dev branch

## Success criteria

- `keywords-manager.tsx`: 1,194 → ~15 lines (-99%)
- 2 new files: `source-multi-select.tsx`, `keywords-section.tsx`
- `BlacklistManager` (426 lines) now actually composed into the UI
- ESLint 0, tsc 0, tests 154/154
- Zero behavior changes — same UI, same imports from page
