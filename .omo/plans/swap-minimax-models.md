# swap-minimax-models - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** All OpenCode agents and task categories will use `llm-gateway/default` as their primary model, with `minimax-m3` as the fallback if that fails. Previously it was the reverse.

**Why this approach:** Single file edit, one replaceAll operation — all 22 entries are identical, so there's zero risk of missing one. No need to touch compiled package code since user config overrides built-in defaults.

**What it will NOT do:** Won't modify any files under `node_modules/`, `.cache/`, or `dist/`. Won't touch any other config files.

**Effort:** Quick (~2 min)
**Risk:** Low - single file, reversible, JSON validated
**Decisions to sanity-check:** None — straightforward swap

Your next move: approve the plan below. The executor will do the entire change in one wave.

---

> TL;DR (machine): Quick | Low — swap model↔fallback for 22 agent/category entries in ~/.config/opencode/oh-my-openagent.json so `llm-gateway/default` becomes primary and `minimax-m3` becomes fallback.

## Scope
### Must have
- Edit `~/.config/opencode/oh-my-openagent.json` — swap `model` and `fallback_models[0]` for all 22 entries (13 agents + 9 categories)
- Validate JSON syntax after edit
- Confirm all entries changed correctly

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do NOT touch `node_modules/`, `.cache/`, `dist/` or any compiled package code
- Do NOT edit `opencode.json`, `tui.json`, or any project files
- Do NOT restart services — OpenCode reads config on demand

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: none (config file change — validate JSON syntax + grep for correctness)
- Evidence: .omo/evidence/task-1-swap-minimax-models.json

## Execution strategy
### Parallel execution waves
Single wave — one file, one edit operation.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1. Swap model↔fallback | — | — | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Swap model↔fallback in oh-my-openagent.json
  What to do / Must NOT do:
  - Read `~/.config/opencode/oh-my-openagent.json`
  - Replace ALL occurrences of `"model": "llm-gateway/minimax/minimax-m3",\n      "fallback_models": ["llm-gateway/default"]` with `"model": "llm-gateway/default",\n      "fallback_models": ["llm-gateway/minimax/minimax-m3"]`
  - Use replaceAll — all 22 entries are identical
  - Must NOT edit any other file
  - Must NOT touch node_modules/ or .cache/ directories
  - Must NOT edit opencode.json or tui.json
  Parallelization: Wave 1 | Blocked by: — | Blocks: —
  References:
  - `~/.config/opencode/oh-my-openagent.json:5-89` (all agent + category entries)
  - `~/.config/opencode/opencode.json:80-84` (llm-gateway provider defines `default` and `minimax/minimax-m3` models)
  Acceptance criteria (agent-executable):
  1. `python3 -c "import json; json.load(open(os.path.expanduser('~/.config/opencode/oh-my-openagent.json')))"` — exits 0 (valid JSON)
  2. `grep -c '"model": "llm-gateway/minimax/minimax-m3"' ~/.config/opencode/oh-my-openagent.json` — returns 0 (no minimax-m3 as model)
  3. `grep -c '"model": "llm-gateway/default"' ~/.config/opencode/oh-my-openagent.json` — returns 22 (all entries use default as model)
  4. `grep -c '"fallback_models": \["llm-gateway/minimax/minimax-m3"\]' ~/.config/opencode/oh-my-openagent.json` — returns 22 (all entries use minimax-m3 as fallback)
  QA scenarios (agent-executable): happy path — all 4 acceptance criteria pass. Failure scenario — if edit pattern doesn't match, show diff and retry.
  Evidence: `.omo/evidence/task-1-swap-minimax-models.json` — capture output of all 4 checks
  Commit: N (config file outside repo — no commit needed)

## Final verification wave
> Runs after todo completes. ALL must APPROVE.
- [ ] F1. Plan compliance audit — verify acceptance criteria 1-4 all pass
- [ ] F2. Scope fidelity — confirm no other files were touched (`git diff --stat` in project is empty, no other config files changed)

## Commit strategy
No commit needed — the changed file (`~/.config/opencode/oh-my-openagent.json`) is outside the project repo. Git tracking is irrelevant.

## Success criteria
- [ ] `~/.config/opencode/oh-my-openagent.json` is valid JSON
- [ ] Zero entries with `"model": "llm-gateway/minimax/minimax-m3"` as primary model
- [ ] 22 entries with `"model": "llm-gateway/default"` as primary model
- [ ] 22 entries with `"fallback_models": ["llm-gateway/minimax/minimax-m3"]`
- [ ] No other files modified
