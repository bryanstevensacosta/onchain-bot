# keyword-dedup - Work Plan

## TL;DR

**What you'll get:** Creating a keyword with a phrase that already exists (case-insensitive) will show a "Ya existe" error instead of creating a duplicate. The check happens both on the backend (409 Conflict) and on the frontend (instant inline feedback before submitting).

## Todos

### 1. Backend — `keywords.controller.ts`

Add duplicate check in `create()`:
- Import `ConflictException` from `@nestjs/common`
- Before `Keyword.create()`, call `this.keywordRepo.findAll()` and check if any existing keyword has the same `phrase` after `.toLowerCase()` trim
- If duplicate found, throw `new ConflictException('Keyword "... " already exists')`

### 2. Frontend — `keywords-manager.tsx`

Add inline duplicate detection in the create-new-keyword form:
- Before calling `createKeyword()`, check if `phrase.trim().toLowerCase()` matches any keyword in the already-loaded list
- If it does, show a red error message below the input field (something like `"Esa keyword ya existe"`)
- Prevent form submission when duplicate detected

## Verification
- `cd apps/backend && npx tsc --noEmit --incremental false`
- `cd apps/frontend && npx tsc --noEmit --incremental false`