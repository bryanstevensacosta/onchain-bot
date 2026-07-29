# template-divergence-signal - Work Plan

## TL;DR (For humans)

**What you'll get:** A fix for the dedup system that wrongly blocks "update" messages as duplicates. Messages with the same template structure (e.g., "BUY $TICKER — CA: ...") but completely different numbers (price, market cap, etc.) will now be recognized as updates and sent to the LLM arbiter for correct classification — not silently blocked.

**Why this approach:** The current scoring only applies a small penalty when numbers differ (max -0.15). But when the announcement template is highly similar (semantic ~0.96), that penalty isn't enough — the score stays in the ~0.92 range (borderline gray zone). The new `template_divergence` signal detects the pattern "high template similarity + low number overlap" and applies a dedicated penalty of -0.15, reliably pushing the score to ~0.77 (into the gray zone) where the LLM arbiter examines the text and lets the update through.

**What it will NOT do:** Change ScoreInput, modify the LLM arbiter, alter zone thresholds, touch any pipeline wiring, or add new env vars.

**Effort:** Standard (2 files, ~40 lines total)
**Risk:** Low - configurable defaults, reversible, test-covered
**Decisions to sanity-check:** The three new config defaults (semantic threshold 0.90, number Jaccard threshold 0.40, penalty 0.15) are all tuneable via `Partial<ScoreConfig>` at call sites.

Your next move: **Approve** this plan, then use `$start-work` to execute.

---

> TL;DR (machine): Standard effort, Low risk — 3 config fields on ScoreConfig + computeScore logic + test updates. 2 files touched.

## Scope

### Must have

- ScoreConfig: add `templateDivergenceSemanticThreshold`, `templateDivergenceNumberJaccardThreshold`, `templateDivergencePenalty`
- DEFAULT_CONFIG: set defaults (0.90, 0.40, 0.15)
- computeScore(): add template divergence check between cashtag_penalty and url_boost signals
  - Condition: `semantic > cfg.templateDivergenceSemanticThreshold AND numberJaccard < cfg.templateDivergenceNumberJaccardThreshold`
  - Signal contribution: `-cfg.templateDivergencePenalty`
  - When condition NOT met: contribution = 0
- Score formula: include `templateDivergencePenalty` in the subtraction at score computation
- Spec: add `template_divergence_penalty` to the "should include all signal names" assertion
- Spec: new test block "template divergence penalty" with:
  - "applies penalty when semantic high AND numberJaccard low" (the msg108 scenario)
  - "does NOT apply penalty when numberJaccard is high" (same numbers = no divergence)
  - "does NOT apply penalty when semantic is low" (different template)
  - "does NOT apply penalty when both arrays empty" (no numbers to compare)

### Must NOT have (guardrails, anti-slop, scope boundaries)

- Do NOT change `ScoreInput` interface
- Do NOT change `ScoreOutput` interface
- Do NOT change zone thresholds (0.75 / 0.95)
- Do NOT change `DedupScorer` static class
- Do NOT modify any file outside `dedup-scorer.service.ts` and `dedup-scorer.service.spec.ts`
- Do NOT add NestJS decorators, env vars, or module wiring

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: TDD — write tests first, then implement
- Framework: Jest (co-located `*.spec.ts`)
- Evidence: `.omo/evidence/task-template-divergence-signal.txt`

```bash
# Run the specific test file to verify
cd apps/backend && npx jest --no-coverage src/shared/deduplication/domain/services/dedup-scorer.service.spec.ts 2>&1
```

## Execution strategy

### Parallel execution waves

> Single wave — all edits are in 2 files with no dependency between them (but tests must pass after implementation).

Wave 1: Add config fields + computeScore logic + tests (all in one sequential batch since test assertions reference the new signal).

### Dependency matrix

| Todo                      | Depends on | Blocks | Can parallelize with |
| ------------------------- | ---------- | ------ | -------------------- |
| 1. Config + logic + tests | —          | —      | —                    |

## Todos

- [ ] 1. Add `template_divergence_penalty` signal to dedup-scorer (config + logic + tests)
     What to do / Must NOT do:
  1. **ScoreConfig** — add three number fields after `cashtagPenaltyMedium` at L43:
     ```ts
     templateDivergenceSemanticThreshold: number; // default 0.90
     templateDivergenceNumberJaccardThreshold: number; // default 0.40
     templateDivergencePenalty: number; // default 0.15
     ```
  1. **DEFAULT_CONFIG** — add defaults at L68 (after cashtagPenaltyMedium):
     ```ts
     templateDivergenceSemanticThreshold: 0.90,
     templateDivergenceNumberJaccardThreshold: 0.40,
     templateDivergencePenalty: 0.15,
     ```
  1. **computeScore()** — add template divergence signal between L253 (cashtag_penalty push) and L255 (url boost). Logic:
     ```ts
     // Template divergence penalty: high semantic + low number similarity = likely an update
     const templateDivergencePenalty =
       semantic > cfg.templateDivergenceSemanticThreshold &&
       numberJaccard < cfg.templateDivergenceNumberJaccardThreshold
         ? cfg.templateDivergencePenalty
         : 0;
     signals.push({
       name: 'template_divergence_penalty',
       contribution: -templateDivergencePenalty,
     });
     ```
  1. **Score formula** at L267-274: add `- templateDivergencePenalty` alongside the existing penalties:
     ```ts
     let score =
       semantic +
       jaccardContribution +
       urlBoost +
       proximityBoost -
       numberPenalty -
       entityPenalty -
       cashtagPenalty -
       templateDivergencePenalty;
     ```
  1. **Spec** at L191: add `expect(signalNames).toContain('template_divergence_penalty');`
  1. **Spec**: add new describe block "template divergence penalty" after cashtag tests with 4 test cases:
     - High semantic + low numberJaccard → penalty applied
     - High semantic + high numberJaccard → no penalty
     - Low semantic + low numberJaccard → no penalty
     - Empty numbers → no penalty (numberJaccard=1)
       Must NOT do: Do not change ScoreInput, ScoreOutput, zone thresholds, or DedupScorer class.

  Parallelization: Wave 1 | Blocked by: — | Blocks: —
  References (executor has NO interview context - be exhaustive):
  - `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:31-43` (ScoreConfig interface — add 3 fields after line 42)
  - `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:57-69` (DEFAULT_CONFIG — add defaults after line 68)
  - `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:202-289` (computeScore function — insert signal after line 253, update score formula at line 267-274)
  - `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.spec.ts:183-198` ("should include all signal names" — add assertion)
  - `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.spec.ts:137-158` (cashtag tests — add new describe block after this)
  - `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.spec.ts:19-34` (makeEmptyInput helper — used in tests)
    Acceptance criteria (agent-executable):

  ```bash
  cd apps/backend && npx jest --no-coverage src/shared/deduplication/domain/services/dedup-scorer.service.spec.ts 2>&1
  ```

  All 4 new tests pass, existing tests still pass, no TypeScript errors.
  QA scenarios (name the exact tool + invocation):
  - Happy path: `npx jest src/shared/deduplication/domain/services/dedup-scorer.service.spec.ts` — all 4 new tests green
  - Failure: verify template_divergence_penalty is explicitly 0 when conditions not met (assert contribution toBe(0))
  - Edge: empty number arrays → no penalty (numberJaccard=1, condition false)
    Evidence: `.omo/evidence/task-template-divergence-signal.txt`
    Commit: Y | `feat(dedup): add template_divergence_penalty signal for update detection`

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — verify all todos completed, no scope creep
- [ ] F2. Code quality review — check signal naming consistency (kebab_case), config defaults documented, edge cases covered
- [ ] F3. Real manual QA — run full test suite: `cd apps/backend && npx jest 2>&1`
- [ ] F4. Scope fidelity — confirm no files outside dedup-scorer.service.ts/spec.ts were modified

## Commit strategy

Single commit: `feat(dedup): add template_divergence_penalty signal for update detection`

## Success criteria

- [ ] All tests pass (both new and existing)
- [ ] No TypeScript compilation errors
- [ ] For scenario msg108 vs msg9566: semantic=0.96, numberJaccard≈0.15 → score ≈ 0.77 (in gray zone → LLM arbiter decides)
- [ ] For scenario with identical numbers: no penalty applied (score unchanged)
- [ ] For scenario with different templates: no penalty applied (score unchanged)
- [ ] No files outside `dedup-scorer.service.ts` and `dedup-scorer.service.spec.ts` were modified
