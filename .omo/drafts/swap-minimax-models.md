---
slug: swap-minimax-models
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/swap-minimax-models.md
approach: Swap model↔fallback for all agent and category entries in oh-my-openagent.json, so `default` becomes primary and `minimax/m3` becomes fallback.
---

## Findings (cited - path:lines)

- **File:** `~/.config/opencode/oh-my-openagent.json`
- **Structure:** `agents.{13 names}.model` + `categories.{9 names}.model` all set to `"llm-gateway/minimax/minimax-m3"` with fallback `"llm-gateway/default"` (lines 5-89)
- **No other files** contain overrides — searched `.opencode/`, `.config/opencode/`, `.cache/opencode/packages/oh-my-openagent/`, project workspace. Result: zero other matches.

### Current state (22 identical entries)

```json
"model": "llm-gateway/minimax/minimax-m3",
"fallback_models": ["llm-gateway/default"]
```

### Target state (22 entries)

```json
"model": "llm-gateway/default",
"fallback_models": ["llm-gateway/minimax/minimax-m3"]
```

### Agents (13)
`sisyphus`, `librarian`, `explore`, `oracle`, `frontend-ui-ux-engineer`, `document-writer`, `multimodal-looker`, `prometheus`, `atlas`, `metis`, `hephaestus`, `momus`, `sisyphus-junior`

### Categories (9)
`quick`, `unspecified-low`, `unspecified-high`, `visual-engineering`, `artistry`, `ultrabrain`, `deep`, `writing`

## Decisions (with rationale)

| Decision | Rationale |
|----------|-----------|
| Include ALL 22 entries, not just the 12 mentioned | Consistency — all share the same pattern; partial change creates confusing behavior |
| Single replaceAll edit on the file | All entries identical → one atomic change, zero risk of missing one |
| No changes to compiled dist/ files | Those are oh-my-openagent built-in defaults. User config in `oh-my-openagent.json` overrides them. Only the user config matters. |

## Scope IN

- Edit `~/.config/opencode/oh-my-openagent.json` — swap `model` and `fallback_models[0]` for every agent and category entry
- Validate JSON syntax after edit
- Confirm change took effect by re-reading the file

## Scope OUT (Must NOT have)

- Do NOT edit any files under `node_modules/`, `.cache/`, `dist/` — those are package code
- Do NOT edit `opencode.json` or any other config file
- Do NOT restart any service — OpenCode reads this file on demand

## Open questions

None — all resolved.

# Draft: swap-minimax-models

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

## Findings (cited - path:lines)

## Decisions (with rationale)

## Scope IN

## Scope OUT (Must NOT have)

## Open questions

## Approval gate
status: drafting
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
