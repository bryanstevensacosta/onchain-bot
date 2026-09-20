---
slug: crypto-news-permanent-fix
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/crypto-news-permanent-fix.md (skeleton exists, todos NOT appended yet)
approach: 5 waves on dev branch — (1) switch INGESTION_TELEGRAM_URL to container DNS in both composes, (2) pipeline health endpoint + frontend badge + smoke probes, (3) drop matchingEnabled from LlmConfigView read, (4) firewall-as-code in bootstrap-droplet.sh, (5) worker release protocol commit/push/poll-600/PR/checks/squash. Tests-after. Momus pre-opted by user, runs after plan approval.
---

# Draft: crypto-news-permanent-fix

## Components (topology ledger)

| id | outcome (one line) | status | evidence path |
| C1-dns-switch | Backends reach ingestion via `http://onchain-bot-ingestion-telegram:3031` (no host firewall in path) | active | droplet DNS probe 200/200 2026-09-12; apps/backend/docker-compose.staging.yml:11; docker-compose.prod.yml (no URL in-file); docker-compose.ingestion.yml:33-35,55-62 |
| C2-health-smoke | `GET /crypto-news/matching/health` + frontend badge + smoke probes 6-7 catch silent outages | active | apps/backend/src/health/health.controller.ts:11-18; crypto-news-integration.module.ts:60-78; apps/frontend/src/pages/crypto-news/index.tsx:515-518; scripts/smoke-prod.sh |
| C3-dto-cleanup | `matchingEnabled` removed from LlmConfigView read (write already 400-guarded) | active | llm-config.mapper.ts:19-24,52-56; llm-config.controller.ts:194-217; llm-config.input.ts:112-119 |
| C4-firewall-as-code | ufw/socat declared by subnet in bootstrap-droplet.sh (today: 0 matches) | active | bootstrap-droplet.sh (grep ufw|iptables|socat|3032 = none); droplet INPUT lines 6-8 + /etc/ufw/user.rules:26-32 |
| C5-release | commit+push, poll-600 loop, PR dev→master, checks green, conflict fix, squash merge | active | user-specified protocol; .github/workflows/deploy.yml:239-247; deploy-staging.yml:404-412; push dev auto-triggers CI + staging deploy |

## Open assumptions (announced defaults)

| assumption | adopted default | rationale | reversible? |
| Fix1 mechanism | pin URL in compose `environment:` (staging.yml + prod.yml) | visible, versioned, beats env_file; container_name pinned in ingestion.yml | yes |
| Health payload | {enabled,lastTickAt,lastFetchOk,consecutiveFetchFailures,lastEnqueuedAt,queuePending} | scheduler owns all fields already | yes |
| Badge placement/poll | above MatchingToggleButton (index.tsx:515) + refetchInterval 15s on useMatchingConfig | matches existing 15/30s frontend polling convention | yes |
| Smoke extension | probes 6-7 in smoke-prod.sh (reused by both deploys via env) | zero new scripts | yes |
| Fail-closed default | keep enabled=false on fresh seeds | safety; Fix2 makes OFF visible instead of silent | yes |
| Work branch | dev (governance: dev→staging auto, master→prod on merge) | repo rule | n/a |
| Test strategy | tests-after (user-confirmed 2026-09-12) | co-located \*.spec.ts + suites green + smoke | n/a |

## Findings (cited - path:lines)

- Staging outage = EHOSTUNREACH staging-net→host: manual INPUT REJECT shadows ufw; staging bridge had no ACCEPT (prod had "18b-ephemeral" rule). Fixed live via direct ACCEPT + ufw subnet rule (/etc/ufw/user.rules:30-32).
- Prod outage = crypto_news_matching_config.enabled=false since 2026-09-06; scheduler skips silently. Fixed live via UPDATE.
- Prod image (:latest, master) lacks MatchingConfigController → /crypto-news/matching/config 404; prod frontend bundle lacks matching/config → toggle reads deprecated LlmConfig.matchingEnabled=true (UI lies).
- Both backends resolve onchain-bot-ingestion-telegram:3031 → 200 (droplet probe 2026-09-12).
- useMatchingConfig/useLlmConfig: staleTime 5s, NO refetchInterval (use-llm-config.ts:44-75).

## Decisions (with rationale)

- Tests-after (user answer 2026-09-12).
- Momus dual review runs after plan approval (user pre-opted: "ejecuta momus para refinarlo").
- Implementation by worker ($start-work); planner never implements (sticky plan mode) — user's "implementalo" honored via handoff with zero-interview plan incl. 600-protocol.
- DTO removal ships same-release as new frontend (both built from master) → old UI breakage acceptable; recorded as ordering constraint.

## Scope IN

C1-C5 above, on dev branch, backend+frontend+compose+workflows+bootstrap script + release protocol to squash-merged PR.

## Scope OUT (Must NOT have)

- No MTProto changes; no prod data touches; no new infra beyond bootstrap script section; no touching unrelated gaps (ghost events, ScoreTier, dead URLs); no direct droplet edits by worker except verification reads (release via CI/deploys only).

## Open questions

Q1 answered 2026-09-12: worker applies one-time firewall runbook on OracleDroplet (idempotent), reads-only otherwise.
Q2 answered 2026-09-12: user approves dev→master PR; worker waits with bounded 600s polls (max 12), then squash-merges after approval + green checks.
Adopted without asking (reversible internals): Q3 skew → frontend tolerates absent matchingEnabled via ?? fallback + hard-refresh note; Q4 health state → in-memory singleton (restart resets, re-ticks in ≤5min).

## Metis findings folded (ses_f6c76e38dffeuhR45z91XybIWf)

Blockers: F1 health-state holder must be built (fields do NOT exist in scheduler) + exact 6-field contract; F2 firewall needs scope exception + DOCKER-USER + runtime-derived subnets + socat persistence; F3 release must be bounded (gh run watch max 12 polls) + human-approval gate + conflict-via-merge + revert path; F4 every todo needs executable commands + expected outputs (curl/docker exec/gh/shellcheck), happy + failure scenarios.
Majors folded as constraints: F5 compose environment:-over-env*file precedence + dev untouched + ingestion-first boot order + in-container DNS proof; F6 same-PR frontend type removal + spec enumeration + same-SHA ship; F7 badge 3-state (loading/unknown/on-off), never crash on 404, refetchInterval 15s + refetchIntervalInBackground false; F8 staging smoke gate (smoke-prod.sh with staging env) before master PR + Tailscale-URL revert defined; F9 per-task Must-NOTs (no ingestion service in staging/prod composes, no infra/ network redesign, no .env edits, no MATCHING*\* env); F10 probes 6-7 GET-only, /7 summary, path WITHOUT /api prefix; F11 health public read-only, logging ignore reused, Must-NOT touch vite.config.ts/nginx.conf.
Note: Codex CLI absent on this machine (no codex binary) → dual-Momus pass 2 impossible; will run native momus only and record the limitation.

## Approval gate

status: plan-complete-momus-okay
Plan written: .omo/plans/crypto-news-permanent-fix.md (9 todos + F1-F4, TL;DR filled last).
Metis: folded (ses_f6c76e38dffeuhR45z91XybIWf). Momus native: CHANGES-REQUIRED → 5 fixes applied → re-pass OKAY (ses_f6c70fc39ffeXp7D3iY4tG5yHg).
Dual-review pass 2 (Codex CLI gpt-5.5): NOT RUN — no codex binary on this machine (recorded limitation).
Next: worker execution via $start-work. Planner never implements (sticky plan mode).
