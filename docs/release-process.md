# Release Process

> **Owner:** Solo maintainer. **Automation:** [release-please](https://github.com/googleapis/release-please).

This document defines **how releases happen** in this repository. The default flow
is fully automated; manual intervention is reserved for hotfixes and emergency
patch releases.

---

## TL;DR

- **Default path:** Conventional commits on `master` → release-please opens a PR
  `chore(main): release 1.x.0` → squash-merge → tag + GitHub Release + manifest
  bump happen automatically. **No human action required.**
- **Hotfix path:** `workflow_dispatch` on `release-please.yml` with `force: true`
  OR a manual `gh release create`. Documented in §"Manual hotfix" below.

---

## Automation: how a release happens

### 1. Conventional commits drive SemVer

All commits on `master` (or PRs targeting it) must follow
[Conventional Commits](https://www.conventionalcommits.org/) — enforced by
[commitlint](https://github.com/conventional-changelog/commitlint) in the
`commit-msg` Husky hook.

| Commit prefix               | SemVer bump           | Example                                 |
| --------------------------- | --------------------- | --------------------------------------- |
| `feat:`                     | **minor** (0.x.0)     | `feat(governance): add 4-rule check`    |
| `fix:`                      | **patch** (0.0.x)     | `fix(telegram): prevent session wedge`  |
| `feat!:` / `BREAKING CHANGE:` footer | **major** (x.0.0) | `feat(api)!: drop /v1 endpoints`        |
| `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `build:`, `ci:` | no bump (rolls into next `feat`/`fix`) | `ci: cache node_modules` |

`config: bump-minor-pre-major: true` in `.github/release-please-config.json`
means pre-1.0.0 `feat:` commits also bump minor (we are at 1.x so this is mostly
historical).

### 2. release-please workflow

Triggered by `push` to `master` (`.github/workflows/release-please.yml`):

1. Reads `.github/release-please-manifest.json` to find current published version
   (e.g. `1.2.0`).
2. Scans all commits since that version, classifies by conventional prefix.
3. Decides next version:
   - any `feat:` → minor bump (1.2.0 → 1.3.0)
   - only `fix:` → patch bump (1.2.0 → 1.2.1)
   - `feat!:` / `BREAKING CHANGE:` → major bump (1.2.0 → 2.0.0)
4. Opens (or updates) PR `chore(main): release 1.x.0` containing:
   - Updated `CHANGELOG.md` with sections (`Features`, `Bug Fixes`,
     `BREAKING CHANGES`, etc.) grouped by area.
   - Bumped `.github/release-please-manifest.json`.
5. Maintainer reviews the PR (auto-generated, but eyes still useful).
6. Squash-merge the PR to `master`. release-please then:
   - Creates a Git tag `v1.x.0` pointing at the merge commit.
   - Creates a GitHub Release with the same body as the PR.
   - Marks the release as `latest` automatically.

### 3. Manifest is the source of truth

`.github/release-please-manifest.json` is **the only file** that tracks the
currently-published version in source control.

```json
{ ".": "1.2.0" }
```

> ⚠️ Do **not** hand-edit this file to bump versions. The next release-please
> run will overwrite it. Hand-edit only to **reset** release-please state (see
> "Recovery" below).

---

## What you (the maintainer) actually do

Most releases require **zero** human work — just merge the release-please PR.

| Trigger                              | What happens                                         | What you do                                  |
| ------------------------------------ | ---------------------------------------------------- | -------------------------------------------- |
| You merged `feat:` commits to master | release-please PR opens with `Release 1.x.0`         | Review + squash-merge. Done.                 |
| You merged `fix:` only to master     | release-please PR opens with `Release 1.x.y`         | Review + squash-merge. Done.                 |
| You merged breaking changes          | release-please PR opens with `Release 2.0.0`         | Verify the major bump is intentional, merge. |
| You merged `chore:`/`ci:` only       | No release PR (no version bump)                      | Nothing. Sits in the next `feat:`/`fix:`.    |
| Hotfix needed on top of a release    | See "Manual hotfix" below                            | Either `workflow_dispatch` or `gh release`.  |

---

## Manual hotfix (emergency)

> Use this **only** for emergency patches you cannot route through the normal
> release-please flow. The default path is automated.

### Option A — `workflow_dispatch` (recommended for hotfix)

`.github/workflows/release-please.yml` supports `workflow_dispatch` with a
`force` input. From the GitHub UI:

1. Actions → "Release Please" → "Run workflow" → branch `master`.
2. Untick the `release-type` default if you want a specific bump.

OR from the CLI:

```bash
gh workflow run release-please.yml --ref master -f release-type=patch
```

This bypasses the conventional-commit version-detection and forces a specific
bump. Use it when:

- You need to **force a release** even though release-please doesn't think one
  is warranted (e.g. a `chore:`-only merge you still want to ship).
- You need to **rebuild** a release that failed mid-flight (tag created but
  manifest not bumped, etc.).

### Option B — fully manual `gh release create`

For a true emergency (release-please broken, CI down, etc.):

```bash
# Pick the next version
NEW="1.2.1"

# Tag + push
git tag -a "v${NEW}" -m "Release v${NEW}" origin/master
git push origin "v${NEW}"

# Create the GitHub Release
gh release create "v${NEW}" \
  --title "v${NEW}" \
  --notes-file - <<EOF
## Release v${NEW}

Hotfix. See commits since v1.2.0.
EOF

# CRITICAL: update manifest to match — release-please won't auto-detect this
echo '{ ".": "'${NEW}'" }' > .github/release-please-manifest.json
git add .github/release-please-manifest.json
git commit -m "chore(release): manually bump manifest to ${NEW}"
git push origin master
```

> The last step (manifest update) is what release-please would have done. If
> you skip it, the **next** release-please run will mis-detect the current
> version and may publish a duplicate or skip a version.

---

## Recovery procedures

### "release-please published v1.2.0 but manifest still says 1.1.0"

This happens when the release-PR was squash-merged but the manifest update was
reverted or the workflow was interrupted.

```bash
# Fix manifest locally, push to master
echo '{ ".": "1.2.0" }' > .github/release-please-manifest.json
git add .github/release-please-manifest.json
git commit -m "chore(release): align manifest to published v1.2.0"
git push origin master
```

### "GitHub shows v1.1.0 as latest, but v1.2.0 is the real latest"

GitHub's `isLatest` flag is set by **creation order**, not by SemVer. If v1.1.0
was created after v1.2.0 (e.g. retro-tagged from history), it becomes `latest`.

```bash
gh release edit v1.2.0 --latest
gh release list --json tagName,isLatest
# [{ "tagName": "v1.2.0", "isLatest": true }, ...]
```

> release-please itself calls `gh release edit <new> --latest` on every
> successful run, so this drift should not recur under the automated flow.

### "I want to undo a release"

Do **not** delete the tag or the GitHub Release — both are part of the public
record. Instead:

1. Publish a new release that reverts the change (preferred).
2. Or `git revert` the merge commit and let release-please pick it up in the
   next cycle.

---

## Verification commands

```bash
# What does GitHub say is latest?
gh release list --json tagName,isLatest,publishedAt

# What does the source-of-truth manifest say?
cat .github/release-please-manifest.json

# Is release-please configured for simple releases?
cat .github/release-please-config.json

# Last 10 conventional commits (what release-please will scan)
git log --pretty='%h %s' -10 origin/master

# Dry-run release-please locally (requires Node + npx)
npx release-please release-pr --dry-run \
  --config-file .github/release-please-config.json \
  --manifest-file .github/release-please-manifest.json \
  --token "${GITHUB_TOKEN}"
```

---

## Related documents

- [CI/CD pipeline & runbook](./ci-cd.md) — pipeline diagram, oncall, rollback
- [Branch Protection Policy](./branch-protection.md) — gate rules on `master`/`dev`
- [`.github/release-please-config.json`](../.github/release-please-config.json)
- [`.github/release-please-manifest.json`](../.github/release-please-manifest.json)
- [`.github/workflows/release-please.yml`](../.github/workflows/release-please.yml)
- [`GOVERNANCE.md`](../GOVERNANCE.md) — overall branching model + hotfix policy
