# PR → master — staging-green merge gate

> **No merge to `master` without green staging. Paste evidence, not promises.**
> PRs to `dev`: the staging section is optional. PRs to `master` (`dev → master`
> or `hotfix/* → master`): every box below is mandatory, no exceptions other
> than the documented hotfix waiver (see footer).

## Staging evidence (mandatory for `master`)

- [ ] Staging deploy green — run: `https://github.com/bryanstevensacosta/onchain-bot/actions/runs/<RUN_ID>` (deployed SHA: `<sha>`)
- [ ] Twin smoke green — staging twin ingestion (`:3033`) answers `/api/health` (+ honest `/ready` and `/live`) and staging backend answers `/api/health`
- [ ] Traffic observed — counts in a `<min>` min window: ingested `<n>` / published `<n>` / errors `<n>` (source: staging logs or `:3033/metrics`)
- [ ] Migrations rehearsed — `migration:show` / `migration:run` against staging OK, or `n/a` (this PR ships no migrations)
- [ ] Backfill planned if destructive — DROP/RENAME/ALTER with loss: plan `<link or n/a>`; defensive asserts (counts pre/post + backup path in the error message) present

## Merge hygiene

- [ ] CI green (Tests, Lint, TypeScript Check, Build, Branch Governance Check) and branch up to date with `master` (`strict: true` enforced server-side)
- [ ] All review threads resolved; squash merge only (non-fast-forward blocked server-side)

## Hotfix waiver (only if applicable — GOVERNANCE.md §5)

- [ ] Named approver: operator (`@bryanstevensacosta`); waiver + substitute evidence recorded in the incident issue `<#issue>`
- [ ] Compensating controls committed: post-merge staging drill of the merged SHA, shortened (never skipped) bake, follow-up PR via the normal lane within 24h
