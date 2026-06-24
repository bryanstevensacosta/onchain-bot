# Plan: Arreglar `/live` — Agregar Socket.IO al backend + Fixes

## TL;DR

> **Quick Summary**: El frontend en `/live` no muestra nada porque el backend no tiene Socket.IO. Los eventos del pipeline solo se emiten via EventEmitter2 (in-process). Hay que agregar Socket.IO al backend, crear un gateway que retransmita los eventos al frontend, y mapear payloads correctamente. Además hay que corregir endpoints de publishing mal escritos y timestamps hardcodeados.

> **Deliverables**:
> - Backend: Dependencias Socket.IO instaladas, IoAdapter configurado, WsGateway creado
> - Backend: WsEventBridge que transforma eventos de dominio → eventos Socket.IO
> - Backend: Eventos del pipeline retransmitidos en tiempo real (scoring, filters, normalization)
> - Frontend: Endpoints de publishing corregidos en `endpoints.ts`
> - Frontend: LiveFeed muestra timestamps reales en vez de "hace 0s"
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves + final
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 5/6/7 → Task 10/11 (fixes)

---

## Context

### Original Request
"es correcto los endpoints y api usados en /live ? no veo nada en el frontend"

### Interview Summary
**Problemas encontrados**:
- **CRITICAL**: Backend no tiene Socket.IO — solo EventEmitter2 in-process. Frontend intenta conectar a Socket.IO en `:3030` pero no hay respuesta.
- **CRITICAL**: Nombre de evento inconsistente — frontend escucha `token-gating.decision.applied` pero backend emite `filters.token.approved` / `filters.token.rejected`
- **HIGH**: Payloads inconsistentes — frontend espera `ticker` y `breakdown` en scoring events que el backend no emite
- **MINOR**: Endpoints HTTP de publishing mal escritos — frontend usa `/telegram/publishing/` pero backend sirve en `/telegram-publishing/`
- **MINOR**: LiveFeed siempre muestra "hace 0s" porque usa `Date.now()` instead of real event timestamps

### Event Name Mapping (Key Design Decision)

| Frontend `WS_EVENTS` | Backend Domain Event | Action |
|---|---|---|
| `scoring.token.scored` | `scoring.token.scored` | Forward con transformación de payload |
| `token-gating.decision.applied` | `filters.token.approved` + `filters.token.rejected` | Unificar en un solo evento frontend |
| `normalization.call.normalized` | `normalization.call.normalized` | Forward directo (payloads compatibles) |
| `publishing.telegram.published` | `publishing.telegram.published` | Forward directo (para futuro) |
| `publishing.telegram.failed` | `publishing.telegram.failed` | Forward directo (para futuro) |

---

## Work Objectives

### Core Objective
Hacer que la página `/live` funcione mostrando eventos del pipeline en tiempo real.

### Concrete Deliverables
1. Backend con Socket.IO operativo (gateway + bridge de eventos)
2. Eventos de scoring, filters, normalization visibles en LiveFeed
3. Endpoints de publishing corregidos
4. Timestamps reales en LiveFeed

### Definition of Done
- [ ] Backend inicia con Socket.IO en puerto `:3030`
- [ ] Frontend conecta a Socket.IO y recibe evento `hello`
- [ ] Al emitirse un `scoring.token.scored` en backend, aparece en LiveFeed del frontend
- [ ] Al emitirse `filters.token.approved`/`filters.token.rejected`, aparece como decisión en LiveFeed
- [ ] Al emitirse `normalization.call.normalized`, aparece como normalized en LiveFeed
- [ ] Endpoints de publishing funcionan correctamente
- [ ] Timestamps en LiveFeed muestran tiempo real desde el evento

### Must Have
- Socket.IO gateway funcional con rooms (chain:solana, chain:evm)
- Bridge EventEmitter2 → Socket.IO para eventos clave
- Payload transformation para matching frontend/backend

### Must NOT Have (Guardrails)
- NO modificar la lógica de negocio de los BCs existentes
- NO cambiar los nombres de eventos de dominio del backend (solo transformación en el bridge)
- NO agregar nuevas funcionalidades al frontend LiveFeed (solo arreglar lo que ya existe)
- NO refactorizar el sistema de eventos interno (EventEmitter2 se mantiene)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (jest backend, vitest frontend)
- **Automated tests**: YES (tests-after) — unit tests para WsGateway y WsEventBridge
- **Framework**: Jest (backend)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/Socket.IO**: Start NestJS in dev, use interactive_bash (node REPL or curl) to verify Socket.IO handshake
- **Frontend**: Use Playwright to navigate to `/live`, verify WS connection and event rendering
- **API/HTTP**: Use Bash (curl) to verify corrected endpoints

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Socket.IO setup):
├── Task 1: Install deps + IoAdapter config [quick]
├── Task 2: Create WsGateway (basic Socket.IO) [quick]
└── Task 3: Create WsEventBridge (EventEmitter2 → Socket.IO) [quick]

Wave 2 (Event Wiring - connect pipeline):
├── Task 4: Wire normalization.call.normalized [quick]
├── Task 5: Wire scoring.token.scored (with payload transform) [quick]
└── Task 6: Wire filters approved/rejected → unified decision event [quick]

Wave 3 (Frontend Fixes):
├── Task 7: Fix publishing endpoints in endpoints.ts [quick]
├── Task 8: Fix LiveFeed timestamps (real event times) [quick]
├── Task 9: Update LiveFeed frontend types for corrected payloads [quick]
└── Task 10: Add WS connection status indicator to /live page [quick]

Wave FINAL (Verification):
├── Task F1: Plan compliance audit
├── Task F2: Code quality + tests
├── Task F3: Real manual QA (all scenarios)
└── Task F4: Scope fidelity check
```

---

## TODOs

- [ ] 1. Instalar dependencias Socket.IO + configurar IoAdapter

  **What to do**:
  - Add `@nestjs/platform-socket.io` and `socket.io` to `apps/backend/package.json` dependencies
  - Run `npm install` from monorepo root
  - In `apps/backend/src/main.ts`, import `IoAdapter` from `@nestjs/platform-socket.io`
  - Add `app.useWebSocketAdapter(new IoAdapter(app))` before `app.listen()`
  - Verify the backend accepts Socket.IO connections by checking the `/socket.io` handshake

  **Must NOT do**:
  - No cambiar la configuración CORS existente (ya permite localhost:5173)
  - No cambiar el puerto del backend (sigue siendo `:3000` del AppConfig, pero frontend espera `:3030`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple dependency install + boilerplate config
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation for all other tasks)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 2, 3, 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:
  - `apps/backend/package.json:22-39` - Current dependencies - add `@nestjs/platform-socket.io` and `socket.io`
  - `apps/backend/src/main.ts:22-47` - Bootstrap file - add IoAdapter here
  - `apps/frontend/src/shared/realtime/socket.ts:11-13` - Frontend connects to `http://localhost:3030` with path `/socket.io`
  - Official docs: `https://docs.nestjs.com/websockets/gateways`

  **Acceptance Criteria**:
  - [ ] `@nestjs/platform-socket.io` and `socket.io` in backend package.json
  - [ ] `npm install` completes without errors
  - [ ] Backend starts without errors with IoAdapter configured

  **QA Scenarios**:
  ```
  Scenario: Backend accepts Socket.IO connections
    Tool: Bash (curl)
    Preconditions: Backend is running on port 3000 (or AppConfig port)
    Steps:
      1. curl -v "http://localhost:3030/socket.io/?EIO=4&transport=polling" 2>&1
    Expected Result: HTTP 200 response with Socket.IO handshake JSON (contains "sid")
    Evidence: .sisyphus/evidence/task-1-ws-handshake.txt

  Scenario: Backend rejects invalid transport
    Tool: Bash (curl)
    Preconditions: Backend is running
    Steps:
      1. curl -v "http://localhost:3030/socket.io/" 2>&1 | head -20
    Expected Result: Returns 400 or proper Socket.IO error, not a crash
    Evidence: .sisyphus/evidence/task-1-ws-reject.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-1-ws-handshake.txt`
  - [ ] `task-1-ws-reject.txt`

  **Commit**: YES (groups with 2, 3)
  - Message: `feat(backend): add Socket.IO support with IoAdapter`
  - Files: `apps/backend/package.json`, `apps/backend/src/main.ts`

---

- [ ] 2. Crear WsModule + WsGateway (Socket.IO básico)

  **What to do**:
  - Create `apps/backend/src/shared/ws/ws.module.ts` - NestJS module
  - Create `apps/backend/src/shared/ws/ws.gateway.ts` - WebSocket gateway
  - Gateway should:
    - Be annotated with `@WebSocketGateway({ cors: { origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] } })`
    - Handle `join` and `leave` events for room management
    - Support rooms: `chain:solana`, `chain:evm`, `verdict:approved`, `verdict:rejected`, `published:all`, `score:>=70`
    - Emit `hello` event on connection with `{ serverTime, missedSince, bufferedCount }`
    - Expose a method `emitToAll(event: string, payload: any)` that broadcasts to all connected clients
  - Import `WsModule` in `AppModule`

  **Must NOT do**:
  - No implementar lógica de negocio aquí — solo enrutamiento de eventos
  - No autenticación aún (fase futura)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard NestJS gateway creation, well-documented pattern
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 3, 4, 5, 6
  - **Blocked By**: Task 1

  **References**:
  - `apps/frontend/src/shared/realtime/socket.ts:37-43` - ROOMS constant - frontend expects these exact room names
  - `apps/frontend/src/shared/realtime/events.ts:116-120` - ServerHello type - hello event payload shape
  - `apps/frontend/src/shared/realtime/events.ts:122-135` - WS_EVENTS constant - all event names frontend listens to
  - Official docs: `https://docs.nestjs.com/websockets/gateways`

  **Acceptance Criteria**:
  - [ ] WsModule created and imported in AppModule
  - [ ] Gateway handles `join` and `leave` events
  - [ ] Gateway emits `hello` on connection
  - [ ] Gateway has `emitToAll` method for broadcasting
  - [ ] Backend compiles without errors (`tsc --noEmit`)

  **QA Scenarios**:
  ```
  Scenario: Client receives hello on connect
    Tool: Bash (node script)
    Preconditions: Backend is running
    Steps:
      1. Run: node -e "
        const { io } = require('socket.io-client');
        const socket = io('http://localhost:3030');
        socket.on('hello', (data) => { console.log(JSON.stringify(data)); process.exit(0); });
        setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 3000);
      "
    Expected Result: JSON with serverTime and bufferedCount fields
    Evidence: .sisyphus/evidence/task-2-hello.txt

  Scenario: Room join/leave works
    Tool: Bash (node script with 2 clients)
    Preconditions: Backend is running
    Steps:
      1. Start client A that joins room chain:solana
      2. Start client B that does NOT join any room
      3. Emit an event to room chain:solana via gateway.emitToAll
      4. Client A should receive it, client B should not
    Expected Result: Room isolation works correctly
    Evidence: .sisyphus/evidence/task-2-rooms.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-2-hello.txt`
  - [ ] `task-2-rooms.txt`

  **Commit**: YES (groups with 1, 3)
  - Message: `feat(backend): create WebSocket gateway with room support`
  - Files: `apps/backend/src/shared/ws/`

---

- [ ] 3. Crear WsEventBridge (EventEmitter2 → Socket.IO)

  **What to do**:
  - Create `apps/backend/src/shared/ws/ws-event-bridge.ts` as an `@Injectable()` service
  - Inject `EventEmitter2` and `WsGateway`
  - Subscribe to these EventEmitter2 events:
    - `scoring.token.scored`
    - `filters.token.approved` / `filters.token.rejected`
    - `normalization.call.normalized`
  - For each event, create a payload transformer function that maps the backend DomainEvent payload to match what the frontend expects
  - On receiving a domain event, transform payload and call `this.wsGateway.emitToAll(eventName, transformedPayload)`
  - Register the bridge as a NestJS provider in WsModule
  - Use `@OnEvent()` decorators for subscription (async: true)

  **Must NOT do**:
  - No modificar los DomainEvents del backend — solo transformar en el bridge
  - No agregar lógica pesada — las transformaciones deben ser síncronas y rápidas

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Service with event subscriptions and simple payload mapping
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 1, 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `apps/frontend/src/shared/realtime/events.ts:39-83` - Frontend event type definitions - these are the TARGET shapes
  - `apps/backend/src/token/scoring/domain/events/token-scored.event.ts:12-48` - Backend scoring event payload
  - `apps/backend/src/token/normalization/domain/events/call-normalized.event.ts:8-60` - Backend normalization event payload
  - `apps/backend/src/token/token-gating/domain/events/token-filtered.event.ts:7-33` - Backend filter approved event
  - `apps/backend/src/token/token-gating/domain/events/token-rejected.event.ts:7-41` - Backend filter rejected event
  - `apps/backend/src/shared/kernel/domain-event.ts:13` - Base DomainEvent with eventName and toPayload()

  **Transformer Details**:

  **scoring.token.scored**:
  - Backend payload: `{ chain, address, score, tier, classification, securityFlag, sourceCount, mentionCount, avgKolReputation, scoredAt }`
  - Frontend expects: `{ chain, address, ticker, score, tier, breakdown: [] }`
  - Transform: Map chain/address/score/tier directly. Set `ticker: null` (no disponible). Set `breakdown: []` (vacio).
  - Socket.IO event name: `scoring.token.scored` (coincide)

  **filters.token.approved → token-gating.decision.applied**:
  - Backend payload: `{ chain, address, score, classification, decidedAt }`
  - Frontend expects: `{ chain, address, verdict: 'APPROVED', reasons: [], decidedAt }`
  - Socket.IO event name: `token-gating.decision.applied` (mapeado)
  - Add `verdict: 'APPROVED'`, `reasons: []`

  **filters.token.rejected → token-gating.decision.applied**:
  - Backend payload: `{ chain, address, score, classification, reasons: [{code, message}], decidedAt }`
  - Frontend expects: `{ chain, address, verdict: 'REJECTED', reasons: string[], decidedAt }`
  - Socket.IO event name: `token-gating.decision.applied` (unificado)
  - Add `verdict: 'REJECTED'`, map `reasons` from objects to strings (extract message)

  **normalization.call.normalized**:
  - Backend payload: `{ chain, address, ticker, name, chart, marketCapUsd, liquidityUsd, fdvUsd, holders, sourceCount, mentionCount, firstSeenAt, lastSeenAt, confidence }`
  - Frontend expects: `{ chain, address, mentionCount, firstSeenAt, lastSeenAt }`
  - Transform: Just extract the needed fields. Extra fields are ignored by frontend.
  - Socket.IO event name: `normalization.call.normalized` (coincide)

  **Acceptance Criteria**:
  - [ ] WsEventBridge created with @OnEvent handlers for all 4 backend events
  - [ ] Payload transformers implemented for each event type
  - [ ] Bridge registered in WsModule providers
  - [ ] Backend compiles without errors

  **QA Scenarios**:
  ```
  Scenario: scoring event reaches bridge and emits via gateway
    Tool: Bash (node REPL with EventEmitter2)
    Preconditions: Backend running
    Steps:
      1. curl -X POST http://localhost:3030/token/scoring/score \
        -H 'Content-Type: application/json' \
        -d '{"chain":"solana","address":"So11111111111111111111111111111111111111112","classification":"TOKEN","signals":[],"score":75,"tier":"GOOD","riskWeight":0,"completeness":1}'
      2. Check Socket.IO client receives 'scoring.token.scored'
    Expected Result: Event received with correct payload shape
    Evidence: .sisyphus/evidence/task-3-scoring-event.txt

  Scenario: bridge handles unknown events without crashing
    Tool: Bash (manual EventEmitter2 emit via internal endpoint)
    Preconditions: Backend running
    Steps:
      1. Manually emit an unknown event name on EventEmitter2
      2. Verify bridge doesn't crash (only events it's subscribed to are handled)
    Expected Result: Bridge is resilient to unhandled events
    Evidence: .sisyphus/evidence/task-3-unknown-event.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-3-scoring-event.txt`
  - [ ] `task-3-unknown-event.txt`

  **Commit**: YES (groups with 1, 2)
  - Message: `feat(backend): create WsEventBridge to relay domain events to Socket.IO`
  - Files: `apps/backend/src/shared/ws/ws-event-bridge.ts`

---

- [ ] 4. Verificar que normalization.call.normalized fluye correctamente al frontend

  **What to do**:
  - El WsEventBridge ya tiene el handler para `normalization.call.normalized` (creado en Task 3)
  - Verificar que el transformer extrae correctamente: `chain`, `address`, `mentionCount`, `firstSeenAt`, `lastSeenAt`
  - Verificar que el evento se emite como `normalization.call.normalized` (coincide nombre)
  - Asegurar que las fechas (`firstSeenAt`, `lastSeenAt`) se serializan como ISO strings
  - Ejecutar el pipeline de normalización o un trigger manual para probar

  **Must NOT do**:
  - No modificar `CallNormalizedEvent` del backend
  - No agregar transformaciones adicionales no necesarias

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple data flow verification, no new code needed
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9 (frontend types)
  - **Blocked By**: Task 3

  **References**:
  - `apps/backend/src/token/normalization/domain/events/call-normalized.event.ts:8-60` - Backend event payload
  - `apps/frontend/src/shared/realtime/events.ts:39-45` - Frontend NormalizationCallNormalizedEvent type
  - `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx:48-57` - Frontend handler for normalized events

  **Acceptance Criteria**:
  - [ ] Normalization events appear in LiveFeed as "canonical" type with mention count
  - [ ] Event payload matches frontend `NormalizationCallNormalizedEvent` interface

  **QA Scenarios**:
  ```
  Scenario: Normalization event flows end-to-end
    Tool: Playwright (frontend) + Bash (trigger event)
    Preconditions: Backend running, frontend running
    Steps:
      1. Open Playwright to http://localhost:5173/live
      2. Trigger normalization event via backend (POST to extract/parse endpoint with a known token)
      3. Wait up to 10s for the event to appear in the live feed
    Expected Result: A new "canonical" row appears with chain badge and mention count
    Evidence: .sisyphus/evidence/task-4-normalization-flow.png
  ```

  **Evidence to Capture**:
  - [ ] `task-4-normalization-flow.png`

  **Commit**: YES (groups with 5, 6)
  - Message: `feat(backend): wire normalization events to WebSocket`
  - Files: `apps/backend/src/shared/ws/ws-event-bridge.ts`

---

- [ ] 5. Verificar que scoring.token.scored fluye correctamente (con transformación de payload)

  **What to do**:
  - El WsEventBridge ya tiene el handler para `scoring.token.scored` (creado en Task 3)
  - El transformer debe mapear:
    - `chain` → `chain` (directo)
    - `address` → `address` (directo)
    - `score` → `score` (directo)
    - `tier` → `tier` (directo)
    - `ticker`: backend NO tiene este campo → set `null`
    - `breakdown`: backend NO tiene este campo → set `[]` (array vacío)
    - `scoredAt` → descartado (frontend no lo usa aún)
  - Verificar que el tipo transformado es compatible con `ScoringTokenScoredEvent` del frontend

  **Must NOT do**:
  - No intentar agregar `ticker` al backend event (eso requiere cambios cross-BC)
  - No agregar `breakdown` falso — array vacío es la señal correcta de "no disponible"

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple payload transformation verification
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:
  - `apps/backend/src/token/scoring/domain/events/token-scored.event.ts:12-48` - Backend payload (no ticker, no breakdown)
  - `apps/frontend/src/shared/realtime/events.ts:68-75` - Frontend expects `ticker` and `breakdown`
  - `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx:125-153` - FeedRow renders scored events, uses `d.ticker` and `d.tier`
  - `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx:27-33` - Handler for scored events

  **Acceptance Criteria**:
  - [ ] Scoring events appear in LiveFeed as "scored" type showing score, tier, chain, and address
  - [ ] `ticker` shows as `null` (no crash, just no ticker symbol shown)
  - [ ] No errors in frontend console about missing fields

  **QA Scenarios**:
  ```
  Scenario: Scoring event appears in LiveFeed
    Tool: Playwright (frontend) + Bash (trigger score)
    Preconditions: Backend running, frontend running
    Steps:
      1. Open Playwright to http://localhost:5173/live
      2. Trigger scoring event: POST /token/scoring/score with valid data
      3. Wait up to 10s for event to appear
    Expected Result: New "scored" row with score badge (colored by range), chain badge, truncated address
    Evidence: .sisyphus/evidence/task-5-scoring-flow.png

  Scenario: Frontend handles null ticker gracefully
    Tool: Playwright
    Preconditions: Scoring event received with ticker=null
    Steps:
      1. Check browser console for errors
      2. Verify the row renders without ticker (just chain + address)
    Expected Result: No console errors, row displays correctly without ticker
    Evidence: .sisyphus/evidence/task-5-null-ticker.png
  ```

  **Evidence to Capture**:
  - [ ] `task-5-scoring-flow.png`
  - [ ] `task-5-null-ticker.png`

  **Commit**: YES (groups with 4, 6)
  - Message: `feat(backend): wire scoring events to WebSocket with payload transform`
  - Files: `apps/backend/src/shared/ws/ws-event-bridge.ts`

---

- [ ] 6. Verificar que filters events se unifican correctamente como token-gating.decision.applied

  **What to do**:
  - El WsEventBridge ya tiene handlers para `filters.token.approved` y `filters.token.rejected` (creado en Task 3)
  - El transformer para `filters.token.approved` debe:
    - Mapear `chain`/`address` directo
    - Agregar `verdict: 'APPROVED'`
    - Agregar `reasons: []` (aprobado = sin razones de rechazo)
    - Mapear `decidedAt` directo
    - Emitir como `token-gating.decision.applied` (NO como `filters.token.approved`)
  - El transformer para `filters.token.rejected` debe:
    - Mapear `chain`/`address` directo
    - Agregar `verdict: 'REJECTED'`
    - Mapear `reasons` de `{code, message}[]` a `string[]` (extraer `message`)
    - Mapear `decidedAt` directo
    - Emitir como `token-gating.decision.applied` (unificado con approved)
  - Verificar que el tipo final coincide con `TokenGatingDecisionAppliedEvent` del frontend

  **Must NOT do**:
  - No cambiar el nombre de los eventos de dominio del backend (`filters.token.approved`/`rejected` se mantienen)
  - No perder información — `reasons` debe mantener todos los mensajes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Payload transformation with simple mapping logic
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:
  - `apps/backend/src/token/token-gating/domain/events/token-filtered.event.ts:7-33` - Approved event (no reasons, no verdict field)
  - `apps/backend/src/token/token-gating/domain/events/token-rejected.event.ts:7-41` - Rejected event (has reasons array of objects)
  - `apps/frontend/src/shared/realtime/events.ts:77-83` - Frontend expects unified event with verdict+reasons
  - `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx:36-46` - Frontend handler for decision events
  - `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx:155-173` - FeedRow renders decision events with verdict color

  **Acceptance Criteria**:
  - [ ] Approved filter decisions appear as "filtered" rows with green APPROVED badge
  - [ ] Rejected filter decisions appear as "filtered" rows with red REJECTED badge and reason text
  - [ ] Both events arrive under the same `token-gating.decision.applied` event name

  **QA Scenarios**:
  ```
  Scenario: Approved filter shows in LiveFeed
    Tool: Playwright + Bash
    Preconditions: Backend + frontend running
    Steps:
      1. Open Playwright to http://localhost:5173/live
      2. Trigger scoring then filters via: POST /token/token-gating/apply with score=85
      3. Wait for event in LiveFeed, click "filtered" tab
    Expected Result: Row with green APPROVED badge, address, chain
    Evidence: .sisyphus/evidence/task-6-approved.png

  Scenario: Rejected filter shows reason
    Tool: Playwright + Bash
    Preconditions: Backend + frontend running
    Steps:
      1. POST /token/token-gating/apply with score=10 (below minScore=50 default)
      2. Wait for event in LiveFeed
    Expected Result: Row with red REJECTED badge, shows reason text like "Score too low"
    Evidence: .sisyphus/evidence/task-6-rejected.png
  ```

  **Evidence to Capture**:
  - [ ] `task-6-approved.png`
  - [ ] `task-6-rejected.png`

  **Commit**: YES (groups with 4, 5)
  - Message: `feat(backend): unify filter approved/rejected events into single decision event for WebSocket`
  - Files: `apps/backend/src/shared/ws/ws-event-bridge.ts`

---

- [ ] 7. Corregir endpoints de publishing en frontend endpoints.ts

  **What to do**:
  - In `apps/frontend/src/shared/api/endpoints.ts`, change the `publishing` section:
    - `/telegram/publishing/calls/published` → `/telegram-publishing/calls/published`
    - `/telegram/publishing/calls/failed` → `/telegram-publishing/calls/failed`
    - `/telegram/publishing/calls/recent` → `/telegram-publishing/calls/recent`
    - `/telegram/publishing/calls/:chain/:address` → `/telegram-publishing/calls/:chain/:address`
    - `/telegram/publishing/publish` → `/telegram-publishing/publish`
  - Aligns frontend with backend controller `@Controller('telegram-publishing')`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `apps/frontend/src/shared/api/endpoints.ts:9-16` - Wrong publishing paths
  - `apps/backend/src/telegram-publishing/api/http/publishing.controller.ts:8` - Backend controller path

  **Acceptance Criteria**:
  - [ ] All publishing endpoints use `/telegram-publishing/` prefix
  - [ ] Frontend compiles without errors

  **QA Scenarios**:
  ```
  Scenario: GET corrected published endpoint
    Tool: Bash (curl)
    Preconditions: Frontend dev server running
    Steps:
      1. curl -v "http://localhost:5173/api/telegram-publishing/calls/published" 2>&1 | grep -E "HTTP/|location"
    Expected Result: Proxied to backend (HTTP 200/404, not 502)
    Evidence: .sisyphus/evidence/task-7-pub-endpoint.txt
  ```

  **Commit**: YES
  - Message: `fix(frontend): correct publishing API endpoints (hyphen in telegram-publishing)`
  - Files: `apps/frontend/src/shared/api/endpoints.ts`

---

- [ ] 8. Arreglar timestamps en LiveFeed (usar tiempo real del evento)

  **What to do**:
  - In `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx`:
    - Handlers currently set `at: Date.now()` — change to extract real timestamp
    - `scoring.token.scored`: Use `scoredAt` from payload (add to ScoringTokenScoredEvent type)
    - `token-gating.decision.applied`: Use `decidedAt` (already exists ✅)
    - `normalization.call.normalized`: Use `lastSeenAt` (already exists ✅)
  - Update `ScoringTokenScoredEvent` in `events.ts` to include `scoredAt: string`
  - Change FeedRow to render `formatRelativeTime(at)` instead of "hace 0s"

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx:27-57` - Handlers using Date.now()
  - `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx:150,169,188` - "hace 0s"
  - `apps/frontend/src/shared/lib/format.ts` - formatRelativeTime()
  - `apps/frontend/src/shared/realtime/events.ts:68-75` - Scoring type needs scoredAt

  **Acceptance Criteria**:
  - [ ] LiveFeed shows accurate relative time
  - [ ] ScoringTokenScoredEvent includes `scoredAt: string`
  - [ ] Frontend compiles without errors

  **QA Scenarios**:
  ```
  Scenario: LiveFeed shows correct elapsed time
    Tool: Playwright
    Preconditions: Backend + frontend running
    Steps:
      1. Go to http://localhost:5173/live
      2. Trigger scoring event via POST /token/scoring/score
      3. Check time shows "hace 0s" or "hace 1s"
      4. Wait 5s, check same row shows "hace 5s"
    Expected Result: Time updates relative to event timestamp
    Evidence: .sisyphus/evidence/task-8-timestamps.png
  ```

  **Commit**: YES
  - Message: `fix(frontend): use real event timestamps in LiveFeed`
  - Files: `apps/frontend/src/widgets/live-feed/ui/live-feed.tsx`, `apps/frontend/src/shared/realtime/events.ts`

---

- [ ] 9. Actualizar tipos frontend para payloads corregidos

  **What to do**:
  - Review all frontend event types in `events.ts` against backend WsEventBridge outputs
  - `ScoringTokenScoredEvent`: Add `scoredAt: string`; keep `ticker` as `string | null`
  - `TokenGatingDecisionAppliedEvent`: Already correct
  - `NormalizationCallNormalizedEvent`: Already correct
  - Verify entity query hooks match backend HTTP endpoints

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Preferably after Tasks 5-6

  **References**:
  - `apps/frontend/src/shared/realtime/events.ts` - All event type definitions

  **Acceptance Criteria**:
  - [ ] Event types match backend payloads (after WsEventBridge)
  - [ ] No TS compilation errors

  **QA Scenarios**:
  ```
  Scenario: TS compilation passes
    Tool: Bash
    Steps: cd apps/frontend && npx tsc --noEmit
    Expected Result: 0 errors
    Evidence: .sisyphus/evidence/task-9-tsc-pass.txt
  ```

  **Commit**: YES (groups with 8)
  - Message: `fix(frontend): align WebSocket event types with backend payloads`
  - Files: `apps/frontend/src/shared/realtime/events.ts`

---

- [ ] 10. Agregar indicador de conexión WebSocket a /live

  **What to do**:
  - Add connection indicator at top-right of `/live` page
  - Use `getSocket().connected` / `connect`/`disconnect` events
  - Show: green "Conectado" / red "Desconectado"

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `apps/frontend/src/shared/realtime/socket.ts:7-27` - getSocket()
  - `apps/frontend/src/pages/live-feed/index.tsx` - Page to modify

  **Acceptance Criteria**:
  - [ ] `/live` shows WS connection status
  - [ ] Indicator updates on state change
  - [ ] No errors on disconnect

  **QA Scenarios**:
  ```
  Scenario: Shows connected
    Tool: Playwright
    Preconditions: Backend + frontend running
    Steps: Go to http://localhost:5173/live
    Expected Result: Green "Conectado" visible
    Evidence: .sisyphus/evidence/task-10-connected.png

  Scenario: Shows disconnected
    Tool: Playwright
    Preconditions: Frontend running, backend stopped
    Steps: Go to http://localhost:5173/live
    Expected Result: Red "Desconectado" visible
    Evidence: .sisyphus/evidence/task-10-disconnected.png
  ```

  **Commit**: YES
  - Message: `feat(frontend): add WebSocket connection indicator to /live`
  - Files: `apps/frontend/src/pages/live-feed/index.tsx`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl WS handshake, check frontend compiles). For each "Must NOT Have": search for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` on both apps + linter. Review changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (WS connection + events flowing + frontend rendering). Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Commit | Tasks | Message |
|--------|-------|---------|
| 1 | 1, 2, 3 | `feat(backend): add Socket.IO support with gateway and event bridge` |
| 2 | 4, 5, 6 | `feat(backend): wire pipeline events (scoring, filters, normalization) to WebSocket` |
| 3 | 7 | `fix(frontend): correct publishing API endpoints (hyphen in telegram-publishing)` |
| 4 | 8, 9 | `fix(frontend): use real event timestamps and align types with backend` |
| 5 | 10 | `feat(frontend): add WebSocket connection indicator to /live` |

---

## Success Criteria

### Verification Commands
```bash
# Backend compiles
cd apps/backend && npx tsc --noEmit

# Frontend compiles
cd apps/frontend && npx tsc --noEmit

# Backend starts with Socket.IO
cd apps/backend && npm run start:dev &
sleep 5
curl -v "http://localhost:3030/socket.io/?EIO=4&transport=polling" | grep -q "sid" && echo "WS OK"

# Frontend starts
cd apps/frontend && npm run dev &
sleep 5
curl -s "http://localhost:5173" | grep -q "root" && echo "Frontend OK"

# Publishing endpoints fixed
curl -s "http://localhost:5173/api/telegram-publishing/calls/published" | head -1
```

### Final Checklist
- [ ] Backend Socket.IO handshake responde con `sid`
- [ ] Frontend conecta a WebSocket y recibe evento `hello`
- [ ] Eventos de scoring, filters, normalization aparecen en LiveFeed
- [ ] Timestamps del LiveFeed son precisos (no "hace 0s")
- [ ] Endpoints de publishing funcionan
- [ ] Indicador de conexión WS visible en /live
