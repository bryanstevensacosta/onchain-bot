# post-session-cleanup - Work Plan

## TL;DR (For humans)

**What you'll get:** Closure on three loose ends: (1) a clear answer on why GitHub Actions isn't auto-deploying, (2) confirmation that the + Add KOL button works in production, (3) the .omo/ plan files committed so the session's work is fully traceable.

**Why this approach:** Three independent tasks that can run in parallel. The auto-deploy investigation is the most actionable — it's been broken across multiple pushes this session, and fixing it removes the need for manual SSH deploys.

**What it will NOT do:** No new features, no code changes, no MTProto session generation. Just investigation + minor git housekeeping.

**Effort:** Short
**Risk:** Low — no production code changes, read-only investigation

---

> TL;DR (machine): Short effort, Low risk. Three independent tasks: GH Actions investigation, prod Add KOL test, .omo/ commit.

## Scope
### Must have
- Determine why auto-deploy didn't fire (workflow syntax? secrets? test failure?)
- Test Add KOL POST endpoint in prod (or dev with valid session)
- Commit .omo/ plan artifacts

### Must NOT have
- No code changes to application or workflow
- No MTProto session generation
- No new features

## Todos
- [ ] 1. Investigate GitHub Actions auto-deploy failure
  What to do:
    - Try `gh auth login --with-token` with the env `GITHUB_TOKEN` (or check if it's expired)
    - Run `gh run list --limit 5 --workflow=deploy.yml` to see recent workflow runs
    - If `gh` can't authenticate, use `webfetch` or `grep_app_searchGitHub` to check the repo's Actions page:
      - `https://github.com/bryanstevensacosta/onchain-bot/actions` (may need different URL)
    - Read the most recent workflow run logs if accessible
    - Identify the root cause: missing secret, syntax error, test failure, etc.
    - If the workflow can't be checked remotely, check locally:
      - `cd .github/workflows && grep -n 'secrets.' deploy.yml` — list all secrets
      - Verify the workflow YAML is valid (`node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/deploy.yml','utf8'))"`)
    - Report findings: what's broken and the minimum fix needed
  Must NOT do: Do not modify the workflow file, do not change secrets
  References:
    - `.github/workflows/deploy.yml`
    - `gh run list --help`
  Acceptance criteria: A clear finding on what's broken (or "nothing is broken, workflow just takes 10+ min")
  Commit: N | investigation only

- [ ] 2. Test Add KOL POST endpoint in prod
  What to do:
    - Verify the prod backend is up: `ssh CryptoGanster "curl -s http://localhost:3030/api/health"`
    - Test POST to the KOL endpoint:
      ```bash
      ssh CryptoGanster "curl -s -X POST http://localhost:3030/telegram-kol/identity/kols \
        -H 'Content-Type: application/json' \
        -d '{\"kolId\":\"test_probe\"}' \
        -w '\nHTTP %{http_code}'"
      ```
    - If MTProto session is valid, it should resolve and return 201
    - If MTProto session is invalid/inactive, note the result
    - If public facing URL works, test via Playwright:
      - Navigate to `http://cryptoganster.tailf01c61.ts.net/kols`
      - Click "+ Add KOL"
      - Fill in a test KOL ID
      - Submit
      - Verify result
    - Document the outcome
  Must NOT do: Do not modify production data, do not generate new sessions
  References:
    - `apps/backend/src/kol/identity/api/http/kol.controller.ts:39-42` (POST endpoint)
    - `http://cryptoganster.tailf01c61.ts.net/kols`
  Acceptance criteria: Confirmation of whether the POST endpoint works with the current prod MTProto session
  Commit: N | test only

- [ ] 3. Commit .omo/ plan artifacts
  What to do:
    - Review which .omo/ files should be committed (drafts, plans, evidence):
      ```bash
      git status -- .omo/ | grep -v 'start-work/'
      ```
    - Do NOT commit `.omo/start-work/`, `.omo/boulder.json`, or `.omo/evidence/` — those are execution state, not plans
    - Commit only `.omo/plans/*.md`, `.omo/drafts/*.md`, `.omo/notepads/*.md`:
      ```bash
      git add .omo/plans/*.md .omo/drafts/*.md
      git commit -m "docs(omo): add plan artifacts from session
      - post-session-cleanup (auto-deploy investigation plan)
      - fix-crypto-news-message-entity (entity registration plan)
      - kol-seed-auto-join (seed auto-join plan)
      - fix-settings-inmemory (settings DI fix plan)
      - add-kol-modal (KOL add modal plan)"
      ```
    - Push to origin/master
  Must NOT do: Do NOT commit `.omo/start-work/` or `.omo/evidence/` (per-session state, not versioned)
  References:
    - `git status -- .omo/`
  Acceptance criteria: `.omo/plans/` and `.omo/drafts/` committed and pushed
  Commit: Y | docs(omo): add plan artifacts from session

## Final verification wave
- [ ] F1. Auto-deploy investigation findings documented
- [ ] F2. Add KOL test results documented
- [ ] F3. .omo/ push confirmed on origin

## Commit strategy
One commit for .omo/ files only. Investigation and test are read-only (no commit).
