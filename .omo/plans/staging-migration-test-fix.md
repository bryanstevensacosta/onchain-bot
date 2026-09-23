# staging-migration-test-fix - Work Plan

## TL;DR (For humans)

**What you'll get:** El spec rojo que bloquea `git push` vuelve a verde sin false-green, y queda escrito qué DB usa cada modo de migración.

**Why this approach:** El spec mezcla dos cosas (¿elige bien el modo JS/TS? + ¿conecta a la DB?) y la segunda depende de un volumen Postgres local roto. En vez de "arreglar" asserts a ciegas, separamos: selección de modo determinista vía `DRY_RUN` (sin DB, siempre verde) y path con DB como integración con skip si no hay DB viva.

**What it will NOT do:** No toca la lógica de migraciones (up/down), no toca `data-source.ts`, no "repara" la DB local (se reporta), no añade dependencias.

**Effort:** Short
**Risk:** Low - solo scripts de migración (añaden rama `--dry-run`), un spec, y una sección de doc; cero lógica de negocio.
**Decisions to sanity-check:** DRY_RUN como flag de script (`--dry-run`) vs var de entorno (se adopta flag); path con DB como integración con skip en vez de gate de CI (se adopta skip).

Your next move: approve, o pide revisión Momus. Full execution detail follows below.

---

> TL;DR (machine): Short / Low — DRY_RUN flag en 3 scripts + spec rewrite (modo determinista + integración con skip) + contrato NODE_ENV→modo en AGENTS.md.

## Scope

### Must have

- Diagnóstico documentado: qué `.env*` resuelve el CLI con `NODE_ENV=staging` en local + estado del volumen PG (evidencia, no fix de entorno).
- Modo `DRY_RUN` (`--dry-run`) en `show-migrations.sh`, `run-migrations.sh`, `typeorm.sh`: imprime modo + data-source objetivo, exit 0 sin conectar.
- Reescritura de `test/staging-migration-env-propagation.bug-exploration.spec.ts`: asserts de selección de modo vía `DRY_RUN` (determinista, sin DB) + path con DB como test de integración (skip sin DB viva).
- Contrato `NODE_ENV`→modo documentado en `apps/backend/AGENTS.md` (MIGRATIONS o gaps).
- QA: spec verde con y sin `dist/`, `tsc` + `lint` verdes, hook pre-push desbloqueado.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO cambiar la lógica de migraciones (up/down de `src/shared/common/persistence/migrations/`).
- NO tocar `src/shared/common/persistence/data-source.ts` (resolución de env/CLI fuera de alcance).
- NO "arreglar" la DB local como parte del plan (hallazgo de entorno, se reporta en el todo 6).
- NO "arreglar" el spec cambiando asserts para que pase con la DB rota (false-green; el plan separa modo determinista de integración con DB).
- NO copiar la hipótesis refutada ("npm barrier") como premisa (el draft la registra como refutada con evidencia).
- NO dependencias nuevas; NO `as any` / `@ts-ignore`; NO borrar specs para pasar.

## Failure contract (hechos verificados — no re-discutir, citar con evidencia)

| # | hecho | evidencia |
| F-a | Hipótesis "npm barrier bloquea NODE*ENV" REFUTADA | `NODE_ENV=staging npm run migration:show` → `[MIGRATION-DEBUG] NODE_ENV='staging'` + `Showing migrations from compiled JavaScript (dist/)...` (igual vía bash directo) |
| F-b | Fallo real = exit 1 del data-source compilado, modo JS correcto | `◇ injected env (1) from .env` → `FATAL: could not open file "base/16384/2601": Read-only file system` (code `42501`, `md.c:672`) → `npm error code 1`; idéntico vía `npx typeorm -d ./dist/.../data-source.js migration:show` |
| F-c | Sin `dist/` el spec hace skip silencioso (CI probablemente ni corre) | spec:73-78,199-204 (`return` con warning si no hay artefactos) |
| F-d | Con `NODE_ENV=staging` en local el CLI golpea la DB de dev, nunca `.env.staging` | `data-source.ts:28` (`dotenv.config()` carga solo `.env`); defaults `localhost:5432`/`alpha_meta_token_scanner` (:35-39); `.env` local sin `POSTGRES*\*`; `.env.staging:97-105` Docker-only (`HOST=postgres`) |
| F-e | Estado medido del spec: 1 failed / 1 passed (solo `exitCode`en spec:127; asserts de modo pasan) |`npx jest test/staging-migration-env-propagation.bug-exploration.spec.ts`→`1 failed, 1 passed, 2 total` |

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + Jest (co-locado `*.spec.ts`, `testRegex .*\.spec\.ts$`, `--forceExit`, 30s timeout). Implementation + Test = ONE todo.
- Evidence: `.omo/evidence/task-<N>-staging-migration-test-fix.<ext>` (salidas verbatim de comandos + spec).
- Gates: `npx tsc --noEmit -p apps/backend/tsconfig.json` verde, `npm run lint` (o `npx eslint`) en ficheros tocados, `npx jest test/staging-migration-env-propagation.bug-exploration.spec.ts` verde.

## Execution strategy

### Parallel execution waves

- Wave 1 (diagnóstico + código + doc, 4 todos): 1, 2, 3, 4 — 3 bloqueado por 2 (necesita el flag `--dry-run`); 1 y 4 arrancan en paralelo sin dependencias.
- Wave 2 (QA + reporte, 2 todos): 5, 6 — 5 bloqueado por 2+3+4, 6 bloqueado por 1+5.

### Dependency matrix

| Todo                     | Depends on | Blocks | Can parallelize with |
| ------------------------ | ---------- | ------ | -------------------- |
| 1 diagnóstico DB local   | —          | 6      | 2, 4                 |
| 2 DRY_RUN 3 scripts      | —          | 3, 5   | 1, 4                 |
| 3 rewrite spec           | 2          | 5      | 1, 4                 |
| 4 doc AGENTS.md contrato | —          | 5      | 1, 2, 3              |
| 5 QA matriz con/sin dist | 2, 3, 4    | 6      | 6 (tras 5)           |
| 6 reporte DB + pre-push  | 1, 5       | —      | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Diagnóstico NODE*ENV=staging → DB local (evidencia, sin fix de entorno)
     What to do / Must NOT do: Documentar con salidas verbatim: (a) qué `.env*` lee el CLI (`data-source.ts:28` solo `.env`; `.env` local sin `POSTGRES*_`→ defaults`localhost:5432`/`alpha_meta_token_scanner`); (b) `.env.staging:97-105` nunca resuelto por el CLI en local (Docker-only); (c) estado del PG local (`pg_isready -h localhost -p 5432`, contenedor `alpha-meta-token-scanner-postgres`, FATAL `base/16384/2601`read-only code 42501). Guardar en`.omo/evidence/task-1-staging-migration-test-fix.log`. NO reparar el volumen/contenedor; NO tocar `data-source.ts`; NO tocar `.env_`.
Parallelization: Wave 1 | Blocked by: — | Blocks: 6
References (executor has NO interview context - be exhaustive): `apps/backend/src/shared/common/persistence/data-source.ts:28-48`; `apps/backend/.env.staging:97-105`; `apps/backend/.env`; `apps/backend/.env.dev`; `apps/backend/scripts/show-migrations.sh:6-13`; `.omo/drafts/staging-migration-test-fix.md`(Findings)
Acceptance criteria (agent-executable): el log contiene`NODE_ENV='staging'`+`compiled JavaScript`+`FATAL`/`42501`verbatim y la frase "el CLI nunca lee`.env.staging`en local";`grep -E "^(POSTGRES|DATABASE)" apps/backend/.env`citado en el log
QA scenarios (name the exact tool + invocation): happy:`NODE_ENV=staging npm run migration:show`(apps/backend) reproduce F-b; failure-control:`NODE_ENV=staging npx typeorm -d ./dist/backend/src/shared/common/persistence/data-source.js migration:show`reproduce el mismo FATAL (prueba que no es la barrera npm). Evidence`.omo/evidence/task-1-staging-migration-test-fix.log`
     Commit: N

- [x] 2. DRY_RUN (`--dry-run`) en los 3 scripts de migración + specs
     What to do / Must NOT do: En `show-migrations.sh`, `run-migrations.sh` y `typeorm.sh`: parsear `--dry-run` como `$1` (shift antes de delegar; en `typeorm.sh` no debe llegar a `npx typeorm`), imprimir `[DRYRUN] mode=<javascript|typescript> data-source=<path> args=<resto>` y salir 0 sin ejecutar `npx`. Mantener `set -euo pipefail` y los bloques `[MIGRATION-DEBUG]`/`[TYPEORM-DEBUG]` intactos. Añadir asserts (spec co-locado o asserts en el spec del todo 3 — coordinar: este todo entrega el flag + su prueba mínima de humo en el evidence log). NO cambiar la rama normal (sin flag, comportamiento idéntico); NO tocar `package.json`; NO tocar `data-source.ts`.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 3, 5
     References (executor has NO interview context - be exhaustive): `apps/backend/scripts/show-migrations.sh:1-24`; `apps/backend/scripts/run-migrations.sh:1-24`; `apps/backend/scripts/typeorm.sh:1-24`; `apps/backend/package.json:25-29`
     Acceptance criteria (agent-executable): `NODE_ENV=staging bash scripts/show-migrations.sh --dry-run` exit 0 y contiene `compiled JavaScript` + `data-source.js`; igual para `run-migrations.sh --dry-run`; `NODE_ENV=staging bash scripts/typeorm.sh --dry-run migration:show` exit 0 sin `Error during migration`; sin flag, `bash -n` verde en los 3 y el modo impreso no cambia
     QA scenarios (name the exact tool + invocation): happy: staging + dist/ → `[DRYRUN] mode=javascript data-source=./dist/.../data-source.js`; failure-control: sin NODE_ENV (development, sin dist/) → `[DRYRUN] mode=typescript data-source=src/.../data-source.ts`; regression: `NODE_ENV=production bash scripts/run-migrations.sh --dry-run` → javascript. Evidence `.omo/evidence/task-2-staging-migration-test-fix.log`
     Commit: N

- [x] 3. Reescribir el spec: modo determinista (DRY_RUN) + path DB como integración con skip
     What to do / Must NOT do: Reescribir `test/staging-migration-env-propagation.bug-exploration.spec.ts` (265 líneas, 2 tests) así: (a) test 1 = selección de modo vía `NODE_ENV=staging bash scripts/show-migrations.sh --dry-run` (directo) + vía `npm run migration:show -- --dry-run` (propagación npm): asserts `compiled JavaScript`, `data-source.js`, no `data-source.ts`, exit 0 — determinista, sin DB; documenta en comentario que la hipótesis "npm barrier" está refutada (F-a); (b) test 2 = integración con DB viva: probe previo (p.ej. `pg_isready -h localhost -p 5432` o `SELECT 1` con timeout corto) y SKIP con warning si no hay DB viva; si hay, corre `migration:show` real y exige exit 0; (c) mantener el skip sin `dist/` (F-c). Conservar el header `bug-exploration` (invariante de fix futuro). NO relajar asserts para pasar con DB rota (false-green); NO `as any`; NO llamadas a providers externos.
     Parallelization: Wave 1 | Blocked by: 2 | Blocks: 5
     References (executor has NO interview context - be exhaustive): `apps/backend/test/staging-migration-env-propagation.bug-exploration.spec.ts:1-265` (header:1-26, skip-dist:37-61, test npm:72-189, test bypass:198-264); `apps/backend/scripts/show-migrations.sh:1-24` (flag del todo 2); `apps/backend/docker-compose.staging.yml` (existencia, cf. spec:33)
     Acceptance criteria (agent-executable): `npx jest test/staging-migration-env-propagation.bug-exploration.spec.ts` (apps/backend) verde con DB rota (el test de modo pasa por DRY_RUN; el de integración hace skip con warning visible); `rg -n "npm barrier|bashScriptReceives" apps/backend/test/staging-migration-env-propagation.bug-exploration.spec.ts` muestra la hipótesis marcada como refutada, no como premisa
     QA scenarios (name the exact tool + invocation): happy: DB rota + dist/ → suite verde (modo OK + skip integración); failure: quitar `--dry-run` de los asserts de modo → vuelve a fallar por FATAL (prueba que el test sigue acoplado al modo, no false-green). Evidence `.omo/evidence/task-3-staging-migration-test-fix.log`
     Commit: Y | `fix(backend-test): deterministic staging migration mode asserts via DRY_RUN`

- [x] 4. Documentar contrato NODE_ENV→modo en backend AGENTS.md
     What to do / Must NOT do: Añadir a `apps/backend/AGENTS.md` (sección MIGRATIONS o gaps): tabla `NODE_ENV=staging|production → dist/data-source.js` vs `else → src/data-source.ts`; nota de que el CLI data-source solo lee `.env` (nunca `.env.staging` en local → staging-local golpea la DB de dev por defecto); nota del flag `--dry-run` en los 3 scripts; puntero al draft `.omo/drafts/staging-migration-test-fix.md`. Solo doc. NO cambiar código; NO reordenar secciones existentes.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 5
     References (executor has NO interview context - be exhaustive): `apps/backend/AGENTS.md` (TYPEORM MIGRATIONS runbook); `.omo/drafts/staging-migration-test-fix.md` (Findings, Decisions); `apps/backend/scripts/show-migrations.sh:15-24`; `apps/backend/src/shared/common/persistence/data-source.ts:28-48`
     Acceptance criteria (agent-executable): `rg -n "dry-run|NODE_ENV.*staging.*dist" apps/backend/AGENTS.md` ≥1 hit por concepto (tabla de modos + nota `.env.staging` + flag); `npx prettier --check apps/backend/AGENTS.md` verde
     QA scenarios (name the exact tool + invocation): happy: lector distingue en <1min qué modo usa cada NODE_ENV y por qué staging-local no usa `.env.staging`; failure: N/A (doc). Evidence `.omo/evidence/task-4-staging-migration-test-fix.md`
     Commit: Y | `docs(backend): NODE_ENV to migration-mode contract`

- [x] 5. QA matriz: spec verde con y sin dist/ + gates + pre-push desbloqueado
     What to do / Must NOT do: Matriz en dev, sin tocar prod/staging, sin segunda sesión MTProto: (a) con `dist/` (existe hoy): spec verde; (b) sin `dist/` (renombrar temporal `dist/` → `dist.bak`, restaurar después): suite en skip, 0 failed; (c) `npx tsc --noEmit -p apps/backend/tsconfig.json` verde; (d) eslint en ficheros tocados (todos 2-4) verde; (e) `npm run migration:show -- --dry-run` con NODE_ENV=staging exit 0. Restaurar `dist/` si se movió. NO commitear en este todo; NO borrar specs.
     Parallelization: Wave 2 | Blocked by: 2, 3, 4 | Blocks: 6
     References (executor has NO interview context - be exhaustive): todos 2, 3, 4; `apps/backend/test/staging-migration-env-propagation.bug-exploration.spec.ts`; `apps/backend/package.json:17` (`npm test`: jest --forceExit)
     Acceptance criteria (agent-executable): log con `Tests: ... passed` con dist/ + `skipped, 0 failed` sin dist/ + `TSC_EXIT:0` + `ESLINT_EXIT:0` sobre ficheros tocados
     QA scenarios (name the exact tool + invocation): happy: matriz completa verde; failure: `git push --dry-run`-equivalente — el pre-push (`npm test` backend+frontend) ya no bloquea por este spec. Evidence `.omo/evidence/task-5-staging-migration-test-fix.log`
     Commit: N

- [x] 6. Reporte DB local rota + cierre pre-push (hallazgo, no fix)
     What to do / Must NOT do: Redactar en el evidence log el reporte de entorno: PG local `localhost:5432` responde pero su datadir está read-only (`FATAL base/16384/2601`, code 42501) — reconstruir contenedor/volumen de dev (`docker compose up -d postgres` con `POSTGRES_PORT=5432`, o recrear volumen si persiste) queda FUERA de este plan como acción del operador; verificar que con el spec reescrito el hook pre-push ya no bloquea por este spec. NO ejecutar la reconstrucción del volumen (destructivo, decisión del operador); NO tocar compose; NO commitear.
     Parallelization: Wave 2 | Blocked by: 1, 5 | Blocks: —
     References (executor has NO interview context - be exhaustive): todo 1 (evidence log); todo 5 (matriz QA); `apps/backend/docker-compose.yml` (servicio postgres dev, solo lectura de referencia)
     Acceptance criteria (agent-executable): `.omo/evidence/task-6-staging-migration-test-fix.log` contiene causa (datadir read-only), acción del operador propuesta (comando exacto, SIN ejecutar), y confirmación de que el spec ya no bloquea el pre-push
     QA scenarios (name the exact tool + invocation): happy: reporte cita FATAL+code+comando operador; failure: N/A (reporte). Evidence `.omo/evidence/task-6-staging-migration-test-fix.log`
     Commit: N

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit
- [x] F2. Code quality review
- [x] F3. Real manual QA
- [x] F4. Scope fidelity

## Commit strategy

- Todos 3 y 4 commitean por separado (spec + docs); 1, 2, 5, 6 sin commit (trabajo en árbol, se squashea al merge a `dev` por GOVERNANCE). Nunca commitear en `master`. Mensajes conventional-commits.

## Success criteria

- `npx jest test/staging-migration-env-propagation.bug-exploration.spec.ts` verde con DB rota y con `dist/` presente (modo por DRY_RUN + skip de integración), y en skip limpio (0 failed) sin `dist/`.
- `--dry-run` en los 3 scripts imprime modo + data-source con exit 0 sin conectar (staging→javascript/dist, dev→typescript/src).
- `apps/backend/AGENTS.md` documenta el contrato NODE_ENV→modo + nota `.env.staging` + flag `--dry-run`.
- `tsc` + `lint` verdes en backend; hook pre-push ya no bloquea por este spec; cero cambios en migraciones, `data-source.ts`, o lógica de negocio.
