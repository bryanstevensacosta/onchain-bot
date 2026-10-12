---
slug: worktree-frontend-feed
status: approved
intent: clear
pending-action: done — plan written at .omo/plans/worktree-frontend-feed.md
approach: Doc-registry-first en dev (WORKTREE.md con secciones por worktree + regla reuso-primero + cierre-PR), luego un solo git worktree frontend-feed (SOLO-GIT), bootstrap npm install + cp env, Vite :5184 contra backend :3030 compartido.
---

# Draft: worktree-frontend-feed

## Components (topology ledger)

| id          | outcome                                                                                                   | status | evidence                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| C1-registry | WORKTREE.md en raíz dev con tabla + sección ## frontend-feed + regla reuso-primero + sección cierre-PR    | active | raíz sin WORKTREE.md (glob vacío + ls NO-WORKTREE-FILE, verificado 2026-10-01) |
| C2-worktree | git worktree add ../onchain-bot-feat-feed -b feat/feed-frontend dev + bootstrap + Vite :5184              | active | git worktree list solo principal; git status limpio salvo untracked .omo       |
| C3-verify   | verificación agent-ejecutable list + cat + status + curl :5184                                            | active | —                                                                              |
| C4-cierre   | push rama + gh pr create --base dev (dejar abierto para merge humano) + remove + prune + archivar sección | active | GOVERNANCE.md (dev integración, squash a master, 1 aprobación + CI)            |

## Open assumptions (announced defaults)

| assumption             | adopted default                                                    | rationale                                                             | reversible?                    |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------ |
| Path worktree          | ../onchain-bot-feat-feed                                           | evita choque con principal; convención ../<repo>-<rama> del skill     | sí (renombrable antes del add) |
| Puerto feed            | :5184 (principal :5173, backend :3030 compartido)                  | 5173 strictPort muere si ocupado; script cleanup solo cubre 3030/5173 | sí                             |
| Bootstrap              | npm install + cp apps/frontend/.env.development desde principal    | worktree no hereda node_modules ni .env gitignoreados                 | sí                             |
| Mantenimiento registry | solo se edita en principal dev; worktrees la heredan como snapshot | evita divergencia de la tabla                                         | sí                             |
| Merge PR               | humano (plan deja PR abierto y verificado)                         | GOVERNANCE exige aprobación + CI verde                                | sí                             |

## Findings (cited - path:lines)

- No existe WORKTREE.md en raíz (glob WORKTREE\* vacío; ls NO-WORKTREE-FILE).
- Principal en dev, worktree list solo principal, status limpio salvo untracked .omo/drafts|plans.
- Superficie /feed frontend (31 ficheros): apps/frontend/src/pages/feed/, entities/feed/, entities/feed-session/, features/manage-feed-sources/, features/feed-publisher/, widgets/live-feed/ui/live-feed.tsx, widgets/feed-sessions/, shared/api/feed-publisher-base.ts.
- apps/frontend/vite.config.ts: strictPort true en 127.0.0.1:5173 → worktree debe desplazar puerto.
- GOVERNANCE.md: ramas feat/\* desde dev, PR a dev, squash a master; hooks pre-commit (lint + tsc + branch guard) y pre-push (naming + tests).
- Env frontend gitignoreado: apps/frontend/.env.development (copiar desde principal).
- opencode 1.18.34 → SOLO-GIT (opencode worktree abre TUI, trampa; usar solo git worktree).
- Metis gap-check (ses_f0924c43dffea89spEec6c6sy3): shared-backend vs per-env/Oracle-alt-port; cleanup script no cubre :5184; asumir dev limpio/path libre/puertos libres sin verificar; falta disciplina PID-by-cwd en hosts compartidos. Todo plegado en todos como pre-checks y guardrails.

## Decisions (with rationale)

- Un solo worktree (frontend-feed); /kol aparcado fuera de scope — pedido explícito usuario.
- Doc primero en dev, worktree después — pedido explícito usuario (registry guía el add).
- Secciones por worktree + regla reuso-primero (si el cambio cabe en IN existente → reusar, no crear) — pedido explícito usuario.
- Cierre con PR a dev por worktree + limpieza — pedido explícito usuario.
- Rama feat/feed-frontend desde dev; bootstrap npm install + cp env; puerto :5184 — aprobados por usuario en interview.
- Subagent provider fix: oh-my-openagent.json opencode-zen/_ → opencode/_ (21 reemplazos, backup .bak-\*) porque opencode-zen no existe como provider (auth.json sin esa clave; opencode models opencode-zen = Provider not found); verificado con SMOKE-OK explore + Metis streaming en opencode/muse-spark.

## Scope IN

- WORKTREE.md raíz en dev (tabla + sección ## frontend-feed + reuso-primero + cierre-PR + comandos canónicos + invariantes).
- Un worktree ../onchain-bot-feat-feed (feat/feed-frontend desde dev) + bootstrap + Vite :5184 + sesión opencode nueva.
- Verificación agent-ejecutable + PR abierto a dev + limpieza + archivo de sección.

## Scope OUT (Must NOT have)

- Worktree /kol, cambios de código /feed, features, opencode worktree subcomando, merge automático del PR, ingestión/backend duplicados en worktree, editar product code desde planner.

## Open questions

Ninguna — todo aprobado por usuario ("si" + 3 refinamientos plegados).

## Approval gate

status: approved (usuario dijo "si" + refinamientos; scaffold ejecutado con --reset --force tras backup; Metis obligatorio completado 2026-10-01).
