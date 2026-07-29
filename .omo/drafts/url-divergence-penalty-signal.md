# Draft: url-divergence-penalty-signal

## Intent

**CLEAR** — añadir una señal `url_divergence_penalty` en `computeScore()` para detectar el patrón "mismo template, misma fuente, URLs diferentes, números parcialmente actualizados" (caso msg 111).

## Exploration findings

### Context

- Msg 111: mismo template ETF update que msg 109, 6/8 números iguales + 2 diferentes + URL de X diferente
- Score actual con `semantic=0.98`, `numberJaccard=0.6`, `urlOverlapCount=0` → score > 0.95 → DUPLICATE (incorrecto)
- `template_divergence_penalty` no ayuda porque `numberJaccard=0.6 > 0.4` threshold

### Codebase map

- `ScoreInput` en `dedup-scorer.service.ts:12` — tiene `urlOverlapCount: number` pero no URLs crudas
- `computeScore()` en `dedup-scorer.service.ts:208` — todos los signals se computan inline
- `DEFAULT_CONFIG` en `dedup-scorer.service.ts:60`
- `checkUrl()` en `dedup.service.ts:150` — extrae URLs, hashea, cuenta overlap exacto
- `checkSemantic()` en `dedup.service.ts:188` — pasa `urlOverlapCount` a `computeScore()`
- `UrlNormalizerService` — extrae URLs + normaliza + hashea
- Tests: `dedup-scorer.service.spec.ts` con helper `makeEmptyInput()`
- `threshold-tuner.mjs` — tiene `computeScore` inlined (mantener sincronizado)

### Key decision

**NO se requieren cambios en `ScoreInput`** — la nueva señal usa datos ya disponibles:

- `semantic` (ya computado)
- `urlOverlapCount` (ya en `ScoreInput`)
- `entityJaccard` (ya computado inline)
- `numberJaccard` (ya computado inline)

Esto hace el cambio mínimo y más seguro.

## Condition for the signal

```
semantic > cfg.urlDivergenceSemanticThreshold (0.9) &&
urlOverlapCount === 0 &&
entityJaccard > cfg.urlDivergenceEntityJaccardThreshold (0.5) &&
numberJaccard > cfg.urlDivergenceNumberJaccardMin (0.3) &&
numberJaccard < cfg.urlDivergenceNumberJaccardMax (0.9)
```

## Protected scenarios

| Scenario                                    | semantic | urlOverlapCount | entityJaccard | numberJaccard | ¿Fuego?                                                     |
| ------------------------------------------- | -------- | --------------- | ------------- | ------------- | ----------------------------------------------------------- |
| **Msg 111** (update parcial)                | >0.9     | 0               | >0.5          | 0.6           | ✅                                                          |
| **True duplicate** (mismo URL)              | >0.9     | **>0**          | >0.5          | >0.9          | ❌ (urlOverlapCount>0)                                      |
| **Msg 108** (números distintos)             | >0.9     | 0               | >0.5          | **<0.3**      | ❌ (numberJaccard muy bajo — lo agarra template_divergence) |
| **Contenido diferente**                     | **<0.9** | 0               | <0.5          | cualquiera    | ❌ (semantic bajo)                                          |
| **Mismo template, distinta fuente**         | >0.9     | 0               | **<0.5**      | media         | ❌ (entityJaccard bajo)                                     |
| **Update completo** (todos números cambian) | >0.9     | 0               | >0.5          | **<0.3**      | ❌ (lo agarra template_divergence)                          |

## Status

`approved` — Momus APPROVED con feedback incorporado (acceptance criteria ahora apunta a full suite, no a spec aislado).

### Momus feedback

- **Observación**: El acceptance criteria original referenciaba `dedup-scorer` pattern, pero el spec file aislado tiene un error de parse pre-existente. Corregido: ahora apunta a `npm run test:backend` (full suite).
- **Veredicto**: APPROVED — sin cambios estructurales requeridos.

## Ledger

- `ScoreConfig` nuevos fields: 5
- `computeScore` nueva condición: ~15 líneas
- Tests nuevos: ~7 casos
- `threshold-tuner.mjs` update: ~10 líneas
