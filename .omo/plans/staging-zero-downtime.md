# staging-zero-downtime - Work Plan

## TL;DR (For humans)

**What you'll get:** When you push to `dev`, the frontend SPA nunca se cae — solo las llamadas API fallan brevemente (2-5s) mientras el backend se reinicia, y se recuperan automáticamente. Adiós a la pantalla de 502.

**Why this approach:** Hoy el deploy mata frontend y backend juntos. Separando el deploy en 2 pasos (backend primero, esperar a que esté listo, frontend después), el frontend viejo sigue sirviendo el SPA mientras el backend nuevo arranca. Solo las APIs fallan unos segundos (502), y TanStack Query lo retryea solo.

**What it will NOT do:** No agrega contenedores extra (blue-green), no toca producción, no cambia código React. El downtime de API se reduce de ~10s (todo caído) a ~2-5s (solo APIs).

**Effort:** Short (~30 min)
**Risk:** Low — cambios acotados a 3 archivos, mirror de config que ya existe en prod
**Decisions to sanity-check:**

- Healthcheck params copiados de prod (start_period 40s)
- Nginx timeout en 3s (default de nginx es 60s — mucho mejor)
- error_page 502 devuelve JSON en lugar de HTML de nginx

Your next move: Run the dual Momus high-accuracy review, then start work. Full execution detail follows below.

---

> TL;DR (machine): Short effort — 3 file changes + 1 workflow update. No new dependencies. ~30 min implementation, low risk.

## Scope

### Must have

1. Backend healthcheck in `docker-compose.staging.yml` (modeled after prod)
2. Frontend healthcheck in `docker-compose.staging.yml` (modeled after prod)
3. Split deploy-staging.yml: backend first with healthcheck wait, then frontend
4. Add proxy timeouts to nginx.conf for graceful 502 handling
5. Update healthcheck section in deploy workflow

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No changes to production files (docker-compose.prod.yml, deploy.yml)
- No blue-green containers
- No frontend React code changes (TanStack Query, components, etc.)
- No socat service changes
- No new Docker services or images
- No changes to postgres/redis config or healthchecks

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after (manually verify via review of changed files + dry-run validation)
- Evidence: .omo/evidence/staging-zero-downtime/
- Verification: Read each changed file after edit, confirm syntax validity, run `npm run build` on frontend to validate nginx.conf isn't used in build (it's in Dockerfile), validate YAML syntax of compose and workflow files

## Execution strategy

### Parallel execution waves

- Wave 1 (parallel): Todo 1 (compose healthcheck) + Todo 2 (nginx timeouts) — independent files
- Wave 2 (sequential after Wave 1): Todo 3 (deploy workflow split) — depends on both Wave 1 todos conceptually, but is code-wise independent

### Dependency matrix

| Todo                     | Depends on | Blocks | Can parallelize with |
| ------------------------ | ---------- | ------ | -------------------- |
| 1. Compose healthchecks  | —          | —      | Todo 2               |
| 2. Nginx timeouts        | —          | —      | Todo 1               |
| 3. Deploy workflow split | —          | —      | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Add backend + frontend healthchecks to staging docker-compose.yml
     ⚠️ Metis gap addressed: healthcheck endpoint verified at `apps/backend/src/health/health.controller.ts:12` (GET /api/health)
     ⚠️ Metis gap addressed: frontend healthcheck uses `http://localhost/` (nginx serves SPA on /)
     ⚠️ Metis gap addressed: do NOT add `condition: service_healthy` to frontend's `depends_on: backend` — the 2-step deploy already ensures ordering, and frontend should start regardless
     What to do / Must NOT do:
  - Edit `apps/backend/docker-compose.staging.yml` to add healthcheck block to `backend` and `frontend` services
  - Model after prod (`docker-compose.prod.yml:105-149`): use `wget --no-verbose --tries=1 --spider`
  - Backend healthcheck: test `http://localhost:3030/api/health`, interval 30s, timeout 10s, retries 3, start_period 40s
  - Frontend healthcheck: test `http://localhost/`, interval 30s, timeout 5s, retries 3, start_period 20s
  - Must NOT: change postgres/redis sections, change port mappings, add new services
    Parallelization: Wave 1 | Blocked by: — | Blocks: —
    References:
  - `apps/backend/docker-compose.staging.yml:45-74` (backend + frontend services to edit)
  - `apps/backend/docker-compose.prod.yml:105-149` (reference implementation — backend lines 105-118, frontend lines 136-149)
    Acceptance criteria (agent-executable):
  1. Read `apps/backend/docker-compose.staging.yml` — confirm `backend:` service has a `healthcheck:` block with `wget ... /api/health`, `start_period: 40s`
  2. Confirm `frontend:` service has a `healthcheck:` block with `wget ... localhost/`, `start_period: 20s`
  3. Run `node -e "require('js-yaml').load(require('fs').readFileSync('apps/backend/docker-compose.staging.yml','utf8'))"` — YAML must parse without error
     QA scenarios:
  - Happy: Read file, confirm healthcheck blocks exist with correct values
  - Failure: Intentionally remove a healthcheck line, re-verify YAML parse works — revert
    Evidence: `cat apps/backend/docker-compose.staging.yml | grep -A 8 "healthcheck:"` for both backend and frontend sections
    Commit: Y | chore(staging): add backend and frontend healthchecks to docker-compose.staging.yml

- [x] 2. Add proxy timeouts + error_page to nginx.conf
     What to do / Must NOT do:
  - Edit `apps/frontend/nginx.conf` to add `proxy_connect_timeout 3s;` and `proxy_read_timeout 10s;` to ALL 13 HTTP proxy location blocks
  - Do NOT touch the `/socket.io/` location block (already has `proxy_read_timeout 86400`)
  - Add `proxy_intercept_errors on;` to each HTTP proxy location block
  - Add at the bottom (before the add_header directives):
    ```
    error_page 502 =502 @maintenance;
    location @maintenance {
        default_type application/json;
        return 502 '{"status":"maintenance","message":"Backend is restarting — connection will be retried"}';
    }
    ```
  - Must NOT: change the root `/` location, change socket.io location, add emoji or markdown
    Parallelization: Wave 1 | Blocked by: — | Blocks: —
    References:
  - `apps/frontend/nginx.conf` (entire file, 145 lines)
  - Proxy locations: lines 16-131 (13 location blocks proxying to backend:3030)
  - Socket.IO location: lines 133-140 (leave untouched)
  - add_header directives: lines 142-144 (insert error_page BEFORE these)
    Acceptance criteria (agent-executable):
  1. Read `apps/frontend/nginx.conf` — every HTTP proxy location block (lines 16-131) must have `proxy_connect_timeout 3s;` and `proxy_read_timeout 10s;` and `proxy_intercept_errors on;`
  2. File must have `error_page 502 =502 @maintenance;` and `location @maintenance { ... }` block
  3. Socket.IO location must NOT have been modified
     QA scenarios:
  - Happy: Read file, grep for proxy_connect_timeout — should show 13 matches
  - Happy: grep for "error_page 502" — should show 1 match
  - Failure: grep socket.io section — confirm no proxy_connect_timeout added there
    Evidence: `grep -c "proxy_connect_timeout" apps/frontend/nginx.conf` (should be 13)
    Commit: Y | chore(nginx): add proxy timeouts and error_page for graceful 502 handling

- [x] 3. Split deploy-staging.yml into 2-step deploy with healthcheck wait
     ⚠️ Metis gap addressed: removed `--force-recreate` — `up -d` alone detects image change from build step and recreates. Without `--force-recreate`, if build silently failed, the old container stays running (no unnecessary downtime).
     ⚠️ Metis gap addressed: known risk — if backend healthcheck fails after 30x2s retries, NO backend is running (same as current behavior, but frontend stays up). This is strictly better than today where both go down.
     ⚠️ Metis gap addressed: frontend healthcheck loop NOT added to workflow — nginx boots in milliseconds, the final healthcheck step (currently lines 174-176) verifies frontend is up.
     What to do / Must NOT do:
  - Edit `.github/workflows/deploy-staging.yml`
  - Step structure should become:
    1. (Keep existing) "Sync live source tree with dev" — lines 91-109
    2. (Keep existing) "Clean stale node_modules" — lines 111-115
    3. (Keep existing) "Ensure .env.staging exists" — lines 117-126
    4. (Keep existing) "Inject staging env vars from GitHub" — lines 128-136
    5. (Keep existing) "Backup staging DB" — lines 138-143
    6. (Keep existing) "Build backend" — lines 145-147
    7. (Keep existing) "Build frontend" — lines 149-151
    8. (CHANGED) Extract the .env writing lines (current lines 155-162) into its own step "Configure deploy environment" BEFORE the deploy steps, so it runs once and applies to both backend and frontend deploys
    9. (CHANGED) Replace the old "Deploy services" step (lines 153-163) with three steps:
       a. "Deploy backend" — `docker compose ... up -d --no-deps backend` (NO `--force-recreate`)
       b. "Wait for backend healthcheck" — loop `curl -sf http://localhost:3031/api/health` (30 attempts x 2s, exit 1 on failure)
       c. "Deploy frontend" — `docker compose ... up -d frontend` (NO `--force-recreate`)
    10. (CHANGED) Update "Healthcheck backend (Tailscale)" step (lines 169-172) — remove `sleep 10`, keep the curl as a verification
  - Important: keep ALL existing steps EXCEPT the ones being changed. Do not delete the install-socat-services step or image cleanup step.
  - Must NOT: change build steps, backup steps, env steps, cleanup steps, or socat install step
    Parallelization: Wave 2 | Blocked by: — | Blocks: —
    References:
  - `.github/workflows/deploy-staging.yml:145-183` (build → deploy → healthcheck section)
  - Current line 163: `docker compose -f /opt/onchain-bot-staging/apps/backend/docker-compose.staging.yml up -d --force-recreate backend frontend`
  - New backend deploy line: `docker compose -f /opt/onchain-bot-staging/apps/backend/docker-compose.staging.yml up -d --no-deps backend`
  - New frontend deploy line: `docker compose -f /opt/onchain-bot-staging/apps/backend/docker-compose.staging.yml up -d frontend`
  - Healthcheck endpoint verified: `apps/backend/src/health/health.controller.ts:12` (returns `{status: 'ok'}`)
    Acceptance criteria (agent-executable):
  1. Read `.github/workflows/deploy-staging.yml` — confirm there are NO references to `--force-recreate backend frontend` together
  2. Confirm a step named "Wait for backend healthcheck" exists with `curl -sf http://localhost:3031/api/health` in a loop
  3. Confirm the healthcheck step at the bottom no longer has `sleep 10`
  4. Run `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/deploy-staging.yml','utf8'))"` — YAML must parse without error
     QA scenarios:
  - Happy: Read file, confirm all 3 new steps exist and the old single-step deploy is gone
  - Happy: Confirm `--no-deps` is used for backend but NOT for frontend (frontend has no deps to skip)
  - Failure: grep for "backend frontend" — must NOT find it in a `docker compose ... up -d` line
  - Failure: Confirm `--force-recreate` no longer appears in any deploy step
  - Failure: Confirm `sleep 10` no longer appears in any healthcheck step
  - Edge case: Confirm the .env writing is extracted into its own step BEFORE the two deploy steps, not embedded inside either one
    Evidence: - `grep -n "backend frontend\|--no-deps\|\--force-recreate\|sleep 10\|Wait for backend\|curl.*localhost:3031\|REDIS_PASSWORD" .github/workflows/deploy-staging.yml` - Confirm YAML valid: `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/deploy-staging.yml','utf8'))"`
    Commit: Y | chore(ci): split staging deploy into 2-step with backend healthcheck wait

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit — 3/3 todos completed, git diff shows only 3 intended files ✅
- [x] F2. Code quality review — YAML valid (js-yaml parse passed), nginx.conf has 13 timeouts + error_page ✅
- [ ] F3. Real manual QA — ⏳ User to verify on next push to dev: frontend stays up during backend restart
- [x] F4. Scope fidelity — git diff confirms NO changes to prod files, socat files, or React components ✅

## Commit strategy

- Commit 1: `chore(staging): add backend and frontend healthchecks to docker-compose.staging.yml`
- Commit 2: `chore(nginx): add proxy timeouts and error_page for graceful 502 handling`
- Commit 3: `chore(ci): split staging deploy into 2-step with backend healthcheck wait`
- Total: 3 commits, push to `dev` branch

## Success criteria

1. After backend healthcheck + 2-step deploy is deployed, the next `push` to `dev` should result in:
   - Frontend SPA never returns a full-page error (stays serving at all times)
   - Backend restarts independently without taking down frontend
   - API calls return 502 briefly (2-5s) during backend restart instead of frontend being inaccessible
   - TanStack Query retry (retry: 1) recovers from the brief outage automatically
