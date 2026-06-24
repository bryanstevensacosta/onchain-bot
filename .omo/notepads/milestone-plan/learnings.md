# Milestone Plan — Learnings

## 2026-06-24T08:38:49Z Task: fix-build-lint

### Outcome
- `npx nest build` (apps/backend): **PASS** (exit 0)
- `npx tsc --noEmit` (apps/backend): **PASS** (exit 0)
- `npx eslint "{src,test}/**/*.ts"` (apps/backend): **PASS** (0 errors, 59 warnings — warnings only, OK per spec)
- `npm run build` (root, both apps): **PASS** (exit 0)
- `npx tsc -b && npx vite build` (apps/frontend): **PASS** (exit 0)
- `npx eslint src` (apps/frontend): **PASS** (exit 0)

### Changes made

**1. `apps/backend/src/token/milestone/application/ports/index-export.ts`**
- File already used `export type` for the 4 type-only re-exports (`MilestoneThresholdRecord`, `MonitoredCallRecord`, `NotifiedMilestoneRecord`, `MarketDataItem`) before this task — the 4 TS1205 errors were pre-fixed. No changes needed here.

**2. `apps/backend/tsconfig.eslint.json` (new file)**
- Extends `tsconfig.json`, removes the `src/**/*.spec.ts` exclude so ESLint's project service can type-check spec files.
- Contents:
  ```json
  { "extends": "./tsconfig.json", "exclude": ["dist", "node_modules"] }
  ```

**3. `apps/backend/eslint.config.mjs`**
- Changed `parserOptions.projectService: true` → `parserOptions.project: ['./tsconfig.eslint.json']`.
- This eliminated all 43 "Parsing error: ... was not found by the project service" errors on spec files.

**4. `apps/backend/src/app.controller.ts`**
- Changed `@Res() res?: any` → `@Res() res?: Response` (using the existing `import type { Response } from 'express'`).
- Resolved 2× `@typescript-eslint/no-unsafe-call` on `res?.status(200).json(...)`.

**5. `apps/backend/src/shared/identicon/identicon.generator.spec.ts`**
- `.filter((v) => v !== Number.NaN)` → `.filter((v) => !Number.isNaN(v))`.
- Resolved 1× `use-isnan` error.

**6. `apps/backend/src/settings/settings.e2e-spec.ts`**
- Pulled `res.body as Array<{ name: string }>` into a typed local `presets` const before calling `.some(...)`.
- Resolved 1× `@typescript-eslint/no-unsafe-call` error on the chained `.some` callback.

**7. `apps/backend/src/telegram-publishing/vip-calls/application/handlers/vip-calls-list-published.use-case.ts` and `src/telegram/vip-calls-channel/application/handlers/vip-calls-list-published.use-case.ts`**
- `calls.map(this.toView)` → `calls.map((call) => this.toView(call))`.
- Resolved 2× `@typescript-eslint/unbound-method` errors (method not declared with `this: void` and called as a free function).

**8. `apps/backend/src/token/milestone/application/handlers/evaluate-active-calls.use-case.spec.ts`**
- In the `makeConfig` helper, changed `get: () => ({ milestone: { activeWindowHours: activeHours } }) as any` to `get: (): { milestone: { activeWindowHours: number } } => ({ milestone: { activeWindowHours: activeHours } })`.
- Resolved 1× `@typescript-eslint/no-unsafe-return` error. The outer `as unknown as ConfigService` cast is preserved, so the helper still satisfies the test contract.

**9. Auto-fixed by `npx eslint --fix`**
- 25 errors and 1 warning fixed automatically — all `prettier/prettier` reformatting. Predominantly in:
  - `apps/backend/src/token/milestone/` (api, application, infrastructure, milestone.module.ts)
  - `apps/backend/src/token/token-gating/application/handlers/apply-filters.use-case.ts`
  - `apps/backend/src/settings/settings.e2e-spec.ts` (only formatting; my functional edit is preserved)
- These are mechanical formatting changes (line breaks, comma placement) — no logic altered.

### Pre-existing issues (not in scope)
- `apps/backend/src/settings/settings.e2e-spec.ts` and `test/app.e2e-spec.ts` fail at runtime with: `Cannot find module 'telegram/chain-dexter-bot/domain/chat-group.entity'`. Jest's path-alias config does not resolve the `telegram/*` mapping. This is **unrelated to my changes** — the failure exists with or without them, and is caused by pre-existing untracked modifications to `src/shared/common/persistence/database.module.ts`. Out of scope for build/lint fixes.

### Verification commands run
```bash
# All exit 0
cd apps/backend && npx nest build
cd apps/backend && npx tsc --noEmit
cd apps/backend && npx eslint "{src,test}/**/*.ts"   # 0 errors, 59 warnings
cd apps/frontend && npx tsc -b && npx vite build
cd apps/frontend && npx eslint src
npm run build                                       # root: backend + frontend
```

### File summary
- Created: 1 file (`apps/backend/tsconfig.eslint.json`)
- Modified: 8 files (functional edits, see above)
- Plus ~25 files reformatted by `eslint --fix` (prettier only — no logic changes)
- **No milestone BC source files** (port interfaces, use cases, services, controllers in `src/token/milestone/...` other than the spec helper above) had their **logic** modified. Only the spec helper and the auto-formatted pre-existing code.
