# Draft: fix-lint-errors

## Intent
CLEAR — corregir errores de build, lint y tests en apps/backend/src y apps/frontend/src.

## Exploration evidence
See previous version. Key: only backend lint has issues (1 error + 149 warnings). Builds and tests all pass.

## User decisions

| Fork | Decision |
|---|---|
| **Scope** | Todo excepto bug-exploration — ~98 problemas en ~23 archivos |
| **Strategy** | Tipar los mocks correctamente (reemplazar `as any` con tipos reales) |
| **Review** | Momus high-accuracy review primero |

## Approach
1. Fix 1 ERROR: replace `require()` with ESM `import` in ingestion-coordinator.service.spec.ts
2. Fix PROD warnings (6 files): add proper types
3. Fix TEST warnings (16 non-bug-exploration files): replace `as any` with real types in mocks
4. Bug-exploration files: EXCLUDED
5. Verify: lint passes with 0 errors, all tests still pass

## Components (topology lock)
- C1: ERROR (1 file) — ingestion-coordinator.service.spec.ts
- C2: PROD warnings (6 files) — kol-metrics-calculator, kol-reputation-aggregator, redis.service, migration, in-memory-published-call.repository, achievement.module
- C3: TEST warnings (16 files) — various spec files across telegram/, token/
- C4: Bug-exploration (5 files) — EXCLUDED

Status: **awaiting-approval** → user approved scope. Now writing plan.
