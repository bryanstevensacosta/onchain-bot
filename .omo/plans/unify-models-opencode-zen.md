# unify-models-opencode-zen - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Todos tus agentes y categorías de opencode usando el mismo modelo gratuito de Zen, sin restos de modelos viejos y con respaldo previo.

**Why this approach:** Restauramos desde el backup que ya tenía todo migrado en vez de reescribir a mano, y unificamos el prefijo a opencode-zen como pediste.

**What it will NOT do:** No toca tu código ni el repo, no rota claves, no borra backups, no hace commits.

**Effort:** Quick
**Risk:** Low - solo 2 archivos de config global con backup previo y verificación de cero restos.
**Decisions to sanity-check:** Prefijo opencode-zen/ en los 13 lugares; momus conserva fallback vacío.

Your next move: aprueba y lanzo `$start-work`, o pido primero la revisión dual de alta precisión (Momus + Codex). Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

- `~/.config/opencode/oh-my-openagent.json` (re)creado con agentes + categorias a `opencode-zen/muse-spark-1.3-contributor-free` (los 12 de la lista del usuario incluidos).
- `~/.config/opencode/opencode.json` top-level `model` = `opencode-zen/muse-spark-1.3-contributor-free`.
- Backup previo + verificacion JSON y cero restos legacy.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO tocar `apps/*`, NO tocar `/Users/bryanstevens/dev/onchain-bot/opencode.json`, NO rotar keys/secrets, NO borrar `.bak-*`, NO commit (configs globales fuera de git).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: none (cambio de config, sin suite) + QA agent-executed (parse JSON + grep + resolucion efectiva).
- Evidence: .omo/evidence/task-<N>-unify-models-opencode-zen.<ext>

## Execution strategy

### Parallel execution waves

- Wave 1 secuencial (todos 1-4 tocan los mismos 2 archivos globales; backup primero). 4 todos porque es cambio trivial de config: no rellenar con slop.

### Dependency matrix

| Todo                           | Depends on | Blocks  | Can parallelize with |
| ------------------------------ | ---------- | ------- | -------------------- |
| 1 backup                       | -          | 2, 3, 4 | -                    |
| 2 restore oh-my-openagent.json | 1          | 4       | 3                    |
| 3 fix top-level model          | 1          | 4       | 2                    |
| 4 verify                       | 2, 3       | -       | -                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Backup de configs globales antes de tocar nada
     What to do / Must NOT do: Copiar `~/.config/opencode/opencode.json` a `opencode.json.bak-<YYYYMMDD-HHMMSS>` e inventariar `oh-my-openagent.json*` (debe mostrar ausente el vigente + listar baks). Must NOT do: modificar, borrar ni mover ningun archivo; no tocar el repo.
     Parallelization: Wave 1 | Blocked by: - | Blocks: 2, 3, 4
     References (executor has NO interview context - be exhaustive): `~/.config/opencode/opencode.json:1-76` (top-level model en :75); `~/.config/opencode/oh-my-openagent.json.bak-20260925-005917:1-71` (fuente de restauracion, NO editarla); `.omo/drafts/unify-models-opencode-zen.md` (decisiones y prefijo canonico).
     Acceptance criteria (agent-executable): `ls -la ~/.config/opencode/oh-my-openagent.json` falla (aun ausente) y existe un `opencode.json.bak-<ts>` nuevo con `diff` vacio contra el original.
     QA scenarios (name the exact tool + invocation): happy via bash `ls -la ~/.config/opencode/*.bak-* && diff ~/.config/opencode/opencode.json <nuevo-bak> && echo OK` (exit 0), Evidence .omo/evidence/task-1-unify-models-opencode-zen.log; failure via bash `diff` con salida no vacia o bak inexistente => abortar waves siguientes.
     Commit: N | global config fuera de git, sin commit.
- [x] 2. Restaurar oh-my-openagent.json desde bak-20260925-005917
     What to do / Must NOT do: `cp ~/.config/opencode/oh-my-openagent.json.bak-20260925-005917 ~/.config/opencode/oh-my-openagent.json` byte-identico. Must NOT do: re-escribir a mano, cambiar modelos, tocar `momus.fallback_models: []`, usar otro bak, editar el bak origen.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4 | Can parallelize with: 3
     References (executor has NO interview context - be exhaustive): fuente `~/.config/opencode/oh-my-openagent.json.bak-20260925-005917:1-71` (agents :3-44 con los 12: artistry via categories :58-60, atlas :28-30, deep :64-66, explore :10-12, hephaestus :34-36, librarian :7-9, metis :31-33, momus :37-40 con fallback [], multimodal-looker :22-24, oracle :13-15, prometheus :25-27, quick :46-48); destino `~/.config/opencode/oh-my-openagent.json` (ausente hasta este todo).
     Acceptance criteria (agent-executable): `diff ~/.config/opencode/oh-my-openagent.json ~/.config/opencode/oh-my-openagent.json.bak-20260925-005917` exit 0 y `python3 -c "import json; d=json.load(open(...)); assert all(v['model']=='opencode-zen/muse-spark-1.3-contributor-free' for v in list(d['agents'].values())+list(d['categories'].values()))"`.
     QA scenarios (name the exact tool + invocation): happy via bash `diff` + `python3` assert (exit 0), Evidence .omo/evidence/task-2-unify-models-opencode-zen.log; failure via bash `python3 -c` que liste cualquier `model != opencode-zen/muse-spark-1.3-contributor-free` => no avanzar al 4.
     Commit: N | global config fuera de git, sin commit.
- [x] 3. Unificar top-level model a opencode-zen/muse-spark-1.3-contributor-free
     What to do / Must NOT do: En `~/.config/opencode/opencode.json:75` cambiar `"model": "opencode/muse-spark-1.3-contributor-free"` por `"model": "opencode-zen/muse-spark-1.3-contributor-free"`, preservando resto del archivo (plugin, mcp, providers, compaction). Must NOT do: tocar otra clave, reformatear todo el archivo, rotar API keys, tocar el `opencode.json` del repo.
     Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4 | Can parallelize with: 2
     References (executor has NO interview context - be exhaustive): `~/.config/opencode/opencode.json:69-76` (compaction + skills + model); decision de prefijo en `.omo/drafts/unify-models-opencode-zen.md` (usuario: "debe ser opencode-zen").
     Acceptance criteria (agent-executable): `python3 -c "import json; assert json.load(open('$HOME/.config/opencode/opencode.json'))['model']=='opencode-zen/muse-spark-1.3-contributor-free'"` exit 0.
     QA scenarios (name the exact tool + invocation): happy via bash `python3` assert + `grep -n '"model"' ~/.config/opencode/opencode.json` muestra una sola linea con el valor esperado, Evidence .omo/evidence/task-3-unify-models-opencode-zen.log; failure via bash JSON invalido (`python3 -m json.tool` exit != 0) => restaurar desde el bak del todo 1 y repetir.
     Commit: N | global config fuera de git, sin commit.
- [x] 4. Verificar unificacion total y resolucion efectiva
     What to do / Must NOT do: Validar JSON de ambos archivos, contar 0 ocurrencias legacy (`gpt-5.5`, `gpt-5.4-mini`, `gemini-3.1-pro`, `gemini-3-flash`, `claude-sonnet-4-6`, `claude-opus-4-7`, `opencode/muse-spark`, `llm-gateway/default`, `deepseek`) en los 2 archivos vigentes, y confirmar que los 12 mapeos resuelven a `opencode-zen/muse-spark-1.3-contributor-free`. Must NOT do: dar por valido con grep solo visual; la evidencia debe ser el output capturado.
     Parallelization: Wave 1 | Blocked by: 2, 3 | Blocks: -
     References (executor has NO interview context - be exhaustive): `~/.config/opencode/opencode.json` (vigente post-3); `~/.config/opencode/oh-my-openagent.json` (vigente post-2); defaults del plugin `.../oh-my-openagent/dist/index.js` (`CATEGORY_MODEL_REQUIREMENTS`: artistry gemini-3.1-pro, deep gpt-5.5, quick gpt-5.4-mini, unspecified-low claude-sonnet-4-6, unspecified-high claude-opus-4-7) como oracle negativo.
     Acceptance criteria (agent-executable): bash `grep -rEn 'gpt-5\.5|gpt-5\.4-mini|gemini-3\.1-pro|gemini-3-flash|claude-sonnet-4-6|claude-opus-4-7|opencode/muse-spark|llm-gateway/default|deepseek' ~/.config/opencode/opencode.json ~/.config/opencode/oh-my-openagent.json; test $? -eq 1` (cero hits) + `python3` assert de los 12 valores exactos (artistry/atlas/deep/explore/hephaestus/librarian/metis/momus/multimodal-looker/oracle/prometheus/quick).
     QA scenarios (name the exact tool + invocation): happy via bash script combinado con exit 0 y output guardado, Evidence .omo/evidence/task-4-unify-models-opencode-zen.log; failure via bash cualquier hit legacy o assert fallido => listar archivo:linea ofensores y volver al todo 2/3 segun archivo.
     Commit: N | global config fuera de git, sin commit.

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

No commits: los 2 archivos viven en `~/.config/opencode/` (fuera del repo, fuera de git). Trazabilidad = backups timestamped + evidencias en `.omo/evidence/task-*-unify-models-opencode-zen.log`.

## Success criteria

- `opencode.json` top-level `model == opencode-zen/muse-spark-1.3-contributor-free` y JSON valido.
- `oh-my-openagent.json` byte-identico al bak-20260925-005917 salvo decision contraria registrada; los 12 (artistry, atlas, deep, explore, hephaestus, librarian, metis, momus, multimodal-looker, oracle, prometheus, quick) resuelven a `opencode-zen/muse-spark-1.3-contributor-free`.
- Cero strings legacy en los 2 archivos vigentes (grep exit 1).
- `momus.fallback_models == []` preservado; `.bak-*` intactos; repo onchain-bot sin cambios.
