# WORKTREE.md — Registro de worktrees (SOLO-GIT)

> Qué es un worktree en este repo: un checkout aislado del mismo repo git en otro
> directorio (`git worktree`), para trabajar una tarea sin rozar el árbol principal.
> **SOLO-GIT**: con opencode 1.18.34 el subcomando `opencode worktree` abre una TUI
> interactiva (trampa para agentes) — usar **únicamente `git worktree`**.
> El registry vive SOLO en el principal (rama `dev`); los worktrees lo heredan como snapshot.

## Registro

| worktree      | rama                 | base  | path                         | puertos                                                      | propósito                                       | scope IN            | scope OUT           | estado |
| ------------- | -------------------- | ----- | ---------------------------- | ------------------------------------------------------------ | ----------------------------------------------- | ------------------- | ------------------- | ------ |
| frontend-feed | `feat/feed-frontend` | `dev` | `../onchain-bot-feat-feed`   | Vite `:5184` (principal `:5173`), backend compartido `:3030` | trabajar `/feed` frontend sin rozar `/kol`      | ver § frontend-feed | ver § frontend-feed | activo |
| dexter-bot    | `feat/dexter-bot`    | `dev` | `../onchain-bot-feat-dexter` | N/A (modo solo-editar, sin servidores)                       | trabajar el bot chart dexter sin rozar feed/kol | ver § dexter-bot    | ver § dexter-bot    | activo |

## frontend-feed

- **Propósito**: trabajar la pantalla de noticias (feed) del frontend sin rozar `/kol`.
- **Rama**: `feat/feed-frontend` (NUEVA, creada con `-b` desde `dev`).
- **Base**: `dev`.
- **Path**: `../onchain-bot-feat-feed`.
- **Puertos**: Vite `:5184` en el worktree (el principal usa `:5173` con `strictPort: true`
  y muere si el puerto está ocupado) contra backend **compartido** `:3030` del principal
  (excepción local documentada al 1:1 per-env, solo para UI — no se duplica backend ni ingestión). Los upstreams `:3031` (ingestion), `:3040` (feed-publisher) y `:4080` (scheduling-posts) también se comparten del entorno principal.
- **Scope IN** (8 grupos feed):
  1. `apps/frontend/src/pages/feed/`
  2. `apps/frontend/src/entities/feed/`
  3. `apps/frontend/src/entities/feed-session/`
  4. `apps/frontend/src/features/manage-feed-sources/`
  5. `apps/frontend/src/features/feed-publisher/`
  6. `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx`
  7. `apps/frontend/src/widgets/feed-sessions/`
  8. `apps/frontend/src/shared/api/feed-publisher-base.ts`
- **Scope OUT**: `/kols`, otros widgets; backend e ingestion-telegram (lectura vía proxies sí, cambios no); fases backend del refactor (D6–D12: adapters→telegram-bots, queue→publishing-queue, dual-serve wire) van en worktree/rama aparte.
- **Estado**: activo.
- **Specs**: `.kiro/specs/refactor-feed-frontend/overview.md` (inventario CRUDO v1.0 del /feed) + `refactor.md` (v0.1 vivo: D1–D12 fijadas, R1–R6 abiertas).
- **Cuándo reusar**: si el cambio cabe en el scope IN existente → **reusar** este worktree,
  no crear uno nuevo (regla reuso-primero, ver abajo).

### Regla reuso-primero

Antes de crear un worktree nuevo, mira la tabla: si tu cambio cabe en el scope IN de un
worktree activo, **reuso** ese worktree (nueva sesión de agente en su path). Solo se crea
un worktree nuevo cuando el scope no encaja en ninguno existente.

### Cierre-PR (por worktree)

1. Desde el worktree: `git push -u origin feat/feed-frontend`.
2. `gh pr create --base dev --head feat/feed-frontend --title 'feat(feed): <resumen>' --body 'Worktree: ../onchain-bot-feat-feed. Registry: WORKTREE.md ## frontend-feed'`.
3. Verificar `gh pr view` + checks CI verdes (GOVERNANCE.md: 1 aprobación + CI + hilos resueltos).
4. **Dejar el PR abierto para merge humano** (nunca mergear solo).
5. Limpieza: `git worktree remove ../onchain-bot-feat-feed` (exige árbol limpio —
   commitear/stash primero, nunca `--force` sin instrucción explícita) + `git worktree prune`.
6. Archivar: en el principal `dev`, marcar esta sección como `estado: archivada`.

### Cómo añadir el próximo (reservado)

- `feat/kol-frontend` → `../onchain-bot-feat-kol` → `:5185` (reservado, no creado).

## dexter-bot

- **Propósito**: trabajar el bot chart dexter sin rozar feed/kol.
- **Rama**: `feat/dexter-bot` (NUEVA, creada con `-b` desde `dev`).
- **Base**: `dev`.
- **Path**: `../onchain-bot-feat-dexter`.
- **Puertos**: N/A — modo solo-editar, sin servidores (decisión del owner).
  No se levanta ni backend ni Vite en este worktree; no se copian `.env`
  y no se toca el Vite `:5184` (PID 19833) del worktree feed.
- **Scope IN** (bot chart dexter):
  1. `apps/backend/src/telegram/chain-dexter-bot/` (34 ficheros)
  2. `apps/frontend/src/pages/dexter/`
  3. `apps/frontend/src/shared/api/dexter-base.ts`
- **Scope OUT**: feed, kol, ingestion-telegram, deploy.
- **Estado**: activo.
- **Cuándo reusar**: si el cambio toca el bot chart dexter (comandos `/x` `/z` `/c`,
  scans, charts, trade buttons, página dexter) → **reusar** este worktree,
  no crear uno nuevo (regla reuso-primero).

### Cierre-PR (dexter-bot)

1. Desde el worktree: `git push -u origin feat/dexter-bot`.
2. `gh pr create --base dev --head feat/dexter-bot --title 'feat(dexter): <resumen>' --body 'Worktree: ../onchain-bot-feat-dexter. Registry: WORKTREE.md ## dexter-bot'`.
3. Verificar `gh pr view` + checks CI verdes (GOVERNANCE.md: 1 aprobación + CI + hilos resueltos).
4. **Dejar el PR abierto para merge humano** (nunca mergear solo).
5. Limpieza: `git worktree remove ../onchain-bot-feat-dexter` (exige árbol limpio —
   commitear/stash primero, nunca `--force` sin instrucción explícita) + `git worktree prune`.
6. Archivar: en el principal `dev`, marcar esta sección como `estado: archivada`.

## Comandos canónicos

```bash
git worktree add ../onchain-bot-feat-feed -b feat/feed-frontend dev  # crear (rama NUEVA con -b)
git worktree list                                                    # listar
git worktree remove ../onchain-bot-feat-feed                         # cerrar (árbol limpio)
git worktree prune                                                   # podar metadata
```

## Sincronización entre worktrees

- **Quién escribe qué**: archivos compartidos (`WORKTREE.md`, registry) se editan
  SOLO en el principal (`dev`) + commit + push; código feature en su rama `feat/*`.
  Si un edit compartido cae por accidente en un worktree, llevarlo a `dev`
  con stash/cherry-pick, nunca commitear ahí.
- **Propagar `dev` a los worktrees**: por worktree `git fetch origin` +
  `git merge origin/dev` (merge, no rebase, a mitad de feature); un fetch en
  cualquier sitio basta (`.git` compartido) pero el merge es por worktree;
  nunca la misma rama en dos worktrees.
- **Mirar sin mezclar**: `git show dev:WORKTREE.md`,
  `git show origin/dev:WORKTREE.md`, `git log --all --oneline --graph`.
- **Ciclo completo**: principal edita registry → commit+push `dev` →
  cada worktree fetch+merge; features vía PR `feat/*` → `dev` → resto sincroniza.

## Invariantes

- La misma rama nunca está en dos worktrees a la vez.
- `remove` exige árbol limpio (commitear o stash primero).
- Vite usa `strictPort` — cada worktree lleva su propio puerto.
- Ramas `feat/*` siempre desde `dev` (GOVERNANCE.md); PRs a `dev`, squash a `master` vía `dev`.
- El registry solo se edita en el principal (`dev`).
- Nunca commitear en `master`; nunca `git reset --hard` / `revert --no-commit` / force-push;
  nunca borrar el worktree principal; nunca matar procesos por patrón (PID explícito).
