---
description: Execute a .omo/plans work plan as orchestrator-only with parallel subagents and evidence ledger.
---

# /start-work

Execute, never improvise. Load the `start-work` skill and follow it exactly.

```text
/start-work [plan-name] [--worktree <absolute-path>]
```

- No `plan-name` + one plan → runs it. Several → you are asked once.
- No plan at all → bootstraps `ulw-plan` first ("start work" = approval).
- Orchestrator-only: all implementation via subagents, five verification
  gates per checkbox, ledger at `.omo/start-work/ledger.jsonl`.
- No hooks in this setup: if the turn ends with work remaining, re-invoke
  `/start-work` to continue (Boulder state resumes).
