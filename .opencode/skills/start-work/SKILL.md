---
name: start-work
description: 'Execute a decision-complete work plan from .omo/plans/ as orchestrator-only: Boulder state, evidence ledger, parallel subagents, adversarial verify per checkbox. Use when the user says start work, execute plan, continue plan, resume plan, or asks to run a .omo/plans plan.'
---

# start-work (local V2 adaptation)

Derived from OMO `start-work`; rewritten for OpenCode V2.
See `NOTICE.md`. No plugin, no hooks: continuation is manual re-invoke.

## ABSOLUTE RULE: ORCHESTRATOR — NEVER IMPLEMENTER

YOU DO NOT WRITE CODE, EDIT PRODUCT FILES, OR RUN QA. Every unit of
implementation, test, QA, review goes to a spawned `subagent`. Your hands
touch only: plan selection, `.omo/` state, decomposition, dispatch,
verdicts, evidence. About to edit or run implementation yourself? STOP.
SPAWN A WORKER. Maximum parallelism: independent units concurrently; only
named dependencies serialize.

## Subagent discipline (repo tool)

Each message is self-contained: `TASK:` + DELIVERABLE / SCOPE / VERIFY +
role inside. Long agents run in background (`background: true` default);
poll short, never one long blocking wait. Require `WORKING: <task> -
<phase>`; `BLOCKED: <reason>` only when stuck. Timeout = no new update,
child alive. Fall back (record inconclusive, never pass; respawn smaller)
only on: completed without deliverable, ack-only after followup, explicit
BLOCKED, or dead. Reviewers must differ from executors.

## Usage

```text
/start-work [plan-name] [--worktree <absolute-path>]
```

## Phase 1 — Select the plan

1. Read `.omo/boulder.json` if present.
2. List plans under `.omo/plans/`.
3. `plan-name` given → match by stem.
4. One active/paused Boulder work for this session → resume it.
5. No active work + one plan → select it.
6. No active work + no selectable plan → **No-plan bootstrap**.
7. Several candidates → one focused selection question (`question` tool).

### No-plan bootstrap

"start work" with no plan = approval to plan first: invoke `ulw-plan`
skill (collect → verify → design → adversarial → synthesize), require the
plan at `.omo/plans/<slug>.md` (waves, checkboxes, acceptance — a brief
without those is NOT decision-complete), then continue to Phase 2. Ask one
question only if objective missing/destructive/safety-ambiguous.

## Phase 2 — Boulder state

Write `.omo/boulder.json` before implementing. Prefix ids `opencode:`.

```json
{
  "schema_version": 2,
  "active_work_id": "<work-id>",
  "works": {
    "<work-id>": {
      "work_id": "<work-id>",
      "active_plan": ".omo/plans/<plan-name>.md",
      "plan_name": "<plan-name>",
      "session_ids": ["opencode:<session_id>"],
      "status": "active",
      "worktree_path": null
    }
  }
}
```

`--worktree`: verify via `git worktree list --porcelain` or
`git worktree add <path> <branch-or-HEAD>`; store absolute path; all work
inside it.

## Phase 3 — Execute next checkbox

1. Read the full plan. First unchecked column-0 checkbox in `## Todos` /
   `## Final verification wave`. Ignore nested checkboxes.
2. Tier it (default LIGHT; HEAVY on: new module/abstraction, auth/security/
   session, external integration, DB schema/migration, concurrency, cross-
   domain refactor, or plan/user signals care). Unsure → HEAVY.
3. Decompose to atomic sub-tasks; fan out same-wave ready checkboxes
   concurrently. **Delegate everything in one parallel burst.**

Each sub-task states: goal + exact scope; baseline characterization test
first when touching existing behavior (pins current observable, passes
unchanged), then failing-first proof for the new behavior; plan + project
constraints; verification commands; ONE manual-QA channel with exact tool +
invocation + binary PASS/FAIL observable (LIGHT = one real-surface proof);
applicable adversarial classes + probes; artifact path + cleanup receipt.

Trigger-mapped classes: new input parsing → malformed input; untrusted text
→ prompt injection; long/resumable flows → cancel/resume; generated/cached
artifacts → stale state; uncommitted files in scope → dirty worktree; long
commands → hung commands; new/timing tests → flaky tests; log success
claims → misleading output; interrupts → repeated interruptions. Probe
applicables; not-applicables get one-line reasons.

## Phase 4 — Verify + record

Five gates per checkbox: plan reread → automated verification → manual-QA
artifact (never dry-run) → adversarial probes with captured observables →
cleanup with receipts (QA scripts, sessions, PIDs, ports, tmp dirs — none
left running).

Append to `.omo/start-work/ledger.jsonl`, one JSON object/line:
`event, plan, task, session_id, commands, artifact, adversarial_classes,
cleanup`.

### Completion contract (executor claim ≠ done)

Worker returns `DoneClaim` (task, changed_files, tests+results, manual_qa,
cleanup, risks). An INDEPENDENT verifier (different subagent) probes/
reproduces → verdict `confirmed | false-positive | needs-fix |
needs-human-review` + evidence + repro + confidence. Only `confirmed`
passes. Else: ledger feedback, checkbox back to in-progress, re-dispatch
with exact failure. Verifier probes `stale_state`, `dirty_worktree`,
`misleading_success_output` before `FullyDone`.

## Phase 5 — Mark progress

Only after verification: `- [ ]` → `- [x]`; confirm remaining count
decreased; append `task-completed` ledger entry; continue — do not ask.

## Completion

All top-level checkboxes done → run plan's final verification → worktree:
sync `.omo/` back, merge/hand off as requested, remove worktree only after
merge/handoff → Boulder work completed → print `ORCHESTRATION COMPLETE`
(plan path, verifications, artifacts, cleanup receipts).

## Hard rules

- Failing-first proof before production change; baseline test before
  behavior change.
- No `--dry-run` as evidence. No tests-only completion — Manual-QA artifact
  required.
- Orchestrator never implements. No completion with unprobed applicable
  class. `opencode:`-prefixed session ids only. Plan + ledger are truth.
