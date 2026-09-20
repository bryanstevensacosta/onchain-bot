---
slug: staging-migration-test-fix
status: drafting
intent: clear
pending-action: write .omo/plans/staging-migration-test-fix.md
approach: <fill: separar seleccion-de-modo determinista (DRY_RUN, sin DB) del path con DB viva (integracion con skip) + documentar contrato NODE_ENV->modo>
---

# Draft: staging-migration-test-fix

## Components (topology ledger)

| id | outcome (one line) | status | evidence path |
| C1-spec | caracterizar el fallo real del spec (hipotesis refutada + exit 1 por DB) | done | `apps/backend/test/staging-migration-env-propagation.bug-exploration.spec.ts:72-189,198-264` |
| C2-scripts | diagnosticar seleccion de modo en los 3 scripts + DRY_RUN | active | `apps/backend/scripts/show-migrations.sh:1-24`, `run-migrations.sh:1-24`, `typeorm.sh:1-24`, `apps/backend/package.json:25-29` |
| C3-datasource | documentar a que DB apunta NODE_ENV=staging en local | done | `apps/backend/src/shared/common/persistence/data-source.ts:28-48`, `apps/backend/.env.staging:97-105` |
| C4-rewrite | reescribir el spec: asserts de modo via DRY_RUN + path DB como integracion | active | mismo spec + nuevos asserts |
| C5-doc | contrato NODE_ENV->modo en backend AGENTS.md | active | `apps/backend/AGENTS.md` (MIGRATIONS) |
| C6-qa | spec verde con y sin dist/, hook pre-push desbloqueado | active | — |

## Open assumptions (announced defaults)

| assumption | adopted default | rationale | reversible? |
| DRY_RUN | flag de script (`--dry-run`, opt-in por invocacion) antes que var de entorno | el spec necesita forzar el modo por invocacion sin mutar entorno global; el flag es visible en el comando citado en el log | si (scripts) |
| path con DB | test de integracion con skip si no hay DB viva (probe `SELECT 1`) | en CI probablemente ni corre hoy (sin dist/ hace skip silencioso); exigir PG vivo en CI seria nuevo requisito de infra | si (spec) |
| DB local rota | hallazgo que se reporta, NO se "arregla" en este plan | `FATAL base/16384/2601 read-only` es estado del volumen PG local, no logica del repo | n/a (entorno, no codigo) |

## Findings (cited - path:lines)

- Hipotesis del spec REFUTADA (spec:12-15,72-76,170-179: "npm barrier bloquea NODE_ENV"):
  salida real via npm (`NODE_ENV=staging npm run migration:show`, apps/backend):
  `[MIGRATION-DEBUG] NODE_ENV='staging'` + `✓ Compiled artifacts found` +
  `Showing migrations from compiled JavaScript (dist/)...` + `Mode: JavaScript (NODE_ENV='staging')`.
  Identica salida via bash directo (`NODE_ENV=staging bash scripts/show-migrations.sh`).
  La barrera npm NO existe: `package.json:28` propaga con `NODE_ENV=${NODE_ENV:-development}`.
- Fallo real = exit 1 del data-source compilado contra PG local, MODO JS correcto:
  `◇ injected env (1) from .env` → `Error during migration show:` →
  `error: could not open file "base/16384/2601": Read-only file system`
  (`severity FATAL, code 42501, file md.c line 672, routine mdopenfork`) →
  `npm error code 1`. Via directa (`npx typeorm -d ./dist/.../data-source.js migration:show`)
  el mismo FATAL — confirma que no es la barrera npm.
- A que DB apunta NODE*ENV=staging en local (`data-source.ts:28-48`):
  `dotenv.config()` (:28) carga SOLO `.env` (nunca `.env.staging`); `POSTGRES*_`caen a
defaults (:35-39:`localhost:5432`, `alpha*meta_token_scanner`). El `.env`local NO tiene`POSTGRES*_`(solo`DATABASE_ENABLED=true`); `.env.dev` si (`localhost:5432`,
`alpha_meta_token_scanner`, `DATABASE_SYNCHRONIZE=true`) pero el CLI no lo lee.
`.env.staging:97-105` (`POSTGRES_HOST=postgres`, `POSTGRES_DB=alpha_meta_token_scanner_staging`)
es Docker-only y el CLI data-source JAMAS lo resuelve en local. Conclusion: con
NODE_ENV=staging en local se golpea la DB de dev `alpha_meta_token_scanner`en`localhost:5432`(aceptando conexiones; contenedor`alpha-meta-token-scanner-postgres`en`:5432`), cuyo datadir esta en read-only → FATAL.
- Estado del spec hoy (`npx jest test/staging-migration-env-propagation.bug-exploration.spec.ts`):
  `Test Suites: 1 failed, 1 total` / `Tests: 1 failed, 1 passed, 2 total`.
  Los asserts de MODO (spec:116-124: `compiled JavaScript`, `data-source.js`, no `data-source.ts`)
  PASAN via npm — por eso solo falla `spec:127 expect(exitCode).toBe(0)`.
  El test 2 (bypass-npm, spec:198-264) PASA. Sin `dist/` ambos hacen skip silencioso
  (spec:73-78,199-204: `return` con warning) — por eso en CI probablemente ni corre.
- Convencion del repo: `*-bug-exploration.spec.ts` = invariantes de fix futuro, no "arreglar"
  a ciegas (root AGENTS.md + backend AGENTS.md ANTI-PATTERNS). Cambiar asserts para pasar
  con la DB rota seria false-green.

## Decisions (with rationale)

- Separar seleccion-de-modo (determinista, sin DB) de ejecucion-contra-DB (integracion):
  el spec actual mezcla ambas y por eso un volumen PG roto bloquea `git push` (pre-push corre `npm test`).
- DRY_RUN en los 3 scripts (`show-migrations.sh`, `run-migrations.sh`, `typeorm.sh`):
  imprime modo + data-source objetivo y sale 0 sin conectar. Hace los asserts de modo
  citables sin depender del estado del PG local.
- El path con DB viva queda como test de integracion con skip (probe antes de conectar),
  NO como gate del pre-push.
- La DB local rota se REPORTA (volumen PG read-only, reconstruir contenedor/volumen fuera
  de este plan), no se "repara" dentro del plan.

## Scope IN

- Diagnostico documentado: que `.env*` resuelve el CLI con NODE_ENV=staging en local + estado del volumen PG.
- Modo DRY_RUN en los 3 scripts (imprime modo + data-source, exit 0 sin conectar) + specs de scripts si aplica.
- Reescritura del spec: asserts de seleccion de modo via DRY_RUN (determinista, sin DB) +
  path con DB como integracion (skip sin DB viva).
- Contrato NODE_ENV→modo en backend AGENTS.md (gaps o MIGRATIONS).
- QA: spec verde con y sin `dist/`, hook pre-push desbloqueado.

## Scope OUT (Must NOT have)

- NO cambiar la logica de migraciones (up/down de los 15 ficheros en `src/shared/common/persistence/migrations/`).
- NO tocar `src/shared/common/persistence/data-source.ts` (resolucion de env/CLI fuera de alcance).
- NO "arreglar" la DB local como parte del plan (hallazgo de entorno, se reporta).
- NO dependencias nuevas; NO `as any` / `@ts-ignore`; NO borrar specs para pasar.
- NO copiar la hipotesis refutada ("npm barrier") como premisa del plan.

## Open questions

- Q1 (CI): ¿el path con DB debe correr en CI (requiere servicio PG + dist/ compilado) o quedar como integracion local con skip? Default adoptado: skip sin DB viva (cero infra nueva).
- Q2 (DRY_RUN): ¿flag de script (`--dry-run`) o var de entorno (`DRY_RUN=1`)? Default adoptado: flag de script, visible en el comando.

## Approval gate

status: awaiting-approval
pending-action: write .omo/plans/staging-migration-test-fix.md (plantilla backend-media-ownership: TL;DR humano+maquina, Scope Must/Must NOT, Verification, Execution waves + Dependency matrix, Todos con commit Y/N, Final verification F1-F4, Commit strategy, Success criteria)
approach: separar seleccion-de-modo determinista (DRY_RUN, sin DB) del path con DB viva (integracion con skip) + documentar contrato NODE_ENV->modo
