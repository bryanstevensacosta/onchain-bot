# Git Flow & Branch Strategy

**Last Updated**: 2026-09-04  
**Repository**: Alpha Meta Token Scanner (Monorepo)

## Overview

This repository follows a **simplified Git Flow** with two main branches and linear history enforcement on `master`. All merges to `master` must use **squash** or **rebase** (merge commits are disabled).

## Branch Structure

```
master (protected)     → Production (144.126.203.139)
  ↑
  PR only (squash/rebase)
  ↑
dev (protected)        → Staging
  ↑
  Direct work OR feature branches
```

### Branch Rules

| Branch   | Protection | Merge Strategy     | Deploy Target | Direct Push          |
| -------- | ---------- | ------------------ | ------------- | -------------------- |
| `master` | ✅ Yes     | Squash/Rebase only | Production    | ❌ No (PR only)      |
| `dev`    | ✅ Yes     | Squash (preferred) | Staging       | ✅ Yes (after merge) |

### Why Squash/Rebase Only?

**Master has `require_linear_history: true`** enabled, which:

- ✅ Keeps history clean and readable
- ✅ Makes `git bisect` easier
- ✅ Simplifies rollbacks
- ❌ Prevents merge commits (no merge bubbles)

## Squash vs Rebase: When to Use Each

### Use **Squash Merge** ✅ (Default)

**When:**

- Merging feature branches to `dev`
- Merging `dev` to `master`
- Multiple commits that tell a story (WIP, fix typo, etc.)

**Why:**

- Combines all commits into one clean commit
- Removes intermediate "fix", "wip", "oops" commits
- Cleaner history in target branch

**Example:**

```bash
# Feature branch has:
- feat: add user auth
- fix: typo in login
- wip: debugging
- fix: tests

# After squash merge to dev:
- feat: add user authentication (#123)
```

### Use **Rebase Merge** (Rare)

**When:**

- Each commit in the PR is meaningful and well-crafted
- Commits follow conventional commit format
- You want to preserve the commit history

**Why:**

- Preserves individual commits
- Keeps author information per commit
- Better for audit trails

**Example:**

```bash
# Feature branch has:
- feat(auth): add JWT token generation
- feat(auth): add token validation middleware
- test(auth): add integration tests
- docs(auth): update API documentation

# After rebase merge to dev:
All 4 commits appear individually in dev history
```

**⚠️ Use rebase only if:**

1. Every commit is production-ready
2. Every commit has a meaningful message
3. You want granular history

**Default recommendation: Use squash for 95% of cases.**

## Development Workflows

### Workflow 1: Direct Work on `dev` (Solo Developer)

**Best for**: Small changes, quick fixes, solo development

```bash
# ═══════════════════════════════════════════════════
# Daily Development
# ═══════════════════════════════════════════════════

# 1. Start work (ALWAYS pull first)
git checkout dev
git pull origin dev  # Critical: sync with remote

# 2. Make changes
# ... edit code ...
git add .
git commit -m "feat(module): add new feature"

# 3. Push to dev
git push origin dev

# Result: Auto-deploy to staging ✅

# ═══════════════════════════════════════════════════
# Deploy to Production
# ═══════════════════════════════════════════════════

# 1. Create PR from dev to master
gh pr create --base master --head dev \
  --title "release: Deploy features X, Y, Z" \
  --body "## Changes
- Feature X
- Feature Y
- Bugfix Z

## Tested in Staging
✅ All features verified
✅ No regressions"

# 2. Wait for CI checks to pass

# 3. In GitHub: Click "Squash and merge"
# Result: Auto-deploy to production ✅

# 4. ⚠️ CRITICAL: Sync dev with master
git checkout master
git pull origin master   # Get the squashed commit

git checkout dev
git pull origin dev      # Sync remote dev first
git merge master         # Bring master's squashed commit into dev
git push origin dev      # Push the sync

# Now dev and master are synchronized ✅
```

### Workflow 2: Feature Branch Development (Team/Complex Features)

**Best for**: Large features, team collaboration, isolated work

```bash
# ═══════════════════════════════════════════════════
# Create Feature Branch
# ═══════════════════════════════════════════════════

# 1. Start from dev
git checkout dev
git pull origin dev
git checkout -b feature/user-authentication

# 2. Develop feature
# ... make changes ...
git add .
git commit -m "feat(auth): add JWT token generation"
git commit -m "feat(auth): add login endpoint"
git commit -m "test(auth): add integration tests"

# 3. Push feature branch
git push origin feature/user-authentication

# 4. Create PR to dev
gh pr create --base dev --head feature/user-authentication \
  --title "feat: User authentication system" \
  --body "Implements JWT-based authentication"

# 5. After CI passes: Squash merge to dev
# (In GitHub UI: "Squash and merge")

# Result: Auto-deploy to staging ✅

# 6. Clean up
git checkout dev
git pull origin dev
git branch -d feature/user-authentication

# ═══════════════════════════════════════════════════
# Later: Deploy to Production (same as Workflow 1)
# ═══════════════════════════════════════════════════
```

### Workflow 3: Hotfix to Production (Urgent)

**Best for**: Critical bugs in production

```bash
# ═══════════════════════════════════════════════════
# Hotfix Directly to Master
# ═══════════════════════════════════════════════════

# 1. Create hotfix branch from master
git checkout master
git pull origin master
git checkout -b hotfix/critical-security-fix

# 2. Make the fix
# ... fix bug ...
git add .
git commit -m "fix(security): patch XSS vulnerability"

# 3. Push and PR to master
git push origin hotfix/critical-security-fix
gh pr create --base master --head hotfix/critical-security-fix \
  --title "fix: Critical security patch" \
  --body "Fixes XSS vulnerability in user input"

# 4. After CI: Squash merge to master
# Result: Auto-deploy to production ✅

# 5. ⚠️ CRITICAL: Backport to dev
git checkout dev
git pull origin dev
git merge master  # Bring the hotfix into dev
git push origin dev

# Now both branches have the fix ✅
```

## Critical Rules

### ✅ DO

1. **Always `git pull` before starting work** (even if you're solo)
2. **Always sync dev with master after merging to master**
3. **Use conventional commits** (`feat:`, `fix:`, `chore:`, etc.)
4. **Test in staging before promoting to production**
5. **Use squash merge by default** (cleaner history)

### ❌ DON'T

1. **Never push directly to master** (protected, PR only)
2. **Never skip syncing dev after master merge** (causes conflicts)
3. **Never force push to protected branches** (protected)
4. **Never skip CI checks** (required for merge)
5. **Never use merge commits** (linear history enforced)

## Common Scenarios

### Scenario 1: "I forgot to sync dev after merging to master"

**Problem**: Next PR from dev to master has conflicts

**Solution**:

```bash
# Sync dev with master now
git checkout dev
git pull origin dev
git merge master  # May have conflicts
# Resolve conflicts if any
git push origin dev

# Close conflicting PR and create new one
gh pr close <old-pr-number>
gh pr create --base master --head dev
```

### Scenario 2: "I need to undo my last commit on dev"

**Before pushing**:

```bash
git reset HEAD~1  # Undo commit, keep changes
# or
git reset --hard HEAD~1  # Undo commit, discard changes
```

**After pushing**:

```bash
git revert HEAD  # Creates a new commit that undoes the last one
git push origin dev
```

### Scenario 3: "I made changes on master by mistake"

```bash
# Move changes to dev
git stash
git checkout dev
git stash pop
git add .
git commit -m "feat: the feature"
git push origin dev
```

### Scenario 4: "Merge conflicts when syncing dev with master"

```bash
git checkout dev
git merge master
# CONFLICT appears

# Resolve conflicts in your editor
# Then:
git add .
git commit  # Completes the merge
git push origin dev
```

## Why Always Pull?

Even if you're the only developer, **always pull before starting work** because:

1. **GitHub Actions create commits**:
   - Release Please creates release PRs
   - Auto-sync workflows merge automatically
2. **Merges happen on GitHub**:
   - Squash merges create commits on the server
   - Your local doesn't know about them until you pull

3. **Multiple machines**:
   - Work laptop vs desktop
   - Kiro on different environments

**Example of what goes wrong**:

```
Your local (dev):    A -- B -- C
GitHub (dev):        A -- B -- C -- [D from master sync]
                                     ↑ You don't have this

Without pull:
- Next push creates a merge conflict
- Or worse, overwrites the sync commit
```

## Automated Workflows

### On Push to `dev`

```yaml
Triggers:
  - CI (tests, lint, build)
  - Deploy to staging
```

### On Merge to `master`

```yaml
Triggers:
  - CI (tests, lint, build)
  - Deploy to production
  - Release Please (creates release PR)
  - Sync master → dev (optional, can be manual)
```

## Quick Reference Card

```bash
# Daily work on dev
git checkout dev && git pull origin dev
# ... make changes ...
git add . && git commit -m "feat: new feature"
git push origin dev

# Deploy to production
gh pr create --base master --head dev --title "release: ..."
# Wait for CI, then squash merge in GitHub UI
git checkout master && git pull origin master
git checkout dev && git merge master && git push origin dev

# Feature branch (alternative)
git checkout -b feature/name
# ... make changes ...
git push origin feature/name
gh pr create --base dev --head feature/name
# Squash merge to dev in GitHub UI
```

## Troubleshooting

### "Cannot merge: conflicts"

→ Sync dev with master first (see Scenario 4)

### "CI failing on PR"

→ Check logs, fix issues, push again to same branch

### "Squash button disabled"

→ Wait for required checks to pass

### "Push rejected (protected branch)"

→ Never push directly to master, use PRs

## Related Documentation

- **Branch Protection**: Settings → Branches → master
- **Conventional Commits**: [conventionalcommits.org](https://www.conventionalcommits.org/)
- **CI Workflows**: `.github/workflows/`
- **GOVERNANCE.md**: Release process and versioning
- **AGENTS.md**: Project structure and conventions

---

**For questions or issues**: Check this document first, then review closed PRs for examples.
