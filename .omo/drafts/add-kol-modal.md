---
slug: add-kol-modal
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/add-kol-modal.md
approach: 
  Backend: Make title optional in RegisterKolInput, inject ResolvedKolMetadataRepository + TelegramListenerPort into RegisterKolUseCase to resolve title/handle from kolId (mirroring KolSeeder.resolveMetadata()). Frontend: "+ Add KOL" button in KolsPage header → modal with single field (kolId) → POST to backend → auto-close + refresh list.
---

# Draft: add-kol-modal

## Components (topology ledger)
1. **Backend**: `RegisterKolInput` — make `title` optional (`title?: string`)
2. **Backend**: `RegisterKolUseCase` — inject metadata resolution, derive title/handle from kolId when not provided
3. **Frontend**: `shared/ui/modal.tsx` — reusable Modal
4. **Frontend**: `features/add-kol/` — feature slice (api, model, ui)
5. **Frontend**: `KolsPage` — "+ Add KOL" button in header + modal integration
6. **Tests**: feature slice tests

## Open assumptions (announced defaults)
1. Modal: centered overlay with backdrop, ESC/backdrop-dismiss | Standard UX
2. Form: single field `kolId` (required text input) | User specified only kolId needed
3. Validation: frontend required-field check, backend validates | Standard pattern
4. Modal built from scratch with Tailwind + React portal | Keeps deps lean
5. Button: "+ Add KOL" variant primary in header | User chose header placement
6. Backend resolves title/handle from kolId via TelegramListenerPort + ResolvedKolMetadataRepository | Follows KolSeeder pattern

## Findings (cited - path:lines)
1. **Backend endpoint exists**: `POST /telegram-kol/identity/kols` → `KolController.add()` (apps/backend/src/kol/identity/api/http/kol.controller.ts:39-42)
2. **RegisterKolInput**: `{ kolId: string; handle?: string; title: string }` — title is REQUIRED (apps/backend/src/kol/identity/api/input/register-kol.input.ts:5-9)
3. **RegisterKolUseCase.execute()**: requires `title` on line 38: `Kol.create({ id, handle, title: input.title })` (apps/backend/src/kol/identity/application/handlers/register-kol.use-case.ts:38)
4. **KolSeeder.resolveMetadata()** resolves title/handle from kolId via:
   - `ResolvedKolMetadataRepository` (cache lookup)
   - `TelegramListenerPort.resolveChannelMetadata(kolId)` (MTProto call to Telegram)
   - Fallback: `Telegram channel ${kolId}` (apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts:161-244)
5. **IdentityModule** already wires `ResolvedKolMetadataRepository` and exports it (identity.module.ts:64-73, 83)
6. **TelegramListenerPort** is provided globally by `TelegramIngestionModule`
7. Frontend: `ENDPOINTS.kols.add = '/telegram-kol/identity/kols'` (apps/frontend/src/shared/api/endpoints.ts:9)
8. Frontend: `httpPost<TBody, TResp>()` available (apps/frontend/src/shared/api/http-client.ts:23)
9. Frontend: No Modal component exists yet (shared/ui exports: Button, Badge, Card, ChainIcon, LiquidityGauge, TokenImage)
10. Frontend: KolsPage header area at apps/frontend/src/pages/kols/index.tsx:108-115

## Decisions (with rationale)
1. **Backend: make title optional + auto-resolve** — user only wants to provide kolId; the resolution logic already exists in KolSeeder. We extract it into the use case.
2. **ResolveInline** in RegisterKolUseCase rather than a separate service — simpler, avoids premature abstraction. The seeder can be refactored later to share the logic.
3. **Single-field form** (kolId only) — matches user requirement. Title and handle are resolved server-side.
4. **Fallback to kolId as title** — if Telegram resolution fails, use `kolId` as placeholder; the seeder's backfill will update it later.

## Scope IN
- Backend: make `title` optional in `RegisterKolInput`
- Backend: inject `ResolvedKolMetadataRepository` + `TelegramListenerPort` into `RegisterKolUseCase`
- Backend: resolve title/handle from kolId when not provided (cache → MTProto → fallback)
- Frontend: Modal component in `shared/ui/`
- Frontend: "+ Add KOL" button in KolsPage header
- Frontend: Modal with single `kolId` field
- Frontend: TanStack Query mutation → POST → invalidate kolKeys.all
- Frontend: Success auto-close, error inline display

## Scope OUT (Must NOT have)
- No multi-KOL bulk add
- No edit/delete
- No toast library
- No animation library
- No persisted form state
- No confirmation dialogs
- No refactor of KolSeeder (can be follow-up)

## Open questions
None resolved from exploration.

## Approval gate
status: awaiting-approval
