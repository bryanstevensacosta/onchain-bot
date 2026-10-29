---
description: Create a decision-complete work plan (explore-first, approval-gated) via the ulw-plan skill.
---

# /ulw-plan

Plan before coding. Load the `ulw-plan` skill and follow it exactly.

```text
/ulw-plan <request> [--clear|--unclear]
```

- `<request>`: what to plan (feature, refactor, fix, vague brief).
- `--clear` / `--unclear`: force routing; omit to let the skill judge.
- Output: `.omo/drafts/<slug>.md` + `.omo/plans/<slug>.md`, human TL;DR first.
- Approval gate is mandatory: present the brief, wait for explicit okay.
- Never implement in this command. Start execution only via `/start-work`.
