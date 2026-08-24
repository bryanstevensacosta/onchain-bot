# Branch Protection Policy

> **Owner:** Solo maintainer. **Enforcement tier:** Harvard-grade (CI/CD + governance gates).

This document describes the branch protection rules enforced on `master` and `dev`.
Rules are managed declaratively via the GitHub REST API; see "How to apply" below for the canonical JSON.

---

## Branches

| Branch   | Purpose                                 | Enforcement                                      |
| -------- | --------------------------------------- | ------------------------------------------------ |
| `master` | Production — auto-deploys to production | **Strict.** Admins blocked, linear history only. |
| `dev`    | Integration — auto-deploys to staging   | Strict checks, but admins may bypass via PR.     |

---

## Rules

### Required status checks (both branches)

All five checks must pass before a PR can merge:

| Context                   | Workflow                      | Why                                        |
| ------------------------- | ----------------------------- | ------------------------------------------ |
| `Tests`                   | `ci.yml` → `Tests`            | Backend Jest + frontend Vitest must pass.  |
| `Lint`                    | `ci.yml` → `Lint`             | ESLint flat config (root + workspace).     |
| `TypeScript Check`        | `ci.yml` → `TypeScript Check` | `tsc --noEmit` on both workspaces.         |
| `Build`                   | `ci.yml` → `Build`            | `nest build` + `vite build` must succeed.  |
| `Branch Governance Check` | `branch-governance.yml`       | Husky hooks + docs staleness + commitlint. |

`strict: true` — branches must be **up to date with the base branch** before merge.

### Other rules

| Setting                            | `master` | `dev`    | Rationale                                                                                                                                                    |
| ---------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `enforce_admins`                   | **true** | false    | Production is immutable to admins; dev allows fast solo pushes.                                                                                              |
| `required_linear_history`          | **true** | **true** | No merge commits on either branch; squash or rebase only.                                                                                                    |
| `required_conversation_resolution` | **true** | **true** | All PR review threads must be resolved before merge.                                                                                                         |
| `dismiss_stale_reviews`            | **true** | **true** | Reviews are invalidated when new commits are pushed to the PR.                                                                                               |
| `required_approving_review_count`  | 0        | 0        | Solo maintainer; approvals would block all merges. PR-only safety is sufficient because linear history + strict checks + governance check gate every change. |
| `allow_force_pushes`               | false    | false    | History is sacrosanct — use `git revert` instead.                                                                                                            |
| `allow_deletions`                  | false    | false    | Branches cannot be deleted accidentally.                                                                                                                     |

---

## Why zero required approvals?

This repository has a **single maintainer**. Forcing `required_approving_review_count: 1` would deadlock every PR. The compensating controls that make zero-approval merges safe are:

1. **Required CI status checks** — Tests, Lint, TypeScript, Build all green.
2. **Branch Governance Check** — Husky pre-commit hooks (`lint-staged` + `tsc --noEmit`), `commitlint` enforcing conventional commits, and docs staleness check.
3. **Linear history** — every merge is a fast-forward or squash; no silent rebases.
4. **Conversation resolution** — bot/code-review comments must be addressed.
5. **Strict status** — branches must be up-to-date, preventing "merge → fix CI on main" patterns.

When a second maintainer joins, bump `required_approving_review_count` to `1`.

---

## How to apply (canonical command)

Both protections are managed via `gh api`. To re-apply (idempotent):

```bash
# master
gh api -X PUT repos/bryanstevensacosta/onchain-bot/branches/master/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Tests","Lint","TypeScript Check","Build","Branch Governance Check"]
  },
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "required_approving_review_count": 0
  },
  "required_conversation_resolution": true,
  "required_linear_history": true,
  "enforce_admins": true,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

# dev
gh api -X PUT repos/bryanstevensacosta/onchain-bot/branches/dev/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Tests","Lint","TypeScript Check","Build","Branch Governance Check"]
  },
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "required_approving_review_count": 0
  },
  "required_conversation_resolution": true,
  "required_linear_history": true,
  "enforce_admins": false,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

## How to verify

```bash
# Master — must show 5 contexts + all strict flags
gh api repos/bryanstevensacosta/onchain-bot/branches/master/protection --jq \
  '{contexts: .required_status_checks.contexts, strict: .required_status_checks.strict, linear: .required_linear_history.enabled, conv: .required_conversation_resolution.enabled, enforce_admins: .enforce_admins.enabled, approvals: .required_pull_request_reviews.required_approving_review_count}'

# Dev — same, but enforce_admins must be false
gh api repos/bryanstevensacosta/onchain-bot/branches/dev/protection --jq \
  '{contexts: .required_status_checks.contexts, strict: .required_status_checks.strict, linear: .required_linear_history.enabled, conv: .required_conversation_resolution.enabled, enforce_admins: .enforce_admins.enabled, approvals: .required_pull_request_reviews.required_approving_review_count}'
```

Expected output for `master`:

```json
{
  "contexts": [
    "Branch Governance Check",
    "Build",
    "Lint",
    "Tests",
    "TypeScript Check"
  ],
  "strict": true,
  "linear": true,
  "conv": true,
  "enforce_admins": true,
  "approvals": 0
}
```

For `dev`, the only difference is `"enforce_admins": false`.

---

## Emergency bypass

Production incidents may require skipping `enforce_admins`. Workflow:

1. Temporarily disable admin enforcement: `gh api -X DELETE repos/.../branches/master/protection/enforce_admins`
2. Push the hotfix commit (still requires checks via PR merge; direct push via `git push origin master` only if checks are also temporarily relaxed).
3. Re-apply: re-run the `master` block above.

**Audit trail**: every change to protection settings is logged via the GitHub audit log (`Settings → Audit log`).

---

## Related documents

- [CI/CD pipeline & runbook](./ci-cd.md)
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- [`.github/workflows/branch-governance.yml`](../.github/workflows/branch-governance.yml)
- [`.husky/pre-commit`](../.husky/pre-commit)
- [`.docs-map.jsonc`](../.docs-map.jsonc)
