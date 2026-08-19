# frontend-prod-deploy - Work Plan

## TL;DR (For humans)

**What you'll get:** Un `.env.dev.template` con todas las variables documentadas, limpieza de la confusión entre `.env` y `.env.dev`, el build del frontend arreglado en staging, y el frontend deployándose automáticamente en producción igual que en staging.

**Why this approach:** Los 4 cambios son independientes pero apuntan al mismo objetivo: que los 3 entornos (dev, staging, prod) tengan paridad de config y deployment para el frontend. Staging y prod deben verse igual, y dev necesita una template para que cualquier dev sepa qué vars configurar.

**What it will NOT do:** No toca nginx.conf, no agrega `.env` al frontend (no lo necesita), no cambia el workflow de desarrollo local, no modifica infraestructura del droplet.

**Effort:** Short
**Risk:** Low - cambios localizados en archivos de config y workflow, fácil de revertir. ⚠️ Nota: el tiempo de deploy de producción aumentará ~2-5 min por el build del frontend.
**Decisions to sanity-check:** Eliminar `.env` de `envFilePath` (solo dejar `.env.dev`). Verificar que `.env.dev` tenga todas las vars.

Your next move: approve, then `$start-work` to execute. Full execution detail follows below.

---

> TL;DR (machine): Short effort, Low risk. 4 tasks: create .env.dev.template, clean up .env vs .env.dev references, fix staging frontend Docker build context, add frontend auto-deploy to production workflow.

## Scope

### Must have

1. Create `apps/backend/.env.dev.template` with placeholder values (matching existing templates style)
2. Replace `['.env.dev', '.env']` with `['.env.dev']` in `main.ts` and `app.module.ts`
3. Update `database.module.ts` comment that references `.env`
4. Fix staging frontend build context in `docker-compose.staging.yml`
5. Add frontend build + deploy + healthcheck + rollback to `deploy.yml`

### Must NOT have (guardrails, anti-slop, scope boundaries)

- Do NOT create `.env.development` / `.staging` / `.production` for frontend (not needed)
- Do NOT modify `nginx.conf` (already works in both staging and prod)
- Do NOT modify `vite.config.ts` (local dev proxy is fine)
- Do NOT modify droplet configs, Tailscale IPs, or production `.env` files
- Do NOT touch the dev workflow (`npm run dev` should be unaffected)
- Do NOT modify any test files

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after (config/workflow files have no unit tests; verify by inspection + CI simulation)
- Evidence: .omo/evidence/task-<N>-frontend-prod-deploy.md

## Execution strategy

### Parallel execution waves

- **Wave 1** (tasks 1-2): `.env.dev.template` creation + `.env` cleanup — independent, can run in parallel
- **Wave 2** (tasks 3-4): Staging fix + prod deploy — both depend on Wave 1 completing, but are independent of each other

### Dependency matrix

| Todo                            | Depends on                | Blocks | Can parallelize with |
| ------------------------------- | ------------------------- | ------ | -------------------- |
| 1. Create .env.dev.template     | —                         | —      | 2, 3, 4              |
| 2. Clean up .env refs           | —                         | —      | 1, 3, 4              |
| 3. Fix staging frontend build   | 1 (indirect: verify vars) | —      | 2                    |
| 4. Auto-deploy frontend in prod | —                         | —      | 1, 2, 3              |

> **Note on wave grouping:** Tasks 1, 2, 3, 4 are all independent. Wave 1 = all 4 tasks in parallel.
> But Task 2 (clean up `.env`) has a PRE-CONDITION: verify that `.env.dev` has every var that was previously in `.env` before removing `.env` from the load path. This pre-check can run in Task 2 itself.

## Todos

- [ ] 1. Crear `.env.dev.template`
     **What to do:** Create `apps/backend/.env.dev.template` with same structure as `.env.staging.template` and `.env.production.template`. All values as empty placeholders. Must include ALL vars from `.env.dev`, organized in sections with comments. Key sections: Application, CoinMarketCap, CoinGecko, Alchemy, Birdeye, FluxRPC, Helius, Mobula, Moralis, Pump.dev, Telegram (MTProto + Bot API), Telegram Ingestion Seed, VIP Calls, Crypto-news publisher, Chain Dexter, Analytics, Postgres, Redis, LLM Gateway.

  **⚠️ SECURITY:** Do NOT include real API keys or secrets. All values must be empty (`VAR=`). Do NOT overwrite `.env.dev` (keep the real secrets file untouched). Read `.env.dev` ONLY for variable names — never print, log, or commit the values.

  **Parallelization:** Wave 1 | Blocked by: — | Blocks: —
  **References:**
  - Template to follow: `apps/backend/.env.staging.template` (style guide, format)
  - Actual dev vars: `apps/backend/.env.dev` (for variable names ONLY, NOT values — use `grep -n "^[A-Z_]" apps/backend/.env.dev` to extract just names)

  **Acceptance criteria:**
  - File `apps/backend/.env.dev.template` exists
  - Every variable in `.env.dev` has a corresponding placeholder line in the template (verified by extracting key names from both files and diffing)
  - Header comments match the pattern from `.env.staging.template` (section headers, environment warning, blank lines)
  - `diff <(grep "^[A-Z_]" apps/backend/.env.dev | sed 's/=.*//' | sort) <(grep "^[A-Z_]" apps/backend/.env.dev.template | sed 's/=.*//' | sort)` returns empty (same variable names)
  - No real secrets leaked: `grep -c '[a-zA-Z0-9]\{20,\}' apps/backend/.env.dev.template` = 0

  **QA scenarios:**
  - Happy: Diff variable names between `.env.dev` and template — should be identical set
  - Happy: Compare style against `.env.staging.template` for consistency
  - Failure: `grep -c '[a-zA-Z0-9]\{20,\}' apps/backend/.env.dev.template` should be 0 (no long alphanumeric strings = no leaked keys)
  - Evidence: `.omo/evidence/task-1-frontend-prod-deploy.md`

  **Commit:** Yes | `chore(backend): add .env.dev.template`

- [ ] 2. Limpiar referencias a `.env` en backend
     **What to do:**
     **⚠️ PRE-CHECK (critical):** Before removing `.env` from the load path, verify that `.env.dev` contains EVERY variable that `.env` might have. Run:

  ```
  diff <(grep "^[A-Z_]" /path/to/any/existing/.env 2>/dev/null | sed 's/=.*//' | sort) <(grep "^[A-Z_]" apps/backend/.env.dev | sed 's/=.*//' | sort)
  ```

  If any variable exists ONLY in `.env`, it must be added to `.env.dev` first. If no `.env` file exists (current state), skip this check.

  **Main changes:**
  1. `apps/backend/src/main.ts:17`: Change `['.env.dev', '.env']` to `['.env.dev']` and update the comment on line 14.
  2. `apps/backend/src/app.module.ts:48`: Change `envFilePath: ['.env.dev', '.env']` to `envFilePath: ['.env.dev']`.
  3. `apps/backend/src/shared/common/persistence/database.module.ts:80`: Update comment that says `envFilePath: ['.env']` to reflect the current config.

  **Must NOT do:** Do NOT change `process.env.X` usage patterns — only the explicit `.env` string references in env-file loading. Do NOT modify test files. Do NOT remove `.env` from backfill scripts (`scripts/backfills/_template.ts` uses `dotenv.config({ path: '.env' })` — that's a separate concern and should stay as-is since backfills run in a different context). Do NOT delete the `.env` file from disk (leave it for now; developers who had it may still use it).

  **Parallelization:** Wave 1 | Blocked by: — | Blocks: —
  **References:**
  - `apps/backend/src/main.ts:14-22` (manual dotenv loading loop)
  - `apps/backend/src/app.module.ts:46-50` (ConfigModule.forRoot)
  - `apps/backend/src/shared/common/persistence/database.module.ts:78-82` (comment only)

  **Acceptance criteria:**
  - No references to `['.env.dev', '.env']` remain in `main.ts` or `app.module.ts`
  - Only `['.env.dev']` appears in both files
  - `grep -n "'\.env'" apps/backend/src/main.ts apps/backend/src/app.module.ts` returns no matches for `.env` as a file name
  - `npm run test:backend` passes (all 972 tests)
  - `npm run build` passes

  **QA scenarios:**
  - Happy: Run `npm run test:backend` — all 972 pass
  - Happy: Run `npm run build` — build succeeds
  - Happy: Verify `.env.dev` is the only env file loaded — `grep -n "envFilePath" apps/backend/src/app.module.ts | grep "\.env.dev"` and NOT `\.env`
  - Failure: Start backend with `npm run start:dev` — should boot without errors (runs for 5s then Ctrl+C)
  - Evidence: `.omo/evidence/task-2-frontend-prod-deploy.md`

  **Commit:** Yes | `refactor(backend): remove .env from envFilePath, use only .env.dev`

- [ ] 3. Arreglar build context de frontend en staging
     **What to do:** In `apps/backend/docker-compose.staging.yml`, fix the frontend build service (lines 57-66). Change build context from `../frontend` to `../..` and dockerfile path accordingly.

  **Current (broken):**

  ```yaml
  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
  ```

  **Fixed:**

  ```yaml
  frontend:
    build:
      context: ../..
      dockerfile: apps/frontend/Dockerfile
  ```

  **Must NOT do:** Do NOT change the prod docker-compose (it already has the correct context). Do NOT change ports, container names, or any other service config.

  **Parallelization:** Wave 2 | Blocked by: — | Blocks: —
  **References:**
  - `apps/backend/docker-compose.staging.yml:57-66` (current broken config)
  - `apps/backend/docker-compose.prod.yml:126-134` (correct reference pattern — context `../..`, dockerfile `apps/frontend/Dockerfile`)
  - `apps/frontend/Dockerfile:5-12` (expects root context — `COPY tsconfig.base.json ./`, `COPY apps/frontend/package.json ./apps/frontend/`)

  **Acceptance criteria:**
  - `grep "context:" apps/backend/docker-compose.staging.yml` shows `../..` for frontend service
  - `grep "dockerfile:" apps/backend/docker-compose.staging.yml` shows `apps/frontend/Dockerfile` for frontend service
  - Build context matches prod pattern exactly (diff should show no meaningful difference between staging and prod frontend build config)

  **QA scenarios:**
  - Happy: Run `docker compose -f apps/backend/docker-compose.staging.yml build frontend` (from repo root) — build succeeds with no errors
  - Happy: Verify context matches prod — `diff <(grep -A5 'frontend:' apps/backend/docker-compose.prod.yml) <(grep -A5 'frontend:' apps/backend/docker-compose.staging.yml)` shows only port/name differences

  **Commit:** Yes | `fix(infra): correct staging frontend Docker build context`

- [ ] 4. Agregar auto-deploy de frontend en producción
     **What to do:** Modify `deploy.yml` to build and deploy the frontend alongside the backend. Changes needed:
  1. After backend build (line 127), add frontend build:
     ```bash
     echo "=== Building frontend ==="
     docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml build frontend
     ```
  1. Change deploy command (line 140) from:
     ```bash
     docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml up -d --force-recreate backend
     ```
     to:
     ```bash
     docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml up -d --force-recreate backend frontend
     ```
  1. After backend healthcheck succeeds (after line 152), add frontend healthcheck:
     ```bash
     echo "=== Frontend healthcheck ==="
     curl -sf -m 10 -o /dev/null http://localhost:5173/ || { echo "FRONTEND HEALTHCHECK FAILED"; exit 1; }
     echo "Frontend is healthy"
     ```
  1. Include frontend in rollback (lines 145-151): when rollback triggers, also recreate frontend:
     Change `up -d --force-recreate backend` to `up -d --force-recreate backend frontend` in both rollback locations.
  1. **⚠️ Verify**: Count all occurrences of `up -d --force-recreate` in deploy.yml — there are exactly 3 (initial deploy, rollback line 145, rollback line 149). All must include `frontend`.

  **Must NOT do:** Do NOT change the staging workflow (`deploy-staging.yml`) — it already works (once the build context is fixed). Do NOT add frontend healthcheck before backend healthcheck (backend must be healthy first). Do NOT change how secrets or env vars are loaded.

  **Parallelization:** Wave 2 | Blocked by: — | Blocks: —
  **References:**
  - `.github/workflows/deploy.yml:122-153` (current "Build and deploy" step — full context)
  - `apps/backend/docker-compose.prod.yml:126-155` (frontend service already defined)
  - `apps/backend/docker-compose.staging.yml:140-148` (staging deploy frontend build step for reference)
  - `apps/frontend/nginx.conf:1-109` (nginx proxy config — serves frontend and proxies API)

  **Acceptance criteria:**
  - `grep "build frontend" .github/workflows/deploy.yml` finds the frontend build step
  - `grep "frontend" .github/workflows/deploy.yml` shows frontend referenced in build, deploy, rollback, and healthcheck
  - The `up -d --force-recreate` line in all 3 locations (initial deploy + 2 rollback) includes `frontend`
  - Healthcheck step references port 5173

  **QA scenarios:**
  - Happy: Validate YAML syntax — `node -e "console.log(require('js-yaml').load(require('fs').readFileSync('.github/workflows/deploy.yml','utf8')))"` should not throw
  - Happy: Or use `docker compose -f apps/backend/docker-compose.prod.yml config` to verify the compose file is valid (not the workflow, but a good sanity check on related config)
  - Happy: Trace the execution path — build frontend → build backend → migrate → up backend frontend → healthcheck backend → healthcheck frontend → complete
  - Failure: Count `up -d --force-recreate` occurrences — `grep -c "up -d --force-recreate" .github/workflows/deploy.yml` should be 3 and all should include `frontend`
  - Evidence: `.omo/evidence/task-4-frontend-prod-deploy.md`

  **Commit:** Yes | `ci(deploy): add frontend build, deploy, healthcheck, and rollback to production workflow`

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — verify each of the 4 scope items was completed
- [ ] F2. Code quality review — verify no secrets leaked, no syntax errors, no unintended changes
- [ ] F3. Build verification — `npm run build` (backend + frontend), `npm run test:backend` (972 tests), `npm run test:frontend` (154 tests)
- [ ] F4. Docker compose validation — `docker compose config` for both staging and prod

## Commit strategy

4 commits, one per task, in order (task 1 → 2 → 3 → 4). Each commit independently buildable and testable. Push all at once to `dev` branch.

## Success criteria

1. `apps/backend/.env.dev.template` exists and has all env vars documented
2. Backend loads only from `.env.dev`, not `.env`
3. Staging frontend build context is fixed (matches prod pattern)
4. Production workflow builds, deploys, and healthchecks the frontend
5. All 1126 tests pass (972 backend + 154 frontend)
