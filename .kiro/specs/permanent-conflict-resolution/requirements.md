# Permanent Conflict Resolution

## Problem Statement

Recurrent merge conflicts between `dev` and `master` branches due to:

1. Commits merged to `master` that are not in `dev`
2. Parallel development in both branches
3. GitHub detecting divergence as "conflicts" even when no code conflicts exist
4. Current sync workflow (master→dev after merge) doesn't prevent conflicts in NEW PRs

## Root Cause

The sync workflow `.github/workflows/sync-master-to-dev.yml` runs AFTER a merge to `master`, but this doesn't help the NEXT PR from `dev` to `master` because `dev` has moved forward with new commits.

**Timeline:**

1. PR #86 (`dev` → `master`) merged ✅
2. Sync workflow creates PR #87 (`master` → `dev`) ✅
3. PR #87 merged ✅
4. Developer adds fix to `dev` (commit d3ef790)
5. PR #88 (`dev` → `master`) created ❌ **CONFLICTS** because:
   - `master` has commits from PR #86
   - `dev` has commits from PR #86 + PR #87 + d3ef790
   - Git sees divergent histories

## Requirements

### REQ-1: Prevent conflicts in dev→master PRs

**Must** ensure `dev` is always up-to-date with `master` BEFORE creating a PR from `dev` to `master`.

### REQ-2: Automatic rebase-or-merge strategy

**Must** automatically update `dev` with `master` changes using:

- Rebase if `dev` history is linear
- Merge if rebase would create conflicts

### REQ-3: Branch protection compatibility

**Must** work with existing branch protections:

- No merge commits in `dev` (linear history required)
- No force-push to `dev`

### REQ-4: Developer workflow unchanged

**Should not** require developers to manually sync branches before creating PRs.

### REQ-5: Fail-safe mechanism

**Must** detect when automatic sync fails and notify developer.

## Proposed Solution

**Option A: Pre-PR sync check**

- Add a GitHub Action that runs on PR open/synchronize
- Checks if `dev` is behind `master`
- If behind, automatically rebases `dev` on `master` and updates PR

**Option B: Scheduled sync**

- Run sync workflow every hour (not just after merges)
- Ensures `dev` is never more than 1 hour behind `master`

**Option C: Branch protection rule**

- Require `dev` branch to be up-to-date before allowing PR creation
- Forces developer to sync locally before PR

**Recommended: Option A** (most automatic, least intrusive)

## Acceptance Criteria

1. ✅ No more "CONFLICTING" status in dev→master PRs when no code conflicts exist
2. ✅ Automatic resolution of divergent histories
3. ✅ Preserves linear history in both branches
4. ✅ Works with existing branch protections
5. ✅ Developer can create PR from `dev` to `master` without manual sync

## Out of Scope

- Resolving actual code conflicts (developer must handle these)
- Changing existing branch protection rules
- Modifying commit history already in `master`
