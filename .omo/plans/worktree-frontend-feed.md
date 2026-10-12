# worktree-frontend-feed - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Un registro `WORKTREE.md` en la raíz que lista cada espacio de trabajo con su propósito y sus archivos, más un espacio aislado solo para la pantalla de noticias (feed) corriendo en su propio puerto.

**Why this approach:** Primero el registro y después el espacio: así nadie crea un segundo worktree que pise al primero, y si un cambio futuro encaja en el espacio existente se reusa en vez de duplicar. El feed comparte el backend principal para no duplicar servicios.

**What it will NOT do:** No toca el código del feed, no crea el espacio de KOLs, no duplica backend ni Telegram, y no fusiona nada solo: deja la solicitud de integración a `dev` abierta para tu aprobación.

**Effort:** Short
**Risk:** Low - solo añade un doc y un checkout aislado; el único roce es el puerto 5184 si ya está ocupado (tiene fallback).
**Decisions to sanity-check:** Path `../onchain-bot-feat-feed`, puerto `:5184`, rama `feat/feed-frontend` desde `dev`, y que el registro solo se edite en el principal.

Your next move: aprueba para `$start-work`, o pide la revisión de alta precisión (doble Momus) antes. Full execution detail follows below.

---

> TL;DR (machine): Short effort, Low risk; WORKTREE.md registry + 1 frontend-feed worktree (:5184) + PR to dev left open.

## Scope

### Must have

- `WORKTREE.md` en raíz, rama `dev`: qué es un worktree en este repo (SOLO-GIT, opencode 1.18.34), tabla registro + sección `## frontend-feed` (propósito|rama `feat/feed-frontend`|base `dev`|path `../onchain-bot-feat-feed`|puertos `5184` vs `5173` principal + backend compartido `3030`|scope IN con los 8 grupos feed|scope OUT|estado|cuándo reusar), regla reuso-primero, sección cierre-PR a `dev`, invariantes (misma rama nunca ×2, `remove` exige limpio, `strictPort`, `GOVERNANCE.md` feat/\* desde dev, registry solo se edita en principal), comandos canónicos add/list/remove/prune.
- Un worktree: `git worktree add ../onchain-bot-feat-feed -b feat/feed-frontend dev` + `npm install` + `cp apps/frontend/.env.development` desde principal + Vite `:5184` contra backend `:3030` + sesión `opencode` nueva en ese dir.
- Verificación agent-ejecutable + PR abierto a `dev` (`gh pr create --base dev`, dejar para merge humano) + limpieza (`remove` + `prune`) + sección marcada archivada.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO worktree /kol, NO cambios de código /feed, NO features, NO subcomando `opencode worktree`, NO merge automático del PR, NO backend/ingestión duplicados en el worktree, NO `git reset --hard` / `revert --no-commit` / force-push, NO commitear en `master`, NO borrar el worktree principal, NO dos worktrees con la misma rama.

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: none (infra/doc task, no product code) + agent-executed QA per todo (happy + failure con herramienta exacta + evidencia).
- Evidence: .omo/evidence/task-<N>-worktree-frontend-feed.<ext> (salidas de git/gh/curl/vite).
- Pre-checks Metis (asumir-nada): `git branch --show-current` (=dev), `git status --porcelain`, `git worktree list`, path `../onchain-bot-feat-feed` libre, puertos `5184`/`3030` libres, `GOVERNANCE.md` + `apps/frontend/vite.config.ts` leídos.

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 1 (secuencial, 3 todos): pre-checks → WORKTREE.md → worktree add + bootstrap. El doc manda sobre el add; el add depende del doc committeado en dev.
- Wave 2 (1 todo): verificación punta a punta (list + cat + curl + status).
- Wave 3 (1 todo): cierre PR a dev + limpieza + archivo de sección. Merge humano fuera del plan.

### Dependency matrix

| Todo                   | Depends on | Blocks | Can parallelize with |
| ---------------------- | ---------- | ------ | -------------------- |
| 1 pre-checks           | —          | 2, 3   | —                    |
| 2 WORKTREE.md          | 1          | 3, 4   | —                    |
| 3 worktree+bootstrap   | 1, 2       | 4      | —                    |
| 4 verificación e2e     | 3          | 5      | —                    |
| 5 cierre PR + limpieza | 4          | —      | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Pre-checks en principal dev (no asumir nada)
     What to do / Must NOT do: Corre en /Users/bryanstevens/dev/onchain-bot: git branch --show-current (espera dev), git status --porcelain, git worktree list, ls ../onchain-bot-feat-feed (debe NO existir), puertos libres (lsof -i :5184 y :3030 o equivalente), lee GOVERNANCE.md (branch model) y apps/frontend/vite.config.ts (strictPort). Must NOT do: ningún git worktree add/remove, ningún reset, no tocar product code.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 2, 3
     References (executor has NO interview context - be exhaustive): GOVERNANCE.md; apps/frontend/vite.config.ts (strictPort 127.0.0.1:5173); /Users/bryanstevens/.agents/skills/worktree-opencode/ (sección 1 SOLO-GIT, opencode 1.18.34); .omo/drafts/worktree-frontend-feed.md (gate aprobado).
     Acceptance criteria (agent-executable): `git branch --show-current` → dev; `git worktree list` → 1 línea (solo principal); `../onchain-bot-feat-feed` inexistente; `:5184` libre, `:3030` ocupado por backend principal (o libre si backend parado — registrar cuál).
     QA scenarios (name the exact tool + invocation): happy: bash `git worktree list && git status --porcelain` → 1 línea + limpio salvo untracked .omo, Evidence .omo/evidence/task-1-worktree-frontend-feed.txt. failure: bash `git worktree add ../onchain-bot-feat-feed feat/feed-frontend` en dry-run mental → si rama ya usada en otro worktree debe fallar con 'already used by worktree' y el todo se detiene (no --force), Evidence misma.
     Commit: N | —
- [x] 2. Crear WORKTREE.md en raíz dev (registry + reuso-primero + cierre-PR)
     What to do / Must NOT do: Crea WORKTREE.md en raíz del repo (rama dev): título + qué es un worktree aquí (SOLO-GIT, 1.18.34 trampa TUI) + tabla registro (worktree|rama|base|path|puertos|propósito|scope IN/OUT|estado) + sección `## frontend-feed` con rama feat/feed-frontend, base dev, path ../onchain-bot-feat-feed, puertos 5184/3030, propósito (trabajar /feed frontend sin rozar /kol), scope IN (los 8 grupos: apps/frontend/src/pages/feed/, entities/feed/, entities/feed-session/, features/manage-feed-sources/, features/feed-publisher/, widgets/live-feed/ui/live-feed.tsx, widgets/feed-sessions/, shared/api/feed-publisher-base.ts), scope OUT (/kols, backend, ingestion, otros widgets), estado activo, cuándo reusar + regla reuso-primero + sección cierre-PR (push + gh pr create --base dev + CI + 1 aprobación + hilos resueltos + remove + prune + archivar) + cómo añadir el próximo (reservar feat/kol-frontend + ../onchain-bot-feat-kol + :5185) + comandos canónicos + invariantes. Must NOT do: no crear worktrees aquí, no tocar código feed, no commitear en master.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 4
     References (executor has NO interview context - be exhaustive): .omo/drafts/worktree-frontend-feed.md (contenido exacto de secciones); apps/frontend/src/pages/feed/; apps/frontend/src/entities/feed/; apps/frontend/src/entities/feed-session/; apps/frontend/src/features/manage-feed-sources/; apps/frontend/src/features/feed-publisher/; apps/frontend/src/widgets/live-feed/ui/live-feed.tsx; apps/frontend/src/widgets/feed-sessions/; apps/frontend/src/shared/api/feed-publisher-base.ts; GOVERNANCE.md; GIT-FLOW.md.
     Acceptance criteria (agent-executable): `ls WORKTREE.md` existe; `grep -c '## frontend-feed' WORKTREE.md` → ≥1; `grep -c 'reuso' WORKTREE.md` → ≥1 (regla reuso-primero presente); `grep -c 'gh pr create --base dev' WORKTREE.md` → ≥1.
     QA scenarios (name the exact tool + invocation): happy: bash `cat WORKTREE.md | head -60` muestra tabla + sección feed, Evidence .omo/evidence/task-2-worktree-frontend-feed.md. failure: bash `git status --porcelain WORKTREE.md` → si hooks/docs:check advierten staleness, registrar warning y seguir (docs:check es non-blocking), Evidence misma.
     Commit: Y | docs(worktree): add WORKTREE.md registry with frontend-feed entry
- [x] 3. Crear worktree feed + bootstrap + Vite :5184 + sesión nueva
     What to do / Must NOT do: Desde principal: `git worktree add ../onchain-bot-feat-feed -b feat/feed-frontend dev`; dentro: `npm install`; `cp /Users/bryanstevens/dev/onchain-bot/apps/frontend/.env.development apps/frontend/.env.development` (si no existe en principal, omitir cp y registrar defaults); arrancar `cd apps/frontend && npm run dev -- --port 5184 --strictPort false`; abrir sesión opencode nueva en `../onchain-bot-feat-feed`. Backend :3030 del principal se comparte (documentado como excepción local al 1:1 per-env, solo para UI). Must NOT do: no usar `opencode worktree`, no `-b` sobre rama existente, no symlink node_modules, no copiar sesiones MTProto (no aplica a frontend), no matar procesos por patrón (PID explícito).
     Parallelization: Wave 1 | Blocked by: 1, 2 | Blocks: 4
     References (executor has NO interview context - be exhaustive): .omo/drafts/worktree-frontend-feed.md; /Users/bryanstevens/.agents/skills/worktree-opencode/ (sección 1 y 3); apps/frontend/vite.config.ts; apps/frontend/.env.development (si existe); WORKTREE.md (recién creado).
     Acceptance criteria (agent-executable): `git worktree list` → 2 líneas (principal + feat-feed); `ls ../onchain-bot-feat-feed/apps/frontend/src/pages/feed/` existe; `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5184` → 200 (o 304 con Vite HMR).
     QA scenarios (name the exact tool + invocation): happy: bash `git worktree list && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5184`, Evidence .omo/evidence/task-3-worktree-frontend-feed.txt. failure: bash `npm run dev -- --port 5184` con :5184 ocupado → Vite debe fallar con 'Port is in use' y el agente reintenta en :5186 y actualiza WORKTREE.md, Evidence misma.
     Commit: N | — (el trabajo del worktree commitea en su rama feat/feed-frontend, no en principal)
- [x] 4. Verificación punta a punta del worktree
     What to do / Must NOT do: Verifica: `git worktree list` (2 líneas), `cat WORKTREE.md` (sección feed + reuso + cierre-PR), `git status` (limpio salvo untracked), `curl :5184` OK, backend `:3030/api/health` alcanzable desde el worktree (proxy compartido). Must NOT do: no modificar archivos para que pase, no saltarse el curl.
     Parallelization: Wave 2 | Blocked by: 3 | Blocks: 5
     References (executor has NO interview context - be exhaustive): WORKTREE.md; ../onchain-bot-feat-feed/apps/frontend/src/pages/feed/; backend :3030/api/health.
     Acceptance criteria (agent-executable): las 4 sondas en verde: worktree list=2, WORKTREE.md con 3 marcadores (## frontend-feed + reuso + gh pr create), curl :5184 ∈ {200,304}, curl :3030/api/health ∈ {200}.
     QA scenarios (name the exact tool + invocation): happy: bash script que corre las 4 sondas y guarda salida, Evidence .omo/evidence/task-4-worktree-frontend-feed.txt. failure: si curl :5184 falla → bash `lsof -i :5184` diagnostica choque y se registra puerto alternativo, Evidence misma.
     Commit: N | —
- [ ] 5. Cierre: PR a dev + limpieza + archivar sección
     What to do / Must NOT do: Cuando el trabajo feed termine: desde el worktree `git push -u origin feat/feed-frontend`; `gh pr create --base dev --head feat/feed-frontend --title 'feat(feed): <resumen>' --body 'Worktree: ../onchain-bot-feat-feed. Registry: WORKTREE.md ## frontend-feed'`; verifica `gh pr view` + checks CI; DEJAR el PR abierto para merge humano (no mergear); luego `git worktree remove ../onchain-bot-feat-feed` (árbol limpio o commitear/stash primero) + `git worktree prune`; en principal dev marca la sección ## frontend-feed como archivada. Must NOT do: no mergear solo, no --force en remove con cambios sin aviso, no borrar principal, no `git branch -D` hasta mergeado.
     Parallelization: Wave 3 | Blocked by: 4 | Blocks: —
     References (executor has NO interview context - be exhaustive): GOVERNANCE.md (1 aprobación + CI + hilos resueltos, squash a master vía dev); GIT-FLOW.md (sync dev↔master manual post-merge); WORKTREE.md (sección cierre-PR).
     Acceptance criteria (agent-executable): `gh pr view --base dev --head feat/feed-frontend` existe y está OPEN; `git worktree list` vuelve a 1 línea; WORKTREE.md dice `estado: archivada` en ## frontend-feed.
     QA scenarios (name the exact tool + invocation): happy: bash `gh pr view <url> --json state,baseRefName,headRefName,statusCheckRollup` → OPEN + dev, Evidence .omo/evidence/task-5-worktree-frontend-feed.json. failure: bash `git worktree remove` con árbol sucio → rechaza (esperado) y el agente commitea/stashea y reintenta sin --force salvo instrucción explícita, Evidence misma.
     Commit: Y | docs(worktree): mark frontend-feed archived after PR to dev

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

- Todo 2 (principal dev): `docs(worktree): add WORKTREE.md registry with frontend-feed entry` — 1 commit, conventional commits (commitlint), hooks pre-commit permiten docs (docs:check solo warning).
- Todos 1, 3, 4: sin commit (infra/verificación).
- Todo 5: `docs(worktree): mark frontend-feed archived after PR to dev` en principal; el código feed vive en `feat/feed-frontend` y su PR (squash a dev tras 1 aprobación + CI). Nunca commitear en master; no borrar rama hasta mergeado.

## Success criteria

- WORKTREE.md existe en dev con tabla + sección ## frontend-feed + regla reuso-primero + cierre-PR (3 greps en verde).
- `git worktree list` pasó de 1 → 2 → 1 (creación + limpieza) con evidencias.
- Vite feed sirvió en :5184 (curl 200/304) contra backend :3030 compartido.
- PR `feat/feed-frontend → dev` quedó OPEN y verificado; worktree removido y prune limpio.

## Addendum A — sync protocol (2026-10-01, verificado confirmed)

- Añadida sección `## Sincronización entre worktrees` a WORKTREE.md (commit `ad458051 docs(worktree): add sync protocol between worktrees` en dev, hooks limpios).
- Contenido: who-writes-what (compartidos solo en principal) + `fetch` + `merge origin/dev` por worktree + peek read-only (`git show dev:WORKTREE.md`) + loop completo.
- Evidencia: `.omo/evidence/task-6-worktree-frontend-feed.txt`. Verificación cruzada desde `../onchain-bot-feat-feed` OK.
- Addendum B: `feat/feed-frontend` avanzado en FF `3b8cfd9a→ad458051` dentro del worktree (merge local dev, sin rebase/force). Evidencia: `.omo/evidence/task-7-worktree-frontend-feed.txt`. Verificado confirmed.
- PENDIENTE: `3b8cfd9a` + `ad458051` existen solo en local `dev` (origin/dev va por detrás) → hacer `git push origin dev` cuando se quiera publicar el registro.
- Addendum C — worktree dexter-bot (2026-10-01, verificado confirmed): registrada sección `## dexter-bot` en WORKTREE.md (commit `0c4c49f6 docs(worktree): register dexter-bot worktree` en dev) + creado `../onchain-bot-feat-dexter` en rama NUEVA `feat/dexter-bot` + `npm install` (1450 pkgs) + baseline specs chain-dexter-bot 2 suites/19 tests PASS. Modo solo-editar (sin servidores, sin .env). Evidencias: `.omo/evidence/task-8-dexter-registry.txt`, `task-9-dexter-worktree.txt`.
- Addendum D — worktree kol global (2026-10-01, verificado confirmed): registrada sección `## kol` en WORKTREE.md (commit `7f804d19 docs(worktree): register kol worktree` en dev) + creado `../onchain-bot-feat-kol` en rama NUEVA `feat/kol` + `npm install` + baselines PASS (backend kol 8/54, kol-calls 40/166, kol-calls-publisher 68/247, frontend kol 1/4). Alcance: kol/ + ingestion/kol + kol-calls + kol-calls-publisher + frontend /kols. Modo solo-editar. Fix scope `d2a1d476` (telegram-kol inexistente → telegram/ingestion/kol). Evidencias: `task-10-kol-registry.txt`, `task-11-kol-worktree.txt`, `task-12-kol-scopefix.txt`.
