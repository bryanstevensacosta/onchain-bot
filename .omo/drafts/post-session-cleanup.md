---
slug: post-session-cleanup
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/post-session-cleanup.md
approach: Three independent tasks: (1) investigate why GitHub Actions auto-deploy didn't fire, (2) test the Add KOL flow end-to-end in prod, (3) commit .omo/ plan artifacts to repo.
---

# Draft: post-session-cleanup

## Components (topology ledger)
1. GitHub Actions auto-deploy investigation — check workflow syntax, secrets, test job status
2. Add KOL flow test — curl the POST endpoint, Playwright test via public URL or local proxy
3. .omo/ plan artifacts commit — add the OmoCodex plan files to git for traceability

## Findings (cited - path:lines)
1. Commit `875ed9f` pushed to master but auto-deploy didn't trigger — droplet showed old head after 5min
2. `gh` CLI has invalid `GITHUB_TOKEN` — can't check workflow status from CLI
3. Deploy workflow is at `.github/workflows/deploy.yml` — correctly configured with `script_path: ${{ github.workspace }}/scripts/deploy.sh`
4. Workflow triggers on `push: branches: [master]` and `workflow_dispatch`
5. Test job needs: postgres + redis services, runs `npm ci`, `npm run test:backend`, `npm run test:frontend`, `npm run lint`
6. Secrets referenced: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `DOTENV_PRIVATE_KEY` — if any is missing/invalid, job fails
7. Add KOL flow in dev works (verified via Playwright) but not yet tested in prod
8. `.omo/` directory has 8+ plan/draft files from this session — no gitignore entry blocks them from being tracked

## Decisions
1. Auto-deploy investigation is priority — this has been failing across multiple pushes this session
2. Add KOL flow test in prod is secondary — requires valid prod MTProto session (separate concern)
3. .omo/ commit is purely organizational — can be done at any time

## Scope IN
- Check workflow run status via webfetch or `gh` CLI with proper auth
- If possible, trigger `workflow_dispatch` to test the pipeline
- Test Add KOL POST endpoint in prod (or dev with valid session)
- Commit .omo/ plan files

## Scope OUT
- Fixing any broken auto-deploy issues found (would be a separate plan)
- Creating new features or modifying existing code
- Generating new MTProto sessions

## Approval gate
status: awaiting-approval
