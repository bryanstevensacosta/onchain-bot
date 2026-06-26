# live-feed-robust - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** <fill last - deliverables in human terms, 1-2 sentences>

**Why this approach:** <fill last - the one or two load-bearing decisions and why>

**What it will NOT do:** <fill last - 1-3 plain lines mirroring Must NOT have>

**Effort:** <Quick | Short | Medium | Large | XL>
**Risk:** <Low | Medium | High> - <one-line driver>
**Decisions to sanity-check:** <fill last - the few choices worth a human glance>

Your next move: <fill - e.g. approve, or run a high-accuracy review>. Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope
### Must have
- DELETE 9 invalid `canonical_token_calls` rows (IDs listed in draft findings)
- TypeORM migration `1700000000000-CleanupCanonicalAddressGarbage.ts`: DELETE rows + ADD CHECK constraint on `canonical_token_calls.address` for solana chain (base58 alphabet `^[1-9A-HJ-NP-Za-km-z]{32,44}$`)
- Harden `mergeMarketData.first()` in `enrich-token.use-case.ts` to coerce `undefined`→`null` for every numeric/string getter (defense layer 1)
- Add runtime guard in `TokenSnapshot.create` that throws `DomainError(VALIDATION)` if any numeric field receives `undefined` (defense layer 2)
- Provider normalization helper `normalizeMarketData(raw: MarketData): MarketData` applied in dexscreener/birdeye/helius/geckoterminal adapters (defense layer 3)
- Defensive coercion in `TypeOrmTokenSnapshotMapper.toEntity`: `Number(x) || null` on every numeric column (defense layer 4)
- MTProto adapter: `@Interval(5*60_000)` watchdog calling `client.getDialogs()` + logging if last message age > 10 min
- MTProto adapter: subscribe to `UpdateError`/connection events, exponential-backoff reconnect (1s→30s)
- Extend `KolListenerPort` interface with `lastMessageAt(): Date | null` and `connectionStatus(): 'connected'|'reconnecting'|'dead'|'unauthorized'`
- `WsGateway`: emit `pipeline.heartbeat` event every 15s with payload `{ lastEventAt, mtprotoStatus, queueSize, uptimeMs }`
- HTTP endpoint `GET /internal/health/pipeline` returning same heartbeat payload
- TypeORM JSONB query method `findByKolSince(kolId: string, since: Date, limit: number)` on `CanonicalTokenCallRepository` (Postgres `sources @> '[{"kolId":"..."}]'::jsonb` + `last_seen_at >= $2` ORDER BY DESC LIMIT $3)
- `RecomputeKolReputationUseCase` uses the new repo method, dropping `findRecent(5000)` per-kol scan
- WS client hook `usePipelineHeartbeat` updates a Zustand-free React state with `lastEventAt` + `mtprotoStatus`
- `LiveFeed` widget renders "stale since Xm" badge when `lastEventAt > 10min ago`
- `LiveFeedPage` connection indicator shows: green=live, yellow=heartbeat-missed, gray=reconnecting, red=disconnected
- TDD coverage: 5 unit tests (mergeMarketData coercion, TokenSnapshot.create guard, provider normalizer, MTProto status, WS heartbeat shape), 2 integration tests (enrichment end-to-end with stubbed undefined provider, kol-rep query filtered at SQL), 1 e2e (POST /token/intake/parsing/parse → WS `scoring.token.scored` within 5s)

### Must NOT have (guardrails, anti-slop, scope boundaries)
- NO change to `MarketData` interface shape — keep `?:` optional fields; fix at boundary
- NO change to provider adapter business logic — only add `normalizeMarketData` wrapper at return site
- NO new WS event types beyond `pipeline.heartbeat`
- NO new DB columns / tables beyond the CHECK constraint
- NO breaking changes to existing REST endpoints (no renamed fields, no removed routes)
- NO new ENV vars beyond what's documented in `.env.example`
- NO changes to Telegram publishing path (`telegram/vip-calls-channel/`) — out of scope
- NO refactor of `KolReputationCalculator` math — only the use case's repository call
- NO change to the live MTProto client lifecycle (still OnModuleInit/OnModuleDestroy) — add to it
- NO manual SQL run by humans — everything goes through `npm run migration:run`

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD (red test first, then fix) — framework: Jest (backend) + Vitest (frontend) + Playwright for one visual QA
- Evidence: `.omo/evidence/task-<N>-live-feed-robust.<ext>` (test output, screenshot, curl response)
- Pre-merge gates per todo: (1) `npm test -w backend` passes, (2) `curl` smoke against running backend at :3030 returns 2xx, (3) for frontend, `npm run build` succeeds
- Migration safety: dry-run via `npm run db:migrate:dry-run` before applying; rollback path = `--down` reverts DELETE + drops CHECK

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means under-splitting.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| A1 | — | B3, E1 | (none, do first) |
| B1 | — | B3 | C1, E1, A1 |
| B2 | — | B3 | C1, E1, A1 |
| C1 | — | C2, D1 | B1, B2, E1, A1 |
| E1 | A1 (constraint must exist) | E2 | B1, B2, C1 |
| B3 | B1, B2, A1 | — | C2, E2 |
| C2 | C1 | D1 | B3, E2 |
| E2 | E1 | — | C2, D1 |
| D1 | C2 | F1, F2 | E2 |
| D2 | — | (independent ops surface) | F1 |
| F1 | D1 | F3 | D2, F2 |
| F2 | D1 | F1 | D2 |
| F3 | F1, F2 | (final verification) | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. <title>
  What to do / Must NOT do: <...>
  Parallelization: Wave <N> | Blocked by: <...> | Blocks: <...>
  References (executor has NO interview context - be exhaustive): <src/path:lines>
  Acceptance criteria (agent-executable): <exact command or assertion>
  QA scenarios (name the exact tool + invocation): happy + failure, Evidence .omo/evidence/task-1-live-feed-robust.<ext>
  Commit: <Y/N> | <type>(<scope>): <summary>

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

## Success criteria
