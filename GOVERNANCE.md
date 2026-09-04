# Git Branch Governance — Alpha Meta Token Scanner

**Version:** 2.0  
**Date:** 2026-08-29  
**Status:** ACTIVE

---

## 1. Branch Governance Architecture (3 Layers)

**Defense in depth** against non-conforming branches:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Pre-push Hook (.husky/pre-push)                    │
│ ├─ Local validation BEFORE the push                         │
│ ├─ Immediate feedback to the developer                       │
│ └─ Bypass: git push --no-verify                             │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: GitHub Ruleset (Server-Side)                       │
│ ├─ Enforcement on GitHub (not bypassable without permission)│
│ ├─ Blocks creation/update/deletion                          │
│ └─ Admin bypass: temporary, for documented operations       │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: Branch Governance Workflow (Audit)                 │
│ ├─ Continuous post-push validation                          │
│ ├─ Detects anomalies and drift                              │
│ └─ Fails CI on violations                                   │
└─────────────────────────────────────────────────────────────┘
```

### Branch Naming Convention

**Allowed:**

- `dev`, `master` (main branches)
- `feat/*`, `fix/*`, `chore/*` (conventional commits)
- `ci/*`, `docs/*`, `refactor/*`, `perf/*`, `test/*`
- `build/*`, `style/*`, `hotfix/*`, `release/*`, `revert/*`

**Blocked:**

- `random-name`, `test`, `tmp`, `my-branch` (no convention)
- Any branch not following the pattern

**Enforcement:**

- **Pre-push hook:** Validates the current branch before pushing
- **GitHub Ruleset:** Blocks non-conforming creation server-side
- **Branch Governance:** Audits remote branches and reports extras

---

## 2. Official Branch Flow

```
dev ──────────────────────────────────────► (continuous integration)
  │
  ├── feature/* (short-lived branch, < 2 weeks)
  │    └── PR → dev (requires: 1 approval, CI pass, conversation resolved)
  │
  └── PR: dev → master (squash merge)
       └── master (production)
            └── automatic deploy on push
```

**Rules:**

- Only `master` and `dev` are _long-lived_ (permanent) branches
- `feature/*`, `hotfix/*`, `backport/*`, `sync/*` are _short-lived_ (deleted after merge)
- `release/*` is **NOT used** — deploys are continuous on push to master

---

## 3. Branch Rules (Branch Protection + Rulesets)

| Branch     | PR required | Approvals | Status checks   | Force push | Delete | Conversation resolved |
| ---------- | ----------- | --------- | --------------- | ---------- | ------ | --------------------- |
| **master** | ✅          | 1         | test, lint, tsc | ❌         | ❌     | ✅                    |
| **dev**    | ✅          | 1         | test, lint, tsc | ❌\*       | ❌     | ✅                    |

_\*dev exception: maintainers may temporarily enable force-push for **backport sync** (requires 2 approvals on an issue/PR). See §6._

### GitHub Rulesets

**Ruleset: "Branch Strategy Enforcement"** (ID: 21297389)

- **Target:** All branches except allowed ones
- **Rules:** Blocks `creation`, `update`, `deletion`
- **Allowed:** `dev`, `master`, `feat/*`, `fix/*`, `chore/*`, `ci/*`, `docs/*`, `refactor/*`, `perf/*`, `test/*`, `build/*`, `style/*`, `hotfix/*`, `release/*`, `revert/*`, `release-please--*`
- **Enforcement:** Active (server-side)
- **Bypass:** Admin role (temporary, documented)

**Ruleset: "Master"** (ID: 21130799)

- **Target:** `master` branch
- **Rules:** Requires PR, blocks deletion, blocks non-fast-forward, squash merge only
- **Enforcement:** Active

---

## 4. Daily Workflow

### 4.1 Development on a feature branch

```bash
# From updated dev
git checkout dev && git pull origin dev
git checkout -b feature/my-change

# Development + local tests
npm run test && npm run lint && npm run tsc

# Push + PR to dev
git push origin feature/my-change
gh pr create --base dev --head feature/my-change --title "feat: my change"
```

### 4.2 Merge to dev (integration)

- PR to `dev` with base `dev`
- Requirements: 1 approval + CI pass (test, lint, tsc) + conversation resolved
- **Squash merge** → keeps history clean on dev
- Feature branch auto-deleted (auto-delete enabled)

### 4.3 Promotion to master (release)

```bash
# When dev is ready for production
gh pr create --base master --head dev --title "release: vX.Y.Z" --body "Changelog..."
# Review + squash merge in GitHub UI
# Automatic deploy on push to master
```

---

## 5. Hotfix Policy (Production)

**When:** Critical production bug that cannot wait for the next release.

```bash
# 1. Branch from master (current production)
git checkout master && git pull origin master
git checkout -b hotfix/short-description

# 2. Fix + local test + manual staging deploy
npm run test && npm run lint
# manual deploy to staging if applicable

# 3. PR to master
gh pr create --base master --head hotfix/... --title "hotfix: ..." --body "Fix for #ISSUE"

# 4. Squash merge to master → automatic production deploy

# 5. Backport to dev (so the fix persists into the next release)
git checkout dev && git pull origin dev
git checkout -b backport/hotfix-<issue> dev
git cherry-pick <squash-commit-hash-of-hotfix>
gh pr create --base dev --head backport/hotfix-... --title "backport: hotfix #ISSUE"
# Squash merge to dev
```

---

## 6. Controlled Exceptions

### 6.1 Force-push to dev (Backport Sync)

**When:** Syncing commits from master → dev (e.g. backport CI fixes, hotfix backport)
**Process:**

1. Open issue/PR: "backport sync: bring X commits from master to dev"
2. 2 maintainer approvals
3. Maintainer temporarily enables "Allow force pushes" on dev (Settings → Branches)
4. Run the sync (cherry-pick + force-push to dev)
5. Disable force-push immediately

### 6.2 Master Rollback (Emergency)

**When:** A merge to master breaks production

```bash
git checkout master && git pull origin master
git revert HEAD -m 1  # revert the squash commit
git push origin master --force-with-lease
```

**Revert ONLY.** Documented in an issue with 2 approvals.

### 6.3 Dev Rollback (Emergency)

Same as master but on dev. Requires 2 approvals.

### 6.4 Pre-push Hook Bypass (Local Development)

**When:** Exceptional situation where the hook blocks a legitimate push

```bash
# Emergency use only, documented
git push --no-verify
```

**Note:** The GitHub Ruleset still validates server-side.

### 6.5 GitHub Ruleset Bypass (Admin)

**When:** Documented operations requiring temporary branches

**Process:**

1. Open issue: "ruleset bypass: create temporary branch X for Y"
2. 1 maintainer approval
3. Admin creates the branch with override
4. Document the steps taken in the issue

---

## 7. Automatic Cleanup

- **Auto-delete head branches:** ✅ Enabled (Settings → General)
- **Effect:** PR branches are auto-deleted on merge into **master**
- **Dev:** NOT auto-deleted ("no deletions" protection) — keep clean manually

---

## 8. Allowed / Forbidden Commands

| Command                       | master       | dev          | feature/\*      |
| ----------------------------- | ------------ | ------------ | --------------- |
| `git push` (no force)         | ❌ (PR only) | ❌ (PR only) | ✅              |
| `git push --force`            | ❌\*         | ❌\*         | ✅ (own branch) |
| `git push --force-with-lease` | ❌\*         | ❌\*         | ✅              |
| `git rebase -i` (public)      | ❌           | ❌           | ✅              |
| `git cherry-pick` + push      | ✅ (via PR)  | ✅ (via PR)  | ✅              |
| `git tag`                     | ✅ (release) | ❌           | ❌              |

_\* See exceptions §6_

**Pre-push hook bypass:** `git push --no-verify` (GitHub Ruleset still validates)

---

## 9. CI Governance Job (`.github/workflows/branch-governance.yml`)

This job **fails CI** when it detects violations (Layer 3 - Audit):

1. **Extra branches:** Detects remote branches outside the convention
2. **Ancestor policy:** `master` must be an ancestor of `dev` (`git merge-base --is-ancestor master dev`)
3. **Orphan commits on master:** `git log --oneline dev..master --grep -v "sync|chore|backport" | wc -l` > 0
4. **Force-push detected (24h):** `git reflog --since="24 hours ago" | grep -E "force-push|push --force" | wc -l` > 0 (on master/dev)

**Note:** This workflow is informational and audit-only. Real prevention happens in Layers 1 and 2.

---

## 10. Quick References

| Action                   | Command                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| View current protection  | `gh api repos/OWNER/REPO/branches/BRANCH/protection`                       |
| View rulesets            | `gh api repos/OWNER/REPO/rulesets`                                         |
| View specific ruleset    | `gh api repos/OWNER/REPO/rulesets/ID`                                      |
| View remote branches     | `git ls-remote --heads origin`                                             |
| View ancestry            | `git merge-base --is-ancestor master dev && echo "master ancestor of dev"` |
| View unique commits      | `git log --oneline master..dev` / `git log --oneline dev..master`          |
| Create PR                | `gh pr create --base BASE --head HEAD --title "..." --body "..."`          |
| Squash merge             | `gh pr merge --squash --delete-branch`                                     |
| Test pre-push hook local | `git push --dry-run` (runs hook without pushing)                           |
| Bypass pre-push hook     | `git push --no-verify` (documented emergencies)                            |

---

## 11. Changelog of This Document

| Version | Date       | Changes                                                                                                                                 | Author        |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 2.0     | 2026-08-29 | 3-layer architecture (pre-push hook + GitHub Ruleset + Branch Governance). Removed Branch Naming workflow. Updated enforcement strategy | Bryan Stevens |
| 1.0     | 2026-08-22 | Initial creation (Plan sync-repos-governance)                                                                                           | Bryan Stevens |

---

> **Reminder:** This document is the single source of truth for branch governance. Any change requires a PR to `dev` → `master` with 2 approvals.

---

## 12. Automatic master → dev Sync

**Problem:** Commits on `master` missing from `dev` cause conflicts in `dev` → `master` PRs.

**Solution:** Automatic workflow syncing `master` → `dev` after every push to `master`.

### 12.1 Workflow: sync-master-to-dev.yml

**Trigger:** `push` to `master` (also manual via `workflow_dispatch`)

**Behavior:**

1. Attempts to rebase `dev` onto `master` (`git rebase origin/master`)
2. If the rebase succeeds → `git push --force-with-lease origin dev`
3. If the rebase fails (conflicts):
   - Aborts the rebase
   - Creates a `sync/master-to-dev-<timestamp>` branch
   - Opens an automatic PR to `dev` titled `"chore: sync master → dev (auto, conflicts detected)"`
   - The PR requires manual conflict resolution

**Benefits:**

- **Automatic prevention:** `dev` always contains `master` commits
- **Zero divergence:** Eliminates conflicts in `dev` → `master` PRs
- **Manual fallback:** On conflicts, creates a PR for human resolution
- **Non-invasive:** Only force-rebases when fast-forward

### 12.2 Full Flow with Automatic Sync

```
master (PR merged) ──► workflow: sync-master-to-dev ──┬──► rebase succeeded
                                                        │     └──► force-push to dev
                                                        │
                                                        └──► conflicts detected
                                                              └──► creates PR sync/* → dev
                                                                   └──► manual resolution
```

### 12.3 Conflict Handling

**If the workflow fails with conflicts:**

1. GitHub Actions automatically opens a PR from `sync/master-to-dev-<timestamp>` → `dev`
2. A maintainer must:
   - Review the PR
   - Resolve conflicts locally:
     ```bash
     git fetch origin
     git checkout sync/master-to-dev-<timestamp>
     git rebase origin/dev
     # Resolve conflicts manually
     git push --force-with-lease origin sync/master-to-dev-<timestamp>
     ```
   - Approve and merge the PR

**Important:** This flow guarantees `dev` never diverges from `master` for more than one PR cycle.

### 12.4 Exceptions and Considerations

- **`dev` protection:** The workflow has permission to force-push to `dev` (required for rebase)
- **Rate limit:** The workflow only runs on push to `master` (max ~10-20 times/day on active projects)
- **Audit:** All automatic syncs are recorded in `dev` history
