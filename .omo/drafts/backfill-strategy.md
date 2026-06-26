# Backfill Strategy — Research & Plan

**Status**: research (catalog + design), not yet implemented.
**Owner**: TBD
**Created**: 2026-06-26

---

## 1. Motivation

The onchain-bot pipeline is in active development. Each new feature routinely adds a new column / parameter to `token_snapshots`, `token_scores`, `token_classifications`, `kols`, `kol_reputations`, etc. Existing rows (the "old data" problem) often lack the new field, so we backfill them.

Examples observed in this codebase:

- `token_scores.breakdown` was added (jsonb). The 2 tokens scored before the save path was wired have NULL breakdown (fixed in commit `942589e` via one-shot SQL).
- `kols.is_active` was added. Lifecycle mutations only set `lifecycle_status`; `is_active` is updated separately (partially fixed in commit `56cbf3a` — `activate()` now restores `is_active=true`).
- KOL `title`/`handle` fields were added. 2 of 45 KOLs still have placeholder values.
- Token `image_urls` field added to snapshots — pre-snapshot tokens have empty `image_urls` (only affects display).

**The core problem**: backfills are currently scattered across:

1. **Runtime code paths** that quietly mutate data on every deploy (`KolSeeder.onApplicationBootstrap`, `start-kol-ingestion.backfillKol()`).
2. **Scheduler jobs** that loop through KOLs/tokens and call expensive external APIs every N minutes (`KolReputationScheduler`, hypothetical `BackfillScheduler`).
3. **One-shot SQL scripts** (good pattern, ad-hoc).
4. **Frontend `BackfillButton`** that triggers backend HTTP endpoints (KOL backfill from Ops page).

Some of these are legitimate runtime behavior (e.g., `KolSeeder` runs once on boot, idempotent). Others are anti-patterns — they touch external paid APIs (Helius, Birdeye, Alchemy) on every deploy/scheduler tick, which:

- Costs real money (API calls).
- Slows deploys and runtime.
- Risks re-running in production when the team only meant "fill in for the new column".
- Creates hidden data mutations that are hard to audit.

**Goal of this plan**: research feasibility of (a) cataloging every backfill touchpoint, (b) extracting them into a `scripts/backfills/` convention with `--dry-run` / `--validate` / `--apply` modes that require explicit human invocation, and (c) keeping the runtime path free of backfill mutations except where genuinely needed (e.g., event-driven cache warming).

---

## 2. Investigation — Catalog of existing backfill logic

### 2.1 Runtime side-effects on boot

| File | Pattern | Frequency | Touches external API? | Idempotent? | Production-safe? |
|---|---|---|---|---|---|
| `apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts` | `OnApplicationBootstrap` registers 46 KOLs from static seed | Every boot | Yes — `getTitle/handle` via Telegram API | Yes (skip if exists) | Yes (env-gated `seed.enabled`) |
| `apps/backend/src/token/milestone/infrastructure/default-thresholds-seed.service.ts` | OnApplicationBootstrap seed default thresholds | Every boot | No | Yes | Yes |
| `apps/backend/src/token/call-tracking/infrastructure/default-tracking-filter-seed.service.ts` | OnApplicationBootstrap seed tracking filters | Every boot | No | Yes | Yes |
| `apps/backend/src/kol/ingestion/.../start-kol-ingestion.use-case.ts:137` `backfillKol(kolId, limit)` | HTTP `POST /kols/:kolId/backfill` → MTProto fetch | On-demand via Frontend BackfillButton | **Yes — Telegram MTProto, every call** | Yes (limit-bounded) | Risky — costs API quota |

### 2.2 Runtime schedulers with backfill semantics

| File | Cron | Touches external API? | Frequency | Notes |
|---|---|---|---|---|
| `apps/backend/src/kol/reputation/infrastructure/scheduling/kol-reputation.scheduler.ts` | `*/15 * * * *` | No (pure DB aggregation) | Every 15 min | Computes reputation from existing `call_performances` |
| `apps/backend/src/token/call-tracking/infrastructure/scheduling/live-call-tracking.scheduler.ts` | TBD | **Yes — Birdeye/Helius for ATH** | Every N min | Bounded by `maxTokensPerTick` |
| `apps/backend/src/token/milestone/infrastructure/scheduling/live-milestone.scheduler.ts` | TBD | Possibly | Every N min | |
| `apps/backend/src/kol/ingestion/infrastructure/scheduling/*` | TBD | Yes — Telegram | Every N min | |

### 2.3 One-shot scripts already shipped

| File | Pattern | Was it run? | Notes |
|---|---|---|---|
| `apps/backend/scripts/one-shot-backfill-token-breakdown.sql` | Pure SQL idempotent CTE | Yes (2026-06-26) | **Reference pattern** for future SQL backfills |
| `apps/backend/scripts/seed-pipeline-events.ts` | Dev seed for pipeline events | Yes (dev only) | |
| `apps/backend/scripts/telegram-gen-session.ts` | One-time auth setup | Yes (manual) | |

### 2.4 Frontend backfill triggers

| File | Triggers | Calls | Cost |
|---|---|---|---|
| `apps/frontend/src/features/trigger-backfill/ui/backfill-button.tsx` | User click on Ops page | `POST /kols/:kolId/backfill` | MTProto quota per click |

### 2.5 Anti-patterns to extract

1. **`KolSeeder`**: legitimate dev convenience but should be **explicit opt-in** per deploy (env `INGESTION_TELEGRAM_SEED_ENABLED=true` → register on boot). In production, replace with explicit `npm run seed:kol` script. The OnApplicationBootstrap pattern is fine if gated, but should print loudly when it runs.
2. **Lifecycle migration paths** (e.g., set `is_active` after a lifecycle change): currently mixed in domain mutators. Should be split: domain emits `KolLifecycleChangedEvent`, separate **migration handler** subscribes and applies one-shot data fix. Better: when the field is added, ship a one-shot SQL script (`scripts/one-shot-set-kol-is-active.sql`) and remove the migration logic from the domain mutator.
3. **Any backfill that touches external APIs** in a scheduler tick: should be extracted to a script with `--dry-run` + cost estimate before apply. The scheduler should be replaced with a hook that flags rows needing backfill (e.g., `needs_image_backfill: boolean`) and a separate one-shot script processes them.

---

## 3. Categorization matrix

| Category | Examples | Should be script? | Why |
|---|---|---|---|
| Static seed (one-time, idempotent, no API) | KOL seed list, default thresholds, default tracking filters | **Keep as runtime seed** (env-gated) | Cheap, idempotent, dev convenience |
| Static seed that touches Telegram (resolve title/handle) | KOL seeder `resolveMetadata()` | **Extract to script** | Costs MTProto calls; do not re-run per boot |
| On-demand backfill via HTTP (user clicks button) | KOL message backfill | **Keep as HTTP endpoint**, but add cost estimate + dry-run | User is explicit; cost is bounded by limit param |
| Periodic scheduler that fetches external data | ATH tracking, milestone checks | **Hybrid**: keep tick but require `needs_backfill: boolean` flag set by separate script | Avoids burning API quota on already-fresh rows |
| One-time SQL data fix | `token_scores.breakdown` backfill, `kols.is_active` migration | **Pure script** (no code change) | Tracked, reproducible, reversible |
| Cache warming | First-time fetch of token metadata | **Keep as runtime** | No external cost; it's the primary read path |
| Domain mutator that emits a backfill event | `kol.activate()` setting `is_active` | **Anti-pattern** — should be a SQL script + removal from mutator | Domain mutators should not have migration logic |

---

## 4. Proposed pattern — `scripts/backfills/`

### 4.1 Directory layout

```
apps/backend/scripts/
├── README.md                            ← explains the convention
├── backfills/
│   ├── README.md                        ← what backfills are, why, how to add
│   ├── _template.ts                     ← standard CLI scaffold (copy-paste)
│   ├── _template.sql                    ← standard SQL scaffold
│   ├── 2026-06-26-token-score-breakdown.sql   ← shipped (rename to date-prefixed)
│   ├── 2026-XX-XX-kol-is-active-migration.sql ← TODO
│   ├── 2026-XX-XX-kol-image-backfill.ts       ← TODO (Helius fetch)
│   └── ...
├── seed-pipeline-events.ts              ← existing, dev-only
└── telegram-gen-session.ts              ← existing, one-time
```

### 4.2 Required CLI modes

Every backfill script must support:

```bash
backfill.ts --dry-run          # Show what WOULD change (count rows, sample 5)
backfill.ts --validate         # Check if backfill is needed (skip if no rows affected)
backfill.ts --apply            # Run the backfill
backfill.ts --estimate-cost    # For API-touching scripts: count API calls, $ estimate
backfill.ts --rollback         # If reversible: undo the changes
```

### 4.3 Standard template — `_template.ts`

```typescript
#!/usr/bin/env ts-node
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const MODE = process.argv[2] ?? '--dry-run';
const client = new Client({ connectionString: process.env.POSTGRES_URL });

async function main() {
  await client.connect();
  const rows = await dryRun();
  console.log(`Would affect ${rows.length} rows. Sample:`);
  rows.slice(0, 5).forEach(r => console.log(JSON.stringify(r)));

  if (MODE === '--dry-run') return;
  if (MODE === '--validate') {
    if (rows.length === 0) { console.log('No backfill needed, skipping.'); return; }
    console.log(`Backfill needed for ${rows.length} rows.`);
    return;
  }
  if (MODE === '--apply') {
    await client.query('BEGIN');
    try { await apply(client); await client.query('COMMIT'); }
    catch (e) { await client.query('ROLLBACK'); throw e; }
    return;
  }
  // --estimate-cost, --rollback, etc.
}
```

### 4.4 Naming convention

`YYYY-MM-DD-<short-name>.ts` or `.sql`. The date makes the order obvious in `git log` and `ls`.

### 4.5 Documentation in scripts/README.md

For each backfill script:
- **What** it backfills (column, table, condition).
- **Why** it's needed (link to PR/issue).
- **Cost**: API calls, DB rows, $ estimate if external.
- **How to verify it succeeded**: SELECT query that proves the state changed.
- **Rollback**: SQL to undo (if possible).
- **Idempotency**: can it be re-run safely?

---

## 5. Migration plan

### 5.1 Short-term (this week)

- [x] Rename `one-shot-backfill-token-breakdown.sql` → `2026-06-26-token-score-breakdown.sql` (move to `scripts/backfills/`).
- [ ] Add `scripts/backfills/_template.ts` and `_template.sql`.
- [ ] Document the convention in `scripts/backfills/README.md`.
- [ ] Create `2026-XX-XX-kol-is-active-migration.sql` (backfill `is_active` from `lifecycle_status` for existing rows — single SQL UPDATE).
- [ ] Create `2026-XX-XX-kol-title-handle-backfill.ts` (resolves missing titles via MTProto for KOLs 2054466090, 1960616143; `--estimate-cost` reports 2 MTProto calls).
- [ ] Add `--dry-run` mode to existing `KolSeeder` and log loudly when it would touch external API.

### 5.2 Medium-term (next sprint)

- [ ] Extract lifecycle migration logic from domain mutators (`kol.activate`, `kol.dormant`, `kol.blacklist`). Domain mutators only update aggregate state; a separate **handler** subscribes to `KolLifecycleChangedEvent` and applies side-effects (e.g., sync `is_active`). For greenfield data, use SQL scripts instead of runtime handlers.
- [ ] Add `needs_image_backfill: boolean` flag to `token_snapshots` so the ATH-tracking scheduler skips already-fresh rows.
- [ ] Replace `KolReputationScheduler` with a script-driven approach: `scripts/backfills/recompute-kol-reputations.ts --apply` runs on demand, scheduler is removed.

### 5.3 Long-term

- [ ] Audit every cron scheduler for external API calls. Each must justify why it can't be replaced by a flag-driven one-shot script.
- [ ] Add CI check: `scripts/backfills/` must be sorted by date in README.md (enforces ordering).
- [ ] Pre-commit hook: refuse to commit changes to `apps/backend/src/**/seeders/**` without a sibling script in `scripts/backfills/`.

---

## 6. Validation pattern — when is a backfill needed?

A backfill is only needed if:

1. **State condition**: at least one row matches the WHERE clause (`SELECT COUNT(*) > 0`).
2. **Schema condition**: the target column exists and is the expected type.
3. **No fresh alternative**: the data cannot be re-derived cheaply from existing columns.

If any condition fails, `--validate` should exit early with a clear message:

```
[validate] FAILED: column token_scores.breakdown does not exist (run migration first?)
[validate] FAILED: 0 rows match WHERE breakdown IS NULL — backfill not needed.
[validate] OK: 2 rows need backfill. Run with --apply to proceed.
```

This is critical for the user's stated concern: **"y como son con tokens y cuestan dinero deberá validar que esa cosa que hará backfill realmente lo necesita"** — the `--validate` flag prevents accidental spending.

---

## 7. Open questions

1. **Should backfills be SQL-only or TS scripts?** Hybrid: prefer SQL (faster, no Node startup), but TS when external API calls are needed.
2. **How to track which tokens/KOLs need backfill?** Option A: ad-hoc SQL queries per script. Option B: add `needs_backfill` column + flag set by domain events. Option A is simpler for v1.
3. **Should backfill scripts live in the repo or in a separate ops repo?** In-repo for v1 (low friction). Move to ops repo once we hit 10+ scripts.
4. **CI enforcement**: should `scripts/backfills/README.md` be required to list every shipped backfill? Yes (single source of truth).

---

## 8. Success criteria

- [ ] All backfill touchpoints cataloged in this doc are either (a) extracted to `scripts/backfills/` with `--dry-run` / `--validate` / `--apply`, or (b) explicitly justified in a `// REASON:` comment in the runtime code.
- [ ] Every script in `scripts/backfills/` has `README.md` entry with cost + verification + rollback.
- [ ] `KolSeeder` no longer auto-runs in production (env-gated, prints loudly).
- [ ] No domain mutator contains migration logic (only aggregate state changes).
- [ ] All scheduler jobs that touch external APIs are justified in `docs/dev/schedulers.md` (to be created).

---

## 9. References

- INV-2 backfill: `apps/backend/scripts/one-shot-backfill-token-breakdown.sql` (commit `942589e`).
- INV-3 spec: `apps/backend/src/kol/identity/domain/entities/kol.entity.spec.ts` (commit `56cbf3a`).
- Frontend backfill button: `apps/frontend/src/features/trigger-backfill/`.
- QA plan: `.omo/drafts/manual-qa-test-plan.md`.
- Existing scripts README: `apps/backend/scripts/README.md`.