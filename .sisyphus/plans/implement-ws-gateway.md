# Implement WebSocket Gateway (Socket.IO)

## TL;DR

> **Quick Summary**: Implementar Socket.IO en el backend para que el frontend reciba eventos del pipeline en tiempo real. El frontend ya tiene el cliente configurado pero el backend no tiene Gateway — las conexiones WS fallan.
>
> **Deliverables**:
> - Dependencias `@nestjs/platform-socket.io` y `socket.io` instaladas
> - `WsGateway` en `shared/ws/gateway/ws.gateway.ts` — gateway que escucha eventos del EventEmitter2 y los reenvía a clientes WS
> - `WsModule` en `shared/ws/ws.module.ts` — módulo que provee el gateway
> - `AppModule` actualizado para importar `WsModule`
>
> **Estimated Effort**: Short (4 tareas)
> **Parallel Execution**: Wave 1 (1 task) → Wave 2 (3 tasks en paralelo) → VERIFY (1 task)
> **Critical Path**: Task 1 → Task 2 → Task 5

---

## Context

### Original Request
El dashboard funciona pero muestra "Esperando eventos del pipeline… (WS conectado)" y el WebSocket no está conectado realmente — falla con:

```
WebSocket connection to 'ws://localhost:3030/socket.io/' failed
```

### Interview Summary
**Investigación**:
- Frontend (`socket.ts`): Usa `socket.io-client` v4.8, conecta a `WS_URL=http://localhost:3030` con path `/socket.io`, espera evento `hello` al conectar
- Backend: NO tiene Socket.IO — 0 dependencias, 0 Gateways, nada
- Backend tiene EventEmitter2 con eventos de dominio que fluyen por el pipeline
- Todos los domain events tienen `eventName` que coincide (o se puede mapear) con los WS_EVENTS del frontend

**Mapeo de eventos Backend → Frontend:**

| Backend (EventEmitter2) | Frontend (WS_EVENTS) |
|---|---|
| `telegram.message.ingested` | `telegram.message.ingested` |
| `extraction.candidates.extracted` | `extraction.candidates.extracted` |
| `parsing.call.parsed` | `parsing.call.parsed` |
| `normalization.call.normalized` | `normalization.call.normalized` |
| `enrichment.token.enriched` | `enrichment.token.enriched` |
| `classification.token.classified` | `classification.token.classified` |
| `scoring.token.scored` | `scoring.token.scored` |
| `filters.token.approved` → se mapea a | `token-gating.decision.applied` |
| `filters.token.rejected` → se mapea a | `token-gating.decision.applied` |
| `publishing.telegram.published` | `publishing.telegram.published` |
| `publishing.telegram.failed` | `publishing.telegram.failed` |

### Metis Review
No disponible. Gap analysis manual aplicado.

---

## Work Objectives

### Core Objective
Implementar un WebSocket Gateway en el backend NestJS que permita al frontend recibir eventos del pipeline en tiempo real.

### Concrete Deliverables
- `apps/backend/package.json` — 2 nuevas dependencias
- `apps/backend/src/shared/ws/gateway/ws.gateway.ts` — gateway class
- `apps/backend/src/shared/ws/ws.module.ts` — módulo
- `apps/backend/src/app.module.ts` — importación de WsModule

### Definition of Done
- [ ] Build pasa sin errores (`npm run build -w apps/backend`)
- [ ] Conexión WebSocket exitosa desde el frontend (no más errors en console)
- [ ] Evento `hello` recibido al conectar

### Must Have
- Gateway que escuche todos los eventos del pipeline vía EventEmitter2 y los reenvíe a WS clients
- Mapeo correcto de nombres de eventos backend → frontend
- Soporte para eventos `join`/`leave` (room management)
- Evento `hello` al conectar con serverTime

### Must NOT Have (Guardrails)
- NO modificar ningún handler/controlador existente
- NO modificar el frontend (solo backend)
- NO procesar eventos de analytics (no existen en backend aún)
- NO agregar lógica de rooms/broadcast selectivo — v1 broadcast a todos
- NO cambiar la configuración de CORS existente

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO (no hay tests para WS)
- **Automated tests**: None — verificación vía build + Node.js REPL or curl
- **Framework**: N/A

### QA Policy
Every task MUST include agent-executed QA scenarios.

- **Build**: `npm run build -w apps/backend`
- **WS**: Node.js script que conecta vía socket.io-client y verifica hello event

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (dependencias - bloqueante):
├── Task 1: Instalar @nestjs/platform-socket.io + socket.io

Wave 2 (después de npm install — paralelo):
├── Task 2: Crear WsGateway (ws.gateway.ts)
├── Task 3: Crear WsModule (ws.module.ts)
└── Task 4: Actualizar AppModule

Wave FINAL:
└── Task 5: Build + verificación WS
```

---

## TODOs

- [ ] 1. Install Socket.IO dependencies

  **What to do**:
  - Ejecutar `npm install @nestjs/platform-socket.io socket.io -w apps/backend` desde la raíz del monorepo
  - Verificar que las dependencias aparecen en `apps/backend/package.json`

  **Must NOT do**:
  - No instalar en el root (usar `-w apps/backend`)
  - No instalar `@nestjs/websockets` (viene transitivamente con platform-socket.io)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (bloqueante)
  - **Blocks**: Tasks 2-5
  - **Blocked By**: None

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: Dependencies installed correctly
    Tool: Bash (grep)
    Steps:
      1. grep '"@nestjs/platform-socket.io"' apps/backend/package.json
      2. grep '"socket.io"' apps/backend/package.json
    Expected Result: Ambos aparecen en dependencies
    Evidence: .sisyphus/evidence/task-1-deps-installed.txt
  ```

  **Commit**: NO (se agrupa con task 2-4)

---

- [ ] 2. Create WsGateway

  **What to do**:
  - Crear `apps/backend/src/shared/ws/gateway/ws.gateway.ts`
  - Gateway class con `@WebSocketGateway` decorator:
    - CORS config: origin `['http://localhost:5173', 'http://127.0.0.1:5173']`, credentials: true
    - Namespace: `/`
  - `@WebSocketServer()` server: Server
  - Implementar `OnGatewayConnection`, `OnGatewayDisconnect`
  - `handleConnection(client)`:
    - Emitir `hello` event con `{ serverTime: new Date().toISOString(), missedSince: null, bufferedCount: 0 }`
  - `@SubscribeMessage('join')` handleJoin(client, payload: {room: string}):
    - `client.join(payload.room)`
  - `@SubscribeMessage('leave')` handleLeave(client, payload: {room: string}):
    - `client.leave(payload.room)`
  - Implementar `OnModuleInit`:
    - Usar `this.eventEmitter.onAny()` para escuchar TODOS los eventos
    - Mapear según tabla:
      ```
      'telegram.message.ingested' → 'telegram.message.ingested'
      'extraction.candidates.extracted' → 'extraction.candidates.extracted'
      'parsing.call.parsed' → 'parsing.call.parsed'
      'normalization.call.normalized' → 'normalization.call.normalized'
      'enrichment.token.enriched' → 'enrichment.token.enriched'
      'classification.token.classified' → 'classification.token.classified'
      'scoring.token.scored' → 'scoring.token.scored'
      'filters.token.approved' → 'token-gating.decision.applied'
      'filters.token.rejected' → 'token-gating.decision.applied'
      'publishing.telegram.published' → 'publishing.telegram.published'
      'publishing.telegram.failed' → 'publishing.telegram.failed'
      ```
    - Para cada evento mapeado, hacer `this.server.emit(wsEvent, eventPayload)`
    - El payload se obtiene de `event.toPayload?.()` si existe, o del event completo
  - Importar `EventEmitter2` de `@nestjs/event-emitter` vía constructor injection

  **Must NOT do**:
  - No agregar logs excesivos (usar Logger solo para debug)
  - No filtrar por rooms todavía — broadcast global

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — lógica simple pero integración con NestJS/EventEmitter2/Socket.IO
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with tasks 3, 4)
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:
  - `apps/frontend/src/shared/realtime/socket.ts:1-27` — Cliente Socket.IO del frontend (config, hello event)
  - `apps/frontend/src/shared/realtime/events.ts:122-135` — WS_EVENTS mapping que el frontend espera
  - `apps/frontend/src/shared/realtime/socket.ts:37-44` — ROOMS definidos para join/leave
  - `apps/backend/src/shared/kernel/domain-event.ts:13-28` — Base DomainEvent class (eventName, toPayload)
  - `apps/backend/src/telegram-publishing/infrastructure/event-bus/filters-approved.handler.ts:19` — Ejemplo de @OnEvent handler existente

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: Gateway file compiles (no TS errors)
    Tool: Bash (tsc)
    Preconditions: Dependencies installed
    Steps:
      1. npx -w apps/backend tsc --noEmit apps/backend/src/shared/ws/gateway/ws.gateway.ts 2>&1 | head -20
    Expected Result: No compilation errors
    Evidence: .sisyphus/evidence/task-2-gateway-compiles.txt
  ```

  **Commit**: YES (groups with 3, 4, 5)
  - Message: `feat(backend): add WebSocket gateway for real-time pipeline events`
  - Files: `apps/backend/src/shared/ws/gateway/ws.gateway.ts`, `apps/backend/src/shared/ws/ws.module.ts`, `apps/backend/src/app.module.ts`, `apps/backend/package.json`

---

- [ ] 3. Create WsModule

  **What to do**:
  - Crear `apps/backend/src/shared/ws/ws.module.ts`
  - `@Module({ providers: [WsGateway] })`
  - No necesita imports/exports — es un módulo simple que solo provee el gateway

  **Must NOT do**:
  - No exportar WsGateway (no se necesita en otros módulos)
  - No importar módulos externos

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: Module file compiles
    Tool: Bash (tsc)
    Steps:
      1. npx -w apps/backend tsc --noEmit apps/backend/src/shared/ws/ws.module.ts 2>&1 | head -20
    Expected Result: No compilation errors
    Evidence: .sisyphus/evidence/task-3-module-compiles.txt
  ```

  **Commit**: NO (groups with 2)

---

- [ ] 4. Update AppModule

  **What to do**:
  - En `apps/backend/src/app.module.ts`:
    - Agregar import: `import { WsModule } from 'shared/ws/ws.module';`
    - Agregar a `imports: [..., WsModule]` (después de DashboardModule)

  **Must NOT do**:
  - No cambiar el orden de otros imports
  - No modificar otra línea del archivo

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:
  - `apps/backend/src/app.module.ts:57-58` — DashboardModule import, donde agregar WsModule

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: AppModule compiles
    Tool: Bash (tsc)
    Steps:
      1. npx -w apps/backend tsc --noEmit apps/backend/src/app.module.ts 2>&1 | head -20
    Expected Result: No compilation errors
    Evidence: .sisyphus/evidence/task-4-appmodule-compiles.txt
  ```

  **Commit**: NO (groups with 2)

---

- [ ] 5. Verify full build and WebSocket connectivity

  **What to do**:
  - Ejecutar `npm run build -w apps/backend` y verificar que pasa
  - Iniciar backend (si no está corriendo) o verificar que está corriendo
  - Ejecutar script Node.js que:
    1. Conecta a `http://localhost:3030` via `socket.io-client`
    2. Espera evento `hello`
    3. Verifica que `hello.serverTime` es un string ISO date
    4. Desconecta
  - Si todo pasa, hacer commit

  **Must NOT do**:
  - No modificar código después de la verificación

  **Recommended Agent Profile**:
  - **Category**: `quick` — verify build + test WS connection
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depende de todo lo anterior)
  - **Blocks**: Final
  - **Blocked By**: Tasks 2, 3, 4

  **Acceptance Criteria**:

  **QA Scenarios**:
  ```
  Scenario: Full build passes
    Tool: Bash (npm run build)
    Steps:
      1. cd /repo && npm run build -w apps/backend
    Expected Result: Build exits with 0, no errors
    Evidence: .sisyphus/evidence/task-5-build-success.txt

  Scenario: WebSocket hello event received
    Tool: Bash (node -e "require('socket.io-client')...")
    Preconditions: Backend running on localhost:3030
    Steps:
      1. node -e "
        const { io } = require('socket.io-client');
        const socket = io('http://localhost:3030', { transports: ['websocket'] });
        socket.on('connect', () => { console.log('CONNECTED'); });
        socket.on('hello', (payload) => { console.log('HELLO', JSON.stringify(payload)); socket.close(); process.exit(0); });
        socket.on('connect_error', (err) => { console.error('ERROR', err.message); process.exit(1); });
        setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 5000);
      "
    Expected Result: Prints CONNECTED and HELLO with serverTime, exits 0
    Evidence: .sisyphus/evidence/task-5-ws-connect.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-5-build-success.txt`
  - [ ] `.sisyphus/evidence/task-5-ws-connect.txt`

  **Commit**: YES (groups with 2-4)
  - Message: `feat(backend): add WebSocket gateway for real-time pipeline events`
  - Files: `apps/backend/src/shared/ws/gateway/ws.gateway.ts`, `apps/backend/src/shared/ws/ws.module.ts`, `apps/backend/src/app.module.ts`, `apps/backend/package.json`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit**
  Verify all deliverables exist. Check: build passes (npm run build -w apps/backend), WS connects and receives hello, all event mappings are correct.
  Output: `Tasks [5/5] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **1-5**: `feat(backend): add WebSocket gateway for real-time pipeline events` - Gateway, Module, AppModule, package.json

---

## Success Criteria

### Verification Commands
```bash
# Build check
npm run build -w apps/backend

# WS connection test (requires backend running)
node -e "
const { io } = require('socket.io-client');
const socket = io('http://localhost:3030', { transports: ['websocket'] });
socket.on('hello', (p) => { console.log('OK', p.serverTime); socket.close(); process.exit(0); });
socket.on('connect_error', (e) => { console.error('FAIL', e.message); process.exit(1); });
setTimeout(() => process.exit(1), 5000);
"
```

### Final Checklist
- [ ] Build passes with no errors
- [ ] WebSocket connects successfully from client
- [ ] `hello` event received with serverTime
- [ ] No errors in browser console
- [ ] All event mappings correct (11 backend events → 10 frontend events)
