---
slug: worktree-opencode-skill
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/worktree-opencode-skill.md
approach: Crear skill global worktree-opencode en ~/.agents/skills/worktree-opencode/SKILL.md solo con worktree nativo del core (CLI/API/TUI + warp + startCommand + limites), QA con worktree de prueba real
---

# Draft: worktree-opencode-skill

## Components (topology ledger)

<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

- C1 scaffold | ~/.agents/skills/worktree-opencode/SKILL.md con frontmatter valido y visible en skill tool | status: active | evidence: https://opencode.ai/docs/skills/ + ~/.agents/skills/gepeto/SKILL.md
- C2 operaciones core | create/list/remove/reset CLI + API + storage path documentados | status: active | evidence: DeepWiki 2.7 + opencodebook 10.4 + opencode.ai/v2/docs/api/worktree/\*
- C3 uso recurrente | warp/switch sesion + startCommand/bootstrap + directory vs worktree | status: active | evidence: PR anomalyco/opencode#36052
- C4 limites + QA | invariantes + troubleshooting + prueba live create->list->remove | status: active | evidence: worktree/index.ts logic

## Open assumptions (announced defaults)

- Metis manual (task subagents con model access disabled): sin contradiccion (global carga en cualquier cwd); constraint anadido = worker debe verificar flags CLI con `opencode worktree --help` en build-time, no de memoria; creep vigilado = plugins y flujo onchain-bot fuera salvo 1 linea; T5 prohibe probar en el repo (solo /tmp dummy)

## Findings (cited - path:lines)

- Skill spec: ubicaciones `.opencode/skills/<name>/SKILL.md` (proyecto) y `~/.config/opencode/skills/<name>/SKILL.md` + `~/.agents/skills/<name>/SKILL.md` (global); frontmatter `name` regex `^[a-z0-9]+(-[a-z0-9]+)*$` = nombre carpeta, `description` 1-1024 chars (https://opencode.ai/docs/skills/)
- Ejemplos locales: `~/.agents/skills/gepeto/SKILL.md` y `~/.agents/skills/pinokio/SKILL.md` con frontmatter `name+description`; repo sin `.opencode/` (verificado por ls)
- Nativo: `opencode worktree create|list|remove|reset`, storage `~/.local/share/opencode/worktree/<project-id>/`, `directory` != `worktree`, startCommand proyecto + extra, solo git, misma rama no en 2 worktrees, no reset del primary (DeepWiki 2.7, OpenCode-Book 10.4, PR #36052)

## Decisions (with rationale)

- Ubicacion Global ~/.agents/skills (usuario la eligio): recurrente en todos los repos, sin tocar onchain-bot
- Alcance Solo core nativo (usuario lo eligio): evita confusion con kdcokenny/owt/open-trees; esos quedan como Must-NOT-Have
- QA Worktree de prueba (usuario la eligio): skill carga + create->list->remove real, evidencia de carga y de git ops

## Scope IN

- SKILL.md global con frontmatter valido, como crear/listar/remover/resetear, warp/switch con stash, startCommand, directory vs worktree, storage path

## Scope OUT (Must NOT have)

- Plugins comunitarios (owt, open-trees, worktree-session) como instrucciones; solo mencion NO-usar si acaso
- Flujo onchain-bot especifico (ramas dev/master, puertos, npm workspaces); no codigo producto, no implementacion del skill ahora

## Open questions

- Ninguna bloqueante; clearance: objetivo, scope IN/OUT, approach y QA confirmados

## High-accuracy review (manual, 2026-10-01)

- Pass 1 (momus-equivalente manual contra doc web + binario): HALLAZGO MATERIAL — el plan asumia `opencode worktree` CLI disponible; binario instalado 1.18.34 NO tiene subcomando worktree (verificado: `--help` lista agent/attach/run/debug/providers/session/plugin/db sin worktree), docs v1 CLI/server tampoco lo listan; el subcomando solo existe en PR #36052 no mergeado + docs v2 + modulo interno del plugin. Codex CLI ausente (segundo pase automatico imposible) y task-subagents con model access disabled (momus automatico imposible).
- Fix aplicado: T2 reestructurado (git worktree primario + bloques version-gated), scope Must-have con gates, T3 warp gated, T5 git-primario; referencias con evidencia del binario.
- Pass 2 (re-verificacion fresca del plan corregido): OK — gates consistentes en T2/T3/T5 + scope, sin promesas sin gate, embargo de plugins y repo intactos.

## Approval gate

status: approved
pending-action: done (plan written)
approach: skill global solo-core con QA live
