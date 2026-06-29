# Configurable Presets — Planning Doc

> Status: draft (planning only)
> Author: Sisyphus (Sisyphus session, 2026-06-26)
> Trigger: user ranking #2 — "configurable presets planning" asked multiple times
> Reads: backend `settings/` BC; `kol/reputation` Slice 1+2+3 (just shipped in `9066edc..c4fc561`)

## Why this doc exists

The app has many values that *should* be operator-tunable at runtime but are currently either:
1. **Hardcoded in code** (need a code change + deploy to adjust)
2. **Already in the settings BC but not exposed in the UI** (DB-backed but only via direct SQL or REST)
3. **Newly added with no clear ownership** (e.g. the `KolScoreFormula` Slice 3 shipped a UI dropdown but the formula lives in code, not in `settings_presets`)

This doc inventories all three categories and proposes a unified preset system.

---

## 1. Inventory of operator-tunable values

### 1a. Currently in settings BC (DB-backed, partial UI)

| Group | BC | DTO | Table | Status |
|---|---|---|---|---|
| Signals (penalty / risk / enabled) | `settings/` | `CreateSignalDto` | `signals` | DB-backed, REST CRUD, **no UI** |
| Thresholds (score → decision) | `settings/` | `CreateThresholdDto` | `thresholds` | DB-backed, REST CRUD, **no UI** |
| Filters (gate config) | `settings/` | `create-filter.dto` | `filters` | DB-backed, REST CRUD, **no UI** |
| Presets (snapshot) | `settings/` | `create-preset.dto` | `settings_presets` (jsonb) | DB-backed, REST CRUD, **no UI** |
| KNOWN_KOLs (whitelist/blacklist) | `kol/reputation/` | n/a | `kol_known_lists` (Slice 2) | DB-backed, **no UI, no admin API yet** |
| KNOWN_GOOD score | `kol/reputation/` | n/a | hardcoded `0.9` in `DbBackedKnownKolRegistry` | **hardcoded** |
| WHITELIST multiplier | `kol/reputation/` | n/a | hardcoded `1.2` | **hardcoded** |
| BLACKLIST multiplier | `kol/reputation/` | n/a | hardcoded `0.5` | **hardcoded** |

### 1b. Kol/reputation formula (Slice 3) — code-only

| Value | Current location | UI? |
|---|---|---|
| `default` formula weights (mention 0.25 / quality 0.55 / drawdown 0.20) | `kol-score-formula.vo.ts` | ✅ dropdown in /kols |
| `mention-heavy` weights (0.50 / 0.30 / 0.20) | `kol-score-formula.vo.ts` | ✅ dropdown |
| `quality-heavy` weights (0.15 / 0.70 / 0.15) | `kol-score-formula.vo.ts` | ✅ dropdown |
| `balanced` weights (0.33 / 0.34 / 0.33) | `kol-score-formula.vo.ts` | ✅ dropdown |
| Custom operator weights | n/a — operator can't add a new formula | ❌ |
| **Default formula id** (which is selected on first load) | hardcoded `DEFAULT_KOL_SCORE_FORMULA_ID = 'default'` | ❌ |

### 1c. Outcome bucket thresholds (KolMetricsCalculator) — code-only

| Bucket | Multiplier | Where |
|---|---|---|
| `x2Count` | ≥ 2x | `KolMetricsCalculator.countMentions` |
| `x5Count` | ≥ 5x | same |
| `x10Count` | ≥ 10x | same |
| `x50Count` | ≥ 50x | same |
| `rug50Count` | ≤ 0.5x (drawdown 50%) | same |
| `rug80Count` | ≤ 0.2x (drawdown 80%) | same |
| `neutralCount` | everything else | same |

**The buckets are operational knobs**: "is a 2x call noteworthy or noise?" depends on the operator's strategy. Currently changing them requires a code change.

### 1d. Score-blend multipliers (whitelist / blacklist) — code-only

```
score * 1.2 if knownGood
score * 0.5 if knownBad
```

Hardcoded in `KolReputationCalculator.applyWhitelist`.

### 1e. Confidence thresholds — code-only

```
< 5 mentions   → LOW
< 20 mentions  → MEDIUM
< 50 mentions  → HIGH
≥ 50 mentions  → VERY_HIGH
```

Hardcoded in `KolReputationCalculator.deriveConfidence`.

---

## 2. The unified preset system

### 2a. Goals

1. **Single source of truth** — every operator-tunable value lives in `settings_presets` (the existing jsonb-snapshot table) with a typed `PresetScope` so the operator can scope changes per-channel, per-chain, or globally.
2. **Hot-reload** — no deploy needed; a UI change writes to the DB, the next read sees the new value.
3. **Audit trail** — every change records who, when, what (the `SettingsAuditLog` already exists in the settings BC).
4. **Per-preset overrides** — an operator can apply a preset to a single KOL, a single chain, a single token, or globally.
5. **Rollback** — every change keeps the previous snapshot. One-click revert from the UI.

### 2b. Existing `settings_presets` table

```sql
id           uuid  PK
name         varchar(100)   -- "conservative", "balanced", "aggressive"
description  text
snapshot     jsonb          -- the full config object
is_active    boolean
created_at   timestamptz
updated_at   timestamptz
created_by   varchar(100)
```

This is good. The missing piece is:
1. **Scoped application** (per-KOL / per-chain / per-token vs global)
2. **Typed presets** (so the UI knows what fields exist and can render forms)
3. **Frontend UI** to manage them

### 2c. Proposed `PresetScope` (additive, no migration needed for existing rows)

```ts
type PresetScope =
  | { kind: 'global' }
  | { kind: 'chain'; chain: 'solana' | 'evm' }
  | { kind: 'kol'; kolId: string }
  | { kind: 'token'; chain: string; address: string };
```

Stored in `settings_presets.snapshot.scope`. Reads resolve by walking the scope tree: token → kol → chain → global, first match wins.

### 2d. Proposed typed preset schema

```ts
interface PresetSnapshot {
  scope: PresetScope;
  // score formula
  scoreFormula?: {
    formulaId: 'default' | 'mention-heavy' | 'quality-heavy' | 'balanced' | string;
    customWeights?: { mention: number; quality: number; drawdown: number };
  };
  // outcome bucket thresholds
  outcomeBuckets?: {
    x2: number;       // multiplier
    x5: number;
    x10: number;
    x50: number;
    rug50: number;    // drawdown 0..1
    rug80: number;
  };
  // whitelist multipliers
  whitelistMultipliers?: {
    knownGood: number;
    knownBad: number;
  };
  // confidence thresholds
  confidenceThresholds?: {
    low: number;      // totalMentions cutoff
    medium: number;
    high: number;
    // >= high → VERY_HIGH
  };
  // knownGood score (replaces the 0.9 hardcoded value)
  knownGoodScore?: number;
  // future: filter thresholds, signal weights (already in settings, just link them)
  filterPresetId?: string;
  signalPresetId?: string;
}
```

Each field is **optional** — operators can override any subset without touching the rest. Missing fields fall back to the global preset, eventually the hardcoded default.

### 2e. Backend changes (3 slices)

**Slice A — Preset infrastructure**

1. New port `KolScorePresetRepository extends KolScoreFormula` (typed lookup)
2. `DefaultKolScorePresetRepository` reads from `settings_presets` (newest active row matching the scope)
3. `KolReputationCalculator.calculate(...)` accepts an optional `KolScorePreset` parameter — passes each value through to `KolMetricsCalculator.countMentions` (multiplier thresholds), `applyWhitelist` (multipliers), `deriveConfidence` (thresholds)
4. `RecomputeKolReputationUseCase` reads the active preset from `SettingsService.getActiveKolScorePreset(scope)`
5. Admin REST API: `GET/POST/PATCH/DELETE /settings/presets/kol-score`

**Slice B — Wiring through all entry points**

1. `RecomputeKolReputationUseCase` accepts `scope?: PresetScope` (operator can pass per-KOL scope on a single recompute)
2. Scheduler reads each KOL's preferred scope (or default to `{ kind: 'global' }`)
3. Frontend dropdown (`KolScoreFormulaSelect`) reads the list of formulas from the API instead of the hardcoded registry
4. Custom formula editor: operator can add a new formula via UI, saved as a new preset

**Slice C — UI + audit + rollback**

1. New `/ops/presets` page: list all presets, edit, activate/deactivate, audit log, rollback
2. Audit log entries show: who, when, what fields changed, before/after
3. Rollback button restores the previous snapshot

### 2f. Frontend changes (mirrors backend slices)

**Slice A — Read path**
- `useKolScorePreset(scope)` hook
- `KolScoreFormulaSelect` becomes `KolScorePresetSelect` — reads from API

**Slice B — Custom formulas**
- `KolCustomFormulaEditor` modal
- Saves via `POST /settings/presets/kol-score`

**Slice C — Ops page**
- New `/ops/presets` route
- Table of presets, scope, last-modified, "Activate" toggle
- "Edit" opens a form with all `PresetSnapshot` fields
- "History" shows the last N snapshots
- "Rollback" button per row

---

## 3. Migration plan

### 3a. Existing data

The `settings_presets` table is currently used for unrelated configs (the existing `create-preset.dto` shows it stores `filterPreset` / `signalPreset` jsonb payloads — see `settings.e2e-spec.ts`). The new `KolScorePreset` uses the **same table** with a `scope` field on the snapshot to disambiguate.

**No migration needed** — additive.

### 3b. Operator workflow

Today: change a multiplier → PR + deploy + redeploy.
After Slice A: change a multiplier → API call → active immediately.
After Slice C: change a multiplier → UI form → preview diff → "Save" → active + audit logged.

### 3c. Backward compat

Slice 3 (already shipped) reads the hardcoded `KOL_SCORE_FORMULAS` registry. Slice A replaces that with the API call but **keeps the hardcoded registry as the fallback** when `settings_presets` has no active row. This means Slice 3 callers (`KolScoreFormulaSelect`, `useKolScoreFormula`) work unchanged for the simple case.

---

## 4. Phased rollout (rough effort estimates)

| Slice | Effort | Risk | Depends on |
|---|---|---|---|
| A — Preset infrastructure (backend) | 2-3h | Low — additive, fallback to hardcoded | Nothing |
| B — Wiring (backend + frontend read path) | 2h | Low — already wired in Slice 3 | A |
| C — Ops UI (frontend) | 3-4h | Medium — new page, audit log table | A, B |
| **Total** | **7-9h** | | |

Plus integration tests (~1h) and docs update (~30min).

---

## 5. Open questions (resolve before Slice A)

1. **Default values location** — keep them in `kol-score-formula.vo.ts` (current) or move to a JSON seed in `settings_presets`? Pro JSON seed: single source of truth. Con: requires a migration. **Recommend**: keep hardcoded as fallback, JSON seed only for the "active default" preset.
2. **Custom formula weights validation** — same `defineKolScoreFormula` (sum to 1.0) but stored in JSON. Validated at write time.
3. **Per-KOL override UX** — should the per-KOL override be set on the KOL itself (a `kol_preset_id` column on `kols`) or stored as a row in `settings_presets` with `scope.kind === 'kol'`? **Recommend**: `settings_presets` (no schema change to `kols`).
4. **Audit retention** — keep last 100 snapshots per preset? Rotate? **Recommend**: last 100 for 90 days, then archive.
5. **UI for outcome bucket thresholds** — needed? Or keep hardcoded until operators ask? **Recommend**: keep hardcoded for Slice A, expose in Slice C only if asked.

---

## 6. What this doc does NOT cover (out of scope)

- **Filter / signal / threshold settings UI** — already in settings BC, just no UI. Separate ticket.
- **SettingsService frontend UI** — already planned in FEAT-2, separate ticket.
- **Manual override UI for APPROVED/REJECTED** — separate ticket (FEAT-1).

---

## 7. References

- `apps/backend/src/kol/reputation/domain/value-objects/kol-score-formula.vo.ts` — the VO Slice 3 shipped
- `apps/backend/src/settings/application/services/settings.service.ts` — `getKnownKOLs()` pattern to mirror
- `apps/backend/src/kol/reputation/infrastructure/known-kol/db-backed-known-kol.registry.ts` — Slice 2's DB-backed port impl as a template
- `apps/backend/scripts/backfills/2026-06-26-kol-known-lists.sql` — migration shape
- `apps/frontend/src/features/kol-score-formula/` — Slice 3 UI pattern
- `.omo/drafts/manual-qa-test-plan.md` — INV-20 (kol/reputation enhanced) and INV-21 (shared/achievements kernel)
