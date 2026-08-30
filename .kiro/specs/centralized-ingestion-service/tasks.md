# Implementation Plan: Centralized Ingestion Service

## Overview

This plan implements a standalone Telegram ingestion service that eliminates resource duplication across backend environments. The migration follows a phased approach with feature flags for safe rollback, preserving all architectural invariants (ToS compliance, message order, deduplication).

## Tasks

### Phase 1: Ingestion Service Core Infrastructure

- [x] 1.1 Create ingestion-service project structure
  - Create new NestJS application at `apps/ingestion-service/`
  - Set up tsconfig.json with backend-compatible path aliases
  - Configure nest-cli.json with `deleteOutDir: true`
  - Add package.json with dependencies (NestJS 11, gramjs, ioredis, TypeORM)
  - _Requirements: 6.1, 6.2_

- [x] 1.2 Extract and port MTProto layer components
  - Copy `TelegramMtprotoListenerAdapter` from backend to ingestion-service
  - Copy `TelegramClientManager` with session initialization logic
  - Copy `LastSeenManager` with Redis cursor tracking
  - Copy `FloodWaitHandler`, `FloodWaitCounter`, `FloodWaitSleepWindow`
  - Copy `IngestionSafetyConfig` configuration loader
  - Copy `MtprotoMediaDownloader` with download logic
  - Update imports to use ingestion-service paths
  - _Requirements: 1.1, 11.1, 11.2, Invariant 6_

- [x] 1.3 Extract and port seeder components
  - Copy `KolSeeder` from backend to ingestion-service
  - Copy `CryptoNewsSeeder` from backend to ingestion-service
  - Update seeders to use ingestion-service repositories
  - Preserve idempotent seeding logic
  - _Requirements: 1.1_

- [x] 1.4 Set up ingestion-service configuration
  - Create `AppConfig` interface for ingestion-service
  - Implement environment variable validation (Joi schemas)
  - Add MTProto credentials config (API_ID, API_HASH, SESSION)
  - Add channel seeder config (SEED_KOLS, SEED_NEWS)
  - Add API server config (PORT=3031, HOST, BASE_URL)
  - Add Redis config (HOST, PORT, DB, PASSWORD)
  - Add safety config (MAX_CHANNELS, POLL_INTERVAL, JITTER, SLEEP_WINDOW)
  - Load `config/ingestion.config.json` with safe defaults
  - _Requirements: 6.2, 11.6_

- [x] 1.5 Implement StreamService for SSE connection management
  - Create `StreamService` with client Map<clientId, ServerResponse>
  - Implement `addClient(clientId, response)` with SSE headers
  - Implement `broadcast(payload)` with sequential iteration (Invariant 2)
  - Implement `removeClient(clientId)` cleanup
  - Implement `sendEvent(response, event, data)` helper
  - Add heartbeat cron job (every 30s) for keep-alive
  - _Requirements: 2.1, 2.3, Invariant 2_

- [x] 1.6 Write unit tests for StreamService
  - Test `addClient()` - verify SSE headers and connection:ready event
  - Test `broadcast()` - verify sequential delivery to all clients
  - Test `removeClient()` - verify cleanup
  - Test heartbeat - verify periodic health:ping events
  - Mock ServerResponse with write() spy
  - _Requirements: 2.3_

### Phase 2: Message Broadcasting Pipeline

- [x] 2.1 Modify IngestionCoordinator for broadcast mode
  - Copy `IngestionCoordinator` from backend to ingestion-service
  - Remove direct use case calls (KolOrchestrator, StoreNewsMessage)
  - Implement `route(raw)` to construct MessagePayload (text excluded per Invariant 1)
  - Call `StreamService.broadcast(payload)` instead of use cases
  - Implement `buildMediaUrl(channelId, messageId, index)` helper
  - _Requirements: 2.3, Invariant 1, Invariant 5_

- [x] 2.2 Implement MessagePayload transformation logic
  - Create `SseMessageTransformer` service
  - Implement `toPayload(raw: TelegramRawMessage): MessagePayload`
  - Exclude `text` field from payload (Invariant 1)
  - Map media to URLs using `/api/media/:channelId/:messageId/:index` format
  - Preserve entities, groupedId, occurredAt
  - _Requirements: Invariant 1, Invariant 5, GAP 4_

- [x] 2.3 Write unit tests for message transformation
  - Test `toPayload()` - verify text excluded
  - Test media URL construction - verify format matches GAP 4
  - Test entities preservation
  - Test groupedId handling
  - _Requirements: Invariant 1, Invariant 5_

- [x] 2.4 Implement deduplication in broadcast pipeline
  - Ensure `LastSeenManager.isAlreadySeen()` check before broadcast
  - Skip duplicate messages (same channelId + messageId)
  - Update cursor after successful broadcast
  - _Requirements: Invariant 3, Invariant 6_

- [x] 2.5 Write integration tests for deduplication
  - Test duplicate messageId - verify second is skipped
  - Test cursor persistence - restart service, verify no re-broadcast
  - Mock Redis for cursor tracking
  - _Requirements: Invariant 3_

### Phase 3: HTTP API Endpoints

- [x] 3.1 Implement StreamController for SSE endpoint
  - Create `StreamController` at `/api/ingestion`
  - Implement `GET /stream` with @Sse() decorator
  - Call `StreamService.addClient()` with generated clientId
  - Handle request.on('close') for cleanup
  - Send initial connection:ready event
  - _Requirements: 2.1, 2.2_

- [x] 3.2 Implement MediaController for file serving
  - Create `MediaController` at `/api/media`
  - Implement `GET /:channelId/:messageId/:index` endpoint
  - Read file from `uploads/crypto-news/media/{channelId}/`
  - Match file with pattern `{messageId}-{index}.*`
  - Return 404 for missing files (GAP 4)
  - Set Content-Type from MIME detection
  - Set Content-Length from file stat
  - Set ETag from mtime
  - Set Cache-Control: public, max-age=31536000
  - Stream file with fs.createReadStream()
  - _Requirements: 4.1, 4.2, 4.3, 4.5, GAP 4_

- [x] 3.3 Write unit tests for MediaController
  - Test file serving - verify headers and streaming
  - Test 404 for missing file
  - Test MIME type detection
  - Test caching headers
  - Mock fs with test fixtures
  - _Requirements: 4.2, 4.3, 4.5_

- [x] 3.4 Implement HealthController
  - Create `HealthController` at `/api`
  - Implement `GET /health` endpoint
  - Query `TelegramClientManager.isConnected()` and `isAuthorized()`
  - Query `StreamService.getClientCount()`
  - Query `FloodWaitCounter` for 24h metrics
  - Return HTTP 200 if MTProto connected, else 503
  - Include JSON with mtproto, channels, clients, floodWait, uptime
  - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_

- [x] 3.5 Implement Channels metadata endpoint
  - Add `GET /channels` to HealthController
  - Query `TelegramClientManager.getChannelMetadata()`
  - Return JSON array with id, title, participantCount, type, joinedAt
  - _Requirements: 5.3_

- [x] 3.6 Write integration tests for Health endpoints
  - Test `/health` - verify 200 when connected
  - Test `/health` - verify 503 when disconnected
  - Test `/channels` - verify metadata structure
  - Mock TelegramClientManager states
  - _Requirements: 5.1, 5.4, 5.5_

- [x] 3.7 Implement Backfill endpoint with SSE streaming
  - Add `GET /api/backfill/:channelId` to StreamController
  - Accept query param `?limit=N` (default 100)
  - Call `TelegramListenerPort.backfill(channelId, limit)`
  - Stream results via SSE (text/event-stream)
  - Send event: backfill:message for each message
  - Send event: backfill:complete with total count
  - Return empty stream if channel not found
  - _Requirements: GAP 1_

- [x] 3.8 Write integration tests for backfill endpoint
  - Test backfill with limit - verify SSE stream format
  - Test backfill:complete event
  - Test unknown channel - verify empty stream
  - Mock TelegramListenerPort.backfill()
  - _Requirements: GAP 1_

### Phase 4: Observability and Monitoring

- [x] 4.1 Implement structured logging
  - Use Winston logger with JSON format
  - Log message:received with channelId, messageId, hasMedia, mediaCount
  - Log sse:client:connected/disconnected with clientId, totalClients
  - Log flood_wait:detected with waitSeconds, count24h, backoffMs
  - Log media:download:failed with error and stack
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 4.2 Implement Prometheus metrics
  - Add @nestjs/prometheus dependency
  - Expose metrics at `/metrics` endpoint
  - Add ingestion_mtproto_connected (gauge)
  - Add ingestion_messages_received_total (counter, labels: channelId, type)
  - Add ingestion_messages_broadcast_total (counter)
  - Add ingestion_messages_broadcast_duration_seconds (histogram)
  - Add ingestion_sse_clients_connected (gauge)
  - Add ingestion_flood_wait_count_24h (gauge)
  - Add ingestion_media_downloads_total (counter)
  - Add ingestion_api_request_duration_seconds (histogram)
  - _Requirements: 9.5, 11.7_

- [x] 4.3 Implement disconnection window tracking
  - Add `DisconnectionTracker` service
  - Track disconnected clients with clientId, disconnectedAt, reconnectedAt
  - Expose via `/health` endpoint under `clients.disconnectionWindows`
  - Add WARNING flag when any window duration >60s
  - _Requirements: GAP 3_

- [x] 4.4 Write unit tests for DisconnectionTracker
  - Test tracking disconnection window
  - Test WARNING flag when duration >60s
  - Test reconnection clears window
  - _Requirements: GAP 3_

### Phase 5: Deployment and Docker Configuration

- [x] 5.1 Create Dockerfile for ingestion-service
  - Use Node 22 Alpine base image
  - Copy package.json and install dependencies
  - Copy source code
  - Build NestJS application
  - Set CMD to run built dist/main.js
  - _Requirements: 6.1_

- [x] 5.2 Update docker-compose.prod.yml with ingestion-service
  - Add ingestion-service to existing docker-compose.prod.yml
  - Use shared network: onchain-net (GAP 2)
  - Map port 3031:3031
  - Mount uploads volume: ./uploads:/app/uploads
  - Mount config volume: ./config:/app/config
  - Add depends_on: redis, postgres
  - Set restart: unless-stopped
  - _Requirements: 6.3, 6.6, GAP 2_

- [x] 5.3 Create ingestion-service environment template
  - Create `.env.ingestion.example` with all required vars
  - Document MTProto credentials (API_ID, API_HASH, SESSION)
  - Document channel seeder config (SEED_KOLS, SEED_NEWS)
  - Document API config (PORT, HOST, BASE_URL)
  - Document Redis config
  - Document safety config
  - _Requirements: 6.2_

- [x] 5.4 Create ingestion.config.json with safe defaults
  - Place in `config/ingestion.config.json`
  - Set maxChannels: 50
  - Set pollIntervalBaseMs: 90000 (90s)
  - Set jitterPercent: 30
  - Set sleepWindow: 04:00-08:00 UTC
  - Set floodProtection: initial 5s, multiplier 2x, max 1h, 5 attempts, threshold 10/24h
  - _Requirements: 11.6_

### Phase 6: Backend SSE Client Adapter

- [x] 6.1 Implement SseIngestionClientAdapter
  - Create `SseIngestionClientAdapter` implementing `TelegramListenerPort`
  - Implement `subscribe(channelIds)` with fetch() SSE connection
  - Parse SSE events (connection:ready, message:ingested, health:ping)
  - Convert MessagePayload to TelegramRawMessage (text empty per Invariant 1)
  - Filter by subscribed channelIds
  - Implement exponential backoff reconnection (1s → 30s cap)
  - Yield TelegramRawMessage via AsyncGenerator
  - _Requirements: 3.1, 3.2, 3.3, 2.4, Invariant 1_

- [x] 6.2 Implement backfill method in SSE client
  - Implement `backfill(channelId, limit)` method
  - Call `GET /api/backfill/:channelId?limit=N`
  - Consume SSE stream (backfill:message events)
  - Accumulate messages until backfill:complete
  - Return Promise<TelegramRawMessage[]>
  - _Requirements: GAP 1_

- [x] 6.3 Implement no-op methods for interface compatibility
  - Implement `disconnect()` - close EventSource
  - Implement `resolveChannelMetadata(channelId)` - fetch from /api/channels
  - Implement `joinChannel(channelId)` - log warning (not supported in SSE mode)
  - _Requirements: 3.4, Invariant 4_

- [x] 6.4 Write unit tests for SseIngestionClientAdapter
  - Test subscribe() - mock SSE stream, verify yielded messages
  - Test payloadToRawMessage() - verify media URL format
  - Test calculateBackoff() - verify exponential backoff math
  - Test parseSSE() - verify event parsing with malformed JSON edge cases
  - Test backfill() - verify SSE stream consumption
  - _Requirements: 3.2, 3.3, GAP 1_

- [x] 6.5 Create IngestionClientModule with feature flag
  - Create `IngestionClientModule.forRoot()` dynamic module
  - Read `INGESTION_MODE` from ConfigService ('local' or 'remote')
  - Return `SseIngestionClientAdapter` when mode=remote
  - Return `TelegramMtprotoListenerAdapter` when mode=local (rollback path)
  - Log selected mode at startup
  - _Requirements: 7.1, 7.3, 7.4_

- [x] 6.6 Write integration tests for mode switching
  - Test remote mode - verify SSE adapter instantiated
  - Test local mode - verify MTProto adapter instantiated
  - Test mode from env var
  - _Requirements: 7.1_

### Phase 7: Migration Preparation and Validation

- [ ] 7.1 Create session validation script
  - Create `scripts/validate-session-migration.sh`
  - Check backend .env has NO TELEGRAM_MTPROTO_SESSION
  - Check backend .env has NO MTPROTO_API_ID/API_HASH
  - Check ingestion-service .env HAS session vars
  - Exit 1 if validation fails
  - _Requirements: GAP 6_

- [x] 7.2 Create pre-deploy checklist document
  - Create `docs/deployment/ingestion-service-checklist.md`
  - List all pre-deploy validation steps
  - Include session migration validation
  - Include docker-compose verification
  - Include environment variable verification
  - Include rollback procedure
  - _Requirements: 12.5, GAP 6_

- [x] 7.3 Create deployment runbook
  - Create `docs/deployment/ingestion-service-runbook.md`
  - Document Phase 1: Deploy ingestion-service standalone
  - Document Phase 2: Migrate staging backend to SSE
  - Document Phase 3: Side-by-side validation (48h)
  - Document Phase 4: Migrate production backend to SSE
  - Document Phase 5: Rollback procedure (<5min recovery)
  - Include health check commands
  - Include log inspection commands
  - Include metric query examples
  - _Requirements: 12.5, 7.2, 7.4, 7.5_

- [ ] 7.4 Create monitoring playbook
  - Create `docs/monitoring/ingestion-service-playbook.md`
  - Document alert conditions and responses
  - Document Prometheus alert rules
  - Document log query patterns
  - Document troubleshooting FAQ
  - _Requirements: 9.6, 11.7, 12.5_

### Phase 8: End-to-End Testing

- [ ] 8.1 Create E2E test for full message flow
  - Deploy ingestion-service in test mode
  - Connect backend SSE client
  - Inject test message via mocked MTProto
  - Verify SSE broadcast received
  - Verify message format matches TelegramRawMessage
  - Verify media URLs accessible
  - Verify latency <500ms
  - _Requirements: 8.1, 10.5, 12.2_

- [ ] 8.2 Create E2E test for reconnection handling
  - Connect SSE client
  - Disconnect client mid-stream
  - Verify exponential backoff
  - Verify reconnection within 30s
  - Verify no message loss after reconnect
  - _Requirements: 2.4, 8.4_

- [ ] 8.3 Create load test for concurrent clients
  - Spawn 10 SSE clients
  - Inject 100 messages/min
  - Measure broadcast latency (p50, p95, p99)
  - Measure memory usage over 1 hour
  - Verify p95 latency <500ms
  - Verify zero disconnections
  - _Requirements: 8.1, 8.2, 8.5_

- [ ] 8.4 Create side-by-side validation test
  - Run prod backend (MTProto mode)
  - Run staging backend (SSE mode)
  - Compare message counts in database
  - Compare KOL extraction results
  - Compare crypto-news keyword matches
  - Verify ≥99.9% message parity
  - _Requirements: 12.2, 12.3_

### Phase 9: Production Deployment (Phased Rollout)

- [ ] 9.1 Phase 1: Deploy ingestion-service standalone
  - Run session validation script
  - Deploy ingestion-service to droplet (docker-compose up ingestion-service)
  - Verify health endpoint: curl http://localhost:3031/api/health → 200
  - Verify MTProto connected: mtproto.connected: true
  - Verify channels seeded: channels.total > 0
  - Monitor logs for 24h (zero FLOOD_WAIT errors)
  - _Requirements: 7.2, GAP 6_

- [ ] 9.2 Phase 2: Migrate staging backend to SSE
  - Update staging .env: INGESTION_MODE=remote
  - Set staging .env: INGESTION_REMOTE_URL=http://ingestion-service:3031
  - Remove MTProto vars from staging .env
  - Restart staging backend container
  - Verify "SSE connection established" log
  - Verify no MTProto initialization logs
  - Verify messages arrive via SSE
  - Verify crypto-news messages in staging DB
  - Verify KOL extraction pipeline runs
  - _Requirements: 7.2_

- [ ] 9.3 Phase 3: Side-by-side validation (48h)
  - Keep prod in INGESTION_MODE=local (MTProto)
  - Keep staging in INGESTION_MODE=remote (SSE)
  - Monitor both for 48h
  - Compare message counts in database
  - Compare KOL extraction results
  - Compare crypto-news keyword matches
  - Compare media download counts
  - Verify ≥99.9% message parity
  - Verify zero SSE disconnections >1min
  - Verify staging memory usage -300MB vs prod
  - _Requirements: 7.2, 12.2, 12.3_

- [ ] 9.4 Phase 4: Migrate production backend to SSE
  - Schedule cutover during low-traffic window (02:00 UTC Sunday)
  - Update prod .env: INGESTION_MODE=remote
  - Set prod .env: INGESTION_REMOTE_URL=http://ingestion-service:3031
  - Remove MTProto vars from prod .env
  - Restart prod backend container
  - Monitor for 1 hour:
    - Health endpoint status
    - Message arrival rate
    - SSE connection stability
    - Dashboard functionality
  - Verify prod receives 100% messages within 5min
  - Verify zero user-facing errors
  - Verify monitoring alerts silent
  - _Requirements: 7.2, 12.4_

- [ ] 9.5 Phase 5: Document rollback procedure
  - If issues detected, update prod .env: INGESTION_MODE=local
  - Restore MTProto vars from backup
  - Restart prod backend
  - Verify MTProto connection established
  - Verify message processing resumes
  - Time to restore: <5min
  - Investigate ingestion-service issue
  - _Requirements: 7.4, 7.5, 12.4_

- [ ] 9.6 Final checkpoint - Production stable for 7 days
  - Monitor production for 7 days
  - Track incidents and resolutions
  - Document any edge cases discovered
  - Update troubleshooting FAQ
  - Confirm success criteria met (12.1-12.6)
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Feature flag (INGESTION_MODE) enables fast rollback within 5 minutes
- Media storage reduced by 66% (3x → 1x duplication) upon completion
- Zero breaking changes - backward compatible via feature flag
- All anti-ban protection preserved (staggered polling, FLOOD_WAIT handling, sleep windows)
- ToS compliance maintained (fix-1: raw text never crosses event bus)
- Message order preserved (Invariant 2: sequential broadcast)
- Deduplication maintained (Invariant 3: LastSeenManager cursor tracking)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "5.3", "5.4"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "1.6", "2.4", "2.5"] },
    { "id": 3, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 4, "tasks": ["3.1", "3.7", "3.8"] },
    { "id": 5, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6"] },
    { "id": 6, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 7, "tasks": ["5.1", "5.2"] },
    { "id": 8, "tasks": ["6.1", "6.2", "6.3", "6.4"] },
    { "id": 9, "tasks": ["6.5", "6.6"] },
    { "id": 10, "tasks": ["7.1", "7.2", "7.3", "7.4"] },
    { "id": 11, "tasks": ["8.1", "8.2", "8.3", "8.4"] },
    { "id": 12, "tasks": ["9.1"] },
    { "id": 13, "tasks": ["9.2"] },
    { "id": 14, "tasks": ["9.3"] },
    { "id": 15, "tasks": ["9.4"] },
    { "id": 16, "tasks": ["9.5"] },
    { "id": 17, "tasks": ["9.6"] }
  ]
}
```

### Phase 10: Media Retention and Cleanup (Additional)

- [ ] 10.1 Port MediaRetentionCleanupScheduler to ingestion-service
  - Copy `MediaRetentionCleanupScheduler` from backend to ingestion-service
  - Migrate cron job to run hourly in ingestion-service
  - Update to query media table via ingestion-service database connection
  - Preserve advisory lock mechanism (MEDIA_RETENTION_ADVISORY_LOCK_ID=7_421_372)
  - Preserve batch cleanup logic (CLEANUP_BATCH_SIZE=1000)
  - _Requirements: GAP 4 (Media lifecycle), Design § 2.1.1_
  - _Note: Cleanup runs in ingestion-service, not backends_

- [ ] 10.2 Configure media retention policy in ingestion-service
  - Add `CRYPTO_NEWS_MEDIA_RETENTION_HOURS` to AppConfig (default 72h)
  - Clamp minimum to 1 hour at config seam
  - Document retention policy in deployment docs
  - _Requirements: GAP 4, Design § 6.1_

- [ ] 10.3 Implement orphan file cleanup (disk vs DB reconciliation)
  - Add `cleanupOrphanFiles()` method to MediaRetentionCleanupScheduler
  - Walk `uploads/crypto-news/media/` directory tree
  - Query database for all valid file_path entries
  - Delete files on disk NOT in database and older than 24h
  - Log count of orphaned files removed
  - _Requirements: GAP 4_
  - _Note: Addresses file accumulation from interrupted downloads_

- [ ] 10.4 Write unit tests for media retention
  - Test batch cleanup with retention window
  - Test orphan file detection and removal
  - Test advisory lock prevents concurrent cleanup
  - Mock filesystem and database queries
  - _Requirements: GAP 4_

### Phase 11: Raw Text Storage and Backend Retrieval (Additional)

- [ ] 11.1 Create telegram_raw_messages table in ingestion-service
  - Create migration for `telegram_raw_messages` table
  - Schema: id (UUID PK), channel_id (string), message_id (integer), text (text), ingested_at (timestamp)
  - Add unique constraint on (channel_id, message_id)
  - Add index on ingested_at for TTL cleanup
  - _Requirements: Invariant 1 (Raw text isolation)_
  - _Note: Separate from crypto_news_messages - this is for KOL messages_

- [ ] 11.2 Store raw text in ingestion-service during broadcast
  - Modify IngestionCoordinator.route() to insert into telegram_raw_messages
  - Store channelId, messageId, text, occurredAt
  - Handle INSERT conflicts (ON CONFLICT DO NOTHING)
  - Log storage failures without blocking broadcast
  - _Requirements: Invariant 1_

- [ ] 11.3 Implement raw text retrieval endpoint
  - Add `GET /api/messages/:channelId/:messageId/text` to StreamController
  - Query telegram_raw_messages table
  - Return JSON: `{ text: string, ingestedAt: string }`
  - Return 404 if not found or expired (past retention window)
  - _Requirements: Invariant 1_

- [ ] 11.4 Update backend KolIngestionOrchestrator to fetch text
  - Modify `onMessageReceived(raw)` to accept raw WITHOUT text field
  - Add HTTP client to fetch text from ingestion-service when needed
  - Cache text in memory for the current message processing
  - Update ExtractFromMessageUseCase call to include fetched text
  - Update ParseFromCandidatesUseCase call to include fetched text
  - _Requirements: Invariant 1, Design § 2.2 Backend Components_

- [ ] 11.5 Write integration tests for text isolation
  - Test broadcast excludes text field
  - Test text retrieval endpoint returns correct text
  - Test backend fetches text during processing
  - Test 404 for expired text
  - _Requirements: Invariant 1_

### Phase 12: Dashboard WebSocket Compatibility (Additional)

- [ ] 12.1 Verify DashboardGateway remains unchanged
  - Confirm DashboardGateway still receives events from event bus
  - Confirm no code changes needed in dashboard gateway
  - Document that KPI flow now includes SSE hop: Ingestion → Backend → EventBus → Dashboard
  - _Requirements: GAP 5 (Dashboard WebSocket)_

- [ ] 12.2 Measure end-to-end KPI latency
  - Inject test message in ingestion-service
  - Measure time until dashboard WebSocket receives event
  - Target: <1000ms end-to-end (includes SSE hop ~50ms)
  - Document measured latency in deployment docs
  - _Requirements: GAP 5, Design § 4.6_

- [ ] 12.3 Create E2E test for dashboard real-time updates
  - Deploy ingestion-service + backend + dashboard
  - Connect dashboard WebSocket client
  - Inject test message via MTProto mock
  - Verify dashboard receives KPI update within 1s
  - _Requirements: GAP 5_

### Phase 13: Shared Docker Volume Configuration (Additional)

- [ ] 13.1 Configure shared uploads volume in docker-compose
  - Define named volume `onchain-bot-uploads` in docker-compose.prod.yml
  - Mount to ingestion-service at `/app/uploads`
  - Mount to backend at `/app/uploads` (read-only for media access if needed)
  - Ensure volume persists across `docker compose build --no-cache`
  - _Requirements: GAP 2 (Docker networking), Design § 7.1_

- [ ] 13.2 Update nginx configuration for media serving (if applicable)
  - Add location block for `/api/media/*` proxying to ingestion-service:3031
  - Enable proxy caching for media files
  - Set proxy_cache_valid for 200 responses (1 year)
  - Document nginx config changes in deployment docs
  - _Requirements: 4.5 (Caching headers)_
  - _Note: Only if nginx reverse proxy is used in production_

- [ ] 13.3 Document volume backup strategy
  - Document uploads volume backup procedure
  - Include in deployment runbook
  - Recommend backup before `docker compose build --no-cache`
  - _Requirements: GAP 2, Design § 13.3_

### Phase 14: CI/CD Integration (Additional)

- [ ] 14.1 Add ingestion-service to GitHub Actions workflow
  - Update `.github/workflows/deploy.yml` to include ingestion-service
  - Add ingestion-service build step to test job
  - Add ingestion-service docker build to deploy job
  - Add ingestion-service health check after deploy
  - _Requirements: Design § 7.1 Deployment, GAP 2_

- [ ] 14.2 Add session validation to CI/CD
  - Call `scripts/validate-session-migration.sh` in deploy job
  - Block deployment if validation fails
  - Log validation results
  - _Requirements: GAP 6 (Session migration)_

- [ ] 14.3 Add ingestion-service smoke tests to deploy workflow
  - Test health endpoint returns 200
  - Test MTProto connection status
  - Test channels endpoint returns data
  - Test SSE endpoint accepts connection
  - Fail deployment if any smoke test fails
  - _Requirements: Design § 8 E2E Testing_

### Phase 15: Production Monitoring Alerts (Additional)

- [ ] 15.1 Create Prometheus alert rules for ingestion-service
  - Create `alerts/ingestion-service.yml` with alert definitions
  - Add IngestionMtprotoDisconnected (>5min) → CRITICAL
  - Add IngestionHighFloodWaitRisk (>3 consecutive) → CRITICAL
  - Add IngestionZeroClients (>10min) → WARNING
  - Add IngestionHighLatency (p95 >1s) → WARNING
  - Add IngestionMediaStorageHigh (>80%) → WARNING
  - _Requirements: 9.6, 11.7, Design § 11.3_

- [ ] 15.2 Integrate alerts with existing alerting system
  - Add ingestion-service alerts to Prometheus config
  - Configure alert routing to Slack/PagerDuty
  - Document alert response procedures in monitoring playbook
  - _Requirements: 9.6, Design § 11.3_

- [ ] 15.3 Create Grafana dashboard for ingestion-service
  - Create dashboard with panels for:
    - MTProto connection status
    - Message throughput (messages/min)
    - SSE client count
    - Broadcast latency (p50, p95, p99)
    - FLOOD_WAIT events count
    - Media download rate
  - Export dashboard JSON to `monitoring/dashboards/ingestion-service.json`
  - _Requirements: 9.5, Design § 11_

### Phase 16: Performance Optimization and Tuning (Additional)

- [ ] 16.1 Implement SSE compression
  - Add gzip compression for SSE responses
  - Set `Content-Encoding: gzip` header
  - Measure bandwidth reduction (expect ~70% reduction for JSON payloads)
  - _Requirements: 8.2 (Performance), Design § 12_

- [ ] 16.2 Optimize media serving with sendfile
  - Replace fs.createReadStream() with res.sendFile() in MediaController
  - Enable zero-copy sendfile syscall for better performance
  - Measure latency improvement (expect ~20% reduction)
  - _Requirements: 8.3 (Media serving <200ms)_

- [ ] 16.3 Implement connection pooling for Redis
  - Configure Redis connection pool (min 2, max 10 connections)
  - Monitor connection pool usage
  - Document tuning parameters in deployment docs
  - _Requirements: Invariant 6 (LastSeenManager Redis)_

- [ ] 16.4 Benchmark and document resource usage
  - Run ingestion-service for 24h under production load
  - Measure: CPU usage, memory usage, disk I/O, network bandwidth
  - Document baseline metrics in deployment docs
  - Compare with backend MTProto mode (expect -66% media storage, -40% memory)
  - _Requirements: 12.1 (Resource reduction), Design § 12.3_

### Phase 17: Security Hardening (Additional)

- [ ] 17.1 Implement rate limiting for public endpoints
  - Add rate limiting middleware to MediaController
  - Limit: 100 requests/min per IP for /api/media/*
  - Limit: 10 requests/min per IP for /api/backfill/*
  - Return 429 Too Many Requests when exceeded
  - _Requirements: Design § 13 Security_

- [ ] 17.2 Add authentication for SSE and backfill endpoints (optional)
  - Generate shared secret for backend→ingestion communication
  - Add `Authorization: Bearer <token>` header validation
  - Reject unauthorized requests with 401
  - Document token rotation procedure
  - _Requirements: Design § 13.1 Network Security_
  - _Note: Optional for MVP if ingestion-service is internal-only_

- [ ] 17.3 Implement media path sanitization
  - Validate channelId, messageId, index params in MediaController
  - Block directory traversal attempts (../, ..\, etc.)
  - Return 400 for invalid params
  - Log security violations
  - _Requirements: Design § 13.3 Media File Access_

- [ ] 17.4 Add security headers to all HTTP responses
  - Set X-Content-Type-Options: nosniff
  - Set X-Frame-Options: DENY
  - Set X-XSS-Protection: 1; mode=block
  - Set Content-Security-Policy for API endpoints
  - _Requirements: Design § 13_

### Phase 18: Documentation and Knowledge Transfer (Additional)

- [ ] 18.1 Create architecture decision record (ADR)
  - Document decision to use SSE over WebSocket/gRPC
  - Document decision to use path-based media URLs
  - Document decision to accept message loss during reconnection
  - Document decision to keep DashboardGateway in backend
  - Place in `docs/adr/001-centralized-ingestion-service.md`
  - _Requirements: Design § 14 Open Questions_

- [ ] 18.2 Update project README with ingestion-service
  - Add ingestion-service to architecture diagram
  - Document new ports (3031)
  - Update environment setup instructions
  - Update deployment instructions
  - _Requirements: 12.5 (Complete documentation)_

- [ ] 18.3 Create troubleshooting guide
  - Document common issues and solutions:
    - MTProto connection failures
    - SSE reconnection loops
    - Media 404 errors
    - FLOOD_WAIT escalations
    - Session expiration
  - Include diagnostic commands
  - Include log inspection patterns
  - Place in `docs/troubleshooting/ingestion-service.md`
  - _Requirements: 12.5, Design § 14_

- [ ] 18.4 Record demo video of migration process
  - Record Phase 1: Standalone deployment
  - Record Phase 2: Staging migration
  - Record Phase 3: Validation
  - Record Phase 4: Production migration
  - Record Phase 5: Rollback procedure
  - Upload to internal documentation system
  - _Requirements: 12.5_

## Updated Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "5.3", "5.4"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "1.6", "2.4", "2.5"] },
    { "id": 3, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 4, "tasks": ["3.1", "3.7", "3.8"] },
    { "id": 5, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6"] },
    { "id": 6, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 7, "tasks": ["5.1", "5.2", "13.1", "13.2", "13.3"] },
    { "id": 8, "tasks": ["6.1", "6.2", "6.3", "6.4"] },
    { "id": 9, "tasks": ["6.5", "6.6"] },
    { "id": 10, "tasks": ["7.1", "7.2", "7.3", "7.4", "14.1", "14.2"] },
    { "id": 11, "tasks": ["10.1", "10.2", "10.3", "10.4", "11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 12, "tasks": ["12.1", "12.2", "12.3", "16.1", "16.2", "16.3", "17.1", "17.2", "17.3", "17.4"] },
    { "id": 13, "tasks": ["8.1", "8.2", "8.3", "8.4", "14.3", "16.4"] },
    { "id": 14, "tasks": ["15.1", "15.2", "15.3", "18.1", "18.2", "18.3"] },
    { "id": 15, "tasks": ["9.1"] },
    { "id": 16, "tasks": ["9.2"] },
    { "id": 17, "tasks": ["9.3"] },
    { "id": 18, "tasks": ["9.4"] },
    { "id": 19, "tasks": ["9.5"] },
    { "id": 20, "tasks": ["9.6", "18.4"] }
  ]
}
```

## Summary of Additional Tasks

**Phase 10 - Media Retention** (4 tasks): Port cleanup scheduler from backend, configure retention policy, implement orphan cleanup

**Phase 11 - Raw Text Storage** (5 tasks): Create telegram_raw_messages table, store text during broadcast, implement retrieval endpoint, update backend to fetch text

**Phase 12 - Dashboard Compatibility** (3 tasks): Verify no breaking changes, measure latency, E2E test

**Phase 13 - Docker Volumes** (3 tasks): Configure shared uploads volume, nginx media proxy, backup strategy

**Phase 14 - CI/CD** (3 tasks): Add to GitHub Actions, session validation gate, smoke tests

**Phase 15 - Monitoring** (3 tasks): Prometheus alerts, integration with existing alerting, Grafana dashboard

**Phase 16 - Performance** (4 tasks): SSE compression, sendfile optimization, Redis pooling, resource benchmarking

**Phase 17 - Security** (4 tasks): Rate limiting, authentication (optional), path sanitization, security headers

**Phase 18 - Documentation** (4 tasks): ADR, README updates, troubleshooting guide, demo video

**Total additional tasks: 33** (including 8 optional test tasks marked with `*`)

**Key improvements addressed:**
- ✅ Media lifecycle management (GAP 4)
- ✅ Raw text isolation with retrieval endpoint (Invariant 1)
- ✅ Dashboard WebSocket compatibility verification (GAP 5)
- ✅ Docker shared volumes (GAP 2)
- ✅ Session validation in CI/CD (GAP 6)
- ✅ Production monitoring and alerting
- ✅ Performance optimization
- ✅ Security hardening
- ✅ Complete documentation

