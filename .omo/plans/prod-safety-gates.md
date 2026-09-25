# prod-safety-gates - Work Plan

## TL;DR (For humans)

**What you'll get:** que romper prod deje de depender de la suerte: merge bloqueado sin staging verde, gates que comparan versiones (no solo latidos), migraciones que se niegan a destruir datos, rollback automático si el smoke post-deploy falla, y ventana de observación con alertas.

**Why this approach:** cada item ataca un fallo real que ya nos mordió (detallados abajo); ordenados por impacto, ninguno toca lógica de negocio.

**What it will NOT do:** no cambia pipelines de producto, no añade métricas nuevas de negocio, no toca MTProto/sesiones, no canary paralelo.

**Effort:** Small-Medium (5 todos + final)
**Risk:** Low - solo workflows, templates, guards y alertas; cero cambios runtime salvo asserts defensivos
**Decisions to sanity-check:** bake 15 min + auto-rollback (¿demasiado agresivo? es dispatch-manual el rollback, auto solo el trigger); branch protection requiere admin (tú)

Your next move: approve, or run a high-accuracy review. Full execution detail follows below.

---

> TL;DR (machine): Small-Medium effort, Low risk, prod-safety gates (merge gate, version-match, migration guards, auto-rollback, bake+alerts)

## Scope

### Must have

- Merge gate: PR template con checklist de staging-evidencia (smoke + tráfico observado con run IDs) + branch protection en `master` exigiendo checks verdes incl. staging deploy (documentar el click-path en settings; si la API lo permite, hacerlo por `gh api`, si no, checklist operador).
- Version-match gates: backend despliega solo si la ingestion sirviente expone el SHA esperado (`/api/health` o endpoint version con `imageRevision`; comparar contra el SHA del run; mismatch = abort con mensaje accionable). Aplica a prod (`:3032`) y staging/twin (`:3033`).
- Migraciones defensivas como patrón: toda migración destructiva futura lleva assert de preservación (counts pre/post + backup path en el mensaje de error, estilo `DropFeedSourcesResidual`); auditar las pendientes existentes y añadir asserts donde falten (lista cerrada en el todo, sin reescribir migraciones ya aplicadas).
- Auto-rollback post-smoke: si el smoke post-deploy falla tras un deploy a prod/staging, disparar el rollback lane correspondiente automáticamente (conservando el dispatch manual como escape); registrar la decisión + downtime en el summary.
- Bake + alertas: ventana 15 min post-deploy prod con checks (5xx, queue stall, SSE disconnect) — implementar como job `watch` post-deploy que falla ruidoso (y por tanto dispara el rollback del punto anterior); documentar umbrales.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO tocar lógica de negocio; cambios runtime solo aditivos y acotados (T2 campo health, T3 asserts migración); sin lógica de negocio nueva.

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + inspección rigurosa; `yaml.safe_load` por workflow tocado; `act` si disponible (si no, dry-review + `gh workflow view --yaml`); specs donde haya lógica nueva testeable (guards en scripts → specs/bats o asserts).
- Evidence: .omo/evidence/task-<N>-prod-safety-gates.txt

## Execution strategy

### Parallel execution waves

- Wave 1 (2 todos paralelizables): T1 merge gate + template, T2 version-match gates
- Wave 2 (2 todos paralelizables): T3 migration guards, T4 auto-rollback post-smoke
- Wave 3 (1 todo): T5 bake + alertas
- Wave 4: Final verification wave F1-F4 en paralelo

### Dependency matrix (T3 concede slot compartido a T1 si colisionan en ventana; ver T1)

| Todo                | Depends on | Blocks | Can parallelize with |
| ------------------- | ---------- | ------ | -------------------- |
| T1 merge gate       | —          | —      | T2                   |
| T2 version-match    | —          | —      | T1                   |
| T3 migration guards | —          | —      | T4                   |
| T4 auto-rollback    | —          | T5     | —                    |
| T5 bake+alerts      | T4         | —      | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

- [x] 1. Merge gate: staging verde obligatorio + template PR
     What to do: (a) `.github/pull_request_template.md` (crear si no existe) con checklist: staging deploy verde (run ID), twin smoke verde, tráfico observado (counts), migraciones ensayadas, backfill planificado si hay DROP. (b) Branch protection `master`: exigir checks (CI + staging deploy success) vía `gh api` (`required_status_checks`) + `can_admins_bypass=false` (verificar estado actual primero con `gh api .../branches/master/protection` y rulesets; si ya es false, evidenciar y seguir). EXCEPCIÓN HOTFIX (decisión operador 2026-09-24): hotfix mergea con aprobador nombrado (el operador) + controles compensatorios obligatorios (drill staging post-merge del SHA, bake acortado no-saltado, PR seguimiento 24h por la vía normal); waiver + evidencia sustituta en el record del incidente.
     Must NOT do: bloquear `dev` (solo `master`); cambiar reviewers/owners; tocar workflows de deploy.
     Parallelization: Wave 1 | Blocked by: — | Blocks: —
     Parallelization: Wave 1 | Blocked by: — | Blocks: T3 (matriz; concede slot compartido si colisionan)
     Acceptance criteria: template existe con 5+ checkboxes + `gh api .../branches/master/protection` muestra checks requeridos O checklist click-path documentada con capturas en evidence.
     QA scenarios: happy — PR de prueba en draft muestra el template; failure — n/a (config). Evidence .omo/evidence/task-1-prod-safety-gates.txt
     Commit: Y | ci(gates): staging-green merge requirement

- [x] 2. Version-match gates (no solo liveness)
     What to do: Exponer revisión servida en ingestion (`GET /api/health` + campo aditivo `imageRevision`: wiring `apps/ingestion-telegram/Dockerfile: ARG IMAGE_REVISION → ENV IMAGE_REVISION=$IMAGE_REVISION`, lectura en `shared/common/config/app.config.ts`, campo en `health.controller.ts`; fallback `unknown` no-bloqueante) + gate en backend deploy (prod y staging) que compara SHA servido vs SHA del run (`needs.<build>.outputs` o `github.sha`); mismatch = abort con mensaje (`esperaba <sha>, sirve <otra> — reintentar tras ingestion`). Mantener el gate liveness actual como backstop (no sustituir).
     Must NOT do: tocar lógica de negocio/health existente (solo añadir campo); romper clientes del health (campo aditivo); cambiar puertos/rutas. ADOPCIÓN REGISTRADA 2026-09-24 (revisión F4): `app.config.ts` porta además hunks aditivos de otro lane (gap-12 `INGESTION_PORT` chain con default 3031 + fallbacks intactos; `mtproto*` reads opcionales fail-soft sin wiring a cliente) — se adoptan explícitamente: aditivos, `tsc` + suites verdes, sin cambios de comportamiento para envs existentes; el wiring MTProto real queda para ese lane.
     Parallelization: Wave 1 | Blocked by: — | Blocks: —
     References: ingestion `health.controller` + `app.module` env wiring, `deploy.yml` ordering gate, `deploy-staging.yml` equivalente, `Dockerfile` (ARG→ENV para IMAGE_REVISION si se usa).
     Acceptance criteria: `curl :3032/api/health | jq .imageRevision` (o campo equivalente) devuelve SHA post-deploy; deploy con mismatch simulado (staging, SHA viejo pineado) aborta con el mensaje exacto (drill en staging, evidenciado); `npx jest` suites tocadas verdes; `tsc` limpio.
     QA scenarios: happy — match verde; failure — mismatch aborta ANTES de migraciones backend (assert orden en logs). Evidence .omo/evidence/task-2-prod-safety-gates.txt
     Commit: Y | ci(gates): version-match before backend deploy

- [x] 3. Patrón migraciones defensivas (generalizar lo que nos salvó)
     What to do: Inventariar migraciones destructivas pendientes/futuras (DROP/RENAME/ALTER con pérdida) en backend + ingestion; a cada una: assert pre-ejecución (counts == 0 o backup path existente verificable) con mensaje que diga QUÉ hacer (no solo qué falló), estilo `DropFeedSourcesResidual`. Las ya aplicadas NO se reescriben (inmutabilidad). Añadir sección al runbook de migraciones con el patrón + checklist.
     Must NOT do: reescribir migraciones aplicadas; tocar lógica de negocio; migraciones sin necesidad (solo destructivas).
     Parallelization: Wave 2 | Blocked by: — | Blocks: —
     References: `DropFeedSourcesResidual` (patrón), `docs/deployment/*migration*`, carpetas `migrations/` de ambas apps.
     Acceptance criteria: lista cerrada en evidence (cada migración destructiva: assert presente/añadido/n-a con motivo); nueva migración de ejemplo? NO crear tablas de mentira — probar el patrón con `migration:show` + review; `docs:check` exit 0.
     QA scenarios: happy — inventario completo; failure — migración destructiva sin assert → añadido con mensaje accionable. Evidence .omo/evidence/task-3-prod-safety-gates.txt
     Commit: Y | docs(db): defensive migration pattern plus asserts

- [x] 4. Auto-rollback post-smoke fallido
     What to do: Tras cada deploy prod/staging (backend, frontend, ingestion, twin): si el smoke post-deploy falla, disparar automáticamente el rollback lane correspondiente (dispatch `rollback-*` con el pin `:prev*`); registrar decisión + downtime en el summary; dispatch manual intacto como escape. Implementar como job `auto-rollback` con `if: failure()` + `needs:` del smoke (verificar sintaxis por workflow; NO asumir — leer cada archivo). ESCALADO SEGUNDO NIVEL (decisión operador 2026-09-24): si el rollback falla (pin ausente, salud roja post-rollback, boot-loop por schema incompatible): congelar lanes (lock documentado, sin re-loops), avisar al operador con ventana de downtime + artifact dump pre-deploy, invalidar el pin envenenado; restore de DB = decisión humana explícita (jamás automática, jamás segundo rollback en loop). Budget: rollback <60s por lane; sin verde en 2 ventanas de healthcheck → forward-fix-or-restore.
     Must NOT do: rollback por timeout genérico sin smoke fallido (solo post-smoke-rojo); tocar lanes de rollback existentes (reusarlos); auto-rollback en respuesta a alertas de negocio (solo deploy-smoke).
     Parallelization: Wave 2 | Blocked by: — | Blocks: —
     References: `rollback-*` lanes + `:prev*` pins + runbooks existentes, smoke steps de cada deploy, `docs/deployment/*rollback*`.
     Acceptance criteria: `yaml.safe_load` ×3 workflows + `grep` del job auto-rollback con condición de fallo + drill en staging (forzar smoke rojo? NO romper staging a propósito — drill seco: workflow_dispatch del lane rollback + downtime medido, evidenciado); `gh workflow view --yaml` coherente.
     QA scenarios: happy — drill rollback staging con tiempos; failure — rollback sin pin disponible → aborta con mensaje (no a ciegas). Evidence .omo/evidence/task-4-prod-safety-gates.txt
     Commit: Y | ci(deploy): auto-rollback on post-smoke failure

- [x] 5. Bake 15 min + alertas post-deploy prod
     What to do: Job `watch` post-deploy prod (backend+ingestion): 15 min de probes (5xx rate, queue stall = pending sin mover, SSE disconnects) con umbrales documentados en el propio workflow (comentarios) + fallo ruidoso que encadena el item 4. Alertas: las que ya existan se reutilizan; si no hay canal, log + summary (no crear infra de alertas nueva en este plan — registrar como follow-up si aplica).
     Must NOT do: cambiar umbrales de negocio; métricas nuevas persistentes; tocar código de apps.
     Parallelization: Wave 3 | Blocked by: T4 | Blocks: —
     References: smoke existente (patrón de probes), runbooks, `docs/deployment/*`.
     Acceptance criteria: job presente con probes + umbrales + `timeout-minutes` acotado + encadenado al rollback (inspección + `grep`); drill seco en staging si es barato, si no procedimiento documentado.
     QA scenarios: happy — probes documentadas con umbrales inline (5xx-rate %, queue-stall min, SSE-disc count) + `timeout-minutes: 20` en el job + grep-evidencia del encadenado a T4; failure — watch rojo → auto-rollback disparado (logs del run como prueba). Evidence .omo/evidence/task-5-prod-safety-gates.txt
     Commit: Y | ci(deploy): post-deploy bake window and alerts

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit
- [x] F2. Code quality review
- [x] F3. Real manual QA
- [x] F4. Scope fidelity

## Commit strategy

- Un commit por todo (5) + final checkpoint; orden Wave 1→3; nada de secretos; nada a prod (workflows en dev hasta merge).

## Success criteria

- 5 todos + F1–F4 APPROVE; romper prod requiere saltarse 3+ gates independientes; cada gate verificado individualmente.
