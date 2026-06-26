# Backfill Scripts — Convention

## What is a backfill?

A **backfill** is a one-shot data fix that runs after a new feature lands. Typical triggers:

- New column added to an existing table (e.g., `token_scores.breakdown` jsonb)
- New field that the new code computes going forward, but old rows lack
- Domain invariant that needs to be retroactively applied (e.g., `kols.is_active` synced from `lifecycle_status`)

## Why a separate directory?

Backfills are **not runtime code**. They run once per database, are tracked, and should not silently re-execute on every deploy. Mixing them into domain mutators or schedulers costs money (API calls) and creates hidden mutations.

This directory exists so:

1. Every backfill is **explicit, audited, and reversible**.
2. The runtime app stays free of migration logic.
3. `npm run dev:backend` auto-applies pending backfills on boot (via `start:dev` → `db:migrate`).

## Naming convention

`YYYY-MM-DD-<short-name>.sql` or `.ts`. Date prefix sorts lexically. Examples:

- `2026-06-26-token-score-breakdown.sql` ✅
- `token-score-breakdown.sql` ❌ (no date, can't order)

Skip the runner scripts: `migrate.js`, `migrate.ts`, `README.md`, `_template.*`.

## Required structure

Every SQL backfill must:

1. Be **idempotent** — `WHERE <condition>` filters to rows that need fixing. The runner skips already-applied scripts, but a re-run should be safe.
2. Use a single `WITH ... UPDATE` pattern when possible (no `DO $$ ... $$` plpgsql unless necessary).
3. Have a header comment explaining **what**, **why**, **rollback**, **verification**.
4. Pass `backfill_migrations` tracking automatically (handled by the runner).

Every TS backfill must additionally:

1. Support `--dry-run` (count affected, sample 5).
2. Support `--validate` (check if needed at all — exit early if 0 rows).
3. Support `--apply` (perform migration).
4. Support `--estimate-cost` if it touches external APIs (report $ estimate).

## Runner

```bash
npm run db:migrate             # apply all pending scripts (default)
npm run db:migrate:dry-run     # list pending, no DB writes
npm run db:migrate:status      # show applied/pending for each
```

Auto-wired into `npm run dev:backend` → `start:dev` so dev/staging databases pick up new backfills on next boot. **Production should run explicitly**:

```bash
# On prod server, BEFORE deploy:
npm run db:migrate:dry-run     # confirm what will apply
npm run db:migrate             # apply pending
# Then deploy the new app version.
```

## Tracking table

`backfill_migrations` (auto-created on first run):

| column | type | notes |
|---|---|---|
| `filename` | VARCHAR(255) PK | matches filename in this dir |
| `applied_at` | TIMESTAMPTZ | default `now()` |

## Cost discipline

If your backfill touches external APIs (Helius, Birdeye, Alchemy, Telegram MTProto):

1. **Don't put it in a scheduler**. Make it a one-shot TS script.
2. **Always run `--validate` first** — if 0 rows match, exit early.
3. **Always run `--estimate-cost` first** — report API call count and $ estimate.
4. **Batched with rate limiting** — never loop unbounded over a result set.

Example: `2026-XX-XX-kol-title-handle-backfill.ts` for 2 KOLs missing Telegram-resolved title/handle. With `--estimate-cost`, it should report "2 MTProto calls, ~$0.00 (free tier)". With 1000 missing, it would chunk into 100-call batches with 1s delays.

## Templates

- `_template.sql` — copy-paste starter for pure SQL backfills.
- `_template.ts` — copy-paste starter for TS backfills (with --dry-run / --validate / --apply / --estimate-cost).

## When NOT to add a backfill here

- One-time setup (e.g., `telegram-gen-session.ts` for MTProto auth) — keep in `scripts/` root.
- Dev seed data (e.g., `seed-pipeline-events.ts`) — keep in `scripts/` root.
- Schema migrations (TypeORM `synchronize` handles dev; production needs proper migrations via `migration:generate`).
- Recurring cleanup jobs (e.g., daily purge of stale snapshots) — use a scheduler, not a backfill.

## See also

- `.omo/drafts/backfill-strategy.md` — full research plan with categorization matrix.
- `.omo/drafts/manual-qa-test-plan.md` — bug-driven backfill candidates (INV-2, INV-9, INV-12, INV-13).