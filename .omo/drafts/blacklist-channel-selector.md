---
slug: blacklist-channel-selector
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/blacklist-channel-selector.md
approach: Replace the plain text input for `sourceChannelIds` in BlacklistModal with the existing SourceMultiSelect component, matching Keywords.
---

# Draft: blacklist-channel-selector

## Components (topology ledger)

<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

1. `blacklist-manager.tsx` — replace text input with SourceMultiSelect | active
2. Tests for blacklist-manager (if any) — update to match new UI | active

## Open assumptions (announced defaults)

<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

1. No new query/API needed — `useCryptoNewsSources()` already imported, `SourceMultiSelect` already exists | Source: `blacklist-manager.tsx:183` imports `useCryptoNewsSources`; `source-multi-select.tsx` is the reusable dropdown | ✅ reversible (trivial)
2. Backend DTOs already accept `sourceChannelIds: string[]` — no backend changes needed | Source: `CreateBlacklistBody` at `blacklist-api.ts:23`, `UpdateBlacklistBody` at `blacklist-api.ts:31`, backend controller uses same shape | ✅ reversible
3. Test updates only needed if tests directly interact with the channel ID input (likely selector-based tests need updating) | Will verify existing spec | ✅ reversible

## Findings (cited - path:lines)

### Current Blacklist UI (text input)

- `blacklist-manager.tsx:48-50`: state is a single `string` (`initialSourceChannelIds`)
- `blacklist-manager.tsx:68-71`: on submit, the string is split by comma into `string[]`
- `blacklist-manager.tsx:102-122`: renders an `<input type="text">` with placeholder `"e.g. 123456789, 987654321 (empty = all sources)"` and a hint below
- `blacklist-manager.tsx:183`: already imports and uses `useCryptoNewsSources()` for display purposes (`sourceDisplay()`, line 246-255)
- `blacklist-manager.tsx:293`: edit modal passes `initialSourceChannelIds={editingItem?.sourceChannelIds.join(', ')}`

### Keywords UI (dropdown selector — the target pattern)

- `keywords-section.tsx:200-205`: renders `<SourceMultiSelect ids={...} onChange={...} sourceOptions={...} disabled={...} />`
- `source-multi-select.tsx`: standalone component accepting `ids: string[]`, `onChange: (ids: string[]) => void`, `sourceOptions`, `disabled`
- Also used inline in edit mode: `keywords-section.tsx:342-352`

### Shared component available

- `source-multi-select.tsx`: `SourceMultiSelect`, `sourceLabel`, `SourceOption` — all exported

### Backend (no changes required)

- `CryptoNewsSourceRepository.findAll()` at `crypto-news-source.repository.ts:14` — already returns all sources
- `BlacklistPhrase.sourceChannelIds` at `blacklist-phrase.entity.ts:13` — already `string[]`
- `BlacklistController` at `blacklist.controller.ts:55` — already accepts `sourceChannelIds?: string[]` in CreateBlacklistDto and UpdateBlacklistDto

## Decisions (with rationale)

1. **Replace text input → SourceMultiSelect in BlacklistModal** — zero new code, reuses existing component. The state shape changes from `string` to `string[]`.
2. **No backend changes** — DTOs and domain model already support `string[]` for `sourceChannelIds`.
3. **Tests**: Explore if blacklist tests exist that assert on the text input; update if so.

## Scope IN

1. Update `BlacklistModal`: change `initialSourceChannelIds` prop type from `string` to `string[]` (and all related state/handlers)
2. Replace the `<input id="bl-sources">` with `<SourceMultiSelect>`
3. Remove the comma-split logic in `handleSubmit` (SourceMultiSelect passes `string[]` directly)
4. Update the edit modal's `initialSourceChannelIds` from `editingItem?.sourceChannelIds.join(', ')` to just `editingItem?.sourceChannelIds ?? []`
5. Verify frontend tests pass

## Scope OUT (Must NOT have)

1. ❌ No new backend endpoints, DTOs, repos, or use cases
2. ❌ No changes to SourceMultiSelect component itself
3. ❌ No changes to keywords-section.tsx
4. ❌ No changes to the blacklist API layer (blacklist-api.ts, use-blacklist.ts)
5. ❌ No CSS/styling changes beyond what SourceMultiSelect already provides

## Open questions

None — intent is CLEAR and codebase exploration resolves all unknowns.

## Approval gate

status: awaiting-approval

<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
