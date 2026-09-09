# Crypto-News Entity Cleanup — Spec

**Spec ID:** `crypto-news-entity-cleanup`  
**Created:** 2026-09-08  
**Status:** IN PROGRESS (Phase 1 complete)

---

## Quick Navigation

- 📋 **[Requirements](./requirements.md)** — What we're solving and why
- 🏗️ **[Design](./design.md)** — 3 architectural strategies with comparison
- ✅ **[Tasks](./tasks.md)** — Detailed implementation phases
- 📊 **[Metadata](./tasks.meta.json)** — Spec metadata & tracking

---

## At a Glance

### The Problem

Backend maintains **duplicate domain entities** of crypto-news data owned by ingestion-service:

```
❌ DUPLICATE:
   apps/ingestion-service/.../crypto-news-message.entity.ts  ← Source
   apps/backend/.../crypto-news-message.entity.ts  ← Copy (deprecated)
```

**Why bad:**

- Violates DRY (must sync changes manually)
- Risk of divergence (copies drift over time)
- Unclear ownership (which is authoritative?)

### The Solution

**3 strategies** to remove duplication:

| Strategy                | Effort  | Risk       | When to Use                   |
| ----------------------- | ------- | ---------- | ----------------------------- |
| **1. Pure DTO** ✅      | 7-9 hrs | Medium     | Clean architecture, long-term |
| **2. Shared Package**   | 3-4 hrs | Low-Medium | ❌ Not recommended            |
| **3. Direct Import** ⚡ | 1-2 hrs | Low        | Quick fix, can migrate later  |

**Recommended:** Strategy 1 (clean) OR Strategy 3 (fast).

---

## Current Status

### Phase 1: ✅ COMPLETE (2026-09-08)

- ✅ Entities marked `@deprecated` with clear warnings
- ✅ DTOs created for HTTP consumption
- ✅ Path alias import issues fixed
- ✅ Backend compiles and runs successfully

**Evidence:** `.omo/completed/crypto-news-entity-deprecation.md`

### Next Steps

**Choose strategy:**

**Option A: Clean Architecture (Strategy 1)**

- Execute phases 2-9 (see [tasks.md](./tasks.md))
- Estimated 7-9 hours
- Best for long-term maintainability

**Option B: Quick Fix (Strategy 3)**

- Execute 4 simple phases
- Estimated 1-2 hours
- Can migrate to Strategy 1 later

**Option C: Defer**

- Current state is stable (non-blocking)
- Deprecation warnings guide future work
- Execute when time permits

---

## Key Documents

### From This Spec

1. **[requirements.md](./requirements.md)** — Formal requirements
   - Problem statement
   - Acceptance criteria
   - Success metrics

2. **[design.md](./design.md)** — Architecture analysis
   - 3 strategies with detailed comparison
   - File structure diagrams
   - Data flow before/after

3. **[tasks.md](./tasks.md)** — Implementation guide
   - Phase-by-phase instructions
   - Code examples
   - Verification steps

4. **[tasks.meta.json](./tasks.meta.json)** — Tracking metadata
   - Phase status
   - Effort estimates
   - Risk assessment

### Related Work (Analysis & Plans)

5. **`.omo/completed/crypto-news-entity-deprecation.md`** — Phase 1 summary
6. **`.omo/plans/crypto-news-domain-entity-migration.md`** — Original migration plan
7. **`.omo/completed/crypto-news-architecture-clarification.md`** — Corrected mental model
8. **`.omo/analysis/ingestion-service-scope-audit.md`** — Scope verification
9. **`.omo/completed/CRYPTO-NEWS-ENTITY-WORK-SUMMARY.md`** — Session summary

---

## Decision Tree

```
Start: Need to remove duplicate entities?
  │
  ├─ Have 7-9 hours available?
  │  YES → Strategy 1 (Pure DTO)
  │  └─ Execute phases 2-9 in tasks.md
  │
  ├─ Have 1-2 hours available?
  │  YES → Strategy 3 (Direct Import)
  │  └─ Execute 4 phases in tasks.md (Path B)
  │
  └─ No time now?
     YES → Defer (system is stable)
     └─ Schedule for future sprint
```

---

## Quick Reference

### What Backend SHOULD Have ✅

- Publisher logic (enqueue, LLM, Bot API)
- Matching logic (keywords, filters)
- Business rules (blacklist, queue)

### What Backend Should NOT Have ❌

- Duplicate domain entities
- TypeORM mappers for non-existent tables
- In-memory repos as DI shims

### Architecture Verification

**✅ Ingestion-service is CORRECT:**

- Text extraction (technical parsing)
- Media download (MTProto I/O)
- RAW data persistence

**✅ Backend is CORRECT:**

- Content filtering (ContentFilterService)
- Keyword matching
- LLM transformation
- Bot API publishing

**❌ Problem:** Backend has DUPLICATE entities (not misplaced logic)

---

## Success Criteria

### Must Have

1. ✅ Backend has ZERO duplicate crypto-news entities
2. ✅ All tests pass (2784 total)
3. ✅ `npm run build` succeeds
4. ✅ Backend boots on port 3030
5. ✅ Enqueue flow works
6. ✅ Publish flow works
7. ✅ No regressions

### Should Have

8. ✅ Documentation updated
9. ✅ Type safety preserved
10. ✅ IDE autocomplete works

---

## Rollback Plan

### If Issues Arise

```bash
# Revert PR
git revert <merge-commit-sha>

# Rebuild
npm run build && npm test

# Verify
npm run start:dev
```

### Per-Phase Rollback

See [tasks.md](./tasks.md) for phase-specific rollback procedures.

---

## FAQ

### Q: Why is this needed?

**A:** Duplicate entities violate DRY and create maintenance burden. Changes must be synced manually across files, and copies can diverge over time.

### Q: Can't we just keep both?

**A:** We could, but it's technical debt. Current state is stable (marked deprecated), but long-term it's better to fix.

### Q: Which strategy should we choose?

**A:**

- **Strategy 1** if planning long-term architecture
- **Strategy 3** if need quick fix (can migrate later)
- **NOT Strategy 2** (couples services)

### Q: What if tests fail?

**A:** Stop, investigate root cause, fix before proceeding. Never skip failing tests.

### Q: Can we do this incrementally?

**A:** Yes! Strategy 1 is designed for 2-3 PRs over multiple sprints.

### Q: What if backend starts failing?

**A:** Rollback immediately (see Rollback Plan), then investigate offline.

---

## Contact & Approval

**Spec Author:** Kiro AI  
**Technical Reviewer:** [Pending]  
**Approval Status:** [Pending]  
**Questions:** Refer to this README or related docs

---

## Revision History

| Version | Date       | Author  | Changes                                      |
| ------- | ---------- | ------- | -------------------------------------------- |
| 1.0     | 2026-09-08 | Kiro AI | Initial spec (requirements + design + tasks) |

---

**End of Spec README** — See individual documents for detailed information.
