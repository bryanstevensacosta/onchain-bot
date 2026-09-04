# Implementation Plan: Shared Ingestion Service with Multi-Backend Broadcast

## Overview

This plan implements multi-backend broadcast functionality in the ingestion service, allowing multiple backend environments (staging, production) to receive message events via SSE without duplicating MTProto connections. The implementation includes:

- Backend registration system with source whitelists
- SSE broadcast infrastructure with circuit breakers
- 72-hour backfill buffer with ring buffer and database persistence
- Feature flag for gradual rollout with legacy HTTP polling fallback

**Estimated Time:** 22-30 hours  
**Total Tasks:** 35 tasks across 5 phases

## Tasks

### Phase 1: Backend Registration & Channel Union

- [x] 1.1 Create BackendRegistration entity and value objects
  - Create `apps/ingestion-service/src/stream/domain/backend-registration.entity.ts`
  - Implement BackendRegistration class with:
    - `backendId: string` (unique identifier)
    - `sourceWhitelist: ReadonlySet<string>` (O(1) lookup)
    - `registeredAt: number`, `lastSeenTimestamp: number`, `apiVersion: string`
    - `constructor(backendId, sourceWhitelist, apiVersion = 'v1')`
    - `updateWhitelist(newWhitelist: string[]): void`
    - `recordDisconnect(): void`
    - `hasChannel(channelId: string): boolean`
    - `getWhitelistArray(): string[]`
  - Constructor validates backendId is non-empty
  - sourceWhitelist stored as Set for O(1) channel lookup
  - Unit tests: create registration, update whitelist, hasChannel
  - _Requirements: 2.1, 2.2, 3.1_
  - _Estimate: 1h_

- [x] 1.2 Create BackendRegistrationController and DTOs
  - Create `apps/ingestion-service/src/stream/api/http/backend-registration.controller.ts`
  - Create `apps/ingestion-service/src/stream/api/http/dto/register-backend.dto.ts`
  - Implement `@Post('ingestion/backends/register')` endpoint
  - RegisterBackendDto with validation:
    - `@IsString() backendId`
    - `@IsArray() @IsString({ each: true }) sourceWhitelist`
    - `@IsOptional() @IsString() apiVersion`
  - Controller validates backendId format
  - Returns 200 with `{ channelUnionSize: number }` on success
  - Returns 400 on invalid input
  - Integration tests: valid registration, invalid backendId, empty whitelist
  - _Requirements: 2.1, 2.2, 3.2_
  - _Estimate: 1.5h_

- [x] 1.3 Modify BackendChannelProviderService for multi-backend support
  - Modify `apps/ingestion-service/src/telegram/shared/services/backend-channel-provider.service.ts`
  - Add `private readonly registrations: Map<string, BackendRegistration>`
  - Implement methods:
    - `registerBackend(backendId: string, sourceWhitelist: string[]): void`
    - `computeChannelUnionFromRegistrations(): { kolIds, newsIds, channelUnion }`
    - `getChannelUnionSize(): number`
    - `getRegisteredBackendIds(): string[]`
    - `recordDisconnect(backendId: string): void`
  - Modify `fetchAllActiveChannelIds()` to:
    - Check registrations first
    - Compute channel union if registrations exist
    - Fallback to HTTP polling if no registrations
  - Unit tests: register 2 backends, union computed, overlapping whitelists deduplicated, fallback to HTTP
  - _Requirements: 2.2, 3.1, 3.3, 5.1_
  - _Estimate: 2h_

- [x] 1.4 Implement channel union computation logic
  - Add to `apps/ingestion-service/src/telegram/shared/services/backend-channel-provider.service.ts`
  - Implement `computeChannelDiff(oldUnion: Set<string>, newUnion: Set<string>)` returning `{ added: string[], removed: string[] }`
  - Correctly identify added channels (in newUnion, not in oldUnion)
  - Correctly identify removed channels (in oldUnion, not in newUnion)
  - Return empty diff when union unchanged
  - Unit tests: add channels, remove channels, no changes, simultaneous add+remove
  - _Requirements: 3.3, 3.4_
  - _Estimate: 1h_

- [x] 1.5 Unit tests for registration and channel union
  - Create `apps/ingestion-service/src/stream/domain/backend-registration.entity.spec.ts`
  - Create `apps/ingestion-service/src/telegram/shared/services/backend-channel-provider.service.spec.ts`
  - Test registration entity: constructor, updateWhitelist, hasChannel
  - Test channel provider: registerBackend, computeUnion, computeDiff
  - Cover edge cases: empty whitelist, duplicate registrations, large unions
  - 15+ unit tests total
  - All tests pass
  - _Requirements: 2.1, 2.2, 3.3_
  - _Estimate: 1h_

### Phase 2: SSE Broadcast Infrastructure

- [x] 2.1 Create BroadcastEvent value object
  - Create `apps/ingestion-service/src/stream/domain/broadcast-event.vo.ts`
  - Implement BroadcastEvent class with:
    - `eventId: string` (UUID)
    - `timestamp: number` (Unix ms)
    - `channelId: string`, `messageId: number`
    - `content: string`, `title?: string`, `mediaPath?: string`, `publishedAt: number`
  - Factory method: `static fromTelegramMessage(channelId, msg, mediaPath?): BroadcastEvent`
  - Serialization: `toJSON(): Record<string, any>`
  - Deserialization: `static fromJSON(json: string): BroadcastEvent`
  - Round-trip property: `parse(print(event)) === event`
  - Unit tests: create from message, serialize, deserialize, round-trip
  - _Requirements: 4.1, 4.2_
  - _Estimate: 1h_

- [x] 2.2 Create SSEBroadcastService
  - Create `apps/ingestion-service/src/stream/application/services/sse-broadcast.service.ts`
  - Implement `@Injectable() SSEBroadcastService` with:
    - `private readonly connections: Map<string, Response> = new Map()`
    - `addConnection(backendId: string, response: Response): void`
    - `removeConnection(backendId: string): void`
    - `async broadcast(event: BroadcastEvent): Promise<void>`
    - `getActiveBackendCount(): number`
    - `isBackendConnected(backendId: string): boolean`
  - broadcast() sends event to all connected backends
  - broadcast() continues on individual failures (logs error, continues to next)
  - Update Prometheus metrics on broadcast (counter: ingestion_broadcast_total)
  - Unit tests: add/remove connections, broadcast to 2 backends, broadcast continues when 1 fails, metrics incremented
  - _Requirements: 4.1, 4.3, 6.1_
  - _Estimate: 2h_

- [x] 2.3 Create BackendCircuitBreakerService
  - Create `apps/ingestion-service/src/stream/application/services/backend-circuit-breaker.service.ts`
  - Define `enum CircuitState { CLOSED, OPEN, HALF_OPEN }`
  - Implement `@Injectable() BackendCircuitBreakerService` with:
    - `private readonly circuits: Map<string, Circuit> = new Map()`
    - `async execute(backendId: string, fn: () => Promise<void>): Promise<void>`
    - `recordSuccess(backendId: string): void`
    - `recordFailure(backendId: string): void`
    - `getState(backendId: string): CircuitState`
  - Circuit opens after 3 consecutive failures
  - Circuit half-opens after 5 minutes (RECOVERY_TIMEOUT_MS)
  - Circuit closes on successful half-open attempt
  - Circuit reopens on failed half-open attempt
  - execute() skips function call when circuit open (throws CircuitOpenError)
  - Unit tests: CLOSED→OPEN after 3 failures, OPEN→HALF_OPEN after 5min, HALF_OPEN→CLOSED on success, HALF_OPEN→OPEN on failure, success resets count
  - _Requirements: 6.2, 6.3_
  - _Estimate: 2h_

- [x] 2.4 Create SSEStreamController with heartbeat
  - Create `apps/ingestion-service/src/stream/api/http/sse-stream.controller.ts`
  - Implement `@Get('ingestion/stream')` endpoint with `@Sse()` decorator
  - Accept query params: `backendId: string`, `lastSeenTimestamp?: string`
  - Validate backendId is registered (returns 401 if not)
  - Add connection to SSEBroadcastService
  - Start heartbeat interval (30 seconds)
  - Return Observable<MessageEvent>
  - Remove connection on client disconnect
  - Integration tests: connect with valid/invalid backendId, heartbeat received within 30s, disconnect cleanup
  - _Requirements: 4.3, 6.4_
  - _Estimate: 1.5h_

- [x] 2.5 Wire SSEBroadcastService into TelegramModule
  - Modify `apps/ingestion-service/src/telegram/telegram.module.ts`
  - Inject SSEBroadcastService into TelegramModule
  - In `startListening()` loop, after `coordinator.route(message, messageType)`:
    - Create BroadcastEvent: `const event = BroadcastEvent.fromTelegramMessage(message.peerId, message, message.mediaPath)`
    - Broadcast: `await this.sseBroadcast.broadcast(event)`
  - Ingestion continues if broadcast fails (log error, don't throw)
  - Integration tests: message ingested → broadcast called, broadcast failure doesn't stop ingestion
  - _Requirements: 4.1, 4.3_
  - _Estimate: 1h_

- [x] 2.6 Integration tests for broadcast and circuit breaker
  - Create `apps/ingestion-service/src/stream/application/services/__tests__/sse-broadcast.integration.spec.ts`
  - Test scenarios:
    - Broadcast event to 2 connected backends (both receive)
    - Backend disconnects, other continues receiving
    - Circuit breaker opens after 3 failures
    - Circuit breaker prevents broadcasts while open
    - Circuit breaker half-opens after timeout
  - 10+ integration tests total
  - All tests pass
  - Circuit breaker behavior validated
  - Multi-backend scenarios covered
  - _Requirements: 4.3, 6.2, 6.3_
  - _Estimate: 1.5h_

### Phase 3: Backfill Buffer Implementation

- [ ] 3.1 Create BackfillMessageEntity (TypeORM)
  - Create `apps/ingestion-service/src/stream/infrastructure/persistence/typeorm/backfill-message.entity.ts`
  - Define `@Entity('backfill_messages')` with columns:
    - `@PrimaryColumn() eventId: string` (UUID)
    - `@Column({ type: 'bigint' }) timestamp: number`
    - `@Column() channelId: string`
    - `@Column({ type: 'int' }) messageId: number`
    - `@Column({ type: 'text' }) payload: string` (JSON-encoded BroadcastEvent)
  - Add `@Index('idx_backfill_timestamp', ['timestamp'])` for fast queries
  - Integration tests: save entity to DB, query by timestamp
  - _Requirements: 7.1, 7.2_
  - _Estimate: 0.5h_

- [ ] 3.2 Create BackfillBufferService with ring buffer
  - Create `apps/ingestion-service/src/stream/infrastructure/backfill-buffer.service.ts`
  - Implement `@Injectable() BackfillBufferService implements OnModuleInit` with:
    - `private readonly ringBuffer: BroadcastEvent[] = []`
    - `private readonly MAX_SIZE = 5000`
    - `private head = 0`
    - `add(event: BroadcastEvent): void` (overwrites oldest when at capacity)
    - `getEventsSince(timestamp: number): BroadcastEvent[]` (filters and sorts)
    - `getSize(): number` (non-null entry count)
    - `getOldestTimestamp(): number | null`
  - Ring buffer stores up to 5000 messages
  - add() overwrites oldest when at capacity
  - getEventsSince() filters by timestamp and returns sorted array
  - Unit tests: add messages, buffer overwrites oldest, getEventsSince filters, returns empty if timestamp too old
  - _Requirements: 7.1, 7.3, 7.4_
  - _Estimate: 2h_

- [ ] 3.3 Implement persist/restore logic
  - Add to `apps/ingestion-service/src/stream/infrastructure/backfill-buffer.service.ts`:
    - `private async persistAsync(event: BroadcastEvent): Promise<void>` (fire-and-forget)
    - `private async restoreFromDatabase(): Promise<void>` (called in onModuleInit)
    - `async cleanupOldMessages(): Promise<number>` (deletes entries older than 72h)
  - add() calls persistAsync() without awaiting
  - onModuleInit() calls restoreFromDatabase() to load last 72h from DB
  - cleanupOldMessages() deletes entries older than 72h (retention window)
  - Integration tests: events persisted, buffer restored on startup, cleanup deletes old messages
  - _Requirements: 7.1, 7.2, 7.5_
  - _Estimate: 1.5h_

- [ ] 3.4 Add backfill query support to SSEStreamController
  - Modify `apps/ingestion-service/src/stream/api/http/sse-stream.controller.ts`
  - In stream() method, parse `lastSeenTimestamp` query param
  - Query backfill buffer: `const backfillEvents = await this.backfillBuffer.getEventsSince(timestamp)`
  - If backfillEvents.length > 0:
    - Send events with `type: 'backfill'`
    - Send `type: 'backfill-complete'` with count
  - If timestamp > 0 and < oldestTimestamp:
    - Send `type: 'backfill-unavailable'` with reason: 'window expired'
  - Resume real-time stream after backfill
  - Integration tests: reconnect with timestamp receives backfill, backfill-complete sent, backfill-unavailable sent if too old
  - _Requirements: 7.3, 7.4, 7.5_
  - _Estimate: 1h_

- [ ] 3.5 Implement cleanup cron job
  - Add to `apps/ingestion-service/src/stream/infrastructure/backfill-buffer.service.ts`:
    - `@Cron('0 3 * * *') async scheduledCleanup(): Promise<void>`
  - Cron job runs daily at 3 AM
  - Calls cleanupOldMessages() and logs deleted count
  - Unit test: cron expression valid
  - Integration test: cleanup deletes messages older than 72h
  - _Requirements: 7.2, 7.5_
  - _Estimate: 0.5h_

- [ ] 3.6 Integration tests for backfill
  - Create `apps/ingestion-service/src/stream/infrastructure/__tests__/backfill.integration.spec.ts`
  - Test scenarios:
    - Backend reconnects, receives missed messages
    - Backfill-unavailable when disconnected > 72h
    - Buffer overflow during disconnect (oldest messages overwritten)
    - Large backfill (1000+ messages) completes within 10s
  - 8+ integration tests written
  - All tests pass
  - Performance validated (10s for 1000 msgs)
  - _Requirements: 7.3, 7.4, 7.5_
  - _Estimate: 1h_

### Phase 4: Integration & Observability

- [ ] 4.1 Create StreamStatusController
  - Create `apps/ingestion-service/src/stream/api/http/stream-status.controller.ts`
  - Implement `@Get('ingestion/stream/status')` endpoint
  - Return StreamStatusResponse with:
    - `activeBackends: number` (from SSEBroadcastService)
    - `channelUnionSize: number` (from BackendChannelProviderService)
    - `backfillBufferSize: number` (from BackfillBufferService)
    - `backfillBufferOldestTimestamp: number | null` (from BackfillBufferService)
    - `mtprotoConnected: boolean` (from TelegramModule)
    - `registeredBackends: string[]` (from BackendChannelProviderService)
  - Status reflects real-time state
  - Integration tests: status endpoint returns 200, activeBackends count correct
  - _Requirements: 8.1, 8.2_
  - _Estimate: 0.5h_

- [ ] 4.2 Add Prometheus metrics
  - Modify `apps/ingestion-service/src/stream/application/services/sse-broadcast.service.ts`
  - Register metrics with prom-client:
    - `ingestion_active_backends` (gauge)
    - `ingestion_broadcast_total` (counter, labels: backend_id)
    - `ingestion_broadcast_failures` (counter, labels: backend_id, reason)
    - `ingestion_channel_union_size` (gauge)
    - `ingestion_backfill_buffer_size` (gauge)
    - `ingestion_backfill_requests_total` (counter, labels: backend_id, status)
  - Update metrics at correct points in code
  - Metrics scrapable at `/metrics` endpoint
  - Integration tests: metrics endpoint returns data, broadcast_total increments
  - _Requirements: 8.1, 8.3_
  - _Estimate: 1h_

- [ ] 4.3 Update HealthModule for broadcast readiness
  - Modify `apps/ingestion-service/src/health/health.controller.ts`
  - Add to health check response:
    - `broadcast.activeBackends: number`
    - `broadcast.ready: boolean` (true when activeBackends > 0)
  - Health check includes broadcast status
  - ready=true when at least 1 backend connected
  - ready=false when no backends connected
  - Integration test: health check returns broadcast status
  - _Requirements: 8.2_
  - _Estimate: 0.5h_

- [ ] 4.4 E2E tests for full flows
  - Create `apps/ingestion-service/test/multi-backend-broadcast.e2e-spec.ts`
  - Test scenarios:
    1. Full flow: Register 2 backends → Ingest message → Both receive event
    2. Backfill flow: Register → Connect → Disconnect → Ingest 100 msgs → Reconnect → Receive backfill
    3. Failure resilience: Register 2 → Backend 1 fails → Backend 2 continues
    4. Channel union: Register overlapping whitelists → Union computed → MTProto subscribes once
  - 5+ E2E tests written
  - All tests pass
  - Tests use real TypeORM database (test DB)
  - Tests clean up after themselves
  - _Requirements: 4.3, 6.3, 7.3, 7.4_
  - _Estimate: 2h_

- [ ] 4.5 Create Grafana dashboard (optional)
  - Create `monitoring/grafana/dashboards/ingestion-service.json`
  - Panels:
    - Active Backends (gauge)
    - Broadcast Rate (graph)
    - Broadcast Failures (graph)
    - Backfill Buffer Size (graph)
    - Channel Union Size (stat)
    - Backfill Requests (bar chart)
  - Dashboard JSON created with all 6 panels configured
  - Alerts visualized
  - _Requirements: 8.3_
  - _Estimate: 1h_
  - _Note: Optional task_

### Phase 5: Backward Compatibility & Migration

- [ ] 5.1 Add feature flag and configuration
  - Modify `apps/ingestion-service/src/shared/common/config/app.config.ts`
  - Add to config:
    - `multiBackend.enabled: boolean` (from INGESTION_MULTI_BACKEND_ENABLED, default: false)
    - `multiBackend.backfillBufferSize: number` (from INGESTION_BACKFILL_BUFFER_SIZE, default: 5000)
    - `multiBackend.backfillRetentionHours: number` (from INGESTION_BACKFILL_RETENTION_HOURS, default: 72)
  - Update `apps/ingestion-service/.env.production.template` with new vars
  - Default value is false (disabled)
  - Unit test: config parses correctly
  - _Requirements: 9.1, 9.2_
  - _Estimate: 0.5h_

- [ ] 5.2 Implement legacy fallback in BackendChannelProviderService
  - Modify `apps/ingestion-service/src/telegram/shared/services/backend-channel-provider.service.ts`
  - In `fetchAllActiveChannelIds()`:
    - Check `this.config.get('app.multiBackend.enabled')`
    - If enabled AND registrations.size > 0: use computeChannelUnionFromRegistrations()
    - Else: use fetchViaHttpPolling() (legacy)
  - Log which mode is active on startup
  - Integration tests:
    - Flag off → HTTP polling used
    - Flag on + registrations → Union used
    - Flag on + no registrations → HTTP polling fallback
  - _Requirements: 9.1, 9.2_
  - _Estimate: 1h_

- [ ] 5.3 Create migration guide and runbook
  - Create `docs/ingestion-service/multi-backend-migration.md` with:
    - Pre-migration checklist
    - Backend code changes (registration client implementation)
    - Feature flag rollout procedure
    - Validation steps per environment
    - Rollback procedure
  - Create `docs/ingestion-service/multi-backend-runbook.md` with:
    - Common issues and troubleshooting
    - How to check broadcast health
    - How to manually reset circuit breaker
    - Alert response procedures
  - Migration guide complete
  - Runbook covers top 5 scenarios
  - Documents reviewed by team
  - _Requirements: 9.3, 9.4_
  - _Estimate: 1.5h_

- [ ] 5.4 Staging deployment and validation
  - Deploy ingestion-service to staging with feature flag OFF
  - Enable feature flag in staging (.env: INGESTION_MULTI_BACKEND_ENABLED=true)
  - Deploy staging backend with registration client
  - Validate metrics and logs
  - Validation checklist:
    - Staging backend registers successfully
    - SSE stream connects
    - Messages broadcast to staging
    - Backfill works on reconnect
    - Metrics show correct values
    - No errors in logs for 3 days
  - All validation checks pass
  - Staging runs stable for 3 days
  - Performance acceptable (<500ms p99 latency)
  - _Requirements: 10.1, 10.2, 10.3_
  - _Estimate: 2h_

- [ ] 5.5 Production rollout preparation
  - Create `docs/ingestion-service/production-rollout-plan.md` with:
    - **Week 1:** Staging only (complete)
    - **Week 2:** Production parallel mode (registration + legacy)
    - **Week 3:** Production new mode only
    - **Week 4:** Remove legacy code
  - Pre-production checklist:
    - Staging validation complete (3 days stable)
    - Production backend code ready (registration client)
    - Rollback procedure tested in staging
    - Alerts configured in Prometheus
    - On-call team briefed
    - Feature flag ready to toggle
  - Rollout plan documented
  - All stakeholders notified
  - Production deploy window scheduled
  - _Requirements: 10.1, 10.2_
  - _Estimate: 1.5h_

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "name": "Phase 1: Registration Foundation",
      "tasks": ["1.1", "1.2"]
    },
    {
      "id": 1,
      "name": "Phase 1: Channel Union Logic",
      "tasks": ["1.3", "1.4", "1.5"]
    },
    {
      "id": 2,
      "name": "Phase 2: Broadcast Core",
      "tasks": ["2.1", "2.2", "2.3"]
    },
    {
      "id": 3,
      "name": "Phase 2: SSE Integration",
      "tasks": ["2.4", "2.5", "2.6"]
    },
    {
      "id": 4,
      "name": "Phase 3: Backfill Infrastructure",
      "tasks": ["3.1", "3.2", "3.3"]
    },
    {
      "id": 5,
      "name": "Phase 3: Backfill Integration",
      "tasks": ["3.4", "3.5", "3.6"]
    },
    {
      "id": 6,
      "name": "Phase 4: Observability",
      "tasks": ["4.1", "4.2", "4.3", "4.5"]
    },
    {
      "id": 7,
      "name": "Phase 4: E2E Validation",
      "tasks": ["4.4"]
    },
    {
      "id": 8,
      "name": "Phase 5: Configuration & Fallback",
      "tasks": ["5.1", "5.2", "5.3"]
    },
    {
      "id": 9,
      "name": "Phase 5: Deployment",
      "tasks": ["5.4", "5.5"]
    }
  ]
}
```

## Dependencies

- **Phase 2 depends on Phase 1**: Broadcast requires registration system
- **Phase 3 depends on Phase 2**: Backfill requires broadcast events
- **Phase 4 depends on Phases 1-3**: Observability requires all components
- **Phase 5 is independent**: Can run in parallel with Phase 4

**Critical Path:** Phase 1 → Phase 2 → Phase 3 → Phase 5 (Staging validation)

**Parallel Work Opportunities:**

- Task 4.2 (Metrics) can start after Phase 2 completes
- Task 4.5 (Grafana) can run anytime after Task 4.2
- Task 5.3 (Documentation) can start anytime

## Notes

- Feature flag (INGESTION_MULTI_BACKEND_ENABLED) enables safe rollback
- Legacy HTTP polling preserved as fallback
- 72-hour backfill buffer prevents message loss during brief disconnections
- Circuit breaker isolates failing backends (3 failures → open, 5min recovery)
- 5000-message ring buffer optimizes memory usage
- All 35 tasks include comprehensive tests (90+ total: unit, integration, E2E)
