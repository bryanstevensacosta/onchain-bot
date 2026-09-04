# Git Flow & Branch Strategy

**Last Updated**: 2026-09-04  
**Repository**: Alpha Meta Token Scanner (Monorepo)

## Branch Structure & Rules

```
master (protected)     → Production (144.126.203.139)
  ↑ PR only, squash/rebase merge
dev (protected)        → Staging
  ↑ Direct commits allowed
```

| Branch   | Merge to Master | Deploy Target | Direct Commits | Merge Strategy   |
| -------- | --------------- | ------------- | -------------- | ---------------- |
| `master` | N/A             | Production    | ❌ Never       | N/A              |
| `dev`    | PR only         | Staging       | ✅ Yes         | Squash (default) |

**Critical**: Master has `require_linear_history: true` — only squash/rebase allowed, no merge commits.

## LLM Agent Rules

### Default Behavior

- **All work happens on `dev` branch**
- **All commits go to `dev`**
- **All pushes go to `dev`**
- **Never work on master** (protected, PR-only)
- **Only create PR to master when explicitly instructed**

### Workflow

```bash
# Daily work (default)
git checkout dev
git pull origin dev
# ... make changes ...
git add .
git commit -m "feat(module): description"
git push origin dev
# Result: Auto-deploy to staging

# PR to master (only when explicitly requested)
gh pr create --base master --head dev \
  --title "release: ..." \
  --body "..."
# After merge: MUST sync dev with master (see below)
```

## Atomic Commits

**One logical change per commit**. Good commits are:

- **Focused**: Single concern (one feature, one fix, one refactor)
- **Complete**: Tests pass, code compiles
- **Reversible**: Can be reverted without breaking anything

### Examples

✅ **Good** (atomic):

```bash
git commit -m "feat(auth): add JWT token generation"
git commit -m "feat(auth): add token validation middleware"
git commit -m "test(auth): add JWT integration tests"
```

❌ **Bad** (not atomic):

```bash
git commit -m "feat: add auth + fix bug + refactor utils"  # Too much
git commit -m "wip: debugging"  # Incomplete
git commit -m "fix typo"  # Missing context
```

### Conventional Commits (Required)

Format: `<type>(<scope>): <description>`

**Types**:

- `feat`: New feature
- `fix`: Bug fix
- `chore`: Maintenance (deps, config)
- `docs`: Documentation only
- `test`: Tests only
- `refactor`: Code restructure (no behavior change)
- `perf`: Performance improvement
- `style`: Formatting, no code change

**Scope** (optional): `auth`, `api`, `db`, `ui`, module name

**Examples**:

```bash
feat(auth): implement OAuth2 flow
fix(api): handle null response in user endpoint
chore(deps): update TypeScript to 5.7
docs: update API documentation
test(payments): add Stripe webhook tests
refactor(db): extract query builder to separate class
```

## Git Hooks (Husky v9)

### Configured Hooks

| Hook         | Actions                                              | Blocks? |
| ------------ | ---------------------------------------------------- | ------- |
| `pre-commit` | lint-staged (ESLint) → TypeScript check → docs check | ✅ Yes  |
| `commit-msg` | commitlint (conventional commits)                    | ✅ Yes  |
| `pre-push`   | Run all tests (backend Jest + frontend Vitest)       | ✅ Yes  |

### Hook Locations

- `.husky/pre-commit` — Runs before commit
- `.husky/commit-msg` — Validates commit message format
- `.husky/pre-push` — Runs tests before push
- `lint-staged.config.js` — ESLint on staged files per workspace
- `commitlint.config.js` — Extends `@commitlint/config-conventional`

### Bypass Hooks (Rare)

```bash
git commit --no-verify -m "..."  # Skip all hooks
git push --no-verify             # Skip pre-push tests
```

**Only bypass when**:

- CI is broken (not your fault)
- Emergency hotfix needed immediately
- Hook has a bug (fix it after)

## Squash vs Rebase

**Default: Always use Squash** (95% of cases)

### Squash Merge ✅ (Default)

- Combines all commits into one
- Clean history in target branch
- Removes WIP/fixup commits
- **Use for**: Feature branches → dev, dev → master

### Rebase Merge (Rare)

- Preserves individual commits
- Each commit must be production-ready
- **Use only if**: Every commit is well-crafted and meaningful

## Critical Post-Merge Sync

**After every squash merge to master**, immediately sync dev:

```bash
git checkout master && git pull origin master
git checkout dev && git pull origin dev
git merge master
git push origin dev
```

**Why?** Squash creates new commit SHA. Without sync, next PR will conflict.

## Daily Workflow (Solo Dev)

```bash
# Start day
git checkout dev
git pull origin dev

# Work loop
# ... make changes ...
git add .
git commit -m "feat(x): y"
git push origin dev
# Repeat

# Deploy to production (when instructed)
gh pr create --base master --head dev --title "release: X"
# Wait for CI, then squash merge in GitHub
# Then sync dev with master (see above)
```

## Feature Branch Workflow (Team)

```bash
# Create feature
git checkout dev
git pull origin dev
git checkout -b feature/name

# Develop
git add .
git commit -m "feat: ..."
git push origin feature/name

# PR to dev
gh pr create --base dev --head feature/name
# Squash merge in GitHub

# Cleanup
git checkout dev
git pull origin dev
git branch -d feature/name
```

## Common Scenarios

### Forgot to sync dev after master merge

```bash
git checkout dev
git pull origin dev
git merge master  # Resolve conflicts if any
git push origin dev
```

### Undo last commit (before push)

```bash
git reset HEAD~1  # Keep changes
# or
git reset --hard HEAD~1  # Discard changes
```

### Undo last commit (after push)

```bash
git revert HEAD  # Creates new commit
git push origin dev
```

### Made changes on master by mistake

```bash
git stash
git checkout dev
git stash pop
git add . && git commit -m "..."
git push origin dev
```

### PR has conflicts or CI failures

**IMPORTANT: Never create a new PR. Fix in the existing branch.**

```bash
# Fix conflicts or errors locally on dev
git checkout dev
git pull origin dev

# Option 1: Sync with master to resolve conflicts
git merge master
# Resolve conflicts if any, then:
git add .
git commit -m "chore: resolve merge conflicts"

# Option 2: Fix CI failures
# ... fix the code ...
git add .
git commit -m "fix: resolve CI failures"

# Push to dev
git push origin dev
# ✅ PR automatically updates
# ✅ CI checks re-run
# ✅ Conflicts disappear
```

**Why this works**:

- PRs are linked to branches, not commits
- Any push to `dev` updates the PR automatically
- GitHub re-runs checks on new commits
- Creating a new PR is unnecessary and creates duplicate work

## Troubleshooting

| Issue                       | Solution                              |
| --------------------------- | ------------------------------------- |
| "Cannot merge: conflicts"   | See "PR has conflicts or CI failures" |
| "CI failing on PR"          | See "PR has conflicts or CI failures" |
| "Squash button disabled"    | Wait for required checks to pass      |
| "Push rejected (protected)" | Never push to master, use PRs         |
| "Commit message rejected"   | Use conventional commits format       |
| "Pre-commit hook failed"    | Fix lint/TS errors before commit      |

## Why Always Pull?

Even solo dev must pull because:

1. GitHub Actions create commits (Release Please)
2. Squash merges happen on server
3. Auto-sync workflows may run

**Without pull**:

```
Local:  A -- B -- C
Remote: A -- B -- C -- D (from workflow)
                        ↑ You don't have this
Next push: CONFLICT
```

## Quick Reference

```bash
# Default workflow (all work on dev)
git checkout dev && git pull origin dev
git add . && git commit -m "feat: ..."
git push origin dev

# PR to master (only when instructed)
gh pr create --base master --head dev --title "release: ..."
# After merge: sync dev
git checkout master && git pull origin master
git checkout dev && git merge master && git push origin dev

# Bypass hooks (emergency only)
git commit --no-verify -m "..."
```

## Related Files

- `.husky/` — Git hooks configuration
- `lint-staged.config.js` — Pre-commit lint rules
- `commitlint.config.js` — Commit message validation
- `.github/workflows/` — CI/CD automation
- `GOVERNANCE.md` — Release process
- `AGENTS.md` — Project structure

---

**For LLM agents**: Follow "Default Behavior" rules strictly. Work on `dev`, push to `dev`, only PR to master when explicitly told.
