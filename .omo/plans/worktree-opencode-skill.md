# worktree-opencode-skill - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Un skill reutilizable que te enseña a crear, listar, cambiar y borrar worktrees nativos de opencode, con su prueba real incluida.

**Why this approach:** Lo ponemos global para usarlo en todos tus repos y documentamos solo el core verificado contra tu binario, sin plugins que confunden.

**What it will NOT do:** No instala plugins, no toca tu código ni este repo, no prueba en tus repos reales.

**Effort:** Short
**Risk:** Low - un archivo markdown fuera del repo más una prueba en carpeta temporal que se limpia.
**Decisions to sanity-check:** Ubicación global, solo-core, prueba en /tmp.

Your next move: arranco el trabajo ahora ($start-work), o corro primero la revisión dual de alta precisión (Momus + Codex). Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

- `~/.agents/skills/worktree-opencode/SKILL.md` global con frontmatter valido (`name: worktree-opencode` = carpeta, `description` 1-1024 chars especifica) y visible via `skill` tool.
- Seccion operaciones core: `git worktree` como vía primaria SIEMPRE disponible; `opencode worktree create|list|remove|reset` SOLO si el binario la expone (version-gated: instalada 1.18.34 NO la tiene); storage del plugin `~/.local/share/opencode/worktree/<project-id>/` (version-gated); API `/api/worktree/*` (version-gated v2).
- Seccion uso recurrente: warp/switch de sesion con stash, `directory` vs `worktree`, bootstrap + `startCommand` (proyecto + extra), dialogo TUI.
- Seccion limites + troubleshooting: invariantes + tabla de errores comunes.
- QA live: carga del skill + `create->list->remove` real en repo dummy `/tmp`.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO instrucciones de plugins comunitarios (owt, open-trees, worktree-session, kdcokenny): maximo 1 linea "no usar, ir al core".
- NO flujo onchain-bot (ramas dev/master, puertos, workspaces npm); NO codigo producto; NO probar en el repo (solo `/tmp` dummy); NO commitear (skill global fuera de git).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: none (skill markdown, sin suite) + QA agent-executed (carga via skill tool + worktree prueba real + checklist de spec).
- Evidence: .omo/evidence/task-<N>-worktree-opencode-skill.<ext>

## Execution strategy

### Parallel execution waves

- Wave 1: T1 scaffold (puerta: el archivo debe existir antes de anexar secciones).
- Wave 2: T2 -> T3 -> T4 secuenciales (mismo SKILL.md, anexos por secciones distintas; no paralelizar ediciones del mismo archivo).
- Wave 3: T5 QA live, luego T6 validacion final.

### Dependency matrix

| Todo                        | Depends on | Blocks        | Can parallelize with |
| --------------------------- | ---------- | ------------- | -------------------- |
| 1 scaffold                  | -          | 2, 3, 4, 5, 6 | -                    |
| 2 operaciones core          | 1          | 3, 4, 5, 6    | -                    |
| 3 uso recurrente            | 2          | 4, 5, 6       | -                    |
| 4 limites + troubleshooting | 3          | 5, 6          | -                    |
| 5 QA live                   | 4          | 6             | -                    |
| 6 validacion final          | 5          | -             | -                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Scaffold del skill global con frontmatter valido
     What to do / Must NOT do: Crear `~/.agents/skills/worktree-opencode/` + `SKILL.md` con frontmatter `name: worktree-opencode` + `description` especifica (1-1024 chars, menciona worktree nativo + create/list/remove/reset + warp) y esqueleto de secciones (Operaciones, Uso recurrente, Limites, Troubleshooting). Must NOT do: otro nombre de carpeta, otro `name`, contenido de plugins, tocar el repo.
     Parallelization: Wave 1 | Blocked by: - | Blocks: 2, 3, 4, 5, 6
     References (executor has NO interview context - be exhaustive): spec `https://opencode.ai/docs/skills/` (ubicaciones, frontmatter solo name/description/license/compatibility/metadata, regex `^[a-z0-9]+(-[a-z0-9]+)*$`, SKILL.md en mayusculas); ejemplos `~/.agents/skills/gepeto/SKILL.md` + `~/.agents/skills/pinokio/SKILL.md` (frontmatter name+description); decisiones en `.omo/drafts/worktree-opencode-skill.md` (global, solo-core).
     Acceptance criteria (agent-executable): bash `test -f ~/.agents/skills/worktree-opencode/SKILL.md && python3 -c "import re; t=open('$HOME/.agents/skills/worktree-opencode/SKILL.md').read(); m=re.search(r'^---\s*\nname:\s*(\S+)', t); assert m and m.group(1)=='worktree-opencode', 'name==dir'"` exit 0.
     QA scenarios (name the exact tool + invocation): happy via bash assert anterior (exit 0), Evidence .omo/evidence/task-1-worktree-opencode-skill.log; failure via bash frontmatter con `name` distinto a la carpeta o `description` vacia => skill no cargaria, corregir antes del T2.
     Commit: N | skill global fuera del repo, sin commit.
- [x] 2. Seccion operaciones core (CLI + storage + API)
     What to do / Must NOT do: Anexar seccion con PRIMERO `git worktree add|list|remove|prune` (disponible siempre; el skill debe funcionar solo con esto), y LUEGO bloque version-gated: `opencode worktree create|list|remove|reset` SOLO si `opencode worktree --help` exit 0 en el binario instalado (1.18.34 NO lo tiene: comandos reales son agent/attach/run/debug/providers/session/plugin/db/...; el subcomando worktree solo existe en PR #36052 + docs v2). Storage `~/.local/share/opencode/worktree/<project-id>/` y creacion 2 fases (`--no-checkout` + `reset --hard` + `Instance.provide` + Ready) marcados como comportamiento del plugin oh-my-openagent (fuente: su `dist/index.js`), no del binario oficial. API `/api/worktree/*` marcada v2-only (la API v1 oficial no tiene rutas worktree: verificado en /docs/server). Must NOT do: presentar `opencode worktree` como disponible sin gate; documentar flags de memoria sin verificar; incluir plugins; prometer replay.
     Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3, 4, 5, 6
     References (executor has NO interview context - be exhaustive): binario instalado `~/.opencode/bin/opencode --version` = 1.18.34 SIN subcomando worktree (evidencia: `opencode --help` lista agent/attach/run/debug/providers/agent/upgrade/uninstall/serve/web/models/stats/export/import/github/pr/session/plugin/db, sin worktree); `https://opencode.ai/docs/cli/` (sin worktree); `https://opencode.ai/docs/server/` (sin rutas worktree); PR `anomalyco/opencode#36052` (origen del subcomando, no mergeado en 1.18.34); `https://opencode.ai/v2/docs/api/worktree/*` (v2-only); `https://deepwiki.com/sst/opencode/2.7-project-and-worktree-management`; `https://www.opencodebook.xyz/en/chapter_10_snapshot_and_file_system/10.4_worktree_management`; `~/.agents/skills/worktree-opencode/SKILL.md` (anexar, no reescribir headers existentes).
     Acceptance criteria (agent-executable): `opencode worktree --help` ejecutado y su resultado (exit != 0 en 1.18.34) pegado en la evidencia; la seccion funciona con SOLO `git worktree` y todo lo `opencode worktree` lleva marca de version.
     QA scenarios (name the exact tool + invocation): happy via bash `opencode worktree --help` y diff mental contra lo documentado (match), Evidence .omo/evidence/task-2-worktree-opencode-skill.log (incluye `--help` real); failure via bash comando documentado que `--help` no reconoce => reescribir seccion.
     Commit: N | skill global fuera del repo, sin commit.
- [x] 3. Seccion uso recurrente (warp + bootstrap + directory vs worktree)
     What to do / Must NOT do: Anexar flujo diario con `git worktree` como base (crear, moverse, volver, limpiar) + bloque version-gated para warp/switch con stash del PR #36052 y dialogo TUI (SOLO si el binario instalado lo expone; en 1.18.34 NO verificado). `directory` vs `worktree`, bootstrap y `startCommand` marcados como comportamiento del plugin. Must NOT do: presentar el warp como disponible sin gate, inventar comandos warp sin verificar, incluir atajos de plugins.
     Parallelization: Wave 2 | Blocked by: 2 | Blocks: 4, 5, 6
     References (executor has NO interview context - be exhaustive): PR `anomalyco/opencode#36052` (warp con stash/pop + labels, no mergeado en 1.18.34); `https://opencode.ai/docs/custom-tools` (contexto `{directory, worktree}`); `~/.agents/skills/worktree-opencode/SKILL.md` (anexar tras seccion T2).
     Acceptance criteria (agent-executable): el flujo base funciona con SOLO `git worktree` en el dummy de T5; todo lo warp lleva marca de version con su comando de verificacion.
     QA scenarios (name the exact tool + invocation): happy via bash `git worktree list` en repo dummy mostrando el worktree (paso espejo de T5), Evidence .omo/evidence/task-3-worktree-opencode-skill.log; failure via bash warp documentado sin gate => reescribir con marca version-dependiente.
     Commit: N | skill global fuera del repo, sin commit.
- [x] 4. Seccion limites + troubleshooting
     What to do / Must NOT do: Anexar invariantes (solo proyectos git; misma rama nunca en 2 worktrees; no reset del primary; `remove --force` + `branch -D`; `clean -ffdx` en reset) + tabla troubleshooting (minimo: worktree bloqueado por cambios sin commitear, rama ya checkouteada en otro worktree, reset del primary rechazado, directorio huerfano) cada fila con sintoma -> causa -> comando fix. Must NOT do: mas de 1 linea sobre plugins (solo "para aislamiento con terminales usa el core, no plugins"), ni limites inventados.
     Parallelization: Wave 2 | Blocked by: 3 | Blocks: 5, 6
     References (executor has NO interview context - be exhaustive): logica `worktree/index.ts` (remove/reset/sweep/prune via `git worktree remove --force`, `reset --hard <default-branch>`, `clean -ffdx`, `submodule update`) segun OpenCode-Book 10.4; `~/.agents/skills/worktree-opencode/SKILL.md` (anexar al final).
     Acceptance criteria (agent-executable): bash `grep -c 'git worktree\|git reset --hard\|git clean' ~/.agents/skills/worktree-opencode/SKILL.md` >= 3 y cada fila troubleshooting contiene un comando ejecutable.
     QA scenarios (name the exact tool + invocation): happy via bash grep-count (exit 0), Evidence .omo/evidence/task-4-worktree-opencode-skill.log; failure via bash seccion sin comandos (count < 3) => ampliar.
     Commit: N | skill global fuera del repo, sin commit.
- [x] 5. QA live: carga del skill + worktree de prueba real
     What to do / Must NOT do: Con `skill({name:"worktree-opencode"})` confirmar carga; en repo dummy `/tmp/wt-qa-<ts>` (git init + 1 commit) ejecutar el flujo del skill con `git worktree add|list|remove` (via primaria; `opencode worktree` solo si el binario la expone, en 1.18.34 NO) y capturar outputs. Must NOT do: probar en `/Users/bryanstevens/dev/onchain-bot` ni en ningun repo real; no dejar worktrees huerfanos (`git worktree prune` al final).
     Parallelization: Wave 3 | Blocked by: 4 | Blocks: 6
     References (executor has NO interview context - be exhaustive): `~/.agents/skills/worktree-opencode/SKILL.md` (seguir sus propios pasos como QA); decisiones `.omo/drafts/worktree-opencode-skill.md` (QA elegida por el usuario).
     Acceptance criteria (agent-executable): bash secuencia completa con exit 0 y `git worktree list` final sin el worktree de prueba.
     QA scenarios (name the exact tool + invocation): happy via bash secuencia en `/tmp` (exit 0), Evidence .omo/evidence/task-5-worktree-opencode-skill.log (outputs completos); failure via bash cualquier paso con exit != 0 => registrar output, limpiar con prune, y corregir el SKILL.md antes del T6.
     Commit: N | skill global + /tmp fuera del repo, sin commit.
- [x] 6. Validacion final de spec y anti-creep
     What to do / Must NOT do: Checklist: `name` cumple regex y = carpeta; `description` 1-1024 chars; `SKILL.md` en mayusculas; skill aparece listable; `grep -i 'owt\|open-trees\|kdcokenny\|felixAnhalt\|danhenton' SKILL.md` vacio salvo la linea permitida; sin rutas onchain-bot. Must NOT do: aprobar con algun check en rojo.
     Parallelization: Wave 3 | Blocked by: 5 | Blocks: -
     References (executor has NO interview context - be exhaustive): `https://opencode.ai/docs/skills/` (troubleshoot loading 1-4); `~/.agents/skills/worktree-opencode/SKILL.md`.
     Acceptance criteria (agent-executable): bash script de 5 asserts (regex, longitud, filename, grep-creep vacio, sin `onchain-bot`) todo exit 0.
     QA scenarios (name the exact tool + invocation): happy via bash checklist (exit 0), Evidence .omo/evidence/task-6-worktree-opencode-skill.log; failure via bash cualquier assert rojo => fix puntual y re-run del checklist.
     Commit: N | skill global fuera del repo, sin commit.

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

Sin commits: el skill vive en `~/.agents/skills/` (fuera del repo). Trazabilidad = evidencias `.omo/evidence/task-*-worktree-opencode-skill.log`.

## Success criteria

- `skill({name:"worktree-opencode"})` carga sin error y el nombre/carpeta/frontmatter cumplen la spec.
- El SKILL.md permite crear→listar→ver→borrar un worktree y hacer warp con stash solo con lo documentado (probado en /tmp, repo limpio).
- Cero creep: sin plugins como instrucciones, sin rutas onchain-bot, comandos verificados contra el binario instalado.
