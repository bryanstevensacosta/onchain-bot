# Crypto-News Architecture Clarification

**Created:** 2026-09-08  
**Purpose:** Correct misunderstanding about entity ownership post db-separation

## The Misunderstanding

**Initial (incorrect) interpretation:**

> "Backend shouldn't have ANY crypto-news entities because ingestion-service owns the data"

**Reality (correct):**

> "Backend can use crypto-news entities, but shouldn't DUPLICATE them — should import from ingestion-service OR use DTOs"

## Correct Architecture (Opción A)

### Data Ownership

```
┌─────────────────────────────────────────────────────────┐
│ Ingestion-Service (Data Owner)                          │
├─────────────────────────────────────────────────────────┤
│ ✓ Domain entities (CryptoNewsMessage, CryptoNewsMedia)  │
│ ✓ TypeORM entities (persistence layer)                  │
│ ✓ Database tables (crypto_news_*)                       │
│ ✓ RAW data persistence (no filtering)                   │
│ ✓ Media download + storage                              │
│ ✓ HTTP API (serves DTOs)                                │
│ ✓ SSE streaming                                          │
└─────────────────────────────────────────────────────────┘
                         │
                         │ HTTP API (DTOs)
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Backend (Business Logic Owner)                           │
├─────────────────────────────────────────────────────────┤
│ ✓ Consume DTOs via HTTP                                 │
│ ✓ ContentFilterService (per-channel regex transforms)   │
│ ✓ Keyword matching (simple + AND-groups)                │
│ ✓ Blacklist phrase checking                             │
│ ✓ EnqueueMatchingMessageUseCase                         │
│ ✓ Publisher queue (36-cap, 24h TTL)                     │
│ ✓ LLM transformation (OpenAI/gateway)                   │
│ ✓ Bot API publishing                                     │
│                                                          │
│ ❌ NO crypto-news tables                                │
│ ❌ NO media download/storage                            │
│ ❌ NO RAW data persistence                              │
└─────────────────────────────────────────────────────────┘
```

### The Problem: DUPLICATE Entities

**Current state (post-split):**

```
apps/ingestion-service/src/telegram/crypto-news/domain/entities/
  └── crypto-news-message.entity.ts ← SOURCE OF TRUTH

apps/backend/src/telegram/ingestion/crypto-news/domain/entities/
  └── crypto-news-message.entity.ts ← DUPLICATE COPY (DRY violation)
```

**Why this is wrong:**

1. **Violates DRY** — same concept defined twice
2. **Maintenance burden** — changes must be synced manually
3. **Divergence risk** — copies can drift over time
4. **Unclear ownership** — which file is the source of truth?

## What Backend SHOULD Have

### Option A: Pure DTO Consumption (Recommended)

Backend works ONLY with DTOs, never imports domain entities:

```typescript
// Backend imports
import { CryptoNewsMessageDto } from 'crypto-news-integration/domain/dtos/';
import { EnqueueMessageDto } from 'crypto-news-publisher/domain/dtos/';

// Backend does NOT import
// ❌ import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/';
```

**Pros:**

- Clean separation of concerns
- No dependency on ingestion-service internals
- DTOs are stable HTTP contracts
- Backend logic doesn't need full domain entities

**Cons:**

- Needs publisher-specific DTOs (extra layer)
- Some mapping overhead (DTO → publisher DTO)

### Option B: Import from Ingestion-Service (Monorepo Alternative)

Backend imports entities FROM ingestion-service package:

```typescript
// Backend imports from ingestion-service
import { CryptoNewsMessage } from '@alpha-meta-token-scanner/ingestion-service';

// Backend does NOT duplicate
// ❌ Local copy in apps/backend/src/telegram/ingestion/crypto-news/domain/
```

**Pros:**

- No duplication (single source of truth)
- Type safety from domain entities
- Monorepo makes cross-package imports easy

**Cons:**

- Tight coupling to ingestion-service internals
- Backend depends on ingestion domain model
- Changes to entities affect both services

## What Backend CORRECTLY Owns

Backend owns the **publisher pipeline** — this is CORRECT and should stay:

### ✅ Backend Responsibilities (Keep These)

1. **crypto-news-integration/** (matching + enqueue orchestration):
   - `FilteredCryptoNewsService` — fetch RAW + apply filters
   - `EnqueueMatchingCronScheduler` — poll every minute
   - `MatchingConfig` entity (enable/disable matching)

2. **crypto-news-publisher/** (publishing pipeline):
   - `EnqueueMatchingMessageUseCase` — enqueue to publisher queue
   - `ProcessNextQueuedArticleUseCase` — drain queue → LLM → Bot API
   - `PublisherCronScheduler` — tick every minute
   - `LlmConfig` entity (llmEnabled, publishingEnabled)
   - Publisher queue (36-cap, 24h TTL, status tracking)
   - Keyword/phrase/template management

3. **Content transformation** (filter-on-read, Opción A):
   - `ContentFilterService` — per-channel regex transforms
   - `ChannelContentFilterConfig` entity (backend-owned, FK-less)
   - Keyword matching (simple + AND-groups)
   - Blacklist phrase checking

### ❌ Backend Should NOT Have (Ingestion Owns)

1. **Domain entities** (duplicate copies):
   - `CryptoNewsMessage` entity
   - `CryptoNewsMedia` value object
2. **Persistence layer** (no DB writes):
   - TypeORM mappers (crypto-news-message.mapper.ts)
   - TypeORM repositories (TypeOrmCryptoNewsMessageRepository)
   - In-memory repos (InMemoryCryptoNewsMessageRepository)

3. **Data management** (ingestion owns):
   - Media download
   - RAW message persistence
   - Source management (CRUD)

## Migration Strategies

### Strategy 1: Pure DTO (Recommended for Clean Architecture)

**Goal:** Backend uses ONLY DTOs, no entity imports.

**Steps:**

1. Create `EnqueueMessageDto` in publisher module
2. Update `EnqueueMatchingMessageUseCase` to accept DTO
3. Remove entity construction in scheduler
4. Delete duplicate entities from backend
5. Delete in-memory repos + mappers

**Timeline:** 7-9 hours (per migration plan)

### Strategy 2: Shared Package (Fast, More Coupling)

**Goal:** Extract shared crypto-news domain to separate package.

**Steps:**

1. Create `@alpha-meta-token-scanner/crypto-news-domain` package
2. Move entities there (single source of truth)
3. Both services import from shared package
4. Keep DTOs for HTTP boundary

**Timeline:** 3-4 hours

**Pros:** Fast, preserves entity usage  
**Cons:** Introduces coupling, violates service independence

### Strategy 3: Import from Ingestion (Monorepo Quick Fix)

**Goal:** Backend imports directly from ingestion-service.

**Steps:**

1. Delete duplicate entities from backend
2. Update imports to `@alpha-meta-token-scanner/ingestion-service`
3. Ensure ingestion-service exports entities

**Timeline:** 1-2 hours

**Pros:** Fastest, uses monorepo benefits  
**Cons:** Tight coupling, backend depends on ingestion internals

## Recommended Path Forward

### Immediate (Phase 1 — DONE)

✅ Mark duplicate entities as `@deprecated` with corrected explanation
✅ Create DTOs for HTTP consumption
✅ Document the architectural issue

### Short-term (Next Sprint)

Choose ONE strategy:

**If prioritizing clean architecture:** Execute Strategy 1 (Pure DTO)

- Best long-term maintainability
- Proper bounded context separation
- Higher upfront effort

**If prioritizing speed:** Execute Strategy 3 (Import from Ingestion)

- Removes duplication immediately
- Low effort
- Acceptable coupling in monorepo

### Long-term (Future)

If Strategy 3 chosen initially, migrate to Strategy 1 later when time permits.

## Key Insights

### What We Learned

1. **Backend CAN have crypto-news logic** — publisher/matching/filtering belong there
2. **Backend should NOT duplicate entities** — either import or use DTOs
3. **Data ownership ≠ business logic ownership** — ingestion owns data, backend owns publishing
4. **Monorepo allows imports** — can import from ingestion-service package if desired

### Corrected Mental Model

```
Ingestion-Service = Data Management Service
├── Owns: persistence, media, raw data
├── Exposes: HTTP DTOs
└── Provides: read-only API

Backend = Business Logic Service
├── Owns: filtering, matching, publishing, LLM
├── Consumes: DTOs from ingestion-service
└── Provides: publisher pipeline

Relationship: Backend is a CONSUMER of ingestion, not a COPY of it
```

## Files Updated

### Corrected

1. `/apps/backend/src/telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity.ts`
   - Changed `@deprecated` from "LEGACY" to "DUPLICATE"
   - Clarified that problem is duplication, not existence
   - Explained backend SHOULD have publisher logic

2. `/apps/backend/src/telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo.ts`
   - Same corrections as entity

3. `/.omo/plans/crypto-news-domain-entity-migration.md`
   - Corrected problem statement
   - Updated goals (remove duplication vs. remove all entities)
   - Added Strategy 2 and 3 options

### Created

4. `/.omo/completed/crypto-news-architecture-clarification.md` (this file)

## Related Documents

- `.omo/plans/db-separation.md` — Original split plan
- `.omo/plans/crypto-news-domain-entity-migration.md` — Corrected migration plan
- `.omo/completed/crypto-news-entity-deprecation.md` — Phase 1 completion summary
- `AGENTS.md` (root) — Crypto-news architecture section

## Conclusion

**The Real Issue:** Backend has DUPLICATE entities, not that it has entities at all.

**The Solution:** Either use DTOs (clean) OR import from ingestion-service (fast).

**Current Status:** Entities marked as `@deprecated` with correct explanation. Migration strategy TBD based on team priorities (clean architecture vs. speed).

**Backend Publisher Logic:** ✅ CORRECT and should stay in backend.
