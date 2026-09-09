# Requirements Document

## Introduction

Post db-separation (2026-09-08), the backend maintains **duplicate domain entities** of crypto-news data that is owned by ingestion-service. Backend has copies of `CryptoNewsMessage`, `CryptoNewsSource`, and `CryptoNewsMessageMedia` entities that duplicate the source of truth in ingestion-service.

This technical debt creates maintenance burden, violates DRY principles, and risks divergence over time. The goal is to remove duplication by migrating to one of three strategies: (A) pure DTOs, (B) shared package, or (C) direct imports from ingestion-service.

**Context:**

- Backend compiles and runs correctly
- Entities already marked `@deprecated` with warnings
- DTOs created for HTTP consumption
- Architecture boundaries verified (no misplaced business logic)
- Problem is duplicate entities, not incorrect responsibility boundaries

## Glossary

- **Backend**: NestJS service at `apps/backend` (:3030) — owns publisher/matching/filtering business logic
- **Ingestion-Service**: NestJS service at `apps/ingestion-service` (:3031) — owns MTProto ingestion and RAW data persistence
- **Domain Entity**: Rich domain object with behavior and invariants (DDD pattern)
- **DTO**: Data Transfer Object — plain data structure for cross-boundary communication
- **Source of Truth**: The single authoritative definition of a concept
- **DRY**: Don't Repeat Yourself — principle to avoid code duplication
- **TypeORM Entity**: Class decorated with `@Entity()` for database mapping
- **In-Memory Repository**: Mock repository implementation used for testing or DI shim
- **Monorepo**: Single repository containing multiple applications/packages
- **Crypto-News Pipeline**: Flow where ingestion-service captures messages → backend filters/matches → publisher sends to Telegram

---

## Requirements

### Functional Requirements

**FR1: Single Source of Truth**  
Crypto-news domain entities MUST have exactly one definition in the codebase.

**FR2: No Breaking Changes**  
Existing publisher/matching/filtering flows MUST continue to work without modification.

**FR3: Type Safety**  
Backend MUST maintain compile-time type safety for crypto-news data structures.

**FR4: Test Coverage**  
All unit and integration tests MUST pass after migration.

**FR5: Documentation**  
Architecture decision MUST be documented in AGENTS.md files.

### Non-Functional Requirements

**NFR1: Maintainability**  
Changes to crypto-news entities MUST NOT require manual syncing across files.

**NFR2: Build Performance**  
Migration MUST NOT significantly impact build times.

**NFR3: Developer Experience**  
IDE autocomplete and type checking MUST work correctly.

**NFR4: Monorepo Leverage**  
Solution SHOULD leverage monorepo capabilities (cross-package imports).

---

## Constraints

### Technical Constraints

**TC1: Monorepo Structure**  
Both services are workspaces in the same repository.

**TC2: TypeScript 5.7+**  
Must work with TypeScript path aliases and project references.

**TC3: NestJS 11**  
Must be compatible with NestJS module/DI system.

**TC4: Existing Tests**  
815 ingestion tests + 1969 backend tests must continue passing.

### Business Constraints

**BC1: No Downtime**  
Migration must be possible without service interruption.

**BC2: Incremental Rollout**  
Must support gradual migration (not big-bang).

**BC3: Rollback Safety**  
Must be able to revert changes if issues arise.

---

## Acceptance Criteria

### Must Have

1. ✅ Backend has ZERO duplicate crypto-news entities
2. ✅ All tests pass (unit + integration + e2e)
3. ✅ `npm run build` succeeds with no TypeScript errors
4. ✅ Backend boots successfully (port 3030)
5. ✅ Enqueue flow works (messages appear in queue)
6. ✅ Publish flow works (queue drains to Telegram)
7. ✅ No regressions in crypto-news pipeline

### Should Have

8. ✅ Documentation updated (AGENTS.md reflects architecture)
9. ✅ Type safety preserved (compile-time checks work)
10. ✅ IDE autocomplete works for crypto-news types

### Nice to Have

11. 🎯 Build time improvements
12. 🎯 Reduced LOC (less code to maintain)
13. 🎯 Clearer boundaries (ingestion vs backend)

---

## Success Metrics

### Quantitative

- **Zero duplicate entities** — grep returns 0 matches
- **Zero TypeScript errors** — `tsc --noEmit` passes
- **100% test pass rate** — all 2784 tests green
- **Zero runtime errors** — backend starts without crashes

### Qualitative

- **Clearer mental model** — developers understand entity ownership
- **Easier maintenance** — entity changes in one place only
- **Better onboarding** — new developers see clean architecture

---

## Out of Scope

### Explicitly NOT Included

1. ❌ Changing ingestion-service architecture
2. ❌ Modifying HTTP API contracts (DTOs are stable)
3. ❌ Altering publisher queue behavior
4. ❌ Migrating KOL entities (separate concern)
5. ❌ Fixing unrelated gaps (health stubs, metrics, etc.)
6. ❌ Performance optimization
7. ❌ Adding new features

### Future Work (Deferred)

1. 🔮 Extract shared domain to separate package (if Strategy 2 chosen)
2. 🔮 Migrate KOL entities similarly
3. 🔮 Consolidate all TypeORM repos
4. 🔮 Remove legacy seeders completely

---

## Assumptions

### Technical Assumptions

**A1:** Monorepo allows cross-package imports  
**Validation:** ✅ Verified — workspaces can import from each other

**A2:** TypeScript path aliases work at runtime  
**Validation:** ⚠️ Partially — compile time yes, runtime needs build config

**A3:** NestJS DI supports cross-package dependencies  
**Validation:** ✅ Verified — modules can import from other workspaces

**A4:** Existing tests are comprehensive  
**Validation:** ✅ 815 ingestion + 1969 backend tests cover major flows

### Business Assumptions

**B1:** No urgent features block this work  
**Impact:** Can schedule migration over 1-3 sprints

**B2:** Team has capacity for 1-9 hours of work  
**Impact:** Choose strategy based on available time

**B3:** Stable architecture desired  
**Impact:** Worth investing time to fix duplication

---

## Dependencies

### Internal Dependencies

**D1:** `.omo/completed/crypto-news-entity-deprecation.md`  
Phase 1 complete — entities marked deprecated

**D2:** `.omo/plans/crypto-news-domain-entity-migration.md`  
Migration plan with 3 strategies documented

**D3:** `.omo/analysis/ingestion-service-scope-audit.md`  
Verified no misplaced business logic

**D4:** `apps/backend/src/telegram/crypto-news-integration/domain/dtos/crypto-news-message.dto.ts`  
DTOs already created for HTTP consumption

### External Dependencies

**None** — Self-contained within monorepo

---

## Risks and Mitigations

### Risk 1: Breaking Enqueue Flow

**Probability:** Medium  
**Impact:** High (publisher stops working)

**Mitigation:**

- Extensive unit tests on Phase 3 (use case refactor)
- Integration tests on enqueue→publish flow
- Staging deployment before production

### Risk 2: TypeScript Type Errors

**Probability:** Low  
**Impact:** Medium (compilation fails)

**Mitigation:**

- Run `tsc --noEmit` after each phase
- Fix errors before proceeding
- Keep entity interfaces stable

### Risk 3: DI Graph Breaks

**Probability:** Medium (Phase 5)  
**Impact:** High (app won't boot)

**Mitigation:**

- Check all `@Inject()` sites before removing repos
- Test backend boot after Phase 5
- Keep in-memory repos if still needed

### Risk 4: Runtime Module Resolution

**Probability:** Low (if using Strategy 3)  
**Impact:** Medium (runtime errors)

**Mitigation:**

- Test with `npm run start:prod` (not just dev)
- Verify imports resolve in compiled JS
- Document any needed build config

### Risk 5: Team Confusion

**Probability:** Low  
**Impact:** Low (questions arise)

**Mitigation:**

- Document strategy choice in AGENTS.md
- Explain rationale in PR descriptions
- Point to this spec for context

---

## Rollback Plan

### Per-Phase Rollback

**Phase 1 (Deprecation):**  
Revert: Remove `@deprecated` markers (no functional change)

**Phase 2-4 (DTO Migration):**  
Revert: Restore entity imports, remove publisher DTOs

**Phase 5 (Repo Removal):**  
Revert: Restore in-memory repos, re-add providers

**Phase 6-7 (Cleanup):**  
Revert: Restore deleted files from git history

### Full Rollback

If entire migration needs reverting:

```bash
git revert <merge-commit-sha>
npm run build && npm test
# Verify backend boots
npm run start:dev
```

---

## Compliance and Security

### Data Privacy

**No impact** — No changes to data storage or access patterns

### Security

**No impact** — No changes to authentication or authorization

### Licensing

**No impact** — All code is internal (UNLICENSED)

---

## Related Documents

1. `.omo/completed/crypto-news-entity-deprecation.md` — Phase 1 work
2. `.omo/plans/crypto-news-domain-entity-migration.md` — Detailed migration plan
3. `.omo/completed/crypto-news-architecture-clarification.md` — Corrected mental model
4. `.omo/analysis/ingestion-service-scope-audit.md` — Scope verification
5. `.omo/completed/CRYPTO-NEWS-ENTITY-WORK-SUMMARY.md` — Session summary

---

## Approval

**Requirements Author:** Kiro AI  
**Technical Reviewer:** [Pending]  
**Product Owner:** [Pending]  
**Approval Date:** [Pending]

---

## Revision History

| Version | Date       | Author  | Changes              |
| ------- | ---------- | ------- | -------------------- |
| 1.0     | 2026-09-08 | Kiro AI | Initial requirements |

---

## Appendix A: Strategy Comparison

See `design.md` for detailed strategy comparison (Pure DTO vs Shared Package vs Direct Import).

## Appendix B: Verification Checklist

See `tasks.md` for phase-by-phase verification steps.
