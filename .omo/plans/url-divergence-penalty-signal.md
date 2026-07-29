# url-divergence-penalty-signal - Work Plan

## TL;DR (For humans)

**What you'll get:** Una señal anti-falso-positivo que detecta cuando un mensaje es una actualización parcial (mismo template, misma fuente, misma entidad, algunos números actualizados, URL diferente) y lo reclasifica de "duplicado" a "revisión gris" donde el LLM decide correctamente.

**Why this approach:** La señal usa datos ya existentes en `ScoreInput` (semantic, urlOverlapCount, entityJaccard, numberJaccard) — sin cambios estructurales, sin nuevas dependencias, sin IO. Es el mismo patrón que `template_divergence_penalty` pero cubre el gap de "partial update" que esa señal no alcanza.

**What it will NOT do:** No cambia `ScoreInput`, no añade IO, no toca el pipeline de dedup service/handler, no modifica thresholds existentes ni afecta true duplicates. Solo añade un signal más en `computeScore()`.

**Effort:** Short — ~50 líneas nuevas + ~120 líneas de tests
**Risk:** Low — código puramente funcional, sin IO, con tests que verifican cada escenario

---

> TL;DR (machine): Short | Low | Añade `url_divergence_penalty` signal a `computeScore()` + ScoreConfig + tests, sin cambios a ScoreInput/IO.

## Scope

### Must have

- Nuevos fields en `ScoreConfig`: `urlDivergenceSemanticThreshold`, `urlDivergenceEntityJaccardThreshold`, `urlDivergenceNumberJaccardMin`, `urlDivergenceNumberJaccardMax`, `urlDivergencePenalty`
- Nueva señal `url_divergence_penalty` en `computeScore()`
- Tests: 7 casos (fuego msg111, no fuego url overlap, no fuego semantic bajo, no fuego entity bajo, no fuego numberJaccard muy bajo, no fuego numberJaccard muy alto, integración score baja de duplicate a gray_zone)
- Cobertura del threshold-tuner.mjs

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO cambios a `ScoreInput` o `DedupResult` interfaces
- NO cambios a `checkUrl`, `checkSemantic`, o `checkExact` en `DedupService`
- NO cambios al handler de crypto-news publisher
- NO tocar `dedup_fingerprints` DB schema
- NO añadir nuevas dependencias npm

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: TDD + Jest (existing pattern, co-located spec)
- Evidence: .omo/evidence/task-1-url-divergence-penalty-signal.txt

## Execution strategy

### Parallel execution waves

Wave 1: un solo todo (implementación + tests en el mismo archivo)

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| ---- | ---------- | ------ | -------------------- |
| 1    | —          | —      | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Add `url_divergence_penalty` signal to ScoreConfig + computeScore + tests + threshold-tuner
     What to do / Must NOT do:
  - Añadir 5 nuevos fields a `ScoreConfig` (ver referencias abajo)
  - Añadir defaults en `DEFAULT_CONFIG`:
    - `urlDivergenceSemanticThreshold: 0.9`
    - `urlDivergenceEntityJaccardThreshold: 0.5`
    - `urlDivergenceNumberJaccardMin: 0.3`
    - `urlDivergenceNumberJaccardMax: 0.9`
    - `urlDivergencePenalty: 0.12`
  - Añadir la señal en `computeScore()` DESPUÉS de `template_divergence_penalty` y la sección URL boost, usando la condición:
    ```
    semantic > cfg.urlDivergenceSemanticThreshold &&
    input.urlOverlapCount === 0 &&
    entityJaccard > cfg.urlDivergenceEntityJaccardThreshold &&
    numberJaccard > cfg.urlDivergenceNumberJaccardMin &&
    numberJaccard < cfg.urlDivergenceNumberJaccardMax
    ```
  - Incluir `- urlDivergencePenalty` en la fórmula del score final
  - NO cambiar `ScoreInput` ni ninguna otra interface
  - NO cambiar la fórmula de otros signals existentes
  - Tests: 7 casos (usar `makeEmptyInput()` pattern existente):
    1. **Fuego msg111 pattern**: semantic=~0.99, urlOverlapCount=0, entityJaccard=1.0, numberJaccard=0.6 → penalty = -0.12
    2. **No fuego cuando urlOverlapCount > 0**: mismas condiciones pero urlOverlapCount=1 → penalty ≈ 0
    3. **No fuego cuando semantic baja**: semantic≈0, demás condiciones iguales → penalty ≈ 0
    4. **No fuego cuando entityJaccard baja**: entityJaccard≈0, demás ok → penalty ≈ 0
    5. **No fuego cuando numberJaccard muy baja** (<0.3): es caso de template_divergence_penalty, no url → penalty ≈ 0
    6. **No fuego cuando numberJaccard muy alta** (>0.9): true duplicate → penalty ≈ 0
    7. **Integración**: con msg111 input, score baja de >0.95 a <0.95 (gray zone)
  - Actualizar `threshold-tuner.mjs`: inline `computeScore` con el nuevo signal

  Parallelization: Wave 1 | Blocked by: — | Blocks: —
  References:
  - `dedup-scorer.service.ts` (completo: lines 1-356)
  - `dedup-scorer.service.spec.ts` lines 19-34 (makeEmptyInput helper), lines 261-340 (template_divergence_penalty tests — pattern a seguir)
  - `threshold-tuner.mjs` lines 64-111 (inlined computeScore)
    Acceptance criteria:
  - `npm run test:backend` (full suite, 1327+ tests) — ALL PASS
  - `npx jest shared/deduplication/domain/services/dedup-scorer` — nuevos tests verdes
    QA scenarios (name the exact tool + invocation):
  - Happy: `npm run test:backend` → all tests pass
  - Failure: cambiar condición a `urlOverlapCount < 0` → test falla
  - Evidence: `.omo/evidence/task-1-url-divergence-penalty-signal.txt`
    Commit: Y | `feat(dedup): add url_divergence_penalty signal for partial-update detection`

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit — verify all Must have implemented, no Must NOT have violated ✅
- [x] F2. Code quality review — pattern consistency with existing signals, naming, threshold values ✅
- [x] F3. Manual QA — `npm run test:backend` 1334 passed ✅
- [x] F4. Scope fidelity — no ScoreInput changes, no IO, no pipeline changes ✅

## Commit strategy

1. feat(dedup): add url_divergence_penalty signal for partial-update detection

## Success criteria

- [ ] Los 7 nuevos tests pasan en `dedup-scorer.service.spec.ts`
- [ ] `threshold-tuner.mjs` tiene el nuevo signal
- [ ] `npm run test:backend` completo (1327+ tests) pasa
- [ ] Ningún archivo fuera de `dedup-scorer.service.ts`, `dedup-scorer.service.spec.ts`, `threshold-tuner.mjs` fue modificado
