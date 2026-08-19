---
slug: staging-zero-downtime
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/staging-zero-downtime.md
approach: |
  Option A mejorada: (1) add healthcheck to backend in staging compose, 
  (2) split deploy into 2 steps (backend first with --no-deps, wait for 
  healthcheck, then frontend), (3) add nginx proxy timeouts for graceful 502.
---

# Draft: staging-zero-downtime

## Components (topology ledger)

<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

| id                                | outcome                                                                  | status | evidence                                                |
| --------------------------------- | ------------------------------------------------------------------------ | ------ | ------------------------------------------------------- |
| C1 - backend healthcheck          | Add healthcheck (wget /api/health) + start_period 40s to staging compose | active | prod compose lines 105-118, staging compose lines 45-64 |
| C2 - split deploy                 | Backend first (--no-deps), wait for health, then frontend                | active | deploy-staging.yml line 163                             |
| C3 - nginx timeouts               | Add proxy_connect_timeout 3s to all proxy locations                      | active | nginx.conf (no timeouts anywhere)                       |
| C4 - healthcheck loop in workflow | Replace `sleep 10` with retry loop (30 attempts x 2s)                    | active | deploy-staging.yml lines 169-172                        |

## Open assumptions (announced defaults)

<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

| assumption                                  | adopted default                                                                      | rationale                                                 | reversible?               |
| ------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------- |
| backend healthcheck params                  | Match prod: wget /api/health, interval 30s, timeout 10s, retries 3, start_period 40s | Conservative, proven in prod                              | Yes (config change only)  |
| nginx proxy_connect_timeout                 | 3s                                                                                   | Fast enough to not hang UX, slow enough for brief blips   | Yes (single value change) |
| healthcheck retry loop                      | 30 attempts x 2s = 60s max                                                           | Generous for NestJS cold boot                             | Yes                       |
| frontend healthcheck                        | Also add to staging compose (mirror prod)                                            | Good practice, no downside                                | Yes                       |
| Remove `--force-recreate` from backend step | Keep it (`--no-deps --force-recreate`) — ensures container recreation                | Build step already makes fresh image, belt-and-suspenders | Yes                       |

## Findings (cited - path:lines)

- **Prod backend has healthcheck** — `docker-compose.prod.yml:105-118` (wget /api/health, start_period 40s)
- **Staging backend has NO healthcheck** — `docker-compose.staging.yml:45-64` (no healthcheck block)
- **Current deploy kills both containers** — `deploy-staging.yml:163` (`--force-recreate backend frontend`)
- **Nginx has no proxy timeouts** — `nginx.conf` (only socket.io has proxy_read_timeout 86400, line 139)
- **Prod frontend also has healthcheck** — `docker-compose.prod.yml:136-149`
- **Socat services are systemd, not Docker** — they survive container restarts unchanged
- **Deploy healthcheck uses `sleep 10` then curl via Tailscale** — lines 169-176

## Decisions (with rationale)

1. **2-step deploy** — avoids killing frontend+backend simultaneously. Old frontend nginx keeps serving SPA while backend restarts.
2. **Backend first, then frontend** — frontend can serve SPA (static files) while backend boots. APIs briefly return 502 → TanStack Query retries.
3. **nginx proxy_connect_timeout 3s** — prevents 60s nginx default hang during the backend restart window (~2-5s).
4. **Keep `depends_on: backend` without `condition: service_healthy`** — frontend should start even if backend has not yet passed first healthcheck.

## Scope IN

- `apps/backend/docker-compose.staging.yml` — add healthcheck to backend and frontend
- `.github/workflows/deploy-staging.yml` — split line 163 into 2-step deploy + healthcheck wait loop
- `apps/frontend/nginx.conf` — add `proxy_connect_timeout 3s` to all proxy location blocks
- Deploy workflow healthcheck section (lines 169-176): update to use localhost healthcheck loop

## Scope OUT (Must NOT have)

- Blue-green containers (Option C — deferred)
- Changes to production deploy (`docker-compose.prod.yml`, `deploy.yml`)
- Changes to socat services
- Frontend error boundaries or reconnection toasts (nice-to-have, not scope)
- Changes to frontend application code (React components, TanStack Query)

## Open questions

<!-- Only 1 fork: nginx error_page handling — skipped → default adopted -->

(Default adopted: add error_page 502 JSON fallback)

## Approval gate

status: approved
pending-action: execution (via $start-work)
approach: Option A mejorada — 3 file changes + 1 workflow change, ~30-45min effort
momus-verdict: APPROVE ✅ (no blocking issues)
metis-findings: folded in — removed --force-recreate, verified /api/health endpoint, documented rollback risk
user-decision: |-

- Add error_page 502 JSON fallback to nginx? (Recommended: YES) → adopted ✅
