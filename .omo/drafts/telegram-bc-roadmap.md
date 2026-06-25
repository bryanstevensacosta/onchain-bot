---
slug: telegram-bc-roadmap
status: draft-iterative
intent: clear
pending-action: morder el primer mordisco (M1)
approach: 7 mordiscos ordenados por dependencia — cada uno produce valor aislado, se commitea solo, y se actualiza este draft al terminar. La arquitectura de `telegram/` ya está alineada con la visión; la mayor parte del trabajo es completar call-tracking in-flight + score-token bug + milestone-notifications.
---

# Draft: telegram-bc-roadmap

> Living document — se edita a medida que mordemos cada chunk. Estado por mordisco abajo; detalles completos de cada uno en su propio bloque.

## Architectural vision (the "why")

`apps/backend/src/telegram/` contiene todo lo relacionado a Telegram:

```
telegram/
├── shared/                      ← contratos compartidos entre ambos bots
│   ├── domain/                  ← PublishedCall entity, events, ports, value-objects
│   ├── application/ports/       ← repos y publishers abstractos
│   └── infrastructure/messaging/ ← in-process event publishers
├── chain-dexter-bot/            ← bot que detecta CAs en grupos/DM y responde con info
└── vip-calls-channel/           ← bot que publica alpha-calls a un canal de Telegram
```

**Regla de oro**: Ninguno de los dos bots contiene lógica compleja. La lógica vive en:
- `chain/` (detection, explorer, identity) → datos de token/cadena
- `token/` (classification, scoring, honeypot, gates, call-tracking) → pipeline de decisión
- `settings/` → configuración dinámica
- `kol/` → reputación y atribución de fuente

Los bots en `telegram/` son **thin wrappers** que:
1. Detectan eventos de Telegram (mensajes, callbacks, webhooks, polling)
2. Delegan el trabajo pesado a los BCs de dominio vía use cases
3. Formatean la respuesta para Telegram (Markdown escaping, inline keyboards, truncation)

## Current state (audit 2026-06-24)

### `telegram/` — ✅ alineado con la visión

| Directorio | Archivos | Veredicto |
|------------|----------|-----------|
| `shared/` | 12 | ✅ Shared contracts (PublishedCall, events, ports) |
| `chain-dexter-bot/` | 32 | ✅ Thin wrapper — delega a `chain/detection` + `chain/explorer` + `token/*`. 6 commands implementados (`/x /z /c /cc /tb /settings`) |
| `vip-calls-channel/` | 9 | ✅ Thin orchestrator — delega a `token/scoring` + `chain/identity` + `token/milestone`. 2 use cases + bot-api publisher + milestone handler |

Planes de telegram revisados:

| Plan | Estado | Evidencia |
|------|--------|-----------|
| `telegram-reorg.md` | ✅ DONE | Ejecutado como `consolidate-telegram-bc` (commit `0358cc7`) |
| `telegram-bot-api-publishing.md` | ✅ DONE | `BotApiTelegramPublisherAdapter` existe en `vip-calls-channel/infrastructure/senders/` |
| `chain-dexter-bot.md` (99KB) | ✅ DONE | 6 commands + entities + repos + module wired en `app.module.ts` |

### `call-tracking/` — ⚠️ 28 archivos untracked, trabajo in-flight

Tracked (committed):
- `call-tracking.module.ts` — ✅ existe
- `domain/entities/call-evaluation-job.entity.ts`, `domain/value-objects/*`, `domain/ports/*`
- `application/handlers/evaluate-call-performance.use-case.ts`, `enqueue-evaluation-jobs.use-case.ts`, `get-evaluation-job.use-case.ts`, `process-due-evaluation-jobs.use-case.ts`
- `application/ports/call-performance.repository.ts`, `call-evaluation-job.repository.ts`
- `infrastructure/adapters/dexscreener-call-outcome-evaluator.adapter.ts`
- `infrastructure/messaging/token-scored.handler.ts`
- `infrastructure/persistence/typeorm/entities/*` (call-evaluation-job, call-performance)
- `api/http/call-tracking.controller.ts`, `api/input/*`

Untracked (mid-implementation, abandoned):
- `domain/entities/tracked-published-call.entity.ts` (+ spec)
- `domain/types/published-call-tracking-filter.ts`
- `application/handlers/{track,list,get,can-republish,update}-tracked-calls.use-case.ts` (+ specs)
- `application/ports/tracked-published-call.repository.ts`
- `application/mappers/tracked-call.mapper.ts`
- `infrastructure/{default-tracking-filter-seed.service.ts, event-bus/call-published-tracked.handler.ts, persistence/typeorm/{entities,mappers,repositories}/tracked-published-call.*, scheduling/tracking-cron.scheduler.ts}` + specs
- `api/http/tracked-calls.controller.ts` (+ spec, DTOs)

`app.module.ts:20` ya importa `CallTrackingModule` — pero el module probablemente no incluye los nuevos providers untracked.

### `milestone-notifications/` — ❌ Plan escrito, no implementado

Plan completo en `.omo/plans/milestone-notifications.md` (88KB, 1561 líneas, R1-R9 confirmados):
- R1: notificar al vip-calls-channel cuando call hits ≥2x, 3x, 4x... 100x
- R2: thresholds configurables via DB+settings (default `[2..100]`)
- R3: baseline = MC at publish time
- R4: dedup DB + Redis
- R5: TDD
- R6: nuevo BC `token/milestone` como core, feeds vip-calls-channel
- R9: añadir infra DB→Redis

### `score-token` test — ❌ Pre-existing failure

`score-token.use-case.spec.ts > penalizes CRITICAL POSSIBLE_RUG signal heavily` falla con `received: 60, expected: < 60`. Bug en fórmula del reputation multiplier cuando kol es desconocido.

---

## Mordiscos (chunks ordenados por dependencia)

> Cada mordisco = 1 PR atómico. Commit message descriptivo. Status se actualiza in-place.

### M0 — Working tree cleanup [effort: ~30min] — PENDING

**Outcome**: Limpiar `.omo/sessions/`, `.omo/evidence/`, drafts viejos. Decidir qué se commitea a `.gitignore`.

**Tareas**:
- Auditar 33 untracked en `.omo/`
- Mover `.omo/run-continuation/` a `.gitignore` (es output de runtime, no source)
- Confirmar que `.omo/drafts/` y `.omo/plans/` son docs (decidir: tracked vs gitignored)
- Limpiar archivos viejos de evidencia

**Commit**: `chore: gitignore omo runtime artifacts`

---

### M1 — Finish `call-tracking/` (28 untracked files) [effort: ~3-4h] — PENDING

**Outcome**: `TrackedPublishedCall` agregado completo, wired en `CallTrackingModule`, cron actualiza mcNow, emite eventos para milestone. Tests pasan.

**Por qué primero**: desbloquea M4 (milestone-notifications necesita el cron de call-tracking).

**Sub-tareas**:
1. Revisar archivos untracked, confirmar que son coherentes con la visión (delegación a `chain/explorer` para MC, eventos al event bus)
2. Verificar que `TrackedPublishedCall` entity tiene id compuesto `${chain}:${addressLowercased}`
3. Agregar `TrackedPublishedCallRepository` (TypeORM + in-memory) al module
4. Agregar use cases + handlers al module
5. Wire `tracking-cron.scheduler.ts` en el module
6. Wire `call-published-tracked.handler.ts` (escucha `publishing.telegram.published` → crea `TrackedPublishedCall`)
7. Verificar `call-tracking.module.ts` actual exporta todo lo necesario
8. Tests: ejecutar `npm test -- --testPathPatterns="call-tracking"` — deben pasar
9. tsc: 0 errors

**Commit**: `feat(call-tracking): complete TrackedPublishedCall BC with cron + event handler`

---

### M2 — Score-token bug fix [effort: ~30min] — PENDING

**Outcome**: `score-token.use-case.spec.ts > penalizes CRITICAL POSSIBLE_RUG signal heavily` pasa.

**Análisis previo**:
- Test expects `score < 60`, receives `60`
- Cálculo esperado: base 50 + bonuses (5+5+2+8=20) = 70, -15 (CRITICAL penalty) = 55
- Con mi fix reciente de `await knownKol`, kol no-en-listada → 0.5 (unknown) → multiplier 1.0 → score 55 → should pass
- Pero received es 60. Hay algo más: posiblemente la clasificación afecta, o el cap. Investigar.

**Sub-tareas**:
1. Reproducir el bug: leer `ScoreTokenUseCase.execute` + `reputationMultiplier` formula
2. Identificar por qué score = 60 en lugar de 55
3. Aplicar fix mínimo (puede ser: ajustar formula, ajustar expected value, ajustar cap)
4. Verificar todos los tests de score-token pasan
5. Verificar que `score-breakdown` (plan relacionado) sigue siendo coherente

**Commit**: `fix(scoring): penalize CRITICAL signals correctly when kol unknown`

---

### M3 — Telegram/ architecture audit [effort: ~1h] — PENDING (validation)

**Outcome**: Confirmar que `telegram/` BCs están limpios según la visión.

**Sub-tareas**:
1. Auditar cada archivo en `chain-dexter-bot/` y `vip-calls-channel/`: ¿contiene lógica compleja o solo orquestación/presentación?
2. Verificar que las llamadas a `chain/detection`, `chain/explorer`, `token/*`, `kol/*` están vía use cases/ports (no bypassing directo a infrastructure)
3. Si encuentra lógica que debería estar en otro BC, anotarla como M3.1 (sub-mordisco)
4. Verificar que `shared/` no tiene archivos "huérfanos" (no usados por ningún bot)

**Commit**: `docs(telegram): audit confirms architecture alignment` (o mordisco adicional si hay issues)

---

### M4 — Milestone notifications [effort: ~6-8h] — PENDING (depends on M1)

**Outcome**: BC `token/milestone` implementado. Cuando un call tracked hits 2x/3x/4x/.../100x ATH, emite `CallMilestoneReachedEvent`. `vip-calls-channel/milestone-reached.handler.ts` lo consume y publica al canal.

**Por qué después de M1**: usa `TrackedPublishedCall` agregado, `mcNow` actualizado por el cron, y emite eventos que `vip-calls-channel` consume.

**Sub-tareas** (resumen del plan 88KB):
1. Crear `token/milestone/` estructura (domain, application, infrastructure)
2. Entidades: `MilestoneThresholdEntity` (DB), `NotifiedMilestoneEntity` (dedup)
3. Use cases: `DetectCrossedMilestonesUseCase`, `RegisterCallForMilestonesUseCase`, `NotifyMilestoneReachedUseCase`
4. Repos: TypeORM + in-memory
5. Live scheduler (cron cada 5min): buscar calls activos, fetch MC via DexScreener batch, calcular multiple, check thresholds, dedup, emitir eventos
6. Configurable thresholds via `SettingsService` (R2)
7. Event handler en `vip-calls-channel/` (existe skeleton: `milestone-reached.handler.ts`)
8. Redis dedup cache (R4 — opcional si DB es suficiente)
9. Tests (TDD según R5)
10. Verificar: `mcNow >= mcAtPublish * threshold` → notifica

**Commits** (esperados):
- `feat(milestone): add MilestoneThreshold + NotifiedMilestone entities`
- `feat(milestone): add DetectCrossedMilestonesUseCase with TDD`
- `feat(milestone): add LiveMilestoneScheduler with batched DexScreener`
- `feat(milestone): wire vip-calls-channel consumer`
- `test(milestone): integration test full flow`

---

### M5 — Working tree audit final [effort: ~30min] — PENDING

**Outcome**: Working tree limpio al final de todo. Cero archivos "dangling".

**Sub-tareas**:
1. `git status` debería estar limpio
2. Si hay untracked restantes, decidir discard vs commit
3. Si hay archivos modificados, decidir stage vs revert

**Commit**: ninguno (verificación final)

---

## Decision log (se actualiza a medida que mordemos)

| # | Decision | Contexto | Fecha |
|---|----------|----------|-------|
| D1 | Mantener `telegram/` thin — confirmado vía audit | El estado actual ya matchea la visión | 2026-06-24 |
| D2 | `milestone-notifications` se ejecuta DESPUÉS de `call-tracking` completo | Dependencia: necesita `TrackedPublishedCall` | 2026-06-24 |

---

## Out of scope (explícitamente NO hacemos)

- Nuevos npm packages
- Migraciones de DB adicionales más allá de las que requieren M1/M4
- Cambios a HTTP controllers existentes (preservamos paths)
- Refactor del `score-breakdown` (otro plan, futuro)
- Nuevas features del `chain-dexter-bot` (waves 2-11 del plan 99KB — futuro)
- Twitter/AI/Alerts del chain-dexter-bot (waves 5-7 del plan 99KB — futuro)
- Dashboard realtime (otro draft, futuro)

---

## Success criteria (el plan está completo cuando)

- [ ] M0 done — working tree limpio
- [ ] M1 done — `call-tracking/` BC completo, tests pasan, cron activo
- [ ] M2 done — score-token test pasa
- [ ] M3 done — audit confirma alineación arquitectónica
- [ ] M4 done — milestone notifications funcionan end-to-end
- [ ] M5 done — working tree final limpio
- [ ] tsc 0 errors backend + frontend
- [ ] jest failures reducidos al mínimo (pre-existing no-causados)
- [ ] All commits pushed to main (cuando el usuario lo pida)

---

## Notes para iteración futura

- Este draft es living — se edita in-place a medida que mordemos
- Si descubrimos un nuevo mordisco durante la ejecución, agregarlo aquí
- Si descartamos un mordisco (porque era incorrecto o ya no aplica), marcar como CANCELLED con razón
- Si un mordisco crece mucho, dividirlo en sub-mordiscos (M1.1, M1.2, etc.)

> **Estado actual**: 5 mordiscos pendientes. Primer mordisco recomendado: **M1** (call-tracking) — es el más concreto y desbloquea M4.