# Fix /live Page - Empty WebSocket Feed

## TL;DR

> **Quick Summary**: Fix the `/live` page which shows empty despite WebSocket connection being established. Root cause is that pipeline events are not being emitted/broadcast via WebSocket despite EventEmitter2 being configured in the backend.

> **Deliverables**: 
> - `/live` page displays real-time events from the pipeline
> - WebSocket events are properly broadcast to connected clients
> - Debug endpoints to verify event emission

> **Estimated Effort**: Medium
> **Parallel Execution**: NO - Sequential (debug first, then fix)
> **Critical Path**: Debug EventEmitter → Fix emission → Verify /live works

---

## Context

### Original Problem
- URL visited: `http://localhost:5173/live`
- Symptom: Empty page, only shows "Esperando eventos del pipeline… (WS conectado)"
- WebSocket connection indicator shows "WS ●" (connected) but no data appears

### Investigation Results

**What's Working:**
- Frontend WebSocket connects to `http://localhost:3030` ✅
- Backend is running on port 3030 ✅
- Socket.IO connection is established ✅
- Backend WsGateway is configured with event mapping ✅
- LiveFeed component listens to correct events ✅

**Backend Gateway Configuration** (`apps/backend/src/shared/ws/gateway/ws.gateway.ts`):
- Uses `eventEmitter.onAny()` to listen to all pipeline events
- Maps backend event names to WS event names:
  - `scoring.token.scored` → `scoring.token.scored`
  - `filters.token.approved` → `token-gating.decision.applied`
  - `filters.token.rejected` → `token-gating.decision.applied`
  - `normalization.call.normalized` → `normalization.call.normalized`

**Frontend Listeners** (`apps/frontend/src/widgets/live-feed/ui/live-feed.tsx`):
- `scoring.token.scored` - Token evaluated with score
- `token-gating.decision.applied` - Filter decision (APPROVED/REJECTED)
- `normalization.call.normalized` - Canonical token created

**Rooms Joined:**
- `chain:solana`
- `chain:evm`

### Related Issues (Not Primary)
- `/telegram-publishing/calls/published` returns 404 (endpoint path mismatch in endpoints.ts) - separate issue

---

## Work Objectives

### Core Objective
Get the `/live` page to display real-time pipeline events by ensuring WebSocket events are properly emitted from the backend and received by the frontend.

### Concrete Deliverables
1. `/live` page shows events in real-time
2. Debug mechanism to verify events are being emitted
3. Root cause identified and fixed

### Definition of Done
- [ ] Visiting `/live` shows live pipeline events
- [ ] WebSocket receives `scoring.token.scored` events
- [ ] WebSocket receives `token-gating.decision.applied` events
- [ ] WebSocket receives `normalization.call.normalized` events

### Must Have
- Working real-time event feed on `/live`

### Must NOT Have
- Changes to frontend code (frontend is already correct)
- Breaking changes to existing API endpoints

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (playwright for browser automation)
- **Automated tests**: NO - will use manual verification
- **Agent-Executed QA**: YES - will use Playwright to verify page content

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Sequential Execution (Debug First)

```
Wave 1 (Debug - understand why events not arriving):
├── Task 1: Check backend logs for event emission
├── Task 2: Verify EventEmitter2 is wired correctly in NestJS
├── Task 3: Test event emission manually via API
└── Task 4: Identify root cause

Wave 2 (Fix - implement solution):
├── Task 5: Fix the root cause
├── Task 6: Restart backend if needed
└── Task 7: Verify /live shows events

Final Verification:
└── Task F1: Verify with Playwright - page shows events
```

---

## TODOs

---

- [ ] 1. **Check Backend Logs for Event Emission**

  **What to do**:
  - Check if backend logs show any pipeline events being emitted
  - Look for: `scoring.token.scored`, `token-gating.decision.applied`, `normalization.call.normalized`
  - Check if WsGateway debug logs are enabled
  - Command: `lsof -i :3030` to find PID, then check process output

  **References**:
  - `apps/backend/src/shared/ws/gateway/ws.gateway.ts:62-68` - Event listener setup

  **Acceptance Criteria**:
  - [ ] Backend logs show event emission OR confirm no events are being emitted

- [ ] 2. **Verify EventEmitter2 Wiring**

  **What to do**:
  - Check if EventEmitter2 is properly instantiated in NestJS
  - Verify `WsGateway` is in the providers list
  - Check `ws.module.ts` configuration

  **References**:
  - `apps/backend/src/shared/ws/ws.module.ts` - Module configuration
  - `apps/backend/src/app.module.ts` - Root module imports

  **Acceptance Criteria**:
  - [ ] EventEmitter is properly injected into WsGateway

- [ ] 3. **Test Event Emission Manually**

  **What to do**:
  - Use the Ops page (`/ops`) to replay a message through the pipeline
  - Or use endpoint `POST /token/intake/extraction/extract` to trigger pipeline
  - Watch backend logs for event emission
  - Check if WebSocket receives events after triggering

  **References**:
  - Frontend: `apps/frontend/src/pages/ops/index.tsx`
  - API: `POST /token/intake/extraction/extract` (from backend README)

  **Acceptance Criteria**:
  - [ ] Manually triggered pipeline produces events
  - [ ] Events appear in backend logs

- [ ] 4. **Identify Root Cause**

  **What to do**:
  - Based on Tasks 1-3, identify why events are not arriving
  - Common causes:
    a) EventEmitter not emitting (pipeline not running)
    b) Events emitted but not broadcast (WsGateway issue)
    c) Events broadcast but not received (network/namespace issue)

  **Acceptance Criteria**:
  - [ ] Clear root cause documented

- [ ] 5. **Fix the Root Cause**

  **What to do**:
  - Implement the fix based on root cause
  - Possible fixes:
    a) Start the Telegram ingestion to generate events
    b) Fix EventEmitter wiring in WsGateway
    c) Fix WebSocket namespace/path configuration

  **Acceptance Criteria**:
  - [ ] Fix implemented

- [ ] 6. **Restart Backend if Needed**

  **What to do**:
  - If fix requires backend changes, rebuild and restart
  - Command: `npm run dev:backend` (from project root)

  **Acceptance Criteria**:
  - [ ] Backend restarted successfully

- [ ] 7. **Verify /live Shows Events**

  **What to do**:
  - Navigate to `/live` page
  - Should show events or "Esperando eventos..." if no pipeline activity

  **Acceptance Criteria**:
  - [ ] Page no longer shows empty state without events

---

## Final Verification Wave

- [ ] F1. **Verify /live with Playwright**

  **QA Scenarios**:

  Scenario: /live page content
    Tool: Playwright
    Preconditions: Backend running, WebSocket connected
    Steps:
      1. Navigate to http://localhost:5173/live
      2. Wait for page load
      3. Check if LiveFeed widget is present
      4. Verify either events appear OR "Esperando eventos" message shows
    Expected Result: Page renders correctly with LiveFeed component
    Evidence: .sisyphus/evidence/final-live-page.png

---

## Commit Strategy

- **1**: `fix(frontend): add debug logging to WebSocket events` - relevant file
- **2**: `fix(backend): ensure event emission to WebSocket` - relevant file

---

## Success Criteria

### Verification Commands
```bash
# Check backend is running
lsof -i :3030

# Test API endpoint
curl http://localhost:3030/

# Verify /live page loads
curl -s http://localhost:5173/live | grep -i "live"
```

### Final Checklist
- [ ] Backend running on port 3030
- [ ] Frontend running on port 5173
- [ ] WebSocket connection established
- [ ] /live page renders LiveFeed component
- [ ] Events appear when pipeline is active