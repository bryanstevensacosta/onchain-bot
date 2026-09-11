# RELEASE-FLOW.md — Manual releases (solo-dev)

> Owner: solo maintainer. No automation. release-please was removed (see git history); this file is the whole process.
> Scope: 3 apps versioned independently: `backend`, `frontend`, `ingestion`. Enterprise playbooks live in sections 7-12 below (rollback, hotfix, flags freeze, optional tag signing, changelog strategy, Unreleased convention).

## 1. When to release

Release when it is worth it, not on a schedule. No trains, no freeze, no notifications.

- Ship an app when its changelog section is written and `dev` is green (CI pass on the PR).
- Each app releases on its own clock. If only backend changed, only backend gets a tag. Never bump the other two "to keep them in sync".
- Typical triggers: a user visible fix is verified, a feature is done and smoke checked, or queued fixes pile up enough to justify the push to `master`.
- Do not release chore, ci, docs, or refactor only commits. They ride along with the next feat or fix.
- Flow reminder: work lands on `dev` by PR, then squash to `master` for deploy. Tag from `master` after the squash lands.

## 2. Version judgment: major, minor, patch

SemVer per app, judged on what that app's users (or its consumers) feel. A breaking change in backend is a major for backend only, not for frontend.

### Major (X.0.0): real breaking change with cited evidence

A major needs proof: a commit or PR that removes or renames something consumers rely on, drops an endpoint, changes a schema in an incompatible way, or forces a config move. Quote the evidence in the changelog entry.

Real examples from this repo (all three footers were first introduced on `dev` inside the range of merge `2b55629`, per `.omo/evidence/task-3-manual-release-flow.tsv`):

- `351fe02` "BREAKING CHANGE: MTProto credentials must now be in ingestion-service ONLY". Breaking for backend and ingestion (config move, old backend MTProto mode is rollback only). Not breaking for frontend (no frontend files touched by that change), so frontend would not take a major for it.
- `352de6b` "BREAKING CHANGE: Seed-based channel subscription deprecated in favor of DB-driven approach". Breaking where seed wiring existed (backend, ingestion). Judge per app: major only where the removed path was usable.
- `b66beda` "BREAKING CHANGE: CryptoNewsSeeder completely removed from module wiring". Same rule: major where the seeder was wired, nowhere else.

Rule: scope the major to the apps that actually break. A backend breaking change does not bump frontend to the next major.

Rule on accidents: a fix with a stray `!` or a pasted `BREAKING CHANGE:` footer is NOT a major. Remove the `!`, drop the footer, do not bump the version. (This repo lived that mistake: squash bodies re-emitted the MTProto footer up to 96 times in one body, e.g. HIT=96 in `0573b06` quoted by merge `d1eedd9`. Re-emission is not a new breaking change.)

### Minor (x.Y.0): feat without breaking

New endpoint, new screen, new optional config, new command. Backward compatible by definition. If it carries a breaking footer, it is not a minor, it is a major.

Real example pattern: a `feat:` merge with zero breaking footers in its brought-in bodies (HIT=0 on both parents). The TSV has few clean feat rows because most feat merges in the audited range re-emitted the old MTProto footer; when you judge a feat, verify with `git log --format=%B` on the squashed range and confirm no `BREAKING CHANGE:` line describes a live incompatibility before calling it minor.

### Patch (x.y.Z): fix without breaking

Bug fix, NULL safety, query correction, CI fix that ships product code, perf fix with no API change. Real examples, all verified `commit` via `git cat-file -t` and all HIT=0 (no `!`, no footer) per the TSV:

- `d5eeba2` (fix, ingestion, PR=NONE, brought-in `73df116` HIT=0). Net diff is 2 ingestion spec files. Patch for ingestion only.
- `ba4a69f` (fix, PR #150, brought-ins `a527fea` + `901a0a0` HIT=0). The `901a0a0` migration is NULL-safe additive (`queued_at` NULL handling), explicitly not an incompatible schema change. Patch, scoped to the apps it touched.
- `b4f1781` (fix, PR #128, brought-in `89d442c` HIT=0). One file CI change (deploy workflow, 1 deletion). No app code touched, so on its own it would not even trigger a release (rides with the next fix).

## 3. Exact steps

Do them in order, per app. `<app>` is one of `backend`, `frontend`, `ingestion`. Never use a bare `v*` tag.

```bash
# 0. Be on dev, clean tree, know your base SHA (the master squash commit you ship)
git status --porcelain
git branch --show-current   # must print: dev
BASE=<sha-of-master-squash> # e.g. BASE=$(git rev-parse master)

# 1. Bump the app version in its package.json (edit the file, then validate)
#    apps/<app>/package.json: "version": "X.Y.Z"  (X.Y.Z judged per section 2)
python3 -m json.tool apps/<app>/package.json > /dev/null && echo JSON-OK

# 2. Add the changelog entry at the top of apps/<app>/CHANGELOG.md
#    under a new "## [X.Y.Z] - YYYY-MM-DD" header, Keep-a-Changelog style,
#    one bullet per change, each citing its commit or PR. Then re-read it once.

# 3. Commit the two files, push to dev, merge to master by PR (squash), per GOVERNANCE.md
git add apps/<app>/package.json apps/<app>/CHANGELOG.md
git commit --no-verify -m "docs(release): <app> vX.Y.Z - <one-line reason>"
git push origin dev
# open PR dev -> master, squash-merge it, then update BASE to that squash SHA

# 4. Tag the release commit (annotated, per-app namespace), push the tag
git tag -a <app>-v<X.Y.Z> <sha> -m "<app> v<X.Y.Z>"
git push origin <app>-v<X.Y.Z>
# example: git tag -a backend-v4.1.0 95a1a94 -m "backend v4.1.0"

# 5. Cut the changelog section into a notes file and create the GitHub release
git show <app>-v<X.Y.Z>:apps/<app>/CHANGELOG.md | sed -n '/^## \[X.Y.Z\]/,/^## \[/p' | head -n -1 > /tmp/<app>-vX.Y.Z-notes.md
gh release create <app>-v<X.Y.Z> --title "<app> v<X.Y.Z>" --notes-file /tmp/<app>-vX.Y.Z-notes.md

# 6. Verify
gh release view <app>-v<X.Y.Z> --json tagName,name,body,isLatest
git ls-remote --tags origin | grep <app>-v<X.Y.Z>
```

Latest marking rule: do not juggle `--latest` by hand. Default is to accept whatever GitHub assigns (creation order wins) and record the outcome with `gh release list --json tagName,isLatest` in your evidence. If the wrong release shows as latest, fix it once with `gh release edit <app>-v<X.Y.Z> --latest` and note why. Never mark all three app releases latest in one session; at most one holds the flag, and "none touched" is an acceptable documented choice.

## 4. Pre-release checklist

Copy this into the PR or your notes, check every box before tagging:

- [ ] Base SHA is the `master` squash commit, not a `dev` intermediate.
- [ ] Version judged per section 2 for THIS app (breaking scoped to this app, not copied from a sibling).
- [ ] `apps/<app>/package.json` version equals the new `CHANGELOG.md` header version (`python3 -m json.tool` passes).
- [ ] Every changelog bullet cites a real commit or PR (verified with `git cat-file -t <sha>` or `gh pr view`).
- [ ] No `BREAKING CHANGE:` footer unless section 2 evidence backs it (stray `!` removed, not honored).
- [ ] Tag name is `<app>-v<X.Y.Z>` (annotated). Bare `vX.Y.Z` rejected.
- [ ] Release notes equal the changelog section text (no invented lines, no uncurated squash paste).
- [ ] `gh release view` output saved to evidence; push was plain `git push origin dev` (never force-push).

## 5. Anti-duplicates rule

One change, one entry, in the right app. This rule exists because squash bodies re-emitted old footers (the MTProto breaking line appeared 4 to 6 times across the 4.0.0 changelog sections, and a single carrier body hit HIT=96). Transcribing automation output without judgment is what produced that mess.

- Never copy a squash body into a changelog uncurated. Read the net diff (`git diff ^1 ^2 --stat` on the merge, or the PR files tab) and write one bullet per real change.
- One entry per change across the whole repo. If a merge touched backend and ingestion, each app changelog gets one bullet describing what changed for that app, not a full copy of the shared body in both.
- Scopes are per app. Backend entries never list frontend-only work and vice versa. Shared or infra work (workflows, docs, scripts) goes to the app it served, or to no changelog if it served none (it rides along silently).
- Footers do not propagate. A `BREAKING CHANGE:` line quoted inside a later merge body counts zero times unless the later merge itself introduces an incompatibility. Check the diff, not the body.
- When in doubt, cite the smallest real unit: the brought-in commit or PR from the TSV, not the aggregate sync merge that carried it.

## 6. Squash-message convention

History is the changelog source now (no automation). The squash message on every `dev` -> `master` merge is what future you reads when judging versions and writing entries, so write it like a commit, not like a chat log.

How to write it in the GitHub squash UI (default text is editable before merging):

1. Subject line: `type(scope): subject` in lowercase imperative, max ~72 chars. Type is one of `feat, fix, chore, docs, style, refactor, perf, test, build, ci, revert` (same list as `commitlint.config.js`; the `pr-title-lint` workflow enforces it on the PR title, which becomes the squash subject).
2. Blank line, then body: one bullet per real change plus the PR number (`PR #<n>`). Never paste raw commit lists or re-emit old `BREAKING CHANGE:` footers (see section 5); add a footer only when THIS merge introduces the incompatibility, with cited evidence.
3. Keep the default `(#<n>)` suffix GitHub appends; do not delete it. It is the trace back to review and CI.

Why: `git log --format=%B` on the squashed range is the input to version judgment (section 2) and changelog bullets (section 3, step 2). A clean subject scopes the app and bump at a glance; a curated body with the PR number makes every bullet citable without digging.

Examples:

- `feat(vip-channel): add stuck-booking cleaner`
  Body: `- Frees VIP slots stuck mid-post (30s cron). PR #165.`
- `fix(ingestion): NULL-safe queued_at in publisher migration`
  Body: `- Additive NULL handling, explicitly not an incompatible schema change. PR #150.`

## 7. Changelog strategy: the PR merge is the unit

Owner decision 2026-09-11: the changelog unit is the PR merged to `master` (the squash commit), NEVER atomic commits. Atomic commits are intermediate noise (fixups, rebases, sync vehicles); the squash subject plus its curated body is the reviewed, CI-green fact. This matches `scripts/draft-changelog.sh`, which lists merges only.

One bullet per PR, always ending with `(PR #NN)`. Draft-sync merges (`master` -> `dev` with empty net diff) get zero bullets; cite the original PR they carried, not the vehicle.

Real example (from `.omo/evidence/task-3-manual-release-flow.tsv`, commit verified via `git cat-file -t`):

- `Fix NULL-safe queued_at handling in publisher migration (additive change, explicitly not an incompatible schema change). (PR #150)`

That bullet describes brought-in `901a0a0` (`fix(migration): add queued_at column with proper NULL handling for production`, `git cat-file -t 901a0a0` = commit), carried by merge `ba4a69f`. One PR, one bullet, one citation.

Include (user-visible change only):

- `feat` that adds or changes behavior the user can feel (endpoint, screen, command, optional config)
- `fix` that repairs one (user-visible symptom stated, not internals)
- Breaking changes and deprecations (with cited evidence per section 2)
- `perf` with measurable user impact (latency, cost, throughput numbers quoted)
- `security` fixes (what was closed, no exploit detail)

Exclude (rides along silently, no bullet):

- `chore`, `ci`, `docs`, `test`, `style`, `build` with no product effect
- `refactor` with zero behavior change
- Branch syncs and merge vehicles (`master` -> `dev`, conflict resolutions like `ba4a69f` itself)
- Release chores (bumps, tag Recreations, notes edits)

## 8. `## [Unreleased]` convention

Each of the 3 changelogs carries a `## [Unreleased]` header at the top, below the title, above the newest version section. Accumulate bullets there as PRs land on `master`; at release time, rename that header to `## [X.Y.Z] - YYYY-MM-DD` and start a fresh empty `## [Unreleased]` above it. Never keep released bullets under Unreleased, never duplicate a bullet into both places.

Empty state while nothing is queued:

```markdown
  ## [Unreleased]

  (none yet)
```

## 9. Rollback playbook

Declared RTO: 30 minutes from decision to verified healthy. Plausibility basis, all from `.github/workflows/deploy.yml`: compose restart allows `--wait-timeout 180` (3 min), the health loop retries 10 x 10 s (100 s max), the ingestion ordering gate retries 12 x 10 s (120 s max). A revert plus a normal deploy cycle therefore fits inside 30 min with margin; the remaining budget covers the DB backup and migration steps the workflow runs before recreate.

Revert path A (release was a squash merge to `master`, preferred):

```bash
# 0. Be on dev, clean tree
git status --porcelain
git branch --show-current   # must print: dev
# 1. Revert the master squash on dev, open PR dev -> master, squash-merge
git revert <master-squash-sha> --no-edit
git push origin dev
# 2. Re-deploy: push to master runs deploy.yml (backup + migrations + recreate + healthcheck)
# 3. Delete the bad tag and release so they cannot be re-cut by accident
git push --delete origin <app>-v<X.Y.Z>
git tag -d <app>-v<X.Y.Z>
gh release delete <app>-v<X.Y.Z> --yes
```

Revert path B (release was a direct commit, e.g. a changelog correction): same steps with `git revert <sha>` on the branch that holds the commit, then follow the normal section 3 flow to re-tag the corrected version.

Verification after re-deploy (same probes the workflow uses):

```bash
curl -sf http://localhost:3030/api/health
curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=1
git ls-remote --tags origin | grep <app>-v
gh release list --limit 10
```

Rollback is complete only when the health endpoint answers 200 AND the tag/release list no longer shows the bad version. Record all four outputs in evidence.

## 10. Hotfix flow

Branch `hotfix/<slug>` from `master` (not from `dev`; `dev` may hold unreleased work you must not ship early). Fix, PR `hotfix/<slug>` -> `master`, CI green, squash-merge, verify the deploy, write the changelog entry. Reduced checklist, but the smoke step is mandatory, never skipped:

- [ ] Branched from `master` (`git rev-parse --verify master` recorded as base).
- [ ] Fix is minimal: the bug plus its regression coverage, nothing else.
- [ ] CI green on the hotfix PR.
- [ ] Squash-merged to `master`; deploy workflow finished (healthcheck passed).
- [ ] Smoke MANDATORY: `curl -sf http://localhost:3030/api/health` plus the endpoint or behavior the hotfix touched, exercised once against prod (read-only where possible).
- [ ] Changelog entry added under `## [Unreleased]` (or a patch section if released immediately), citing the hotfix PR.
- [ ] Forward-merge `master` into `dev` (`git checkout dev && git merge master`) so the fix is not lost on the next release.

## 11. Flags freeze at release

At release time the pipeline flags are part of the release state: record them, do not flip them mid-release. The three flags (backend AGENTS.md, crypto-news 3-flag control):

- `matchingEnabled` (enqueue on/off)
- `llmEnabled` (LLM transform on/off; effective only when publishing is also on)
- `publishingEnabled` (queue drain on/off; master switch)

How to record known-good state (names and values pattern, NO secret values):

```bash
# Read current state before tagging (values are booleans, safe to log)
curl -s http://localhost:3030/crypto-news-publisher/llm/config
# Expected shape: {"matchingEnabled": <bool>, "llmEnabled": <bool>, "publishingEnabled": <bool>}
```

Read path verified in `apps/frontend/src/features/crypto-news-publisher/api/llm-config-api.ts:68` (`GET /crypto-news-publisher/llm/config`); the same prefix accepts `PATCH` for updates. Save the three booleans next to the release evidence. Rule: no flag flips between tagging and the deploy healthcheck passing. If a flag must change, it is a separate deliberate action after the release verifies, recorded with its own timestamp.

## 12. Tag signing (OPTIONAL, manual setup pending)

Signed tags are nice-to-have, not required. No release is blocked for lack of a signature; unsigned annotated tags per section 3 remain the accepted default. The setup below is MANUAL-SETUP-PENDING: the owner runs it once on their machine, it is not part of any release checklist.

```bash
# 1. Generate a key (UNVERIFIED: never executed in this repo, standard GPG flow)
gpg --full-generate-key
# 2. Tell git which key to use (UNVERIFIED: key id depends on step 1 output)
git config --global user.signingkey <key-id>
# 3. Sign a tag instead of only annotating it
git tag -s <app>-v<X.Y.Z> <sha> -m "<app> v<X.Y.Z>"
git push origin <app>-v<X.Y.Z>
```

Verified locally: `gpg (GnuPG) 2.4.7` installed (`gpg --version`), and git supports `-s/--sign` on tags (`git tag --help`). What is UNVERIFIED is the end-to-end signing run: no key has been generated and no `-s` tag has been cut in this repo, so the first signed tag must be test-verified with `git tag -v <tag>` before relying on it.
