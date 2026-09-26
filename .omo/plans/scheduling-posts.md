# scheduling-posts - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Una app `scheduling-posts/` que ejecuta posts programados (one-shot + recurrentes) con media library, telegram vía gateway y tablas propias — separada de feed-publisher una vez definido el contrato con sessions.

**Why this approach:** El scheduling por-sesión vive hoy dentro de feed-publisher; extraerlo exige primero el contrato sessions↔scheduler o se parte el agregado. Se ejecuta tras ese contrato.

**What it will NOT do:** No toca matching/scoring/LLM (quedan en feed-publisher). No publica sin vínculo verificado (P38-ter espejo).

**Effort:** Large (6 todos)
**Risk:** Medium - frontera sessions/scheduler
**Decisions I made for you:** puertos 4080/81/82 (verificar); DB propia `onchain_bot_scheduling[_staging]`; telegram SOLO vía gateway.

Your next move: <fill - e.g. approve, or run a high-accuracy review>. Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

- Contrato sessions↔scheduling-posts PRIMERO (qué pide la sesión, qué ejecuta el scheduler, estados, idempotencia).
- App `apps/scheduling-posts/` (:4080/81/82): `core/` (scheduling, rotation, media, health), `uploads/` imágenes permanentes, on/off one-shot + recurrentes, telegram SOLO vía gateway, tablas propias `scheduled_posts`.
- Migración desde `feed-publisher/src/scheduling` (+ads legacy) con dual-run + cutover + deprecación.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO matching/scoring/LLM aquí. NO publicar sin vínculo verificado. NO empezar código sin el contrato firmado.

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + Jest + e2e (dual-run parity) + live schedule fire.
- Evidence: .omo/evidence/task-<N>-scheduling-posts.<ext>

## Execution strategy

### Parallel execution waves

> Wave 1: contrato + setup. Wave 2: migración + telegram-gateway. Wave 3: cutover + cleanup.

### Dependency matrix

| Todo                      | Depends on | Blocks | Can parallelize with |
| ------------------------- | ---------- | ------ | -------------------- |
| 0 (contrato)              | P52        | 1-5    | —                    |
| 1, 2 (setup+core)         | 0          | 3, 4   | entre sí             |
| 3, 4 (migración+telegram) | 1, 2       | 5      | entre sí             |
| 5 (cutover)               | 3, 4       | —      | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.
> Precondición: contrato sessions↔scheduling firmado (todo 0) antes de código.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 0. Contrato sessions↔scheduling-posts (bloqueante)
     What to do / Must NOT do: definir petición (sesión, vínculo target, contenido, cuándo: once/cron, idempotencia), estados (scheduled/fired/cancelled/failed), callbacks de resultado a sessions, auth entre apps. Solo docs + diagramas. Must NOT código sin este contrato.
     Parallelization: Wave 1 | Blocked by: P52 | Blocks: 1-5
     References: apps/feed-publisher/src/scheduling/ (origen); apps/feed-publisher/src/sessions/ (consumidor); .omo/drafts/mega-refactor-tramos.md (P34, P38, P52)
     Acceptance criteria: documento de contrato con ejemplos + casos borde (cancel, reintento, target caído)
     QA scenarios: happy contrato completo; failure ambigüedad → se aclara, no se codifica. Evidence .omo/evidence/task-0-scheduling-posts.log
     Commit: Y | docs(scheduling-posts): contrato sessions↔scheduler
- [ ] 1. App setup + core/ (scheduling, rotation, media, health)
     What to do / Must NOT do: `apps/scheduling-posts/` (:4080/81/82 verificar, health, compose, Dockerfile, envs, DB `onchain_bot_scheduling[_staging]`); `core/` con scheduling+rotation+media+health migrados de feed-publisher (git mv); `uploads/` imágenes. Tests + coverage. Must NOT lógica sessions.
     Parallelization: Wave 1 | Blocked by: 0 | Blocks: 3, 4
     References: apps/feed-publisher/src/scheduling/ (origen); .omo/plans/scheduling-posts.md (contrato todo 0)
     Acceptance criteria: `curl :4080/api/health` 200 + suites verdes + tsc limpio
     QA scenarios: happy boot; failure puerto ocupado → fallback C-PORTS. Evidence .omo/evidence/task-1-scheduling-posts.log
     Commit: Y | feat(scheduling-posts): setup y core migrado
- [ ] 2. Telegram vía gateway + tablas scheduled-posts
     What to do / Must NOT do: publish via `telegram-bots-gateway` (HMAC, dual-send temporal + paridad); tablas `scheduled_posts` (one-shot + recurrente, on/off, target binding, estado). Tests paridad. Must NOT Bot API directo.
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5
     References: .omo/plans/telegram-bots-gateway.md (patrón migración 4/5/6)
     Acceptance criteria: dual-send paridad + suites verdes
     QA scenarios: happy paridad; failure divergencia → no cutover. Evidence .omo/evidence/task-2-scheduling-posts.log
     Commit: Y | feat(scheduling-posts): telegram vía gateway
- [ ] 3. Cutover + cleanup + deprecación feed scheduling
     What to do / Must NOT do: flags/corte, borrado scheduling viejo en feed-publisher, CI/deploy staging/prod, réplicas si aplica, final review. Must NOT cerrar con feed scheduling vivo.
     Parallelization: Wave 3 | Blocked by: 2 | Blocks: —
     References: plan central C-CI-01
     Acceptance criteria: `grep scheduling viejo` vacío en feed-publisher + healthchecks verdes
     QA scenarios: happy corte limpio; failure rollback. Evidence .omo/evidence/task-3-scheduling-posts.log
     Commit: Y | feat(scheduling-posts)!: cutover y cleanup

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

Un commit por todo; cutover con `!`; contrato primero, código después.

## Success criteria

- Sessions opera scheduling-posts por contrato sin acoples directos.
- Telegram 100% vía gateway; uploads permanentes servidos.
- Feed-publisher sin scheduling propio.
