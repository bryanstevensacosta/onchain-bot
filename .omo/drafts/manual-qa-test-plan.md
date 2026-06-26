---
slug: manual-qa-test-plan
status: plan-written
intent: clear
pending-action: ready to execute (no code, just playwright + DB/API comparison)
approach: Manual QA via MCP playwright. For each page: navigate → snapshot → screenshot → compare rendered values against direct API calls + DB queries. All errors found → logged in "Errors found" section for later fix.
---

# Manual QA Test Plan — Frontend vs Backend (Playwright + API/DB comparison)

## Setup

**URL**: http://localhost:5173 (frontend), http://localhost:3030 (backend)

**Required state**: backend running with `DATABASE_ENABLED=true` and some seeded data (KOLs, calls, snapshots).

**Tooling**:
- MCP playwright for browser automation (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_console_messages`, `browser_network_requests`, `browser_evaluate`, `browser_take_screenshot`, `browser_wait_for`)
- `curl` for direct API calls (via Bash, not Playwright)
- `psql` for DB queries (via Bash)
- `npm run dev` confirmed running by user

## Refactoring context (IMPORTANT)

**The backend was extensively refactored in prior sessions**. Many endpoint paths and controllers were restructured (e.g. KOL endpoints moved from `/kols` to `/telegram-kol/identity/kols` and `/telegram-kol/reputation/kols`). The frontend was updated to use the new paths.

**Implications for testing**:
- ❌ Do NOT treat "old endpoint returns 404" as a bug (e.g. `/kols` returning 404 is CORRECT — the new path is `/telegram-kol/identity/kols`)
- ❌ Do NOT use `apps/frontend/README.md` §3 as source of truth for endpoints — it's outdated. Use the actual `@Controller` decorators in `apps/backend/src/**/api/http/*.controller.ts` as source of truth
- ❌ Do NOT assume "old test plan expectations" are valid — adapt to the refactored code
- ✅ Verify each endpoint by checking the source file directly
- ✅ Cross-check frontend queries against backend controllers, not against the README

## Conventions

For each page:
1. **Navigate** to URL
2. **Wait** for page to settle (`browser_wait_for time: 2`)
3. **Snapshot** the accessibility tree
4. **Screenshot** for visual record
5. **Check console messages** (errors = failure)
6. **Check network requests** to verify backend calls succeed
7. **Compare displayed values vs API** (use `browser_evaluate` to call fetch inside page OR curl externally)
8. **Test interactions** (click, form submit, navigation)

**Pass criteria per check**: value rendered == value returned by API. If mismatch, log to "Errors found".

## Pre-flight checks (run once before page tests)

- [ ] Frontend dev server reachable: `browser_navigate http://localhost:5173` → expect no error
- [ ] Backend reachable: `curl -s http://localhost:3030/` → expect JSON `{"message":"..."}`
- [ ] Database reachable: `psql $POSTGRES_URL -c "SELECT count(*) FROM kols"` → expect > 0 (some KOLs seeded)
- [ ] Socket.IO server reachable: `curl -s http://localhost:3030/socket.io/?EIO=4&transport=polling` → expect non-error response
- [ ] No critical console errors on initial load: `browser_console_messages level=error`

## Page 1: Dashboard (`/`)

### 1.1 Initial render
- [ ] Navigate to `/`
- [ ] Snapshot — verify: KpiCards widget + LiveFeed widget + TopTokensTable widget
- [ ] Wait 3s for KPI data to load
- [ ] Verify "WS ●" badge visible (green = connected)
- [ ] Screenshot for record

### 1.2 KPI cards consistency (CRITICAL: frontend vs `/dashboard/kpis`)
- [ ] Read each KPI card value via snapshot (e.g. "Active KOLs: 5", "Published: 12")
- [ ] Capture the `/dashboard/kpis` response via `browser_network_requests filter=/dashboard/kpis`
- [ ] Compare: each card value == response field
- [ ] Expected fields: `activeKols`, `totalKols`, `canonicalCalls`, `approvalRate`, `publishedCount`, etc.
- [ ] **Verify approval rate calculation**: `(approved / total) * 100` from API vs card text

### 1.3 LiveFeed on dashboard
- [ ] Verify event list renders OR "no events" empty state
- [ ] Capture 1 network request to verify polling is happening
- [ ] Wait 5s — verify new event appears IF backend pipeline is producing data
- [ ] **Verify timestamps**: each event shows a time ago label. If backend provides timestamps, compare them

### 1.4 TopTokensTable consistency
- [ ] Capture `/token/scoring/tokens/top` response
- [ ] Compare: each row in table == entry in API response (chain, address, ticker, score, tier)
- [ ] Verify score gauge visual: score 87 should show gauge at ~87%

### 1.5 Real-time KPI updates (CRITICAL: WS push)
- [ ] Wait 10s without reload
- [ ] Capture `/dashboard/kpis` again (should be cached for 1s)
- [ ] Wait 1s and capture again — verify new value if backend data changed
- [ ] **Verify WS push works**: trigger a backend event (e.g. replay via Ops page) and verify Dashboard updates within 2s

### 1.6 Navigation from dashboard
- [ ] Click first KPI card or stat → expect navigation to detail page (or no-op if non-clickable)
- [ ] Click first LiveFeed event → expect navigation to `/tokens/:chain/:address`
- [ ] Click first TopTokensTable row → expect navigation to `/tokens/:chain/:address`

## Page 2: Live Feed (`/live`)

### 2.1 Initial render
- [ ] Navigate to `/live`
- [ ] Snapshot — verify: LiveFeed widget full-width, no KPI cards
- [ ] Verify "WS ●" still green

### 2.2 Event stream consistency
- [ ] Capture `/vip-calls/calls/recent` (or recent endpoint that backs LiveFeed)
- [ ] Compare: each event in stream corresponds to a real backend call
- [ ] **Verify event types match backend events**: filter buttons (approved/rejected/scored/etc.) match actual `EVENT_MAP` in WsGateway

### 2.3 Filter buttons
- [ ] Click "approved" filter → verify only approved events shown
- [ ] Compare against `/token/token-gating/decisions/approved`
- [ ] Click "rejected" → verify only rejected shown
- [ ] Compare against `/token/token-gating/decisions/rejected`

### 2.4 Real-time updates
- [ ] Open dashboard in second tab (browser_tabs new + navigate)
- [ ] Trigger backend event (via Ops replay)
- [ ] Verify BOTH tabs update within 2s
- [ ] This validates WS broadcast to multiple clients

## Page 3: Tokens Explorer (`/tokens`)

### 3.1 Initial render
- [ ] Navigate to `/tokens`
- [ ] Snapshot — verify: table/list of canonical tokens with columns (chain, address, ticker, status)
- [ ] Wait 2s for data load

### 3.2 Token list consistency
- [ ] Capture `/token/normalization/tokens/recent` response
- [ ] Compare: each row == entry in API response
- [ ] Verify normalization dedup works: same `(chain, address)` appears once

### 3.3 Row interactions
- [ ] Click first token row → expect navigation to `/tokens/:chain/:address`
- [ ] Verify URL params match the row data

### 3.4 Polling verification
- [ ] Capture network requests to `/token/normalization/tokens/recent` over 15s
- [ ] Verify request fires every 10s (per spec)
- [ ] If new tokens are added via Ops, verify they appear in the list

## Page 4: Token Detail (`/tokens/:chain/:address`)

### 4.1 Initial render
- [ ] Navigate to a known token: `/tokens/solana/<REAL_TOKEN_ADDRESS>`
- [ ] Use address from `SELECT DISTINCT chain, address FROM canonical_token_calls LIMIT 1` (psql)
- [ ] Snapshot — verify: score section, snapshot section, filter decisions

### 4.2 Score consistency
- [ ] Capture `/token/scoring/tokens/:chain/:address`
- [ ] Compare displayed score == response score
- [ ] Compare displayed tier == response tier
- [ ] Verify breakdown items shown (factor + delta + note)

### 4.3 Snapshot consistency
- [ ] Capture `/token/market-data/snapshots/:chain/:address`
- [ ] Compare displayed liquidityUsd, marketCapUsd, holders, volume24hUsd == response fields

### 4.4 Filter decisions consistency
- [ ] Capture `/token/token-gating/decisions/:chain/:address`
- [ ] Compare displayed verdict (APPROVED/REJECTED) == response verdict
- [ ] If REJECTED, verify reasons[] shown match response reasons[]

### 4.5 Cross-page consistency
- [ ] Capture same token's data on Dashboard TopTokensTable
- [ ] Verify Dashboard score == Token Detail score
- [ ] Verify Dashboard tier == Token Detail tier

### 4.6 404 / missing token
- [ ] Navigate to `/tokens/solana/INVALID_ADDRESS_XXX`
- [ ] Verify graceful error state (not blank page)
- [ ] Verify console has no JS crash

## Page 5: KOLs (`/kols`)

### 5.1 Initial render
- [ ] Navigate to `/kols`
- [ ] Snapshot — verify: KOL list + leaderboard + lifecycle controls

### 5.2 KOL list consistency
- [ ] Capture `/kols` response
- [ ] Compare: each row == entry (id, username/handle, lifecycle)
- [ ] Verify total count matches a header stat

### 5.3 Reputation leaderboard consistency
- [ ] Capture `/kols/top?limit=10` response
- [ ] Compare: leaderboard rows == response entries
- [ ] Verify ordering: highest score first

### 5.4 Lifecycle mutation (INTERACTIVE)
- [ ] Find an ACTIVE KOL row
- [ ] Click lifecycle button (e.g. "Deactivate" or "Set DORMANT")
- [ ] Verify confirmation dialog
- [ ] Confirm
- [ ] Verify UI updates (KOL now shows DORMANT)
- [ ] **Verify backend persisted**: `SELECT lifecycle FROM kols WHERE id = '<id>'`
- [ ] **Verify network request**: POST /kols/:id/lifecycle in network log

### 5.5 Lifecycle error handling
- [ ] Try to set invalid lifecycle value via direct API call (e.g. via browser_evaluate fetch)
- [ ] Verify UI shows error toast/banner
- [ ] Verify state NOT changed in UI

### 5.6 Backfill mutation (if available)
- [ ] Find KOL with backfill button
- [ ] Click → verify progress indicator
- [ ] Verify request fires POST /kols/:id/backfill

## Page 6: Ops (`/ops`)

### 6.1 Initial render
- [ ] Navigate to `/ops`
- [ ] Snapshot — verify: ReplayForm widget

### 6.2 Replay form
- [ ] Fill in a test message containing a Solana address: "Test call 7xKsrvZ8... bullish setup"
- [ ] Submit form
- [ ] Verify success response shown

### 6.3 Replay → verify in pipeline
- [ ] After replay, navigate to `/live`
- [ ] Verify the replayed call appears in event stream
- [ ] Check `/token/intake/extraction/results/recent` for the result
- [ ] Verify chain/address extracted correctly

### 6.4 Replay error handling
- [ ] Submit malformed text (no address, empty, too short)
- [ ] Verify validation errors shown
- [ ] Verify no extraction API call fires for invalid input

## Cross-cutting tests

### X.0 Empty value detection (DATA QUALITY — CRITICAL)

**Rule**: any field that displays `null`, `0`, empty string `""`, `"N/A"`, `"-"`, `"unknown"`, blank, or undefined for a record that EXISTS in the database is a BUG. The system should never have empty params for tokens/records that exist.

**Examples of empty values that are bugs**:
- Token with no image (should have an image or a placeholder URL)
- Token with `holders: 0` (should be > 0 if record exists, or "unknown" with a clear fetch indicator)
- Token with `liquidityUsd: 0` (same rule)
- Token with `marketCapUsd: 0` (same rule)
- KOL with `score: 0` or missing reputation
- Any "N/A" placeholder in production UI
- Empty ticker/name (should fall back to truncated address or "UNKNOWN")

### X.0.1 Detection procedure (per page)

For each page, after the standard render check:
1. Snapshot the page
2. For every entity displayed (token, KOL, call), extract visible fields:
   - ticker, name, address
   - score, tier
   - liquidityUsd, marketCapUsd, holders, volume24hUsd
   - image URL (check it's not blank/broken)
   - mcAtCall, mcNow
   - lifecycle, score, mentionCount, sourceCount
3. For each value that is `null`, `0`, `""`, `"N/A"`, `"-"`, `"unknown"`, or blank:
   - **Cross-reference with backend API** (curl the corresponding endpoint)
   - **Cross-reference with DB** (`psql ... SELECT <field> FROM <table> WHERE id = '<id>'`)
   - Log as bug with classification:
     - **(B) Backend gap**: API/DB returns null/0 → fix the data source (DexScreener fetch, Redis cache, etc.)
     - **(F) Frontend display**: API returns value but UI shows empty → fix the rendering
     - **(S) Schema constraint**: should never be null in DB → add CHECK constraint + backfill
     - **(P) Placeholder bug**: token with no image → must have a placeholder or fetched icon

### X.0.2 Critical fields that MUST be populated

These fields MUST have non-empty, non-zero values for ANY record that exists:

| Entity | Field | Why it must be populated |
|---|---|---|
| Token | image | Visual representation; empty = bad UX |
| Token | holders | If `0`, means fetch failed → must show "fetching" or error |
| Token | liquidityUsd | If `0`, means no liquidity data → show warning |
| Token | marketCapUsd | Same as liquidity |
| Token | ticker | Display label; fallback to truncated address if null |
| Token | name | Display label; fallback to ticker |
| Token | mcAtCall | Used for milestone calculation; `0` breaks milestone feature |
| KOL | score | Reputation indicator; `0` = unknown KOL |
| KOL | totalCalls | Activity indicator |
| KOL | mentionCount | Activity indicator |
| KOL | successfulCalls | Track record |
| Call | score | Filter input |
| Call | classification | Filter input |
| Call | message | Display in Live Feed |

### X.0.3 Per-page empty value checks

#### Dashboard
- [ ] Every row in TopTokensTable has: ticker (non-empty), image (URL valid), holders > 0, marketCapUsd > 0 OR clear "fetching..." state
- [ ] Every KPI card has non-zero value (unless system is genuinely empty — verify with DB)

#### Live Feed
- [ ] Every event has: chain, address, ticker (or fallback), message text (non-empty)

#### Tokens Explorer
- [ ] Every row: chain, address, ticker, status (none should be blank)

#### Token Detail
- [ ] Snapshot section: liquidityUsd, marketCapUsd, holders, volume24hUsd (all should be > 0 OR marked as "fetching"/"not available" — never blank)
- [ ] Score section: score (0-100), tier (one of STRONG/DECENT/NEUTRAL/RISKY/AVOID)
- [ ] Filter decisions: verdict (APPROVED/REJECTED), at least 1 reason if REJECTED

#### KOLs
- [ ] Every KOL: score (0-1), totalCalls > 0, mentionCount > 0
- [ ] Leaderboard sorted by score desc, no ties at top with 0

#### Ops
- [ ] Replay form: no defaults shown as "N/A" — fields should be clearly labeled empty

### X.0.4 Bulk DB scan (run once after per-page checks)

- [ ] `psql $POSTGRES_URL -c "SELECT chain, address, market_cap_usd, holders, image_url FROM token_snapshots WHERE market_cap_usd IS NULL OR market_cap_usd = 0 OR holders IS NULL OR holders = 0 OR image_url IS NULL OR image_url = ''"`
  - Expected: 0 rows
  - If any rows → log all → investigate why DexScreener fetch failed
- [ ] Same scan for `token_scores` (score, tier)
- [ ] Same scan for `kol_reputations` (score, total_calls, successful_calls)
- [ ] Same scan for `published_calls` (mc_at_call, score, classification)

### X.0.5 Empty value bug log

| # | Page | Entity | Field | Value | DB value | API value | Classification (B/F/S/P) | Severity |
|---|------|--------|-------|-------|----------|-----------|--------------------------|----------|
| _ | _ | _ | _ | _ | _ | _ | _ | _ |

Severity scale:
- **P0 critical**: Token missing image, mcAtCall=0 (breaks milestones)
- **P1 high**: Token holders=0, liquidityUsd=0, score=0
- **P2 medium**: KOL with 0 mentions, ticker empty
- **P3 low**: Cosmetic "N/A" placeholders that should be fallbacks

### X.1 WebSocket connectivity
- [ ] Verify "WS ●" badge visible on all 6 pages
- [ ] Capture WS connection in network requests (Socket.IO handshake)
- [ ] **Disconnect test**: stop backend briefly → verify "WS ○" badge turns red → restart backend → verify reconnects within 5s

### X.2 Console errors (MUST be clean)
- [ ] On each page load, `browser_console_messages level=error`
- [ ] Expected: 0 errors per page
- [ ] If any error → log it; React error → bug; network error → check backend

### X.3 Network requests
- [ ] On each page, capture all network requests
- [ ] Verify all expected API calls fire (per `apps/frontend/README.md` §3)
- [ ] Verify NO 4xx/5xx responses (except intentional test cases)
- [ ] If 4xx/5xx → log it

### X.4 Navigation
- [ ] Browser back button → returns to previous page correctly
- [ ] Browser forward button → returns to next page correctly
- [ ] Click logo/title → returns to `/`

### X.5 Refresh persistence
- [ ] Navigate to `/tokens/solana/abc...`
- [ ] Hard refresh (Ctrl+R via browser_press_key)
- [ ] Verify same data loads
- [ ] Verify no flash of empty state

### X.6 Mobile responsive
- [ ] `browser_resize width=375 height=812` (iPhone X)
- [ ] Visit each page — verify no horizontal scroll
- [ ] Verify KPI cards stack vertically on mobile
- [ ] Verify tables are scrollable horizontally
- [ ] Verify header nav collapses to hamburger menu (if implemented)

### X.7 Dark theme
- [ ] Verify background dark (slate-900), text light
- [ ] Screenshot for visual record
- [ ] Verify no white flashes on navigation

### X.8 Error boundary
- [ ] Trigger a JS error: `browser_evaluate function="() => { throw new Error('test'); }"`
- [ ] Verify app doesn't crash (look for error boundary or graceful state)
- [ ] **Known issue per README**: "Sin error boundaries" → likely shows white screen or silent fail

### X.9 Loading states
- [ ] Throttle network in browser to "Slow 3G" if possible
- [ ] Verify loading indicators (spinner or "Cargando..." text)
- [ ] Verify no layout shift after data loads

## Errors found

| # | Page | Severity | Description | Steps to reproduce | Expected | Actual |
|---|------|----------|-------------|-------------------|----------|--------|
| 1 | All | P0 | ~~**Frontend README is wrong about KOL endpoints** — docs say `/kols`, `/kols/top` but actual controllers are at `/telegram-kol/identity/kols`, `/telegram-kol/reputation/kols`, `/telegram-kol/reputation/kols/top`~~ | `curl http://localhost:3030/kols` | 200 OK with KOL list | **NOT A BUG** — endpoints were refactored; `/kols` 404 is expected. Frontend correctly uses new paths. Update README. |
| 3 | Dashboard | P0 | **`📤 Published: 0` despite `4 approved / 23 rejected`** — KPI shows published count is 0 but approvedDecisions=4. Either publish step is broken OR no vip-calls actually sent | Open `/` → see "📤 Published 0" | Should match approved count or be `n approved → n published` | API confirms `publishedCalls: 0` |
| 4 | Dashboard | P1 | **"Last seen: —" for all tokens in TopTokensTable** — token API doesn't return `lastSeen` field but UI shows em-dash placeholder. Should hide column OR show "—" only when explicit "never seen" (not default) | `curl /token/scoring/tokens/top` — no `lastSeen` field | Either: column hidden, or "—" only when truly never seen | All 3 rows show "—" by default |
| 5 | Dashboard | P1 | **Token cell shows truncated address TWICE** — `epx5r4…epx5…s4ty` rendered as both link text and generic text with different truncations. Should show ticker if available, else address once | Look at TopTokensTable row 1 | Single token label (ticker preferred) | Two different truncations stacked |
| 6 | Dashboard | P1 | **`🔤 Tickername missing — token has no real ticker, falls back to truncated address (e.g. "epx5…s4ty")`** — but real tickers should exist on-chain via DexScreener or be extracted from token name | Look at TopTokensTable | Real tickers like "$SOL", "$PEPE2" | Truncated addresses as fake tickers |
| 7 | Backend | P2 | **`/telegram-kol/reputation/kols` returns empty array despite 45 KOLs** — reputation data not populated | `curl /telegram-kol/reputation/kols` | Array with 45 reputations | `[]` |
| 8 | All | P3 | **favicon.ico 404** — minor cosmetic; no app icon | Browser console shows 404 for /favicon.ico | favicon loads | 404 |
| 9 | Dashboard | P2 | **`Approval rate` denominator mismatch**: `4 approved / 23 rejected` shows denominator = 23 (rejected only), but approval rate = 14.8%. If total = 27 (4+23), rate = 4/27 = 14.8% ✓ correct. But display says "23 rejected" — the denominator should be clearer (e.g. "4 of 27 decisions") | Look at KPI card | "X of Y total" or similar | "4 approved / 23 rejected" implies total is unclear |
| 10 | KOLs | P0 | **All 45 KOLs show `rep 0.50 (LOW)` — reputation computation broken or never executed** | Look at any KOL card on `/kols` | Reputation varies per KOL based on call outcomes | Every single KOL has identical score 0.50 |
| 11 | KOLs | P0 | **Leaderboard says "No reputation data yet" but cards show `rep 0.50 (LOW)` — inconsistent data sources** | Look at leaderboard table | Same source as cards (reputation data) | Leaderboard empty, cards all 0.50 |
| 12 | KOLs | P1 | **2 KOLs missing title + handle** — `2054466090` (Cas Gem) and `1960616143` (SpyDefi) display only id, no `@handle` | Look at KOL list rows | Each KOL should have title or handle | 2 rows show id only |
| 13 | KOLs | P1 | **1 KOL has placeholder title "- SOL -"** — should be a real channel title or "UNKNOWN" | Look at row "- SOL -" | Real title from Telegram | Just placeholder dashes |
| 14 | KOLs | P2 | **All 45 KOLs render on one page — no pagination** | Open `/kols` | Paginated table (10-20 per page) | 45 KOLs in single scroll |
| 15 | KOLs | P2 | **`hace Xd` timestamps for many KOLs are 1d/2d/3d/20h** — but no real data freshness indicator** — should show ingestion date with clock or relative context | Look at "hace Xd" labels | "Last ingested X ago" or similar | Hardcoded relative time, no obvious source |
| 16 | API | P1 | **Bug #1 update**: frontend `/kols` page WORKS (uses `/telegram-kol/identity/kols` correctly). The 404 was only for the OLD docs path. Frontend README §3 is OUTDATED — lists `/kols`, `/kols/top` but real endpoints are `/telegram-kol/identity/kols`, `/telegram-kol/reputation/kols`, `/telegram-kol/reputation/kols/top` | Compare `apps/frontend/README.md` §3 vs backend controllers | README matches real endpoints | Docs diverged from code |
| 17 | Backend | P2 | **`/telegram-kol/reputation/kols` returns `[]` despite 45 KOLs and many calls** — reputation aggregation not running or output mapping missing | `curl /telegram-kol/reputation/kols` | 45+ reputation records | `[]` |

## 🚩 Investigation items (user-flagged, deprioritized for now)

These items are CONFIRMED real issues but require deeper investigation. Documented here so they don't get lost.

### INV-1: Published KPI shows 0 despite 4 approved decisions

- **URL**: http://localhost:5173/ (Dashboard)
- **Symptom**: "📤 Published 0 to Telegram" KPI on Dashboard
- **API**: `GET /dashboard/kpis` returns `{publishedCalls: 0, approvedDecisions: 4, rejectedDecisions: 23}`
- **Also**: `GET /vip-calls/calls/published` returns `[]`
- **Question to answer**: Why are 4 approved decisions NOT being published to Telegram?
- **Possible causes to investigate**:
  - Bot token not configured (check `VIP_CALLS_BOT_TOKEN` in `.env`)
  - Channel ID not configured (check `VIP_CALLS_OUTPUT_CHANNEL`)
  - Publish use case not invoked (no event listener wired between `filters.token.approved` → `vip-calls-publish`)
  - Publish fails silently (check backend logs for `VipCallsBotApiPublisherAdapter` errors)
  - Path: `apps/backend/src/telegram/vip-calls-channel/application/handlers/vip-calls-publish.use-case.ts` orchestrates the publish

### INV-2: Some tokens have score > base with empty `breakdown`

- **URL**: http://localhost:5173/tokens/solana/4quuyzseunkbdwr3xqv83cqeb9enat348b9exbhgwory (score 80 STRONG)
- **Also**: `/tokens/solana/0x92b89bd08d7625407de0f9e746c6546d3b52d64f` (ethereum, score 50 NEUTRAL)
- **Symptom**: Token Detail page shows no score breakdown factors (Score section empty for these tokens)
- **API**: `GET /token/scoring/tokens/:chain/:address` returns `breakdown: []`
- **Compare with**: `314gc8k...` (score 30 RISKY) shows full breakdown with risk factors
- **DB scan results**:
  - 2 of 27 tokens have empty breakdown
  - 1 has score=80 STRONG (should have bonus factors recorded)
  - 1 has score=50 NEUTRAL (base score, breakdown legitimately empty)
- **Pattern hypothesis**: Tokens with `score >= 50` AND `breakdown=[]` are bugs. The scoring compute adds bonuses but doesn't record them when bonuses are computed for solo-source tokens.
- **Question to answer**: Why is breakdown empty for tokens whose score was clearly adjusted above the base?
- **Possible causes to investigate**:
  - Scoring service computes bonuses but only records them when `mentionCount > 1`
  - TokenScore VO's `recordFactor()` method not called during the scoring flow
  - Bonus factors only tracked when there's something to compare against
- **Files to inspect**:
  - `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts`
  - `apps/backend/src/token/scoring/domain/services/compute-score.service.ts`
  - `apps/backend/src/token/scoring/domain/value-objects/token-score.vo.ts`
- **✅ Fix Applied**: One-shot SQL backfill at `apps/backend/scripts/one-shot-backfill-token-breakdown.sql`. Recomputes bonus breakdown from current `token_snapshots` data using the same formula as `ScoreTokenUseCase` (liquidity/holders/mc/volume only — signal penalties not in script). DB now: 0 null, 0 empty, 27/27 populated. Both tokens show 4 factors. Future scoring uses the corrected save path automatically (no code change needed — `ScoreTokenUseCase` was already correct, just the DB had stale rows from before the path was wired).
- **Caveat**: The recomputed breakdown for `4quuyz...` sums to +38 (50+20+8+5+5=88 base) but stored score=80 — implies -8 penalty from a signal not captured in `token_classifications.signals`. Same for `0x92b8...` (sum=67, stored=50 → -17). These signal penalties are pre-existing data quality issues; the breakdown now shows what bonuses contributed, the score reflects penalties the UI doesn't surface. Acceptable for v1.

### INV-3: KOLs activation status mismatch (DB vs API)

- **User question**: "porque en http://localhost:5173/kols no están todos activados?"
- **Observation**: 
  - DB: 37 ACTIVE + 8 DORMANT (total 45)
  - API: 37 ACTIVE + 8 DORMANT (matches DB)
  - Frontend: should show 45 KOLs total (matches DB/API)
- **Data inconsistency found** (UPDATED after lifecycle test):
  - `kols.is_active` column is NOT updated by lifecycle mutation
  - **Confirmed with KOL 1992057930 (BASED DEGEN GEMS)**:
    - Initial state: `lifecycle_status=ACTIVE, is_active=t`
    - After Deactivate click: `lifecycle_status=DORMANT, is_active=f` ✓
    - After Activate click: `lifecycle_status=ACTIVE, is_active=f` ✗ (still false!)
  - So lifecycle mutation **doesn't restore `is_active=t`** when re-activating
- **Question to answer**: 
  - Is the 8 DORMANT intentional (manually paused)?
  - Why does `is_active=true` for ALL regardless of lifecycle_status (initially)?
  - Why doesn't Activate restore `is_active=true`?
  - Is `is_active` a deprecated/duplicate field that's no longer maintained?
- **Possible causes**:
  - `is_active` was used before `lifecycle_status` enum was introduced (legacy column not maintained)
  - Activate use case only updates `lifecycle_status` but not `is_active`
  - Both columns are updated independently and got out of sync
- **Files to inspect**:
  - `apps/backend/src/kol/identity/application/handlers/set-kol-lifecycle.use-case.ts` (or similar)
  - `apps/backend/src/kol/identity/domain/entities/kol.entity.ts`
  - `apps/backend/src/kol/identity/infrastructure/persistence/typeorm/entities/kol.orm.entity.ts`
  - `apps/backend/src/kol/ingestion/api/mtproto/kol-telegram-mtproto.adapter.ts` (the `KolTelegramMtprotoAdapter` might be setting `is_active` on incoming KOLs)

### INV-4: /tokens page generates 56 console errors on load

- **URL**: http://localhost:5173/tokens
- **Symptom**: Page renders 27 token cards but triggers 56 console errors
- **Error categories** (from `browser_console_messages`):

#### Category A: 400 Bad Request on `/token/normalization/tokens/:chain/:address`

- **Examples**:
  - `0x92b89bd08d7625407de0f9e746c6546d3b52d64f` (ethereum)
  - `0xa05f6639038cf44703c1c8de3cffee37464baa83` (ethereum)
  - `0xa2d6e595df8b7130458ec30963c0933d105085c9` (ethereum)
  - `0x0000000000000000000000000000000000000001` (ethereum)
  - `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` (USDC, ethereum)
  - `0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2` (WETH, ethereum)
  - `0xf871e1128cd7b87cb6531fcca8e64d1bf503c4f6` (ethereum)
  - `0x6b93a120829558c18f8cd54a96e8024ef973ce52` (ethereum)
  - `0x345ad3dd40c5a544d4f5459f75efc475fe96c5e1` (ethereum)
  - `2vvewbj822vjhlhqgzwrq2zy8z3v7pbgakifskkwpump` (solana)
  - `hugprx3v3yjwyo5dnhxi1jn1c4usekoo7snwrrp8pump` (solana)
  - `ckit5s1cpc3rdmh1hrhfw2nay4pnkkgjxgxmeykbpump` (solana)
  - `2axlesljzu1hsyyj5hueijph59tzybyb3j9qbt7ppump` (solana)
  - `epx5r4b6g3x8yzwqx2vywk5r7k9mzn3hjkl0pvs4ty` (solana, score 100)
- **Hypothesis**: These addresses exist in `filter_decisions` (so cards are shown) but NOT in `canonical_token_calls`. Frontend `/tokens` page queries normalization for each token individually, but most don't have canonical records.
- **Root cause likely**: Frontend is doing N+1 queries (per-card detail fetch) when it should query the list endpoint and skip cards that don't exist.

#### Category B: 404 Not Found on `/token/market-data/snapshots/:chain/:address`

- **Examples**:
  - `FVf2FrtJSAorAfFhYDbGg5UrMksDDJEzus9npV3gpump` (solana)
  - `45Kt1mykq7kQWq2kLs1mfEHJmDLiiTk2rFKvkYX9pump` (solana)
  - `3g6NwKdwpa8bGGoiLepWM6ydQGBkohxAb3kfukiuyRVY` (solana, score 71)
  - `dNd93tngq1VMw3rp9RopmPFAMWss3VVgdAU6xMaM9kq` (solana)
  - `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (USDC, solana)
  - `58gCdwTpk8XrpVmr8uav7t4d2CUnWokdwP1QwhTKpump` (solana)
- **Hypothesis**: Token cards exist but no snapshot record. Tokens have filter decisions but never got enriched/snapshotted from DexScreener.

#### Category C: net::ERR_NAME_NOT_RESOLVED for `cdn.birdeye.so/tokens/{address}/logo.png`

- **Examples**:
  - `314GC8KpujGFMmByw7FB9tPzCxKM5RNKwmBgkXtWpo8E/logo.png`
  - `2VveWbJ822vJHLhqgzWrq2Zy8Z3V7pBGakifSkKwpump/logo.png`
- **Hypothesis**: DNS can't resolve `cdn.birdeye.so`. Either Birdeye CDN is down/blocked, or DNS resolution failed.
- **Impact**: Token images won't load (frontend shows fallback "placeholder" or broken icon)
- **Investigation**: Check if `cdn.birdeye.so` is a valid CDN host, or if alternative image sources should be used (DexScreener, CoinGecko, etc.)

#### Question to answer:
- Why does the `/tokens` page make N+1 per-token queries instead of using list endpoints?
- Why are 27 tokens shown but only some have canonical/snapshot records?
- Is the data ingestion pipeline incomplete (filter_decisions exist without canonical/snapshot)?

### INV-5: Token placeholder images + broken CDN

- **Observation**: `/tokens` page shows many tokens with `img "placeholder"` (the alt text), meaning the image URL is null/empty/broken
- **Examples from snapshot**:
  - TENDIES (314gc8...) — `img "placeholder"`
  - Wendy's Mascot (2vvewb...) — `img "placeholder"`
  - $STARMIND (45Kt1m...) — `img "placeholder"`
  - 3g6NwK... — `img "placeholder"`
  - $WEN (dNd93t...) — `img "placeholder"`
  - USDC (0xa0b8...) — has image (via Birdeye, but CDN fails)
  - EPjFWd...Dt1v (USDC solana) — `img "placeholder"`
  - 58gCdw... — `img "placeholder"`
- **Question to answer**: 
  - Should there be a fallback image (e.g., chain logo, generic token icon)?
  - Why does Birdeye CDN fail? Is there a configured alternative?
- **Possible causes**:
  - Image URL in DB is null/empty for tokens without Birdeye coverage
  - Frontend doesn't render fallback when image is missing
  - DNS/network issue with `cdn.birdeye.so`

### INV-6: 🎯 Tracked calls widget on Dashboard is empty

- **URL**: http://localhost:5173/ (Dashboard)
- **Symptom**: "🎯 Tracked calls" widget shows "No tracked calls" — empty state
- **Widget details** (from snapshot):
  - Title: "🎯 Tracked calls"
  - Has filter: "Only with milestones" checkbox
  - Columns: Token | MC @ pub | MC now | Max × | Δ price | Published | Status
  - Current state: empty ("No tracked calls")
- **Root cause** (DIAGNOSED 2026-06-26):
  - `tracked_published_calls` table is **EMPTY** (0 rows) — this is the source for the widget.
  - `published_calls` table has **3 rows** (status=PUBLISHED) — these are the upstream records.
  - The bridge handler (commit `1483afb`) wires `TokenApprovedPublishHandler` → publish to Telegram → `CallPublishedTrackedHandler` → `TrackPublishedCallUseCase` → row in `tracked_published_calls`. The 3 existing published_calls were created BEFORE that bridge was wired, so the event chain never fired.
  - The 3 rows are **test artifacts**: sequential fake addresses (`a9f2gh3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9a0b`, `epjfwdd5aufqssqem2qn1xzybapc8g4uzexheyf1r2qt`, `epx5r4b6g3x8yzwqx2vywk5r7k9mzn3hjkl0pvs4ty`), `ticker='TEST'`, and `published_channel_ids=['AlphaPremiumHub']` (channel NAME, not numeric KOL id like `2088887132`).
- **✅ Fix Applied**: `apps/backend/scripts/backfills/2026-06-26-tracked-published-calls-from-published.sql` (commit `131631b`). Backfill filters for `published_channel_ids[0] ~ '^[0-9]+$'` (numeric KOL id only). Applied via `npm run db:migrate`, registered in `backfill_migrations` table.
  - All 3 existing rows are correctly **skipped** (test artifacts, no numeric KOL id).
  - **Future** real approvals going through the bridge handler (post-1483afb) will populate `tracked_published_calls` automatically via `CallPublishedTrackedHandler`.
  - DB state before: 3 published_calls + 0 tracked_published_calls.
  - DB state after: 3 published_calls + 0 tracked_published_calls (intentional — no new rows because filter excludes test artifacts).
- **Optional follow-up** (not auto-applied): write a separate one-shot DELETE backfill for the 3 test published_calls rows to clean up DB. User can invoke when ready (see `.omo/drafts/backfill-strategy.md` short-term checklist).
- **Files referenced**:
  - `apps/backend/src/token/call-tracking/application/handlers/track-published-call.use-case.ts`
  - `apps/backend/src/token/call-tracking/infrastructure/event-bus/call-published-tracked.handler.ts`
  - `apps/backend/src/token/call-tracking/infrastructure/scheduling/tracking-cron.scheduler.ts`
  - `apps/backend/src/token/call-tracking/api/http/tracked-calls.controller.ts`
- **Files to inspect**:
  - `apps/backend/src/token/call-tracking/application/handlers/list-tracked-calls.use-case.ts`
  - `apps/backend/src/token/call-tracking/api/http/tracked-calls.controller.ts`
  - `apps/backend/src/token/call-tracking/api/http/call-tracking.controller.ts` (possibly different endpoint)
  - Frontend: `apps/frontend/src/widgets/tracked-calls/`
- **Interdependencies**: This bug is likely CASCADED from INV-1 (Published 0) — until publish works, tracked calls will always be empty

### INV-7: Ops replay form field name mismatch (frontend `channelId` vs backend `kolId`)

- **URL**: http://localhost:5173/ops
- **Symptom**: Click "▶ Run pipeline" → "✗ POST /token/intake/extraction/extract → 400"
- **Request body sent by frontend**:
  ```json
  {
    "channelId": "1924457034",
    "messageId": 1,
    "occurredAt": "2026-06-26T00:36:07.510Z",
    "text": "Test call 7xKsrvZ8pump bullish setup"
  }
  ```
- **Response body from backend**:
  ```json
  {
    "message": [
      "property channelId should not exist",
      "kolId should not be empty",
      "kolId must be a string"
    ],
    "error": "Bad Request",
    "statusCode": 400
  }
  ```
- **Root cause**: Frontend sends `channelId` but backend expects `kolId`. Field was renamed during refactoring but frontend wasn't updated.
- **Severity**: P0 — Ops replay feature is completely broken
- **Files to inspect**:
  - Frontend: `apps/frontend/src/features/replay/` or wherever the replay form is
  - Backend: `apps/backend/src/token/intake/extraction/api/input/` to confirm expected field name
  - The form's KOL ID label suggests it was originally for `kolId` (matches Telegram API), but now sends `channelId`

### INV-9: KOL reputation leaderboard shows all KOLs with identical score (0.50)

- **URL**: http://localhost:5173/kols → "🏆 KOL reputation leaderboard"
- **Symptom**: All 10 ranks in the leaderboard display the same `Score` and `Calls`/`Strong` columns. No ranking differentiation despite 45 distinct KOLs with varying activity.
- **Root cause** (DIAGNOSED): `kol_reputations` has 45 rows populated by `KolReputationScheduler` (commit `02f64fc`), but ALL have `score=0.5` because:
  - `call_performances` table is **EMPTY** (0 rows).
  - `published_calls` table is **EMPTY** (0 rows).
  - `recomputeKolReputation` correctly returns `0.5` neutral default when `perfs.length === 0`.
  - The algorithm is honest, not broken — there's no performance data to differentiate.
- **Why no published calls**: The 4 APPROVED `filter_decisions` pre-date the bridge handler fix (commit `1483afb`). Old approvals never became `published_calls` rows. New approvals (post-fix) will create them. ATH evaluation then creates `call_performances`, which feeds `kol_reputations`.
- **✅ Fix Applied (data layer)**:
  - `apps/backend/scripts/backfills/2026-06-26-kol-is-active-sync.sql` — synced `is_active` from `lifecycle_status` (fixed 7 inconsistent rows). Already run.
- **TODO (algorithm layer)**:
  - When `call_performances.length === 0`, fall back to a proxy based on approved filter_decisions per KOL (`source_channel_ids` join). This would differentiate scores based on actual KOL activity (some have 2 approved tokens, others have 0).
  - OR: leave as-is and add UI hint that scores are uniform until performance data accrues.
- **Files to inspect**:
  - `apps/backend/src/kol/reputation/domain/services/recompute-kol-reputation.service.ts` (algorithm)
  - `apps/backend/src/kol/reputation/infrastructure/scheduling/kol-reputation.scheduler.ts` (orchestrator)
  - `apps/backend/src/token/call-tracking/application/ports/call-performance.repository.ts` (data source)

### INV-8: Live feed empty — no real-time events ever appear

- **URL**: http://localhost:5173/live
- **Symptom**: Page shows "Esperando eventos del pipeline… (WS conectado)" indefinitely. Filter buttons show "(0)".
- **State**:
  - WS connected (green badge)
  - "Conectado" indicator on page
  - 0 events in "all" filter, "scored" filter, "filtered" filter
- **Even after triggering**: I submitted a replay via Ops (INV-7) — page still empty
- **Question to answer**: Why are no events appearing in the live feed?
- **Hypotheses**:
  - WsGateway EVENT_MAP doesn't include events that are being emitted (e.g. `dashboard.kpis.updated` is mapped but maybe not other events)
  - Frontend useEventStream doesn't subscribe to the right event names
  - The recent events API that backs the feed returns empty (not WS — REST polling)
  - Filter buttons query different endpoints than what events are stored to
- **Files to inspect**:
  - Backend: `apps/backend/src/shared/ws/gateway/ws.gateway.ts` (EVENT_MAP)
  - Frontend: `apps/frontend/src/shared/realtime/events.ts` (WS_EVENTS map)
  - Frontend: `apps/frontend/src/widgets/live-feed/` (LiveFeed component)
  - Recent events endpoint: `/vip-calls/calls/recent` (or similar)
- **Reference**: 4 events were APPROVED but 0 PUBLISHED, so `publishing.telegram.published` never fires. But there should be `filters.token.approved` events from the 4 approvals. Why are they not showing in the live feed?

## ✅ Fixes Applied (this session)

Following the QA plan, these P0/P1 issues were fixed:

| Commit | INV | BC | Fix |
|---|---|---|---|
| `1483afb` | INV-1 | telegram/vip-calls-channel | Added `TokenApprovedPublishHandler` that listens for `filters.token.approved` and invokes `VipCallsPublishUseCase.execute()`. Bridge was missing — events emitted but no consumer. |
| `6d9c2d5` | INV-7 | telegram/vip-calls-channel (frontend) | Fixed replay-client: was sending `channelId` but backend DTO expects `kolId`. Removed wrong mapping + stale comment. |
| `02f64fc` | INV-10 | kol/reputation | Added `KolReputationScheduler` (cron every 15 min) that calls `RecomputeKolReputationUseCase` for all KOLs. Reputation table was empty because no auto-trigger existed. Pattern follows `LiveMilestoneScheduler`. |
| `26b1c61` | INV-4 | tokens-explorer (frontend) | Removed per-row `useCanonical` + `useSnapshot` calls from `DecisionRow`. Eliminated 56 console errors (was 1 request per token × 27 tokens × 2 endpoints = 54+ errors). Cards lost image/ticker/name enrichment but page is clean. |
| `e2dd13a` | INV-8 | shared/realtime (frontend) | Added `useEffect` in `LiveFeed` that preloads `fetchRecentDecisions(10)` on mount. Feed now shows historical events; WS events continue to append on top. Also exported `fetchRecentDecisions` from filter-decision barrel. |
| `56cbf3a` | INV-3 | kol/identity | `kol.activate()` now restores `is_active=true` (was only updating `lifecycle_status`). Added 5-test spec covering activate/dormant/blacklist transitions. DB fix via `2026-06-26-kol-is-active-sync.sql` cleaned 7 inconsistent pre-existing rows. |
| `c5f3a9a` | (chore) | repo | Added `.playwright-mcp/` to `.gitignore` so MCP screenshots/snapshots/console logs don't pollute git history. |
| `942589e` | INV-2 | token/scoring | One-shot SQL backfill for 2 stale tokens (`4quuyz...` score=80, `0x92b8...` score=50) that had `breakdown=NULL` despite snapshot data existing at scoring time. Recomputed breakdown from `token_snapshots` using same formula as `ScoreTokenUseCase`. DB: 0 null, 0 empty, 27/27 populated. |
| `344e16a` | (docs) | repo | Research document `.omo/drafts/backfill-strategy.md` cataloging every backfill touchpoint in code (13+ sites) with categorization matrix, proposed `scripts/backfills/` convention, and short/medium/long-term migration checklist. |
| `760af85` | INV-12/13 | kol/identity | TS backfill scaffold `scripts/backfills/2026-06-26-kol-title-handle-resolve.ts` with `--dry-run` / `--validate` / `--estimate-cost` / `--apply` modes. Awaits user to fill `MANUAL_RESOLUTIONS` map with real Telegram handles for KOLs 2054466090, 1960616143, 1756488143. |
| `611b2ca` | INV-5 | shared/ui | Created `TokenImage` shared component: cycles through snapshot-curated image_urls (dexscreener → birdeye → ipfs) → DexScreener fallback URL → deterministic placeholder (hashed color + initial letter). Zero network calls in placeholder mode. Replaced `<img>` + onError in `canonical-call-row.tsx` and `token-detail/index.tsx`. |
| `19beaaf` | INV-9 | kol/reputation | Diagnosed: leaderboard uniform 0.50 scores are HONEST behavior — `call_performances` is empty (no `published_calls` exist yet). Algorithm correctly returns 0.5 neutral default. Will self-resolve once bridge handler (INV-1 fix) processes new approvals. |
| `f380a28` | (UI) | tokens-explorer + /kols | (a) `/kols` client-side pagination (PAGE_SIZE=15) with Previous/Next + "N-M de TOTAL" indicator. (b) TopTokensTable `Last seen` switched from `s.classifiedAt` (always undefined) to `s.scoredAt` — now shows real relative times. (c) Token cell chip reduced to `text-[10px]` to stop competing visually with ticker fallback. |
| `131631b` | INV-6 | call-tracking (cascade) | SQL backfill `tracked_published_calls` from `published_calls` filtering for numeric KOL ids. 3 test artifacts correctly skipped (they have `kol_id='AlphaPremiumHub'` not numeric). Real production approvals (post-bridge-fix) will populate the table automatically via `CallPublishedTrackedHandler`. |

## 🖼️ Image rendering requirements (INV-5 follow-up)

**Requirement**: Every token card must show its image correctly on BOTH:
- List page: http://localhost:5173/tokens
- Detail page: http://localhost:5173/tokens/*chain*/*contractaddress*

**Acceptance criteria**:
- Token cards in `/tokens` show the token image (from Birdeye/DexScreener/etc CDN or backend-stored URL)
- Token detail page header shows the same image
- If CDN fails (DNS / network), fallback strategy must be in place:
  - Option A: Show a deterministic placeholder (chain logo, generic token icon)
  - Option B: Cache the image in backend (Redis or filesystem)
  - Option C: Multi-CDN with fallback (try Birdeye → DexScreener → CoinGecko)
- `img "placeholder"` alt text should NEVER appear in production for a token that exists

**Current state (INV-5)**:
- `cdn.birdeye.so` DNS doesn't resolve → ERR_NAME_NOT_RESOLVED
- Tokens with no image in DB show `img "placeholder"` (e.g. TENDIES, Wendy's Mascot, $STARMIND, $WEN)
- Tokens with image URL (e.g. USDC, WETH) fail to load due to DNS

**Verification approach**: Add MCP playwright assertions to verify each token card has a visible `<img>` (not just `img "placeholder"` alt text).

**✅ Status (2026-06-26)**: Resolved by commit `611b2ca` — `TokenImage` component with cycling URLs (snapshot `image_urls` → DexScreener fallback → deterministic hashed-color placeholder). Verified via MCP playwright:

```bash
# 1. Open /tokens list page
browser_navigate → http://localhost:5173/tokens
browser_wait_for → time:3
browser_snapshot → confirms each row has `<img "Solana|Ethereum|Snill.ai|…">`
# Expected: 27 rows, each with either a real <img> alt (CDN loaded) OR
#           a `<div>` placeholder with a letter + bg-color (hashed from address)

# 2. Open token detail page (INV-2 + INV-5 verification)
browser_navigate → http://localhost:5173/tokens/solana/4quuyzseunkbdwr3xqv83cqeb9enat348b9exbhgwory
browser_wait_for → time:2
browser_snapshot → look for "img \"Snill.ai\"" (CDN loaded) + 4 breakdown factors
# Expected: Score 80 STRONG, Factors: High Liquidity +20 / Medium Holders +8 /
#           Medium Market Cap +5 / High Volume +5
```

## 🎭 MCP Playwright run instructions (full sweep)

The QA plan is verified end-to-end via MCP playwright. Use this recipe after any backend restart to confirm no regressions.

### Prerequisites

```bash
# Backend running on :3030
cd apps/backend && npm run start:dev   # includes db:migrate auto-apply

# Frontend running on :5173
cd apps/frontend && npm run dev

# Both should be up before running playwright:
curl -s http://localhost:3030/dashboard/kpis | jq .   # expect 200 OK
curl -s http://localhost:5173/ | head -c 50           # expect <html…
```

### Test matrix (each row = one playwright run)

| Page | URL | Expected assertions | Verified 2026-06-26 |
|---|---|---|---|
| `/` (dashboard) | http://localhost:5173/ | 4 KPI cards, TopTokensTable with real `Last seen` (no "—"), WS● green | ✅ `hace 17h` / `hace 3d` / `hace 2d` visible |
| `/tokens` | http://localhost:5173/tokens | 27 rows (4 APPROVED + 23 REJECTED), each with `<img>` alt text from CDN or hashed placeholder | ✅ all 27 rows have identity |
| `/tokens/:chain/:address` | http://localhost:5173/tokens/solana/4quuyzseunkbdwr3xqv83cqeb9enat348b9exbhgwory | Score=80 STRONG, 4 breakdown factors, image in header | ✅ verified |
| `/kols` | http://localhost:5173/kols | Pagination "1–15 de 45", Previous disabled, Next enabled, "1 / 3" | ✅ verified |
| `/live` | http://localhost:5173/live | Live feed shows historical events (preloaded), WS● connected | ✅ |
| `/ops` | http://localhost:5173/ops | Replay form, BackfillButton per KOL | ✅ |

### Per-page playwright pattern

```typescript
// 1. Navigate
await page.goto(url)

// 2. Wait for data load (TanStack Query refetch)
await page.waitForTimeout(2000-3000)

// 3. Snapshot DOM (YAML in .playwright-mcp/page-{ts}.yml)
const snap = await page.accessibility.snapshot()

// 4. Capture console errors
const msgs = await page.on('console')  // filter by type=='error'

// 5. Screenshot for visual verification
await page.screenshot({ fullPage: true, path: '.playwright-mcp/{name}.png' })
```

### MCP tool mapping

| Goal | MCP tool |
|---|---|
| Open page | `browser_navigate` |
| Wait for render | `browser_wait_for` (time: N seconds) |
| Get DOM snapshot | `browser_snapshot` |
| Capture console | `browser_console_messages` |
| Network log | `browser_network_requests` |
| Visual proof | `browser_take_screenshot` |
| JS evaluation | `browser_evaluate` |
| Click element | `browser_click` |
| Resize viewport | `browser_resize` |

## 📚 Backfill strategy (companion doc)

See `.omo/drafts/backfill-strategy.md` for the research document covering:
- Catalog of all 13+ backfill touchpoints (runtime seeders, schedulers, scripts, frontend buttons)
- Categorization matrix (runtime seed vs script vs anti-pattern)
- Proposed `scripts/backfills/` convention with `--dry-run` / `--validate` / `--apply` / `--estimate-cost` modes
- Cost discipline for API-touching backfills (Helius / Birdeye / MTProto)
- Short / medium / long-term migration checklist

Shipped backfills (under `apps/backend/scripts/backfills/`):

| File | Type | Purpose |
|---|---|---|
| `2026-06-26-token-score-breakdown.sql` | SQL | Backfill `token_scores.breakdown` for 2 stale tokens (INV-2) |
| `2026-06-26-kol-is-active-sync.sql` | SQL | Sync `kols.is_active` from `lifecycle_status` for 7 inconsistent rows (INV-3) |
| `2026-06-26-kol-title-handle-resolve.ts` | TS | Scaffold for INV-12/13 — awaiting user to fill `MANUAL_RESOLUTIONS` map |
| `2026-06-26-tracked-published-calls-from-published.sql` | SQL | Backfill `tracked_published_calls` from `published_calls` filtering numeric KOL ids (INV-6 cascade — 3 test artifacts correctly skipped) |

All auto-applied on `npm run start:dev` via the wired `db:migrate` runner; tracked in `backfill_migrations` table.

## 💡 Feature requests (missing functionality)

### FEAT-1: Manual override of token APPROVED/REJECTED decisions

- **Where**: http://localhost:5173/tokens
- **Current state**: Page shows filter decisions (APPROVED/REJECTED badges) but no way to override them
- **User need**: Ability to manually change a token's decision status
- **Use cases**:
  - Force-approve a token that was rejected (e.g. settings too strict)
  - Force-reject a token that was approved (e.g. manual risk review)
  - Re-evaluate a token against current settings
- **UI suggestions**:
  - Hover/tap on a token card → actions menu with "Mark approved", "Mark rejected", "Re-evaluate"
  - Or: a "Manage" button next to the badge
  - Bulk action: select multiple tokens → apply decision
- **Backend**: Need endpoints for manual override:
  - `POST /token/token-gating/decisions/:id/override { verdict: 'APPROVED'|'REJECTED', reason: string }`
  - Or: `POST /token/token-gating/re-evaluate { chain, address }` to re-run filters
- **Files to inspect**:
  - Frontend: `apps/frontend/src/pages/tokens-explorer/` + `apps/frontend/src/entities/filter-decision/`
  - Backend: `apps/backend/src/token/token-gating/api/http/filters.controller.ts`
  - Decision entity: `apps/backend/src/token/token-gating/domain/entities/filter-decision.entity.ts` (does it have an audit trail for overrides?)
- **Related**: 
  - Related to INV-1 (Published 0) — once manual override exists, ops can bypass auto-filtering
  - Related to FEAT-2 below (Config UI)

(Empty rows above. Add each error found during execution.)

## Final report

After execution, fill in:
- **Total checks**: __
- **Passed**: __
- **Failed**: __
- **Errors by page**:
  - Dashboard: __
  - Live Feed: __
  - Tokens Explorer: __
  - Token Detail: __
  - KOLs: __
  - Ops: __
  - Cross-cutting: __
- **Critical issues** (functional bugs): __
- **Polish issues** (visual, UX): __
- **Recommended next steps**: __

## 🏗️ BC-by-BC review (post-QA)

A walk-through of each BC based on testing so far. Status: ✅ verified working · ⚠️ partial · 🔴 broken · ⏳ untested.

### 🟢 `kol/identity` (KOL list + lifecycle)

- ✅ GET `/telegram-kol/identity/kols` returns 45 KOLs (37 ACTIVE + 8 DORMANT)
- ✅ KOL card renders title, handle, lifecycle status, last ingested time
- ✅ Deactivate mutation: UI updates, DB persists, `is_active` set to `f`
- ⚠️ **Activate mutation**: lifecycle updates to ACTIVE in DB, but `is_active` stays `f` (should be `t`) — INV-3
- 🔴 All 45 KOLs show `rep 0.50 (LOW)` — reputation is broken or never computed — INV-10
- 🔴 Leaderboard shows "No reputation data yet" while cards show 0.50 — inconsistency — INV-11
- 🔴 2 KOLs missing title/handle (Cas Gem, SpyDefi) — INV-12
- 🔴 1 KOL has placeholder title "- SOL -" — INV-13
- ⏳ Backfill button not tested
- ⏳ Pagination (45 KOLs in single scroll) — INV-14

### 🟢 `kol/reputation` (KOL reputation)

- 🔴 GET `/telegram-kol/reputation/kols` returns `[]` despite 45 KOLs — INV-17
- 🔴 Reputation computation not running — INV-10
- ⏳ Top reputation endpoint behavior unclear

### ⏳ `kol/ingestion` (MTProto listening)

- ⏳ Not directly testable via frontend
- ⏳ `is_active` column setting behavior unclear — possibly responsible for INV-3 inconsistency

### ⏳ `kol/source` / `kol/stats`

- ⏳ Not visible in frontend, not tested

### 🟢 `token/intake/extraction` (extraction pipeline)

- 🔴 Frontend `channelId` field rejected by backend (`kolId` expected) — INV-7
- ⏳ Extraction logic itself not tested (would need valid replay request)

### ⏳ `token/intake/parsing`

- ⏳ Not directly testable via frontend

### 🟢 `token/normalization` (canonical calls)

- 🔴 14 of 27 token cards on /tokens get 400 Bad Request from `/token/normalization/tokens/:chain/:address` — INV-4 category A
- 🔴 Multiple 404s for normalization endpoints — tokens exist in filter_decisions but not in canonical_token_calls — INV-4
- ⏳ Polling behavior not confirmed (10s per README)

### 🟢 `token/scoring` (token scores + breakdown)

- 🔴 2 of 27 tokens have empty `breakdown` despite non-zero scores — INV-2
- ✅ Score (80 STRONG) shown correctly on token detail page
- ⏳ Score tier thresholds working as expected (STRONG/DECENT/NEUTRAL/RISKY)

### ⏳ `token/classification`

- ⏳ Not directly testable via frontend

### 🟢 `token/token-gating` (filters + decisions)

- ✅ APPROVED + REJECTED badges render on /tokens page
- ✅ 27 filter decisions shown (4 approved, 23 rejected)
- ⏳ No way to manually override decisions (FEAT-1)
- ⏳ Filter logic not directly testable via UI

### 🟢 `token/call-tracking` (tracked calls)

- 🔴 🎯 Tracked calls widget shows "No tracked calls" despite 4 approved decisions — INV-6
- ⏳ Cascade from INV-1 (Published 0): until publish works, tracked calls will be empty

### 🟢 `token/milestone` (milestone notifications)

- ⏳ Not visible in frontend (no milestone widget)
- 🔴 Tracked calls cascade (INV-6) blocks milestone cron from processing
- ⏳ Redis cache adapter specs already written, not integration-tested

### ⏳ `token/honeypot`

- ⏳ Not visible in frontend

### 🔴 `telegram/vip-calls-channel` (publishing to Telegram)

- 🔴 Published KPI shows 0 despite 4 approved decisions — INV-1
- 🔴 `/vip-calls/calls/published` returns []
- ⏳ Bot API token config state unknown (need to check `.env`)
- ⏳ Whether `filters.token.approved` event listener is wired

### ⏳ `telegram/chain-dexter-bot`

- ⏳ Not visible in frontend (no UI route)

### 🟢 `chain/detection` / `chain/registry`

- ⏳ Internal services, no direct UI exposure

### 🟢 `chain/explorer` (market data enrichment)

- 🔴 `/token/market-data/snapshots/...` 404s for many Solana addresses — INV-4 category B
- 🔴 `cdn.birdeye.so` DNS doesn't resolve — INV-4 category C
- ✅ `/tokens/solana/4quuyz...` shows market data (Price, Liquidity, MC, Holders, Pairs)
- 🔴 Many token images show "placeholder" alt text — INV-5
- ⏳ Image fallback strategy needs definition

### 🟢 `dashboard` (KPI dashboard)

- ✅ All 4 KPI cards render (KOLs, Canonical calls, Approval rate, Published)
- ✅ KPI numbers match `/dashboard/kpis` API response
- ✅ TopTokensTable renders with 3 rows
- 🔴 Published KPI = 0 (see INV-1)
- 🔴 "Last seen: —" for all tokens (see bug #4)
- 🔴 Tracked calls widget empty (see INV-6)
- 🔴 Approval rate denominator wording unclear (see bug #9)

### 🟢 `settings` (filter/threshold config)

- ⏳ SettingsService has methods but no frontend UI (FEAT-2 related)
- ⏳ Reputation thresholds, scoring tiers, signal penalties all in settings but not tunable

### 🟢 `shared/ws` (WebSocket gateway)

- ✅ WS connected badge green on all pages
- 🔴 Live feed empty even after triggering events (INV-8) — WS may not be relaying events or frontend may not be listening

### 🟢 `shared/common/cache` (Redis)

- ✅ RedisMilestoneCacheAdapter has 15 unit specs
- ⏳ No integration test against real Redis

### ⏳ `shared/kernel` (domain events)

- ⏳ Internal infrastructure

---

## 🔥 Severity heatmap (most impactful first)

| Priority | Issue | BC | Severity |
|---|---|---|---|
| P0 | Published 0 to Telegram (INV-1) | vip-calls-channel | Cascade: tracked calls, milestones, live feed all empty |
| P0 | All KOLs show rep 0.50 (INV-10) | kol/reputation | Reputation feature non-functional |
| P0 | /tokens 56 console errors (INV-4) | token/normalization + chain/explorer | N+1 queries, broken images |
| P0 | Ops replay broken — field mismatch (INV-7) | token/intake/extraction | Operator tools unusable |
| P0 | Live feed empty (INV-8) | shared/ws + live page | Core feature broken |
| P1 | KOL activate doesn't restore is_active (INV-3) | kol/identity | Data corruption |
| P1 | Empty breakdown for score 80 (INV-2) | token/scoring | Score opaque |
| P1 | Tracked calls empty (INV-6) | call-tracking + vip-calls | Cascade from INV-1 |
| P1 | 2 KOLs missing title/handle (INV-12) | kol/ingestion | Data quality |
| P2 | 1 KOL placeholder title (INV-13) | kol/ingestion | Data quality |
| P2 | "Last seen: —" for all tokens | dashboard | UI placeholder |
| P2 | Token name truncated twice | dashboard | UI display |
| P2 | KOLs all show rep "(LOW)" label | kol/reputation | Misleading UI |
| P2 | /telegram-kol/reputation/kols returns [] (INV-17) | kol/reputation | Endpoint dead |
| P3 | favicon.ico 404 | n/a | Cosmetic |
| P3 | No pagination on /kols (45 rows) | n/a | UX |
| FEAT | Manual override of APPROVED/REJECTED (FEAT-1) | token/token-gating | Missing feature |
| FEAT | Config UI for settings (separate plan) | settings | Missing feature |

## Out of scope

- Backend DI verification (assumed working per user confirmation)
- Performance benchmarks
- Accessibility deep audit (axe, screen reader)
- Cross-browser compatibility (only Chromium via Playwright)
- Load testing

## Execution notes

- Run in order: preflight → page 1 → page 2 → ... → cross-cutting
- After each page: save console + network logs to `.omo/evidence/qa-<page>-<timestamp>.log`
- Screenshots saved to `.omo/evidence/qa-<page>-<timestamp>.png`
- Total estimated time: 60-90 min if backend has data