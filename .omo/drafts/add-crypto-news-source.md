# Draft: Add Crypto News Source Button

## Intent

**CLEAR** — User wants a button "like Add KOL" on the /crypto-news page to add a crypto news ingestion channel through the frontend.

---

## Momus Review Results

12 issues found (4 HIGH, 4 MED, 4 LOW). All resolved below.

---

## Resolved Decisions (post-Momus)

### D1 — Form fields: ONLY channelId (mirror add-kol pattern)

**Momus finding (HIGH):** Plan said "channelId + title + handle" but add-kol only asks for kolId. The backend resolves metadata.
**Resolution:** Extract the seeder's private `resolveMetadata()` into a `CryptoNewsMetadataResolver` service. Controller calls it when title is not provided. Modal asks **only for channelId** with placeholder `"e.g. 1234567890"` (numeric-only, no `@` — crypto-news requires numeric per domain validation). UX hint: "Display title and handle are resolved automatically from Telegram."

### D2 — Controller: inject RegisterNewsSourceUseCase + map to view

**Momus finding (HIGH):** Controller doesn't inject the use case. Domain entity returned ≠ CryptoNewsSourceView.
**Resolution:**

- Inject `RegisterNewsSourceUseCase` and `CryptoNewsMetadataResolver` into `CryptoNewsController`
- `@Post('sources')` handler: if `title` not in body, call `resolver.resolve(channelId)`. Then `registerSource.execute(...)`. Then map domain entity to `CryptoNewsSourceView` shape (no separate `id` — channelId is the aggregate ID).
- No module changes needed — use case already provided at `crypto-news-ingestion.module.ts:121`.

### D3 — isActive: NEW source must start ingesting

**Momus finding (HIGH):** `CryptoNewsSource.create()` sets `isActive=false`. Seeder explicitly calls `activate()` after register. Controller must do the same or channel won't ingest.
**Resolution:** After `registerSource.execute()`, call `source.activate(); await sourceRepo.save(source);` in the controller handler, matching the seeder pattern.

### D4 — CONFLICT (409) handling

**Momus finding (HIGH):** `RegisterNewsSourceUseCase` throws `DomainError(CONFLICT)` on duplicate. `DomainErrorFilter` maps it to 409. Modal inherits generic error display from add-kol.
**Resolution:** Modal shows `mutation.error.message` in red alert (same as add-kol). Add a test for duplicate submission (409) asserting error renders. OK to keep the raw error text — it's explicit: "CryptoNewsSource already registered: 1234567890".

### D5 — Test plan added

**Momus finding (MED):** Plan didn't enumerate tests.
**Resolution — tests required:**

1. Backend: `crypto-news.controller.spec.ts` — happy POST 201 with view, duplicate 409, invalid channelId 400, optional handle preserved
2. Frontend: `add-crypto-news-source-client.test.ts` — mock httpPost, assert URL + body
3. Frontend: `__tests__/add-crypto-news-source-modal.test.tsx` — open/close, submit, error display, success clear + close
4. Refresh: existing `entities/crypto-news/...` tests still pass (no entity barrel changes)

### D6 — Query invalidation: cryptoNewsKeys.all

**Momus finding (MED):** Must invalidate queries to show the new source immediately.
**Resolution:** In `use-add-crypto-news-source`, invalidate `cryptoNewsKeys.all` (both `sources()` and `messages()`) — same pattern as `kolKeys.all`.

### D7 — Channel ID: numeric-only validation on frontend

**Momus finding (MED):** Crypto-news requires numeric channelId (`/^-?\d+$/`). Add-kol placeholder allows `@channel_username`. Copying that would mislead users.
**Resolution:**

- Placeholder: `"e.g. 1234567890"` (no `@` reference)
- Client-side guard: `if (!/^\d+$/.test(channelId.trim()))` disable submit. Show subtle helper text.

### D8 — handle format: strip leading @ if user adds it

**Resolution:** If handle is provided (e.g. the user types `@WatcherGuru`), strip leading `@` on submit to match seed convention (`handle: 'WatcherGuru'`). Optional field, not shown in default UX.

---

## Evidence (verified by Momus)

- Backend `RegisterNewsSourceUseCase` exists at `apps/backend/src/telegram/ingestion/crypto-news/application/handlers/register-news-source.use-case.ts`
- `CryptoNewsController` has only GET endpoints at `apps/backend/src/telegram/ingestion/crypto-news/api/http/crypto-news.controller.ts`
- `RegisterNewsSourceUseCase` is already in module providers at `crypto-news-ingestion.module.ts:121`
- Seeder `resolveMetadata()` is private at `crypto-news.seeder.ts:125-160`
- Frontend add-kol pattern: `apps/frontend/src/features/add-kol/{ui,api,model,index.ts}`
- Crypto-news page at `apps/frontend/src/pages/crypto-news/index.tsx`
- `ENDPOINTS` config at `apps/frontend/src/shared/api/endpoints.ts`
- `cryptoNewsKeys` query keys at `apps/frontend/src/entities/crypto-news/api/crypto-news-queries.ts`
- `DomainErrorFilter` maps CONFLICT → 409 at `apps/frontend/src/shared/filters/domain-error.filter.ts`
- `httpPost` at `apps/frontend/src/shared/api/http-client.ts:23-37`
- Numeric validation regex at `crypto-news-source.entity.ts:47`

## Implementation Scope

### Backend (2 files modified, 1 new, 3 test files)

1. **NEW** `CryptoNewsMetadataResolver` service at `apps/backend/src/telegram/ingestion/crypto-news/application/services/crypto-news-metadata-resolver.service.ts` — extracted from seeder's `resolveMetadata()`
2. **MODIFY** `apps/backend/src/telegram/ingestion/crypto-news/api/http/crypto-news.controller.ts` — inject `RegisterNewsSourceUseCase` + `CryptoNewsMetadataResolver`, add `@Post('sources')` with activate + view mapping
3. **MODIFY** `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/seeders/crypto-news.seeder.ts` — use the new resolver instead of private method
4. **MODIFY** `apps/backend/src/telegram/ingestion/crypto-news/crypto-news-ingestion.module.ts` — add `CryptoNewsMetadataResolver` to providers
5. **NEW** `apps/backend/src/telegram/ingestion/crypto-news/api/http/__tests__/crypto-news.controller.spec.ts`

### Frontend (4 new feature files + 2 test files + 2 modified files)

1. **NEW** `apps/frontend/src/features/add-crypto-news-source/api/add-crypto-news-source-client.ts`
2. **NEW** `apps/frontend/src/features/add-crypto-news-source/model/use-add-crypto-news-source.ts`
3. **NEW** `apps/frontend/src/features/add-crypto-news-source/ui/add-crypto-news-source-modal.tsx`
4. **NEW** `apps/frontend/src/features/add-crypto-news-source/index.ts`
5. **NEW** `apps/frontend/src/features/add-crypto-news-source/api/__tests__/add-crypto-news-source-client.test.ts`
6. **NEW** `apps/frontend/src/features/add-crypto-news-source/ui/__tests__/add-crypto-news-source-modal.test.tsx`
7. **MODIFY** `apps/frontend/src/shared/api/endpoints.ts` — add `cryptoNews.sources.add`
8. **MODIFY** `apps/frontend/src/pages/crypto-news/index.tsx` — add button + modal state

**Zero changes to:** entities/crypto-news/ (no barrel changes), shared/ui/ (Button + Modal reused), app/router/ (no new route)

## Status

**approved** — user approved on turn 2. Plan written to `.omo/plans/add-crypto-news-source.md`.
