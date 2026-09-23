# manual-release-flow - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** <fill last - deliverables in human terms, 1-2 sentences>

**Why this approach:** <fill last - the one or two load-bearing decisions and why>

**What it will NOT do:** <fill last - 1-3 plain lines mirroring Must NOT have>

**Effort:** <Quick | Short | Medium | Large | XL>
**Risk:** <Low | Medium | High> - <one-line driver>
**Decisions to sanity-check:** <fill last - the few choices worth a human glance>

Your next move: <fill - e.g. approve, or run a high-accuracy review>. Full execution detail follows below.

---

> TL;DR (machine): Medium / Medium (public refs rewrite) / manual releases + fixed changelogs/tags.

**What you'll get:** Releases 100% manuales con reglas escritas, changelogs sin duplicados y con versiones que reflejan cambios reales por app, y tags/releases limpios en GitHub.

**Why this approach:** La automatización transcribía sin juzgar (duplicados, majors indebidos, tags ambiguos); con releases manuales y criterios documentados recuperas control editorial. Se reescribe la historia publicada porque así lo pediste aunque tome tiempo.

**What it will NOT do:** No toca código ni secretos; no hace force-push de ramas; no mergea PRs (quedan abiertos para ti).

**Effort:** Medium
**Risk:** Medium - reescribe refs públicas (tags/releases), mitigado con respaldo previo
**Decisions to sanity-check:** versiones juzgadas por app antes de taggear (el worker las propone con evidencia, las ves en el reporte)

Your next move: aprobar el arranque ($start-work). Full execution detail follows below.

## Scope

### Must have

- Inventario cerrado (tags, releases incl. draft, changelogs por app, versiones package.json, archivos release-please) + respaldo reversible en evidencia.
- Eliminación total de la automatización (workflow, config, manifest, troubleshooting) sin romper links ni otros workflows.
- RELEASE-FLOW.md raíz con proceso manual + criterios major/minor/patch + ejemplos del repo + checklist.
- 3 changelogs reescritos (dedup, entradas atribuidas a su app, versiones juzgadas) + package.json sincronizados + root CHANGELOG eliminado.
- Tags v1–v4 + releases (incl. draft) borrados y recreados por app (`backend-vX`, `frontend-vX`, `ingestion-vX`) con notas desde los changelogs.
- Verificación final: cero restos release-please, changelogs parsean, tags/releases limpios, docs:check sin warnings nuevos.
- Enterprise v1 escala solo-dev: environment `production` con cooling-off (sin reviewers: auto-aprobarse es teatro), higiene PR (title-lint + squash), dry-run de migraciones en deploys, smoke post-deploy (script + steps), secciones en RELEASE-FLOW.md (rollback/RTO, hotfix, flags, firma-opcional), script borrador de changelog probado. Sin trenes, sin CODEOWNERS, sin notificaciones (v2).

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO tocar código de producto (docs/config/versiones/refs públicas solamente).
- NO tocar `.env*`, secretos, compose, runners, hosts, DBs.
- NO force-push de ramas (solo `git push --delete` de TAGS + `gh release delete`, autorizado explícito por el owner).
- NO reescribir historia git (los commits quedan intactos).
- NO mergear PRs (si algún paso crea un PR, queda abierto para el owner).
- NO inventar entradas de changelog (toda entrada cita su commit/PR real).
- NO tocar LiteLLM/otros repos.
- NO auto-aprobar environments (el owner aprueba los deploys a prod; el plan solo configura el gate).
- NO notificaciones Telegram (v2: requiere bot+secretos, decisión pendiente).
- NO builders nativos/depot (v2: solo si los builds con caché siguen lentos).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: **none** (docs/config/versiones/refs — sin runtime) + agent-executed QA per todo (happy + failure, exact tool + invocation, evidence path).
- Evidence: .omo/evidence/task-<N>-manual-release-flow.<ext> (listas gh/git, diffs, parses; jamás valores de secretos).
- QA estándar por todo: parse (`python3 -m json.tool` para JSON, `python3 -c yaml.safe_load` para workflows, estructura markdown), `git diff --stat`, conteos antes/después.

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- **Wave 1 (inventario, 4 todos):** 1 tags+releases, 2 respaldo, 3 mapeo commits→app, 4 grep referencias release-please. Todo lectura, cero mutaciones salvo evidencia.
- **Wave 2 (demolición + proceso, 3 todos):** 5 eliminar automatización, 6 RELEASE-FLOW.md, 7 root CHANGELOG + links. Archivos disjuntos.
- **Wave 3 (reescritura + borrado, 4 todos):** 8 backend, 9 frontend, 10 ingestion (changelog+bump, en paralelo), 11 borrado tags/releases publicados (en paralelo con 8-10, usa el inventario del 1 y el respaldo del 2).
- **Wave 4 (recreación + verificación, 3 todos):** 12 recrear tags (tras 8-11), 13 recrear releases (tras 12), 14 verificación final (tras 5,12,13,18,19,20).
- **Wave 5 (enterprise base, 3 todos):** 15 environments, 16 higiene PR, 17 dry-run migraciones. Sin archivos compartidos entre sí.
- **Wave 6 (enterprise cierre, 3 todos):** 18 smoke (tras 17, mismos workflows), 19 secciones enterprise del flow (tras 6), 20 script borrador (independiente).

### Dependency matrix

| Todo                         | Depends on            | Blocks        | Can parallelize with |
| ---------------------------- | --------------------- | ------------- | -------------------- |
| 1 inventario                 | —                     | 3, 11, 12, 13 | 2, 3, 4              |
| 2 respaldo                   | —                     | 11            | 1, 3, 4              |
| 3 mapeo commits              | 1                     | 6, 8, 9, 10   | 1, 2, 4              |
| 4 grep refs                  | —                     | 5, 7          | 1, 2, 3              |
| 5 demolición                 | 4                     | 14            | 6, 7                 |
| 6 RELEASE-FLOW.md            | 3                     | 8, 9, 10      | 5, 7                 |
| 7 root delete + links        | 4                     | 14            | 5, 6                 |
| 8 backend changelog+bump     | 3, 6                  | 12, 13        | 9, 10, 11            |
| 9 frontend changelog+bump    | 3, 6                  | 12, 13        | 8, 10, 11            |
| 10 ingestion changelog+bump  | 3, 6                  | 12, 13        | 8, 9, 11             |
| 11 borrar tags/releases      | 1, 2                  | 12            | 8, 9, 10             |
| 12 recrear tags              | 8, 9, 10, 11          | 13            | —                    |
| 13 recrear releases          | 12                    | 14            | —                    |
| 14 verificación final        | 5, 12, 13, 18, 19, 20 | —             | —                    |
| 15 environments              | —                     | 14            | 16, 17               |
| 16 higiene PR                | —                     | 14            | 15, 17               |
| 17 dry-run migraciones       | —                     | 14, 18        | 15, 16               |
| 18 smoke post-deploy         | 17                    | 14            | 19, 20               |
| 19 secciones enterprise flow | 6                     | 14            | 18, 20               |
| 20 script borrador changelog | —                     | 14            | 18, 19               |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPENDED BELOW - never rewrite the headers above. -->

- [x] 1. Inventariar tags + releases + versiones actuales
     What to do / Must NOT do: `git tag --list` completo, `gh release list --limit 50` (incl. drafts), versiones de `package.json` raíz + 3 apps, lista de archivos release-please (workflow, config, manifest, troubleshooting, docs). Guardar todo en TSV/log. Must NOT: mutar nada (solo lectura + evidencia).
     Parallelization: Wave 1 | Blocked by: — | Blocks: 3, 11, 12, 13
     References: `.github/workflows/release-please.yml`, `.github/release-please-config.json`, `.github/release-please-manifest.json`, `CHANGELOG.md`, `apps/*/CHANGELOG.md`, `apps/*/package.json`.
     Acceptance criteria: existe `.omo/evidence/task-1-manual-release-flow.tsv` con tags, releases (con estado draft/publicado), versiones y archivos, conteos incluidos.
     QA scenarios: happy `gh release list` exit 0; failure API sin red → reintento ×3 y BLOCKED con el error. Evidence `.omo/evidence/task-1-manual-release-flow.tsv`
     Commit: N.

- [x] 2. Respaldar estado actual (reversibilidad del borrado)
     What to do / Must NOT do: exportar los 4 changelogs íntegros + `gh release view` (notas) de cada release + `git show-ref --tags` a `.omo/evidence/task-2-backup/` (un archivo por artefacto). Must NOT: modificar repo ni remoto.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 11
     References: salidas del todo 1.
     Acceptance criteria: `.omo/evidence/task-2-backup/` contiene ≥ (4 changelogs + N notas de release + 1 tag-list) y `diff` contra originales vacío.
     QA scenarios: happy todos los exports exit 0; failure release ya borrado a destiempo → abortar y BLOCKED antes de cualquier delete. Evidence `.omo/evidence/task-2-manual-release-flow.log`
     Commit: N (evidencia gitignored).

- [x] 3. Mapear commits→app (base para entradas correctas y versiones)
     What to do / Must NOT do: para cada merge-commit desde v1.3.0 (`git log --merges`), clasificar por paths tocados (`apps/backend`, `apps/frontend`, `apps/ingestion-telegram`, compartido) y anotar tipo (feat/fix/breaking real). Salida TSV: commit, PR, apps, tipo, breaking-sí/no-con-evidencia. Must NOT: juzgar sin citar el diff (`git show --stat` por commit dudoso).
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 6, 8, 9, 10
     References: `git log --merges`, `apps/backend/CHANGELOG.md` (versiones 1.3.0→4.0.0 como contraparte a auditar).
     Acceptance criteria: `.omo/evidence/task-3-manual-release-flow.tsv` cubre todos los merges desde v1.3.0 sin filas vacías.
     QA scenarios: happy cobertura 100% merges; failure commit ambiguo → fila `UNVERIFIED` explícita, no bloquear. Evidence `.omo/evidence/task-3-manual-release-flow.tsv`
     Commit: N.

- [x] 4. Grepear referencias a release-please (qué rompería quitarlo)
     What to do / Must NOT do: `git grep -n` de `release-please|paths_released|releases_created|backend_tag|frontend_tag|manifest` en workflows, scripts y docs. Lista archivo:línea + veredicto por hit (propio-del-sistema-a-borrar vs consumidor-externo-a-migrar). Must NOT: editar nada.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 5, 7
     References: `.github/workflows/` (todos), `scripts/`, `docs/`.
     Acceptance criteria: `.omo/evidence/task-4-manual-release-flow.tsv` sin hits sin veredicto.
     QA scenarios: happy grep exit 0; failure hit en workflow crítico (deploy) → marcar `MIGRAR` y avisar en el reporte, no tocar. Evidence `.omo/evidence/task-4-manual-release-flow.tsv`
     Commit: N.

- [x] 5. Demoler la automatización release-please
     What to do / Must NOT do: `git rm` workflow `release-please.yml` + `.github/release-please-config.json` + `.github/release-please-manifest.json` + `RELEASE_TROUBLESHOOTING.md`; `docs/release-process.md` → reemplazar por puntero de 5 líneas a `RELEASE-FLOW.md`; corregir los links rotos del todo 4 que apunten a lo borrado. Must NOT: tocar ningún otro workflow, ni código, ni secretos.
     Parallelization: Wave 2 | Blocked by: 4 | Blocks: 14
     References: lista del todo 4 (qué borrar y qué links arreglar).
     Acceptance criteria: `git status` muestra solo esos deletes/edits; `git grep -ril release-please -- .github/ docs/` vacío salvo menciones históricas intencionales en RELEASE-FLOW.md.
     QA scenarios: happy YAML/workflows restantes parsean (`python3 -c yaml.safe_load_all`); failure link roto residual → lista UNVERIFIED + fix en el mismo diff. Evidence `.omo/evidence/task-5-manual-release-flow.log`
     Commit: Y | `chore(release): remove release-please automation`.

- [x] 6. Crear RELEASE-FLOW.md (proceso + criterios)
     What to do / Must NOT do: crear `RELEASE-FLOW.md` raíz: cuándo releassear, juicio major/minor/patch con 2+ ejemplos REALES del repo (del TSV del 3, citando commits), pasos exactos (bump package.json → entrada changelog → tag `app-vX.Y.Z` → `gh release create` con notas → checklist), y regla anti-duplicados (una entrada por cambio, scopes correctos). Must NOT: copiar texto del sistema viejo sin adaptar; NO tocar otros archivos.
     Parallelization: Wave 2 | Blocked by: 3 | Blocks: 8, 9, 10
     References: TSV del todo 3 (ejemplos), `docs/release-process.md` (qué NO repetir).
     Acceptance criteria: `RELEASE-FLOW.md` existe con las 5 secciones (cuándo, juicio+ejemplos, pasos, checklist, anti-duplicados) y cada ejemplo cita commit real.
     QA scenarios: happy estructura completa; failure ejemplo sin commit → reescribir ejemplo, no inventar. Evidence `.omo/evidence/task-6-manual-release-flow.log`
     Commit: Y | `docs(release): add manual RELEASE-FLOW.md`.

- [x] 7. Eliminar root CHANGELOG + arreglar links
     What to do / Must NOT do: `git rm CHANGELOG.md` (muerto desde agosto); grepear links hacia él (`](#changelog`, `CHANGELOG.md`, badges) y re-apuntar a los changelogs por app o eliminar si huérfanos. Must NOT: tocar changelogs de apps (todos 8-10).
     Parallelization: Wave 2 | Blocked by: 4 | Blocks: 14
     References: `CHANGELOG.md:1-17`, lista de links del todo 4.
     Acceptance criteria: `ls CHANGELOG.md` falla (borrado) + `git grep -n '](.*CHANGELOG.md)'` vacío o solo intencional.
     QA scenarios: happy 0 links rotos (`grep` post); failure link en README/docs externa → actualizar, no dejar roto. Evidence `.omo/evidence/task-7-manual-release-flow.log`
     Commit: Y | `docs(release): remove dead root CHANGELOG`.

- [x] 8. Reescribir CHANGELOG backend + bump versión — REWORK 2026-09-11 DONE (escalera Unreleased+4.0.0+3.1.0+2.1.0, 17 entradas, package.json intacto)
     What to do / Must NOT do: reescribir `apps/backend/CHANGELOG.md`: dedup (una entrada por cambio), cada entrada atribuida con su commit/PR real (del TSV del 3), versiones juzgadas con criterios del 6 (breaking reales → major solo donde aplique); `apps/backend/package.json` version = nueva versión juzgada. Must NOT: inventar entradas; NO tocar otras apps.
     Parallelization: Wave 3 | Blocked by: 3, 6 | Blocks: 12, 13
     References: TSV todo 3, criterios todo 6, `apps/backend/CHANGELOG.md`, `apps/backend/package.json`.
     Acceptance criteria: 0 líneas duplicadas adyacentes + `python3 -m json.tool apps/backend/package.json` exit 0 + versión changelog == package.json.
     QA scenarios: happy parse + match; failure entrada sin commit → UNVERIFIED y fuera del changelog. Evidence `.omo/evidence/task-8-manual-release-flow.log`
     Commit: Y | `docs(release): rewrite backend changelog`.

- [x] 9. Reescribir CHANGELOG frontend + bump versión
     What to do / Must NOT do: mirror del 8 para `apps/frontend/` (dedup, atribución real, versión juzgada, package.json sync). Must NOT: dejar entradas de backend/ingestion (van a su app).
     Parallelization: Wave 3 | Blocked by: 3, 6 | Blocks: 12, 13
     References: TSV todo 3, criterios todo 6, `apps/frontend/CHANGELOG.md:7-10` (duplicados conocidos), `apps/frontend/package.json`.
     Acceptance criteria: 0 duplicados + 0 entradas ajenas + json válido + versión match.
     QA scenarios: mirror del 8. Evidence `.omo/evidence/task-9-manual-release-flow.log`
     Commit: Y | `docs(release): rewrite frontend changelog`.

- [x] 10. Reescribir CHANGELOG ingestion-telegram + bump versión
      What to do / Must NOT do: mirror del 8 para `apps/ingestion-telegram/` (dedup, atribución real, versión juzgada, package.json sync).
      Parallelization: Wave 3 | Blocked by: 3, 6 | Blocks: 12, 13
      References: TSV todo 3, criterios todo 6, `apps/ingestion-telegram/CHANGELOG.md:7-9`, `apps/ingestion-telegram/package.json`.
      Acceptance criteria: 0 duplicados + 0 entradas ajenas + json válido + versión match.
      QA scenarios: mirror del 8. Evidence `.omo/evidence/task-10-manual-release-flow.log`
      Commit: Y | `docs(release): rewrite ingestion changelog`.

- [x] 11. Borrar tags + releases publicados (con respaldo previo)
      What to do / Must NOT do: SOLO tras verificar respaldo del 2 íntegro: `git push --delete origin <cada tag v*>` + `git tag -d <cada>` + `gh release delete <cada> --yes` (incl. draft v1.3.2). Lista exacta desde el inventario del 1. Must NOT: tocar ramas (prohibido force-push: esto solo borra tags/releases, autorizado explícito); NO borrar nada sin respaldo verificado.
      Parallelization: Wave 3 | Blocked by: 1, 2 | Blocks: 12
      References: inventario todo 1, respaldo todo 2.
      Acceptance criteria: `git tag --list` vacío de v\* + `gh release list` vacío (o solo lo recreado después) + evidencia con antes/después.
      QA scenarios: happy deletes exit 0 + verificación; failure un tag no existe → registrar y seguir (idempotente); failure red/BORRADO parcial → STOP + BLOCKED con estado exacto, jamás reintentar a ciegas. Evidence `.omo/evidence/task-11-manual-release-flow.log`
      Commit: N (mutación remota, no commit).

- [x] 12. Recrear tags por app
      What to do / Must NOT do: por cada app, `git tag -a <app>-v<X.Y.Z> <sha-base> -m "<app> v<X.Y.Z>"` con versiones juzgadas (8-10) + `git push origin <tags>`. Orden: backend, frontend, ingestion. Must NOT: reusar namespace `v*` pelado (colisiona con lo borrado y confunde).
      Parallelization: Wave 4 | Blocked by: 8, 9, 10, 11 | Blocks: 13
      References: versiones de los todos 8-10.
      Acceptance criteria: `git tag --list` muestra exactamente los 3 tags nuevos + `git ls-remote --tags` los confirma en remoto.
      QA scenarios: happy push exit 0; failure tag ya existe → verificar SHA (si es nuestro, seguir; si no, BLOCKED). Evidence `.omo/evidence/task-12-manual-release-flow.log`
      Commit: N.

- [x] 13. Recrear GitHub releases con notas
      What to do / Must NOT do: por cada app, `gh release create <app>-v<X.Y.Z> --title --notes-file <sección del changelog corregido>` (notas = texto del changelog, no inventado). Must NOT: marcar latest a mano en los 3 (solo el más relevante o ninguno; documentar elección).
      Parallelization: Wave 4 | Blocked by: 12 | Blocks: 14
      References: changelogs 8-10, tags del 12.
      Acceptance criteria: `gh release list` muestra las 3 con notas no vacías que matchean sus changelogs.
      QA scenarios: happy create exit 0 ×3; failure release duplicado → `gh release view` primero, no duplicar. Evidence `.omo/evidence/task-13-manual-release-flow.log`
      Commit: N.

- [x] 14. Verificación final anti-restos
      What to do / Must NOT do: `git grep -ril release-please` (debe estar vacío salvo menciones históricas en RELEASE-FLOW.md/learnings), changelogs parsean estructura (headers `## [` por versión), `package.json` ×3 parsean y matchean changelogs, `git tag`/`gh release list` limpios, `npm run docs:check` sin warnings nuevos, links a changelogs resuelven.
      Parallelization: Wave 4 | Blocked by: 5, 12, 13 | Blocks: —
      References: todo el árbol + `.github/workflows/` + `docs/`.
      Acceptance criteria: checklist 6/6 verde en evidencia.
      QA scenarios: happy todo verde; failure resto release-please → quitarlo (edición mínima, commit aparte `chore(release): remove leftover`); failure warning docs nuevo → UNVERIFIED + reporte. Evidence `.omo/evidence/task-14-manual-release-flow.log`
      Commit: N (salvo leftover → Y indicado).

- [x] 15. Configurar environments (staging auto, prod con cooling-off)
      What to do / Must NOT do: vía `gh api` crear/actualizar environments `staging` (sin gate) y `production` (wait_timer 600s como cooling-off + historial de deployments por env); SIN required reviewers (solo-dev: auto-aprobarse es teatro — el gate real es tu merge manual + checklist). Verificar con API GET. Must NOT: configurar reviewers; NO tocar workflows aquí.
      Parallelization: Wave 5 | Blocked by: — | Blocks: 14
      References: `.github/workflows/deploy-staging.yml:121` (environment staging existente como plantilla).
      Acceptance criteria: API GET muestra `production` con wait_timer + `staging` sin gate; historial de deployments visible por env.
      QA scenarios: happy reglas visibles; failure API 403/422 → registrar respuesta + BLOCKED (requiere admin = owner). Evidence `.omo/evidence/task-15-manual-release-flow.log`
      Commit: N (config remota, no repo).

- [x] 16. Higiene PR: title-lint + convención squash
      What to do / Must NOT do: crear `.github/workflows/pr-title-lint.yml` (conventional-commits en título de PR, action estándar pineada por SHA) y añadir a RELEASE-FLOW.md la sección de convención squash-message. SIN CODEOWNERS (solo-dev: ruido). Must NOT: cambiar reglas de branch protection (solo owner en consola).
      Parallelization: Wave 5 | Blocked by: — | Blocks: 14
      References: `commitlint.config.js` (tipos permitidos — reutilizar la misma lista).
      Acceptance criteria: workflow existe, YAML parsea, sección squash presente en RELEASE-FLOW.md.
      QA scenarios: happy parse; failure action sin SHA pineado → pinealo, no usar tags flotantes. Evidence `.omo/evidence/task-16-manual-release-flow.log`
      Commit: Y | `ci: add PR title lint`.

- [x] 17. Dry-run de migraciones en deploys
      What to do / Must NOT do: en `deploy.yml` y `deploy-staging.yml`, insertar ANTES del step `migration:run` un step `migration:dry-run` (`migration:show`/validate + `SELECT` de precondiciones, fail ruidoso sin mutar). Misma forma en ambos (source-first env como el patrón todo-11/oracle). Must NOT: cambiar la lógica de migrate/up/health; NO tocar deploy-ingestion.yml (sin migraciones propias).
      Parallelization: Wave 5 | Blocked by: — | Blocks: 14, 18
      References: `.github/workflows/deploy.yml:169-200`, `deploy-staging.yml:254-261` (steps actuales).
      Acceptance criteria: diff = 2 steps nuevos (uno por workflow), YAML parses.
      QA scenarios: happy parse; failure el step muta algo → reescribir a solo-lectura, re-verificar. Evidence `.omo/evidence/task-17-manual-release-flow.log`
      Commit: Y | `ci(deploy): add migration dry-run before migrate`.

- [x] 18. Smoke post-deploy (script + steps)
      What to do / Must NOT do: crear `scripts/smoke-prod.sh` (bash `set -euo pipefail`: healths `:3030/:5173/:3032` + `recent?limit=1` + SSE probe, URLs parametrizables por env con defaults loopback, timeouts explícitos, salida PASS/FAIL por check + exit code) + step que lo invoca al final de `deploy.yml` y `deploy-staging.yml` (ajustando puertos por env). Probarlo en seco localmente contra Oracle (solo lectura: healths + recent limit=1, NUNCA publish). Must NOT: publicar nada real; NO hardcodear IPs (variables con default).
      Parallelization: Wave 6 | Blocked by: 17 | Blocks: 14
      References: gate deploy.yml:146-167 (checks a espejar), flags del plan oracle (raw pipeline).
      Acceptance criteria: `bash -n scripts/smoke-prod.sh` OK + dry-run local con TODO verde + steps presentes en ambos workflows + YAML parses.
      QA scenarios: happy dry-run verde; failure un check rojo contra Oracle → clasificar (degradado-conocido vs rojo-real) en evidencia, no bloquear por degradados del gateway. Evidence `.omo/evidence/task-18-manual-release-flow.log`
      Commit: Y | `ci(deploy): add post-deploy smoke checks`.

- [x] 19. Secciones enterprise en RELEASE-FLOW.md (escala solo-dev)
      What to do / Must NOT do: append a `RELEASE-FLOW.md` (NO reescribir lo del 6): rollback playbook (pasos revert + re-deploy + verificación + RTO declarado 30 min), flujo hotfix (`hotfix/*`, checklist reducida pero con smoke obligatorio), congelamiento de flags en release, firma de tags OPCIONAL (cómo generar GPG + `git tag -s`, marcado como setup manual pendiente, no requerido). Además, 2 secciones de estrategia changelog (decisión owner: unidad = PR mergeado a master/squash, NUNCA commits atómicos; incluir solo cambios visibles a usuario —feat/fix/breaking/deprecation/perf-con-impacto/security— y excluir chores/CI/docs/refactor-sin-cambio/syncs/tests; una bala por PR con `(PR #NN)`; convención `## [Unreleased]` + insertar ese header al tope de los 3 changelogs). SIN trenes/freeze calendar (teatro para una persona: releassea cuando esté verde + checklist) y SIN notificaciones (v2). Must NOT: tocar otras secciones del 6 salvo índice.
      Parallelization: Wave 6 | Blocked by: 6 | Blocks: 14
      References: `RELEASE-FLOW.md` del todo 6 (estructura a extender).
      Acceptance criteria: las 6 secciones existen con comandos exactos (firma marcada opcional/pendiente) + headers `## [Unreleased]` presentes en los 3 changelogs.
      QA scenarios: happy estructura + comandos; failure comando sin verificar → marcar UNVERIFIED, no inventar. Evidence `.omo/evidence/task-19-manual-release-flow.log`
      Commit: Y | `docs(release): add rollback-hotfix playbooks`.

- [x] 20. Script borrador de changelog + prueba
      What to do / Must NOT do: crear `scripts/draft-changelog.sh <app> <since-tag>` (bash: `git log` por path + formato Keep-a-Changelog por tipo feat/fix/otros, con SHAs; NUNCA escribe changelogs, solo stdout/archivo en /tmp). Probarlo contra un rango pasado (ej. v3.0.1..v4.0.0 backend) y comparar con el changelog reescrito del 8 (muestra + diff cualitativo en evidencia). Must NOT: auto-editar changelogs (el humano edita y firma, siempre).
      Parallelization: Wave 6 | Blocked by: — | Blocks: 14
      References: `apps/backend/CHANGELOG.md` reescrito (muestra de comparación).
      Acceptance criteria: script ejecutable + salida sample coherente con el changelog manual (spot-check 5 entradas con commit real).
      QA scenarios: happy sample match; failure entrada sin commit → bug del script, fix + re-test. Evidence `.omo/evidence/task-20-manual-release-flow.log`
      Commit: Y | `chore(release): add changelog draft script`.

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit — APPROVE
- [x] F2. Code quality review — APPROVE
- [x] F3. Real manual QA — APPROVE
- [x] F4. Scope fidelity — APPROVE

## Commit strategy

- Commits pequeños y convencionales por todo con Commit:Y (5 demolición, 6 flow, 7 root-delete, 8/9/10 por app, 14-leftover si aplica). Push a `dev` + PR a `master` por GOVERNANCE (el worker deja PRs ABIERTOS, jamás mergea).
- Tags/releases se crean/borran vía `git`/`gh` (no son commits); cada mutación remota con evidencia antes/después.
- Rollback: `git revert` por commit; tags recreables desde el respaldo del todo 2.

## Success criteria

- Cero restos release-please (grep vacío salvo histórico intencional).
- 3 changelogs sin duplicados, entradas con commit real, versiones independientes juzgadas y sincronizadas en package.json.
- Tags `backend-v*`/`frontend-v*`/`ingestion-v*` (+ v\* viejos fuera); releases recreados con notas que matchean.
- RELEASE-FLOW.md existe con proceso + criterios + ejemplos reales.
- `npm run docs:check` sin warnings nuevos.
