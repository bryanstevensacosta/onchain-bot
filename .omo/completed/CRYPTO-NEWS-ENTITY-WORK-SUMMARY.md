# Crypto-News Entity Migration — Work Summary

**Date:** 2026-09-08  
**Session:** Backend path alias fixes + entity deprecation + architecture clarification  
**Status:** ✅ Phase 1 Complete + Architecture Clarified

---

## TL;DR

**What we fixed today:**

1. ✅ Backend compilation errors (path alias → relative imports)
2. ✅ Marked duplicate entities as `@deprecated` (corrected explanation)
3. ✅ Created DTOs for HTTP consumption
4. ✅ Clarified architecture (backend SHOULD have publisher logic)
5. ✅ Documented 3 migration strategies (7-9 hrs / 3-4 hrs / 1-2 hrs)

**Current state:** Backend compiles + runs. Duplicate entities marked deprecated. Migration path clear.

**Next step (optional):** Choose migration strategy and execute.

---

## The Journey

### Starting Point (Morning)

```
❌ Backend compilation failing
   - Path alias imports not resolving at runtime
   - Error: "Cannot find module 'telegram/...'"

❌ No deprecation markers on duplicate entities
   - Unclear which files are legacy
   - No migration path documented

❌ Architecture confusion
   - "Backend shouldn't have ANY crypto-news entities"
   - Misunderstanding about what backend owns
```

### Discovery Phase

**User question:** "Las crypto messages y media entities deberían deprecarse y migrar a ingestion, o me equivoco?"

**My initial (wrong) answer:** "Sí, backend no debería tenerlas porque ingestion owns the data"

**User correction:** "El publisher, enqueue, matching son parte del backend, solo las domain entities deberían pertenecer a ingestion"

**Key insight:** Backend SHOULD have publisher logic. The problem is DUPLICATE entities, not that backend has them at all.

### What We Fixed

#### 1. Path Alias Import Errors ✅

**Files modified:**

- `apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts`
- `apps/backend/src/telegram/crypto-news-integration/application/services/filtered-crypto-news.service.ts`

**Change:**

```typescript
// Before (broke at runtime):
import { FilteredCryptoNewsService } from 'telegram/crypto-news-integration/...';

// After (works):
import { FilteredCryptoNewsService } from '../services/filtered-crypto-news.service';
```

**Result:** Backend compiles and runs successfully.

#### 2. Deprecation Markers ✅

**Files modified:**

- `apps/backend/src/telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity.ts`
- `apps/backend/src/telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo.ts`

**Added JSDoc:**

```typescript
/**
 * @deprecated DUPLICATE — Post db-separation (2026-09-08), this is a COPY
 * of ingestion-service's domain entity.
 *
 * **PROBLEM:** Backend maintains its own copy instead of importing from
 * ingestion-service.
 *
 * **Migration path:**
 * Option A (recommended): Replace with DTOs
 * Option B (alternative): Import FROM ingestion-service
 */
```

**Result:** Clear warnings in IDE + documented migration path.

#### 3. DTO Creation ✅

**File created:**

- `apps/backend/src/telegram/crypto-news-integration/domain/dtos/crypto-news-message.dto.ts`

**Purpose:** Clean HTTP consumption interface (no domain logic).

**Result:** Backend has proper DTOs for ingestion-service API.

#### 4. Architecture Clarification ✅

**Document created:**

- `.omo/completed/crypto-news-architecture-clarification.md`

**Key corrections:**

- Backend SHOULD have publisher/matching/filtering logic ✅
- Backend should NOT duplicate entities ❌
- Ingestion owns DATA, backend owns BUSINESS LOGIC
- Duplication is the problem, not entity usage

**Result:** Clear mental model documented.

#### 5. Migration Plan ✅

**Document created:**

- `.omo/plans/crypto-news-domain-entity-migration.md`

**Provides:**

- 9-phase migration plan (Strategy 1: Pure DTO)
- 3 strategy options with effort estimates
- Testing strategy + rollback plans
- Success criteria

**Result:** Clear path forward for future work.

---

## Architecture (Corrected Understanding)

### What Backend CORRECTLY Owns ✅

```
Backend Business Logic:
├── crypto-news-integration/
│   ├── FilteredCryptoNewsService (fetch RAW + apply filters)
│   ├── EnqueueMatchingCronScheduler (poll every minute)
│   └── MatchingConfig entity (enable/disable matching)
│
├── crypto-news-publisher/
│   ├── EnqueueMatchingMessageUseCase (enqueue to queue)
│   ├── ProcessNextQueuedArticleUseCase (drain → LLM → Bot API)
│   ├── PublisherCronScheduler (tick every minute)
│   ├── LlmConfig entity (llmEnabled, publishingEnabled)
│   ├── Publisher queue (36-cap, 24h TTL)
│   └── Keyword/phrase/template management
│
└── Content transformation (filter-on-read):
    ├── ContentFilterService (per-channel regex)
    ├── ChannelContentFilterConfig entity
    ├── Keyword matching
    └── Blacklist phrases
```

### What Backend Should NOT Have ❌

```
Duplicate Domain Model:
├── CryptoNewsMessage entity ← DUPLICATE of ingestion-service
├── CryptoNewsMedia value object ← DUPLICATE
├── TypeORM mappers ← Dead code (no DB writes)
├── TypeORM repos ← Dead code
└── In-memory repos ← Shims for DI
```

### What Ingestion-Service Owns ✅

```
Data Management:
├── Domain entities (source of truth)
├── TypeORM entities + DB tables
├── RAW data persistence (no filtering)
├── Media download + storage
├── HTTP API (serves DTOs)
└── SSE streaming
```

---

## Migration Strategies

### Strategy 1: Pure DTO (7-9 hours)

**Goal:** Backend uses ONLY DTOs, no entity imports.

**Pros:** Clean architecture, service independence  
**Cons:** Higher effort, needs publisher DTOs

**Best for:** Long-term maintainability, microservices readiness

### Strategy 2: Shared Package (3-4 hours)

**Goal:** Extract entities to `@crypto-news-domain` package.

**Pros:** Fast, type safety, single source of truth  
**Cons:** Couples services, shared domain

**Best for:** Entities are truly shared concepts

### Strategy 3: Import from Ingestion (1-2 hours)

**Goal:** Backend imports FROM ingestion-service package.

**Pros:** Fastest, leverages monorepo  
**Cons:** Tight coupling, backend depends on ingestion

**Best for:** Quick fix, can refactor later

---

## Files Created

### Documentation

1. `/.omo/completed/crypto-news-entity-deprecation.md`
   - Phase 1 completion summary
   - What was done (deprecation markers + DTOs)
   - Verification (build + runtime success)

2. `/.omo/completed/crypto-news-architecture-clarification.md`
   - Corrected mental model (data vs. business logic ownership)
   - Explained the duplication problem
   - Documented all 3 strategies

3. `/.omo/completed/CRYPTO-NEWS-ENTITY-WORK-SUMMARY.md` (this file)
   - Executive summary
   - Journey from confusion to clarity
   - Complete file inventory

### Plan

4. `/.omo/plans/crypto-news-domain-entity-migration.md`
   - 9-phase migration plan (Strategy 1)
   - Strategy comparison table
   - Effort estimates + testing strategy

### Code

5. `/apps/backend/src/telegram/crypto-news-integration/domain/dtos/crypto-news-message.dto.ts`
   - DTOs for HTTP consumption
   - Clean interface (no domain logic)

---

## Files Modified

### Deprecation Markers

1. `/apps/backend/src/telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity.ts`
   - Added `@deprecated DUPLICATE` JSDoc
   - Corrected explanation (duplication problem, not existence)
   - Documented 2 migration paths

2. `/apps/backend/src/telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo.ts`
   - Same corrections as entity

### Import Fixes

3. `/apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts`
   - Path alias → relative imports
   - Added legacy entity imports (temporary, for compilation)

4. `/apps/backend/src/telegram/crypto-news-integration/application/services/filtered-crypto-news.service.ts`
   - Path alias → relative imports

### Plan Updates

5. `/.omo/plans/crypto-news-domain-entity-migration.md`
   - Corrected problem statement (duplication vs. existence)
   - Updated goals (remove duplication vs. remove all)
   - Added Strategy 2 & 3 (shared package + import)

---

## Verification

### Build Status ✅

```bash
$ npm run build
✅ Backend: SUCCESS (0 TypeScript errors)
✅ Frontend: SUCCESS
```

### Runtime Status ✅

```bash
$ npm run dev
✅ Backend boot: SUCCESS (port 3030)
✅ Database: Connected
✅ Redis: Connected
✅ Telegram Bot: Connected (@vipcallstestbot)
✅ All schedulers: Active
```

**Key log verification:**

```
[IngestionCoordinator] Crypto-news SSE persistence skipped:
ingestion-service owns crypto-news messages/sources/media in its own DB
(Opción A — backend persists nothing, filters apply on-read).
```

---

## Impact Summary

### What Changed

| Area               | Before                         | After                           |
| ------------------ | ------------------------------ | ------------------------------- |
| **Compilation**    | ❌ Failing (path alias errors) | ✅ Success                      |
| **Deprecation**    | ⚠️ No markers                  | ✅ Clear `@deprecated` warnings |
| **Architecture**   | ❌ Confusion about ownership   | ✅ Documented correctly         |
| **DTOs**           | ❌ Missing                     | ✅ Created                      |
| **Migration Path** | ❌ Unclear                     | ✅ 3 strategies documented      |

### What Didn't Change (Intentionally)

- ✅ Legacy entities still exist (marked deprecated, not deleted)
- ✅ Publisher logic still in backend (correct location)
- ✅ Enqueue flow still works (no breaking changes)
- ✅ All tests pass (no regressions)

### Risk Level

**Current:** ⚠️ LOW

- System is stable
- No breaking changes
- Deprecation warnings guide future work
- Migration is optional (non-blocking)

**Future (if migration not done):** ⚠️ MEDIUM

- Duplication continues
- Entities may diverge over time
- Maintenance burden (sync changes manually)

---

## Recommendations

### Immediate (This Sprint)

**Option A: Do nothing** ✅ SAFE

- Current state is stable
- Deprecation markers provide guidance
- Focus on feature work

**Option B: Quick fix (Strategy 3)** ⚡ FAST (1-2 hrs)

- Remove duplication immediately
- Import from ingestion-service
- Low risk, low effort

### Short-term (Next Sprint)

**Execute Strategy 1 (Pure DTO)** 🎯 RECOMMENDED

- Clean architecture
- Proper bounded contexts
- 7-9 hours effort over 2-3 PRs

### Long-term (Future)

**If Strategy 3 chosen initially:**

- Refactor to Strategy 1 later
- When time permits
- Non-blocking tech debt

---

## Key Learnings

### Technical

1. **Path aliases break at runtime** — TypeScript compiles but Node can't resolve
2. **Monorepo enables cross-package imports** — can import from ingestion-service
3. **DTOs !== entities** — different purposes (HTTP vs. domain)

### Architectural

1. **Data ownership ≠ business logic ownership** — ingestion owns data, backend owns publishing
2. **Duplication is worse than coupling** — better to import than duplicate
3. **Bounded contexts can share models** — if truly shared domain concepts

### Process

1. **Question assumptions** — "backend shouldn't have entities" was wrong
2. **Document discoveries** — architecture clarification doc captures learning
3. **Provide options** — 3 strategies with tradeoffs, not just one path

---

## Conclusion

**Problem solved:** Backend compiles and runs. Duplicate entities marked deprecated. Architecture clarified.

**Migration needed:** Yes, but non-blocking. Choose strategy based on priorities:

- Speed → Strategy 3 (1-2 hrs)
- Balance → Strategy 2 (3-4 hrs)
- Clean architecture → Strategy 1 (7-9 hrs)

**Current state:** Stable and documented. Safe to defer migration if needed.

**Next session:** Review strategies with team → choose one → execute (or defer).

---

**Created by:** Kiro AI  
**Date:** 2026-09-08  
**Session Duration:** ~3 hours (investigation + fixes + documentation)  
**Outcome:** ✅ Success (system stable + path forward clear)
