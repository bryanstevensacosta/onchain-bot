# RELEASE-FLOW.md — Manual releases (solo-dev)

> Owner: solo maintainer. No automation. release-please was removed (see git history); this file is the whole process.
> Scope: 3 apps versioned independently: `backend`, `frontend`, `ingestion`. One line on the future: rollback, hotfix, flags, and optional tag signing playbooks land in a later todo, coming soon.

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
