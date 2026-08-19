---
slug: template-divergence-signal
status: awaiting-approval
intent: clear
approach: Add a new `template_divergence_penalty` scoring signal that fires when semantic cosine similarity is high (same announcement template) but number-Jaccard is low (numbers changed indicating an update). Penalty pushes score from ~0.92 (end-of-gray-zone) down into the gray zone (~0.77), routing the pair to the LLM arbiter for correct classification.
---

# Draft: template-divergence-signal

## Components (topology ledger)

<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

| id  | outcome                                                                                                                         | status | evidence                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| T1  | ScoreConfig: add `templateDivergenceSemanticThreshold`, `templateDivergenceNumberJaccardThreshold`, `templateDivergencePenalty` | active | `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:31-43`        |
| T2  | DEFAULT_CONFIG: add defaults (0.90, 0.40, 0.15)                                                                                 | active | `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:57-69`        |
| T3  | computeScore(): add `template_divergence_penalty` signal between cashtag_penalty and url_boost                                  | active | `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.ts:202-289`      |
| T4  | dedup-scorer.service.spec.ts: add `template_divergence_penalty` to signal-name test + new template-divergence test cases        | active | `apps/backend/src/shared/deduplication/domain/services/dedup-scorer.service.spec.ts:183-198` |

## Open assumptions (announced defaults)

<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

| assumption                    | adopted default                                                                                                                                                                 | rationale                                                                                                                                                                                                       | reversible?                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Penalty value 0.15            | With msg9566 vs msg108 numbers: numberJaccard≈0.15, semantic≈0.96 → penalty 0.15 pushes score from ~0.92 to ~0.77 (gray zone). LLM arbiter then correctly classifies as UPDATE. | Root cause analysis: the current score without penalty lands at ~0.92, just inside gray zone but borderline. The penalty reliably moves it into the middle of gray zone where arbiter activation is guaranteed. | YES - config field, tuneable in DEFAULT_CONFIG or via Partial<ScoreConfig> |
| Semantic threshold 0.90       | Only trigger when the message templates are structurally very similar (semantic >> everything).                                                                                 | If semantic < 0.90 the messages are different enough that the existing signals already handle them correctly.                                                                                                   | YES - config field                                                         |
| Number Jaccard threshold 0.40 | If more than 40% of numbers overlap, it's likely the same call (not an update with different values).                                                                           | Numbers are the primary signal for "this is an update, not a repost": different entry price, MC, etc. Low overlap means numbers changed.                                                                        | YES - config field                                                         |

## Findings (cited - path:lines)

1. **Current bug (msg108 vs msg9566)**: DB query and signal analysis showed msg108 was incorrectly blocked as semantic duplicate (zone: duplicate/gray-zone) when it was an actual UPDATE. From `dedup-scorer.service.ts:211-227`: semantic=0.96 (near duplicate threshold), numberJaccard≈0.15 (only 28/1/7 matched from ~20 unique numbers), but current number_penalty only applies medium (0.15) or low (0.05) based on numberJaccard band, which is insufficient to offset the high semantic score. Score calc at L267-274: `score = semantic + jaccardContribution + urlBoost + proximityBoost - numberPenalty - entityPenalty - cashtagPenalty` → ~0.92.

2. **Empty array handling**: `numberJaccardSimilarity(L108-115)` returns 1 when both arrays are empty. This means the new signal correctly won't fire when no numbers exist at all — the condition `numberJaccard < cfg.templateDivergenceNumberJaccardThreshold` (0.40) would be false since numberJaccard = 1. The signal only fires when there ARE numbers and they diverge.

3. **Signal ordering**: Existing signals in `computeScore()` at L210-264: semantic, jaccard, number_penalty, entity_penalty, cashtag_penalty, url_boost, proximity_boost. New signal goes between cashtag_penalty and url_boost (L253-254 insertion point). Score computation at L267-274 must include `- templateDivergencePenalty`.

4. **Test pattern for signal names**: `dedup-scorer.service.spec.ts:183-198` uses `expect(signalNames).toContain('...')` for each signal. Must add `template_divergence_penalty`.

## Decisions (with rationale)

| decision                                                                                                                                     | rationale                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Signal name: `template_divergence_penalty` (kebab-case, matches existing conventions: `number_penalty`, `entity_penalty`, `cashtag_penalty`) | Consistent with existing signal naming pattern                                            |
| Penalty is configurable via ScoreConfig (not hardcoded)                                                                                      | Follows existing pattern — every signal has config fields in ScoreConfig + DEFAULT_CONFIG |
| Penalty applied as negative contribution (like other penalties)                                                                              | Consistent with `-numberPenalty`, `-entityPenalty`, `-cashtagPenalty` at L272-274         |
| Test coverage: verify signal appears in output, verify it fires only when both conditions met, verify it doesn't fire when missing numbers   | Follows existing test pattern for number/entity/cashtag penalties                         |

## Scope IN

- ScoreConfig: add `templateDivergenceSemanticThreshold: number`, `templateDivergenceNumberJaccardThreshold: number`, `templateDivergencePenalty: number`
- DEFAULT_CONFIG: defaults 0.90, 0.40, 0.15
- computeScore(): add template_divergence_penalty signal with condition `semantic > threshold && numberJaccard < threshold`
- Score computation: include `- templateDivergencePenalty` in the score formula
- Tests: update signal-name assertion, add template-divergence-specific test cases
- `DedupScorer` class: no changes needed (delegates to computeScore which already handles config)

## Scope OUT (Must NOT have)

- No changes to `ScoreInput` (all needed fields already available: `embeddingM`/`embeddingE` for semantic, `numbersM`/`numbersE` for numberJaccard)
- No changes to `DeduplicationService` or any other file outside `dedup-scorer.service.ts` / `dedup-scorer.service.spec.ts`
- No changes to LLM arbiter, store, or pipeline wiring
- No new env vars, no NestJS module changes
- No changes to the zone thresholds (0.75/0.95 remain)
- No changes to `DedupScorer` static class (it delegates to computeScore)

## Open questions

None — all decisions are internal implementation details with configurable defaults.

## Approval gate

status: awaiting-approval
