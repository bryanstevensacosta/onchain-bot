---
slug: remove-apply-filters-deprecated
status: done
intent: clear
pending-action: none
approach: Add `getTokenGateConfig()` + `getPublishableChains()` to SettingsService, migrate 3 callers (apply-filters.use-case, filters.controller, token-scored.handler), remove DEFAULT_FILTER_CONFIG + PUBLISHABLE_CHAINS constants, add SettingsModule to FiltersModule.imports. Single commit.
---

## Execution summary (2026-06-25)

- **Phase 1**: NO-OP — `getTokenGateConfig()`, `getPublishableChains()`, `getHoneypotHeuristic()`, `getBlockedClassifications()` all already existed in SettingsService with proper caching + DB keys (`min_score`, `max_risk_weight`, `min_completeness`, `enable_blacklist`, `publishable_chain`, `blocked_classification`). Plan was based on incorrect assumption; reverted the duplicate adds.
- **Phase 2**: rewrote `apply-filters.use-case.ts` — removed `DEFAULT_FILTER_CONFIG` export, `PUBLISHABLE_CHAINS` static, `defaultSettings()` stub, `@Optional()` decorator; constructor now requires `SettingsService` directly.
- **Phase 3**: rewrote `FiltersController.run()` to inject `SettingsService`, became async, builds full config from `getTokenGateConfig()` + `input.config` overrides (preserves override API).
- **Phase 4**: removed `config: DEFAULT_FILTER_CONFIG` from `TokenScoredHandler` — event-driven path now uses settings via the use case's default behavior.
- **Phase 5**: added `SettingsModule` to `FiltersModule.imports` (required for `ApplyFiltersUseCase`'s non-optional SettingsService dep).
- **Phase 6**: NO-OP — `apply-filters.use-case.spec.ts` already had a `FakeSettings` class implementing the 3 methods needed (with mutable fields for per-test tuning); 16/16 specs pass.
- **Phase 7**: backend `tsc --noEmit` 0 errors + `jest` 58 suites / 452 tests pass; frontend 0 + 4 files / 53 tests pass.

### Final diff
- 4 files changed, +22 / -68 lines (net -46 — significant code reduction: removed `DEFAULT_FILTER_CONFIG`, `PUBLISHABLE_CHAINS`, `defaultSettings()`, `@Optional()` handling, manual config merge in controller)
- 1 new tracked file: `.omo/drafts/remove-apply-filters-deprecated.md`

### Surprises
- Phase 1 was unnecessary — `getTokenGateConfig`/`getPublishableChains` already existed with sophisticated caching (`baseConfigCache` for the arrays, `getFilterNumericValue` for numbers, inline boolean parsing for `enable_blacklist`)
- Plan overestimated scope by including method additions that were no-ops

### Verification
- Backend `tsc --noEmit`: 0 errors
- Backend `jest`: 58 suites / 452 tests pass
- Filters targeted: 1 suite / 16 tests pass
- Frontend `tsc --noEmit`: 0 errors
- Frontend `vitest`: 4 files / 53 tests pass

# Plan: remove `@deprecated` constants from `apply-filters.use-case.ts`

## Context

Two `@deprecated` markers remain in `apps/backend/src/token/token-gating/application/handlers/apply-filters.use-case.ts`:

- **`DEFAULT_FILTER_CONFIG`** (line 23, after `FilterConfig` interface)
  Comment: "Use `SettingsService.getTokenGateConfig()` instead."
- **`PUBLISHABLE_CHAINS`** (line 67, static on `ApplyFiltersUseCase` class)
  Comment: "Use `SettingsService.getPublishableChains()` instead."

The deprecation comments reference methods that **don't exist yet** on the real `SettingsService`. The use case has a partial workaround — a private static `defaultSettings()` that returns an object stub with the right method names, used as fallback when `@Optional() settings?: SettingsService` is not provided.

Three production callers consume `DEFAULT_FILTER_CONFIG` (none use `PUBLISHABLE_CHAINS` directly outside the use case):

| Caller | Usage | Has SettingsService? |
|---|---|---|
| `apply-filters.use-case.ts:89-95` | spreads into `getEffectiveConfig()` | `@Optional()` yes |
| `filters.controller.ts:4,23` | spreads into request body as `config` override | **NO** |
| `token-scored.handler.ts:6,33` | passes as `config` to event-driven `execute()` | **NO** |

No spec files reference either constant (verified via grep).

## Scope

### IN

1. Add 2 new methods to `SettingsService`:
   - `getTokenGateConfig(): Promise<TokenGateConfig>` — returns `{minScore, maxRiskWeight, minCompleteness, blockedClassifications, enableBlacklist}`
   - `getPublishableChains(): Promise<string[]>` — returns `['ethereum', 'solana']`
2. Define `TokenGateConfig` interface (export from `settings/application/services/`).
3. Add DB key constants for the 5 filter values + 1 chains array (existing pattern: `getFilterNumericValue('key', fallback)`).
4. Migrate `ApplyFiltersUseCase.getEffectiveConfig()` to use `settings.getTokenGateConfig()` instead of `DEFAULT_FILTER_CONFIG`.
5. Migrate `FiltersController` to inject `SettingsService`, call `getTokenGateConfig()` for the default config.
6. Migrate `TokenScoredHandler` to inject `SettingsService`, call `getTokenGateConfig()` for the event-driven config.
7. Add `SettingsModule` to `FiltersModule.imports`.
8. Remove `DEFAULT_FILTER_CONFIG` export and `PUBLISHABLE_CHAINS` static from `apply-filters.use-case.ts`.
9. Inline fallback values directly in `defaultSettings()` (since the real SettingsService now provides them; fallback only used when `@Optional()` settings is missing — rare, only in unit tests).
10. Update tests if any break (verify with full `jest` run; `apply-filters.use-case.spec.ts` likely needs FakeSettings updates).

### OUT

- Migrating internal `getEffectiveConfig()` logic beyond just the source — the existing fail-fast gate order stays the same.
- Adding UI for editing these settings (covered by `config-ui.md` plan, separate task).
- Tuning default values (50/100/0.3, etc.) — preserve current values exactly.

## Approach options considered

**A. Add methods to SettingsService + migrate all callers (chosen)** — minimal API drift, removes deprecated markers, follows existing SettingsService pattern (compare to `getBaseScore()`, `getSignalPenalties()`, `getKolReputationThresholds()`, etc.).

**B. Keep fallback constant but remove `@deprecated` markers** — defeats the purpose; constants would still be misleading public API.

**C. Replace with module-level `as const` defaults instead of `SettingsService` methods** — smaller change but inconsistent with codebase pattern (every other tunable goes through `SettingsService`).

Chose A for consistency with the rest of the scoring/filtering/reputation layer.

## Phases

### Phase 1: extend `SettingsService` (add 2 methods + 1 interface + 6 DB keys)

**Files**:
- `apps/backend/src/settings/application/services/settings.service.ts` — add `getTokenGateConfig()`, `getPublishableChains()`, `TokenGateConfig` interface export
- `apps/backend/src/settings/application/services/settings.service.spec.ts` (if it exists) — add tests for new methods with FakeSettings

**New methods**:

```ts
export interface TokenGateConfig {
  readonly minScore: number;
  readonly maxRiskWeight: number;
  readonly minCompleteness: number;
  readonly blockedClassifications: ReadonlyArray<string>;
  readonly enableBlacklist: boolean;
}

async getTokenGateConfig(): Promise<TokenGateConfig> {
  return {
    minScore: await this.getFilterNumericValue('gate_min_score', 50, 'global'),
    maxRiskWeight: await this.getFilterNumericValue('gate_max_risk_weight', 100, 'global'),
    minCompleteness: await this.getFilterNumericValue('gate_min_completeness', 0.3, 'global'),
    blockedClassifications: await this.getFilterStringListValue(
      'gate_blocked_classifications', ['SCAM', 'UNKNOWN'], 'global'),
    enableBlacklist: await this.getFilterBooleanValue('gate_enable_blacklist', true, 'global'),
  };
}

async getPublishableChains(): Promise<string[]> {
  return this.getFilterStringListValue('publishable_chains', ['ethereum', 'solana'], 'global');
}
```

**Note**: requires extending `SettingsService` with `getFilterStringListValue()` and `getFilterBooleanValue()` (currently only `getFilterNumericValue` + `getFilterStringValue` exist). Small addition, follows existing pattern.

### Phase 2: migrate `ApplyFiltersUseCase`

**File**: `apps/backend/src/token/token-gating/application/handlers/apply-filters.use-case.ts`

Changes:
- Remove `DEFAULT_FILTER_CONFIG` export (lines 21-27)
- Remove `PUBLISHABLE_CHAINS` static (lines 66-70)
- Remove `defaultSettings()` stub — make `settings` required (drop `@Optional()`)
- `getEffectiveConfig()` reads `settings.getTokenGateConfig()` instead of spreading `DEFAULT_FILTER_CONFIG`
- `execute()` reads `settings.getPublishableChains()` instead of `ApplyFiltersUseCase.PUBLISHABLE_CHAINS`

### Phase 3: migrate `FiltersController`

**File**: `apps/backend/src/token/token-gating/api/http/filters.controller.ts`

Changes:
- Inject `SettingsService` via constructor
- Replace `...DEFAULT_FILTER_CONFIG` spread with `await settings.getTokenGateConfig()` (the `await` means the controller method becomes async; check if it already is)
- Update import: remove `DEFAULT_FILTER_CONFIG` import

### Phase 4: migrate `TokenScoredHandler`

**File**: `apps/backend/src/token/token-gating/infrastructure/event-bus/token-scored.handler.ts`

Changes:
- Inject `SettingsService` via constructor
- Replace `config: DEFAULT_FILTER_CONFIG` with `config: await settings.getTokenGateConfig()` (the `handle()` method becomes async if not already)
- Update import: remove `DEFAULT_FILTER_CONFIG` import

### Phase 5: wire `SettingsModule` in `FiltersModule`

**File**: `apps/backend/src/token/token-gating/filters.module.ts`

Changes:
- Add `import { SettingsModule } from 'settings/settings.module';`
- Add `SettingsModule` to `imports` array

### Phase 6: tests

**Files**:
- `apps/backend/src/token/token-gating/application/handlers/apply-filters.use-case.spec.ts` — update FakeSettings to implement new methods (`getTokenGateConfig`, `getPublishableChains`); remove `@Optional` handling if present in tests

### Phase 7: verify

```bash
cd apps/backend && npx tsc --noEmit       # expect: 0 errors
cd apps/backend && npx jest --silent      # expect: 58 suites, ≥452 tests pass
cd apps/backend && npx jest filters --silent  # targeted
```

### Phase 8: commit

Single atomic commit:
```
refactor(filters): remove @deprecated DEFAULT_FILTER_CONFIG + PUBLISHABLE_CHAINS

Both constants lived in apply-filters.use-case.ts and were marked @deprecated
in favor of SettingsService.getTokenGateConfig() / getPublishableChains().
Those methods didn't exist yet — partially stubbed via a defaultSettings()
fallback when @Optional() settings was not wired.

Adds the two methods to SettingsService (following the existing pattern of
getBaseScore(), getSignalPenalties(), getKolReputationThresholds()). Migrates
3 callers (ApplyFiltersUseCase, FiltersController, TokenScoredHandler) to
inject SettingsService. Adds SettingsModule to FiltersModule.imports.

Removes the @Optional() fallback since SettingsService is now always wired
in production (handlers are provided via Nest DI); tests use FakeSettings
implementations.

Files touched (5):
- settings.service.ts (+ TokenGateConfig + 2 new methods + string-list + boolean helpers)
- apply-filters.use-case.ts (remove deprecated constants + use settings)
- filters.controller.ts (inject SettingsService)
- token-scored.handler.ts (inject SettingsService)
- filters.module.ts (import SettingsModule)
- apply-filters.use-case.spec.ts (FakeSettings update)
```

### Diff size estimate

- ~6 files modified
- ~80 lines added (new methods, settings wiring, injection)
- ~30 lines deleted (deprecated constants + defaultSettings + @Optional handling)

## Risk analysis

| Risk | Probability | Impact | Mitigation | Detection |
|---|---|---|---|---|
| `getFilterStringListValue`/`getFilterBooleanValue` don't exist on real `SettingsService` | High (need to add) | phase 1 only | add in phase 1 before phase 2-4 | `tsc --noEmit` after phase 1 |
| Test FakeSettings doesn't implement new methods | Medium | jest failure | update spec in phase 6 | `jest` after phase 6 |
| `apply-filters.use-case.spec.ts` relies on @Optional fallback | Low | jest failure | update spec or restore optional | `jest filters` |
| Controller/handler async changes break response shape | Low | runtime regression | preserve same return type | manual review |
| `DEFAULT_FILTER_CONFIG` was used elsewhere I missed | Low | tsc error | grep exhaustive + tsc | `tsc --noEmit` |

## Reversibility

Each phase is independently reversible via `git checkout -- <files>`. If phase 1-2 reveals API design issues, can iterate before phase 3-5. Worst case: revert the whole commit and the deprecated constants come back unchanged.

## Out of scope

- Migrating the OTHER `@deprecated` in `apply-filters.use-case.ts:60` docstring (just removes reference to the constants — handled implicitly when constants are removed)
- Adding SettingsService-driven config for OTHER tunables (signal penalties, scoring thresholds) — those already migrated in earlier commits (`a7f3c04`, `168e375`, `7fcfdb2`)
- UI for editing these settings at runtime — covered by `config-ui.md` plan, separate task