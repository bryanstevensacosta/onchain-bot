# Draft: blacklist-match-mode

## Intent

CLEAR — add matchMode (exact/substring) selector to the blacklist phrase UI, mirroring how keywords already implement it.

## Findings / Evidence

### Backend already fully supports matchMode for blacklist phrases

- Domain entity `blacklist-phrase.entity.ts`: `create()` accepts `matchMode?: MatchMode`, defaults to `'exact'`; `reconstitute()` defaults to `'substring'`; `matches()` method implements both modes identically to Keyword.matches()
- Controller `blacklist.controller.ts`: `CreateBlacklistDto`, `UpdateBlacklistDto`, `BlacklistPhraseView` all include `matchMode`; `create()` passes it (default `'exact'`); `update()` handles it
- TypeORM entity `BlacklistPhraseEntity`: column `match_mode` with default `'substring'`; no migration needed
- Source: `apps/backend/src/telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity.ts`
- Source: `apps/backend/src/telegram/crypto-news-publisher/api/http/blacklist.controller.ts`
- Source: `apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/blacklist-phrase.entity.ts`

### Frontend API types already include matchMode

- `blacklist-api.ts`: `BlacklistPhraseView.matchMode`, `CreateBlacklistBody.matchMode`, `UpdateBlacklistBody.matchMode` all exist
- Source: `apps/frontend/src/features/crypto-news-publisher/api/blacklist-api.ts`

### Keywords UI pattern (to replicate)

- Create form: `<select>` with "Exact"/"Substring" options, labeled "Match", next to checkboxes
- Table: "Match" column; read mode shows uppercase value, edit mode shows `<select>`
- Source: `apps/frontend/src/features/crypto-news-publisher/ui/keywords-section.tsx` lines 226-238 (create), 390-412 (table edit)

### What needs to change

Only `blacklist-manager.tsx`:

1. Add `initialMatchMode` prop to `BlacklistModalProps` type
2. Add `matchMode` state in `BlacklistModal`
3. Add matchMode `<select>` in the create modal form (between caseSensitive checkbox and Save button)
4. Add "Match" column header in table
5. Add matchMode display in table (read: uppercase span; edit: select)
6. Pass `matchMode` in `handleSubmit` body
7. Update create modal caller to pass `initialMatchMode={'exact'}`
8. Update edit modal caller to pass `initialMatchMode={editingItem?.matchMode ?? 'substring'}`
9. Update `handleClose` reset to include `matchMode`

### Must NOT

- No backend changes (controller, domain, TypeORM)
- No changes to `blacklist-api.ts`, `use-blacklist.ts`, or any other file
- No changes to keywords-section.tsx or keywords

## Decisions

- Default for new phrases: `'exact'` (matches Keyword domain default)
- Edit modal receives `'substring'` fallback for legacy records (matches reconstitute default)
- Same visual pattern as Keywords: `<select>` with "Exact"/"Substring" options

## Status

awaiting-approval
