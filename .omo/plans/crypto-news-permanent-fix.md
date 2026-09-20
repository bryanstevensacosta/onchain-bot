# crypto-news-permanent-fix - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** the news-matching pipeline stops depending on the server's firewall (it talks directly between containers), a visible health status for the pipeline in the dashboard and in deploy checks, the dashboard toggle reads the one true on/off switch, and the server setup script records the firewall rules so a reboot can't silently break things again — all shipped through the normal branch + review + merge flow.

**Why this approach:** every fix targets a proven root cause from today's outage (blocked network, silent scheduler, lying toggle, manual firewall), and each ships with an automatic tripwire (health endpoint, dashboard badge, deploy smoke checks) so the next failure pages us instead of hiding for days.

**What it will NOT do:** it won't touch message processing, publishing, the Telegram connection, production data, or any unrelated pending cleanups; and the safety default (matching starts OFF on brand-new databases) stays as is.

**Effort:** Medium
**Risk:** Medium - the release touches the production deploy path, but staging auto-deploys first as a canary and every step has a defined revert.
**Decisions to sanity-check:** container-name addressing instead of server IPs; health kept in memory rather than stored; old dashboard data tolerated with a fallback during the release window.

Your next move: run the Momus high-accuracy review (already requested), then start work. Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

- C1: `INGESTION_TELEGRAM_URL: http://onchain-bot-ingestion-telegram:3031` pinned in `environment:` of staging + prod composes (beats `.env.*`; dev/localhost untouched).
- C2: `GET /crypto-news/matching/health` returning exactly `{enabled,lastTickAt,lastFetchOk,consecutiveFetchFailures,lastEnqueuedAt,queuePending}`; frontend badge (loading/unknown/on-off, never crash on 404); smoke probes 6-7, summary `/7`.
- C3: `matchingEnabled` removed from `LlmConfigView` + frontend `LlmConfig`/`UpdateLlmConfigBody`; 400 write guard kept; same-SHA backend+frontend ship.
- C4: idempotent subnet-scoped (runtime-derived, never bridge-name) ufw + DOCKER-USER rules + socat persistence section in `bootstrap-droplet.sh`; one authorized live apply on OracleDroplet.
- C5: commit+push dev, bounded 600s polls (max 12), staging smoke gate, PR dev→master, user approval, checks green, conflict fix via merge, squash merge, post-merge 7/7 smokes.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No `ingestion-telegram` service block in staging/prod composes; no `depends_on` ingestion; no dev compose change.
- No `MATCHING_*` env vars (matching is DB-owned).
- No MTProto/session changes; no prod data writes (verification reads only: psql SELECT, curl GET).
- No `infra/terraform`, proxy (`vite.config.ts`, `nginx.conf`), ghost-event/ScoreTier/dead-URL fixes.
- No `.env.*` edits (document precedence only); no committing `.omo/.kiro` agent-state files (stage only intended files).
- No `git reset --hard`, no force-push, no rebase of shared branches; merge (not rebase) for conflict resolution.

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + Jest (backend, co-located `*.spec.ts`) + Vitest (frontend) + `bash -n`/shellcheck (scripts) + read-only smoke probes (curl) + `gh` (CI/PR).
- Backend gate per code todo: `npx jest <new-spec>`, full `npm run test:backend` green, `tsc --noEmit`, `eslint` on touched files.
- Frontend gate per UI todo: `npx vitest run <spec>`, `tsc -b`, `eslint src`.
- Evidence: .omo/evidence/task-<N>-crypto-news-permanent-fix.<ext> (logs, curl outputs, `gh` JSON).

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 1 (independent, parallel): T1 compose URL pins, T4 smoke probes, T6 bootstrap firewall section.
- Wave 2 (independent, parallel; contract-pinned): T2 health endpoint, T3 badge, T5 DTO removal.
- Wave 3: T7 one-time live firewall apply (blocked by T6 runbook).
- Wave 4: T8 commit+push, CI poll, staging smoke gate, open PR (blocked by Waves 1-3).
- Wave 5: T9 approval wait, checks, conflicts, squash merge, post-merge smokes (blocked by T8 + human approval).

### Dependency matrix

| Todo                   | Depends on                   | Blocks | Can parallelize with |
| ---------------------- | ---------------------------- | ------ | -------------------- |
| T1 compose pins        | —                            | T8     | T4, T6               |
| T2 health endpoint     | — (contract fixed in plan)   | T8     | T1, T3, T4, T5, T6   |
| T3 badge               | T2 contract (spec, not code) | T8     | T1, T2, T4, T5, T6   |
| T4 smoke probes        | —                            | T8     | T1, T6               |
| T5 DTO removal         | —                            | T8     | T1, T2, T3, T4, T6   |
| T6 bootstrap section   | —                            | T7, T8 | T1, T4               |
| T7 live firewall apply | T6                           | T8     | —                    |
| T8 push+CI+PR          | T1–T7                        | T9     | —                    |
| T9 approval+merge      | T8 + human approval          | —      | —                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Pin INGESTION*TELEGRAM_URL to container DNS in staging + prod composes
     What to do: in `apps/backend/docker-compose.staging.yml` backend `environment:` add `INGESTION_TELEGRAM_URL: http://onchain-bot-ingestion-telegram:3031`; same in `apps/backend/docker-compose.prod.yml` backend `environment:` (lines ~107-113). Add/refresh the comment noting compose `environment:` wins over `.env.staging`/`.env.production` and that dev/localhost is untouched. Must NOT do: no `ingestion-telegram` service block, no `depends_on` ingestion, no dev compose change, no `.env.*` edits, no `MATCHING*\*`vars.
Parallelization: Wave 1 | Blocked by: — | Blocks: T8
References: apps/backend/docker-compose.staging.yml:57-81 + :11 (old comment) + :134-136 (net name); apps/backend/docker-compose.prod.yml:74-140 + :179-182; apps/backend/docker-compose.ingestion.yml:11-35 (container_name onchain-bot-ingestion-telegram, both nets); droplet proof 2026-09-12:`http://onchain-bot-ingestion-telegram:3031/api/health`→ 200 from both backends.
Acceptance criteria:`POSTGRES_PASSWORD=dummy REDIS_PASSWORD=dummy docker compose -f apps/backend/docker-compose.staging.yml config | grep -A1 INGESTION`shows the DNS URL (dummy prefix required: prod file has`${VAR:?}`guards); same with prod file.`git diff --stat`shows only the two compose files. Ordering constraint: droplet must bring up`docker-compose.ingestion.yml`first (it owns both external nets) before recreating backends, or DNS fails silently behind SSE backoff.
QA scenarios: happy —`docker compose -f <file> config`exits 0 with URL present, evidence .omo/evidence/task-1-crypto-news-permanent-fix.txt. Failure — point URL at`http://127.0.0.1:3032` temporarily in a scratch copy (NOT committed): in-container curl must fail, proving the test discriminates; restore.
     Commit: Y | chore(compose): pin INGESTION_TELEGRAM_URL to container DNS
- [x] 2. Pipeline health state + GET /crypto-news/matching/health
     What to do: add an in-memory `MatchingHealthState` holder at `crypto-news-integration/application/state/matching-health.state.ts` (fields `lastTickAt,lastFetchOk,consecutiveFetchFailures,lastEnqueuedAt`), register it as a provider in `crypto-news-integration.module.ts`, mutate it in `EnqueueMatchingCronScheduler.tick()` success/failure paths; add `countPending(): Promise<number>` to the `PublisherQueueRepository` port plus its TypeOrm and in-memory implementations (the port today only has finders + countPublishedToday — no count-by-status); add `GET health` to `MatchingConfigController` returning exactly `{enabled,lastTickAt,lastFetchOk,consecutiveFetchFailures,lastEnqueuedAt,queuePending}` with `queuePending` from the new `countPending()`; co-located `*.spec.ts` for holder + handler (tests-after). Must NOT do: no persistence of health state, no auth change (public read-only like matching/config), no new logger (autoLogging.ignore covers `/crypto-news/*`), no proxy changes.
     Parallelization: Wave 2 | Blocked by: — (contract fixed above) | Blocks: T8
     References: apps/backend/src/telegram/crypto-news-integration/api/http/matching-config.controller.ts:33-54; crypto-news-integration.module.ts:60-78 (repo binding :69-72); application/ports/matching-config.repository.ts:10-21; scheduler `enqueue-matching-cron.scheduler.ts` tick (~:47-78, repo.load + getMatchingMessages limit 50); health pattern src/health/health.controller.ts:11-18.
     Acceptance criteria: `npx jest <new-spec> --forceExit` green; `npm run test:backend` green; local `curl -sf $BE/crypto-news/matching/health | jq -e '.enabled,.lastTickAt,.lastFetchOk,.consecutiveFetchFailures,.lastEnqueuedAt,.queuePending'` (against dev backend if bootable, else spec-level assertion of shape).
     QA scenarios: happy — enabled=true + recent tick → all keys present, evidence .omo/evidence/task-2-crypto-news-permanent-fix.txt. Failure — simulate fetch throw in spec → `lastFetchOk=false`, `consecutiveFetchFailures` increments; `PATCH .../matching/config '{"enabled":false}'` → scheduler skips (existing behavior).
     Commit: Y | feat(crypto-news): expose matching pipeline health endpoint
- [x] 3. Frontend pipeline badge + 15s poll on useMatchingConfig
     What to do: add `fetchMatchingHealth(): Promise<MatchingHealth>` (`GET /crypto-news/matching/health`, type mirrors the todo-2 6-field contract) in `llm-config-api.ts` plus `useMatchingHealth()` in `use-llm-config.ts` with `refetchInterval: 15_000, refetchIntervalInBackground: false, staleTime: 5_000`; render a status badge directly above `<MatchingToggleButton />` in `pages/crypto-news/index.tsx` (~:515) consuming ONLY `useMatchingHealth` (keep `useMatchingConfig` for the toggle) with three states — LOADING skeleton, UNKNOWN/ERROR gray (tooltip shows `consecutiveFetchFailures`, never throw on 404/old backend), ON/OFF green/red with relative `lastTickAt`; co-located vitest for the three states (tests-after). Must NOT do: no changes to toggle buttons themselves, no `vite.config.ts`/`nginx.conf` changes (prefix already proxied), no blocking on query error.
     Parallelization: Wave 2 | Blocked by: T2 contract (spec only) | Blocks: T8
     References: apps/frontend/src/pages/crypto-news/index.tsx:508-519 (badge anchor above toggle); features/crypto-news-publisher/ui/matching-toggle-button.tsx:10-23; model/use-llm-config.ts:44-75 (keep toggle on useMatchingConfig); api/llm-config-api.ts:61-85 (add MatchingHealth type + fetch fn here).
     Acceptance criteria: `npx vitest run <badge-spec>` green; `tsc -b` clean; `eslint src` clean on touched files.
     QA scenarios: happy — mocked health ON → green + timestamp, evidence .omo/evidence/task-3-crypto-news-permanent-fix.txt. Failure — mocked 404 (old backend) → gray UNKNOWN, no crash; mocked enabled=false → red OFF.
     Commit: Y | feat(crypto-news): pipeline status badge with live health poll
- [x] 4. Smoke probes 6-7 for matching config + health
     What to do: append to `scripts/smoke-prod.sh` probe 6 `GET $SMOKE_BACKEND_URL/crypto-news/matching/config` (expect 200 + boolean `enabled`) and probe 7 `GET $SMOKE_BACKEND_URL/crypto-news/matching/health` (expect 200 + all 6 keys), GET-only with `$SMOKE_TIMEOUT`, `PASS/FAIL` lines like existing, update summary `/5`→`/7`. Must NOT do: no new script file, no non-GET requests, no `/api` prefix on these two paths.
     Parallelization: Wave 1 | Blocked by: — | Blocks: T8
     References: scripts/smoke-prod.sh:1-91 (probes pattern :40-86, summary :86); .github/workflows/deploy.yml:239-247; deploy-staging.yml:404-412.
     Acceptance criteria: `bash -n scripts/smoke-prod.sh` + `shellcheck scripts/smoke-prod.sh` clean; run `SMOKE_BACKEND_URL=http://<droplet-staging>:3031 ... bash scripts/smoke-prod.sh` → probes 1-5 PASS, 6-7 FAIL (endpoint not deployed yet — proves probes discriminate), evidence saved.
     QA scenarios: happy — post-deploy rerun → `7/7 PASS`. Failure — pre-deploy run → exactly `5/7`, failures only on 6-7.
     Commit: Y | test(smoke): probe matching config + pipeline health
- [x] 5. Remove deprecated matchingEnabled from LlmConfig read path
     What to do: remove `matchingEnabled` from `LlmConfigView` + `toConfigView` (`llm-config.mapper.ts`); remove it from frontend `LlmConfig` + `UpdateLlmConfigBody` (`llm-config-api.ts`); keep the 400 write guard + hint in `llm-config.controller.ts:200-217`; keep the column in DB/entity untouched; update affected co-located specs. Must NOT do: no entity/migration change, no touching the matching/config endpoint, no frontend tolerance hacks beyond `??` fallback where the old field was read.
     Parallelization: Wave 2 | Blocked by: — | Blocks: T8
     References: backend application/mappers/llm-config.mapper.ts:19-33,52-66; api/http/llm-config.controller.ts:71-72,194-217; api/input/llm-config.input.ts:112-119; frontend features/crypto-news-publisher/api/llm-config-api.ts:30-44,99-110.
     Acceptance criteria: backend + frontend suites green; `curl -s $BE/crypto-news-publisher/llm/config | jq -e 'has("matchingEnabled") | not'`; `curl -s -X PATCH $BE/crypto-news-publisher/llm/config -d '{"matchingEnabled":true}'` → HTTP 400 with hint.
     QA scenarios: happy — GET lacks field, PATCH rejected 400, evidence .omo/evidence/task-5-crypto-news-permanent-fix.txt. Failure — old frontend bundle reading `config.matchingEnabled` → `undefined`, must not crash (assert `??` fallback path in spec).
     Commit: Y | refactor(crypto-news): drop deprecated matchingEnabled from LlmConfig read
- [x] 6. Firewall-as-code section in bootstrap-droplet.sh
     What to do: append an idempotent section to `bootstrap-droplet.sh`: derive backend subnets at runtime via `docker network inspect onchain-bot-net onchain-bot-staging-net`, add subnet-scoped (never bridge-name-scoped) ACCEPTs for TCP 3031/3032 in the `DOCKER-USER` chain (insert before any manual REJECT if present), ensure socat listeners for 3030/3031/3032 persist (systemd unit + `systemctl enable --now` guarded by `command -v socat`). Must NOT do: no hardcoded subnets/bridge names, no touching `infra/terraform`, no compose network redesign, no running it against the live host in this todo.
     Parallelization: Wave 1 | Blocked by: — | Blocks: 7, 8
     References: bootstrap-droplet.sh:1-63 (zero firewall content today); droplet evidence 2026-09-12: manual INPUT REJECT shadows ufw, /etc/ufw/user.rules:26-32 (subnet rules that work), socat listeners on 100.110.169.120:3030-3032.
     Acceptance criteria: `bash -n bootstrap-droplet.sh` clean; `shellcheck -S warning bootstrap-droplet.sh` clean; second dry parse identical (idempotence by inspection: guards + `ufw --force`/iptables `-C` checks before `-A`).
     QA scenarios: happy — both checks pass, evidence .omo/evidence/task-6-crypto-news-permanent-fix.txt. Failure — `shellcheck` finding or non-idempotent append (e.g. blind `-A` without `-C`) → fix before commit.
     Commit: Y | chore(infra): declare crypto-news firewall + socat persistence
- [x] 7. One-time live firewall apply on OracleDroplet (authorized)
     What to do: execute EXACTLY the commands from todo 6's runbook section against OracleDroplet via ssh (user-authorized one-time exception): apply subnet-scoped DOCKER-USER ACCEPTs for 3031/3032 derived from `docker network inspect`, verify with `sudo ufw status numbered`, `sudo iptables -L DOCKER-USER -n`, and in-container probes `docker exec onchain-bot-staging-backend … curl http://onchain-bot-ingestion-telegram:3031/api/health` + same for prod backend (expect 200 + `{"status":"ok"`). All other droplet access in this plan stays read-only. Must NOT do: no other host mutation, no container restarts, no DB writes.
     Parallelization: Wave 3 | Blocked by: 6 | Blocks: 8
     References: runbook section written in todo 6; droplet containers onchain-bot-staging-backend, onchain-bot-backend, onchain-bot-ingestion-telegram.
     Acceptance criteria: both in-container probes return HTTP 200; `iptables -L DOCKER-USER -n | grep -E '3031|3032'` shows both subnet ACCEPTs; evidence transcript saved.
     QA scenarios: happy — 200/200 + rules present, evidence .omo/evidence/task-7-crypto-news-permanent-fix.txt. Failure — any probe non-200 → diagnose (DNS? net attach?) and re-run idempotent apply; never proceed to todo 8 with failing probes.
     Commit: N (no repo change; host state only)
- [x] 8. Commit + push dev, poll CI, staging gate, open PR
     What to do: on branch `dev` (create from origin/dev if needed; `git status` clean of unrelated files — stage ONLY todos 1-6 files, never `.omo/.kiro` state): run backend+frontend gates (`npm run test:backend`, `npx vitest run`, `tsc`, `eslint`), commit per-todo messages from this plan, `git push origin dev`, then run this explicit bounded loop (max 12 iterations ≈ 2h; on timeout/failure stop + report, do NOT force-push): `for i in $(seq 1 12); do gh run list --branch dev --limit 1 --json databaseId,status,conclusion --jq '.[0]'; sleep 600; done` stopping early on `completed` (require SUCCESS). After CI green: run staging smoke gate `SMOKE_BACKEND_URL=http://localhost:3031 SMOKE_FRONTEND_URL=http://localhost:4173 SMOKE_INGESTION_URL=http://localhost:3032 bash scripts/smoke-prod.sh` from the droplet (read-only; expect 7/7 — staging auto-deployed on dev push; ingestion compose must already be up per todo 1 ordering constraint), then `gh pr create --base master --head dev` with summary + test evidence. Must NOT do: no push to master, no merge, no `--no-verify` (hooks must pass), no force-push.
     Parallelization: Wave 4 | Blocked by: 1-7 | Blocks: 9
     References: GOVERNANCE.md (dev→staging, master→prod, squash, 1 approval); .github/workflows/ci.yml; deploy-staging.yml:334-412; lint-staged + husky hooks.
     Acceptance criteria: `gh run list --branch dev --limit 1 --json conclusion` = SUCCESS; smoke output `7/7 PASS`; `gh pr view --json state,mergeable` = OPEN + MERGEABLE.
     QA scenarios: happy — all green + PR open, evidence .omo/evidence/task-8-crypto-news-permanent-fix.txt. Failure — CI red → read logs, fix on dev, re-push (new poll cycle); smoke <7/7 → fix forward on dev, never hotfix staging host.
     Commit: Y (the per-todo commits) + push | PR opened dev→master
- [~] 9. Approval wait, checks, conflicts, squash merge, post-merge smokes — UPDATE 2026-09-12 07:56Z: PR #203 MERGED externally 07:49:41Z (a472374). Deploy-to-production run 34681730094 in `waiting` = production environment `wait_timer: 600` (by design, fires ~07:59:43Z). Resume: watch deploy → 7/7 smokes staging+prod → final wave.
  What to do: poll `gh pr view --json reviews,reviewDecision` every 600s (max 12 iterations; stop + report on timeout — never merge without the user's approval), then run explicit bounded checks loop `for i in $(seq 1 12); do gh pr checks --json name,state --jq .; sleep 600; done` stopping early when all complete (require all green); if `mergeable` = CONFLICTING: `git fetch origin master && git merge origin/master` into dev, resolve conflicts (matching code wins only with evidence; never delete others' changes silently), re-run gates, push, re-poll checks; then `gh pr merge --squash --delete-branch=false`. Master push auto-deploys prod: poll prod health + run `scripts/smoke-prod.sh` with prod env (`:3030/:5173/:3032` from droplet) → expect `7/7 PASS`; also rerun staging smoke. Must NOT do: merge without user approval, merge with red checks, rebase, `--delete-branch`, direct master commits.
  Parallelization: Wave 5 | Blocked by: 8 + human approval | Blocks: —
  References: .github/workflows/deploy.yml:222-248 (health loop + smoke); GOVERNANCE.md squash rule.
  Acceptance criteria: `gh pr view --json state` = MERGED; prod smoke `7/7 PASS`; staging smoke `7/7 PASS`; `curl -sf https://<prod>/crypto-news/matching/config` (via droplet `http://127.0.0.1:3030/crypto-news/matching/config`) returns 200 with boolean `enabled`.
  QA scenarios: happy — MERGED + 7/7 + 7/7, evidence .omo/evidence/task-9-crypto-news-permanent-fix.txt. Failure — checks red → fix on dev (new poll cycle, re-approval if requested); conflicts → resolve via merge as above; poll timeout → stop + report to user, do NOT merge blind.
  Commit: N (squash merge is the commit) | PR squash-merged dev→master

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit — every todo 1-9 has refs + executable acceptance + happy/failure QA + commit line; Must-NOTs respected (no ingestion service in staging/prod composes, no MATCHING\_\* env, no proxy/infra/terraform touches). Tool: read plan + `git status`/`git log --oneline`. Evidence: .omo/evidence/final-1-crypto-news-permanent-fix.txt. ✓ APPROVED: All plan constraints satisfied, zero Must-NOT violations, git history clean, conventional commits.
- [x] F2. Code quality review — backend/frontend suites green on dev, eslint+tsc clean, no `any` crossing boundaries, DDD/FSD layout respected. Tools: `npm run test:backend`, `npx vitest run`, `tsc`, `eslint`. Evidence: .omo/evidence/final-2-crypto-news-permanent-fix.txt. ✓ APPROVED: Backend 177/1977 green, frontend 24/305 green, tsc clean both, eslint warnings pre-existing (non-blocking), DDD/FSD respected.
- [x] F3. Real manual QA — from droplet: staging + prod in-container DNS probes 200; `GET /crypto-news/matching/config` 200 both envs; `GET /crypto-news/matching/health` 6 keys both envs; `PATCH .../llm/config '{"matchingEnabled":true}'` → 400; smokes 7/7 both envs. Tools: curl + docker exec (reads only). Evidence: .omo/evidence/final-3-crypto-news-permanent-fix.txt. ✓ APPROVED: Staging+prod smokes 7/7, health endpoints live with 6 keys, in-container DNS probes 200, deprecated field rejected 400, scheduler active (fresh timestamps).
- [x] F4. Scope fidelity — `git diff master...dev --stat` contains only intended files (composes, health endpoint+spec, badge+spec, mapper+DTO+specs, smoke script, bootstrap script); no `.omo/.kiro` files, no MTProto/prod-data/infra changes. Tool: `git diff --stat` + `gh pr view --json files`. Evidence: .omo/evidence/final-4-crypto-news-permanent-fix.txt. ✓ APPROVED: PR #203 scope 24 files all intentional, zero agent state committed, zero Must-NOT violations.

## Commit strategy

Conventional commits per todo (feat/fix/chore/test + scope), one commit per todo 1-6 on `dev`, single `git push origin dev` in todo 8 (hooks run: lint-staged, tsc, docs:check warning-only). No `--no-verify`, no force-push, no master commits. Release via PR squash-merge (todo 9) after user approval + green checks. Rollback: `git revert` on dev (staging auto-redeploys prior image).

## Success criteria

- Staging + prod schedulers fetch via container DNS (no host firewall in path); 600s-loop polls all green.
- `GET /crypto-news/matching/health` live in both envs with 6 keys; badge visible, never crashes on 404.
- Smoke `7/7 PASS` staging + prod; PR dev→master squash-MERGED with no conflicts at merge time.
- No recurrence path: silent fetch outage → badge red + smoke fail; flag OFF → visible; UI cannot display stale deprecated field.
