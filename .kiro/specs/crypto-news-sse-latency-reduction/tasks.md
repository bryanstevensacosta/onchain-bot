# Implementation Plan: Crypto-News SSE Latency Reduction

## Overview

Replace polling-based crypto-news message discovery with event-driven SSE consumption to reduce publishing latency from ~2 minutes (worst case) to ~5-10 seconds. The backend will subscribe to `messageType='crypto-news'` SSE events and process them in real-time, while maintaining fallback polling to catch messages missed during SSE reconnection gaps.

**Architecture**: Dual-path ingestion (SSE primary + polling fallback) with shared deduplication logic ensures zero message loss while achieving <10s latency in the happy path.

## Tasks

- [x] 1. Add configuration for crypto-news SSE and polling behavior
  - [x] 1.1 Extend app.config.ts with new environment variables
    - Add `useSseCryptoNews` field to `app.ingestion` section (reads `USE_SSE_CRYPTO_NEWS`, boolean, default `true`)
    - Add new `app.cryptoNews` nested group with `pollingIntervalMinutes` field (reads `CRYPTO_NEWS_POLLING_INTERVAL_MINUTES`, number, min 1, max 60, default 5)
    - Add validation rules ensuring `pollingIntervalMinutes` is between 1 and 60
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.2 Update environment variable templates
    - Add `USE_SSE_CRYPTO_NEWS=true` to `.env.example`, `.env.staging.template`, `.env.production.template`
    - Add `CRYPTO_NEWS_POLLING_INTERVAL_MINUTES=5` with comment explaining fallback role
    - Document the truth table (4 combinations of `USE_SSE_CRYPTO_NEWS` × `matchingEnabled`)
    - _Requirements: 3.1, 3.2, 3.5_

- [ ] 2. Create ProcessCryptoNewsMessageHandler for SSE event processing
  - [x] 2.1 Implement core handler class
    - Create `apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts`
    - Inject dependencies: `FilteredCryptoNewsService`, `EnqueueMatchingMessageUseCase`, `MatchingConfigRepository`, `PublisherQueueRepository`
    - Implement `async handle(raw: TelegramRawMessage): Promise<void>` with try/catch error boundary
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 2.2 Add deduplication logic
    - Query `PublisherQueueRepository.findByChannelIdAndMessageId()` before expensive operations
    - Skip if status is `PENDING` or `PUBLISHED`
    - Skip if status is `FAILED` with blocking reason (call `isBlockingFailureReason()` helper from `shared/deduplication/domain/constants/blocking-failure-reasons.ts`)
    - Allow re-enqueue if status is `FAILED` with non-blocking reason (e.g., "Expired: exceeded 24h")
    - Log deduplication decisions at INFO level
    - _Requirements: 1.4, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.3 Integrate filtering and matching pipeline
    - Call `FilteredCryptoNewsService.getMatchingMessages()` to fetch RAW message and apply filters
    - Skip enqueue if no keyword matches (empty result from filtering service)
    - Transform `FilteredCryptoNewsMessage` to `EnqueueMessageDto` format
    - Call `EnqueueMatchingMessageUseCase.execute()` for matched messages
    - _Requirements: 1.2, 1.3_

  - [x] 2.4 Add latency measurement
    - Implement `private logLatency(ingestedAt: Date, channelId: string, messageId: number): void`
    - Calculate latency as `Date.now() - ingestedAt.getTime()`
    - Log INFO if latency < 10 seconds with ✅ emoji: `"✅ Latency ${latencySec}s for ${channelId}:${messageId} (target <10s met)"`
    - Log WARN if latency ≥ 10 seconds with ⚠️ emoji: `"⚠️ Latency ${latencySec}s for ${channelId}:${messageId} (target <10s MISSED)"`
    - Handle invalid `ingestedAt` timestamps gracefully (log warning and skip latency calculation)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 2.5 Ensure defensive error handling
    - Wrap entire `handle()` method in try/catch
    - Log errors with ERROR level including channelId and messageId
    - Do NOT throw errors (prevents single bad message from crashing SSE stream)
    - Include error stack trace in logs when available
    - _Requirements: 1.1_

- [ ] 3. Modify IngestionCoordinator to route crypto-news messages
  - [x] 3.1 Inject ProcessCryptoNewsMessageHandler
    - Add `ProcessCryptoNewsMessageHandler` to constructor dependencies in `apps/backend/src/telegram/ingestion/shared/application/ingestion-coordinator.service.ts`
    - _Requirements: 8.1_

  - [ ] 3.2 Replace skip-with-log behavior
    - Locate the crypto-news skip-with-log block (around line 80: `"Crypto-news SSE persistence skipped..."`)
    - Replace with handler invocation: `await this.cryptoNewsHandler.handle(raw)`
    - Add debug logs before and after: `"[ROUTE-DEBUG] Routing to crypto-news handler"` and `"[ROUTE-DEBUG] ✅ Crypto-news handler completed"`
    - _Requirements: 8.2, 8.3_

  - [ ] 3.3 Add error boundary for handler
    - Wrap handler call in try/catch (same pattern as KOL handler)
    - Log ERROR with channelId and messageId on failure
    - Do NOT throw (defensive error boundary prevents stream crash)
    - _Requirements: 8.4, 8.5_

- [ ] 4. Convert EnqueueMatchingCronScheduler to dynamic interval
  - [x] 4.1 Remove static @Cron decorator
    - Remove `@Cron(CronExpression.EVERY_MINUTE)` from `tick()` method in `apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts`
    - Implement `OnApplicationBootstrap` interface if not already present
    - _Requirements: 2.1, 2.2_

  - [ ] 4.2 Add dynamic cron registration
    - Inject `SchedulerRegistry` from `@nestjs/schedule` and `ConfigService`
    - Implement `async onApplicationBootstrap(): Promise<void>`
    - Read `useSseCryptoNews` and `pollingIntervalMinutes` from config
    - Compute effective interval: `useSse ? pollingIntervalMinutes : 1`
    - Generate cron expression: `*/${intervalMinutes} * * * *`
    - Create `CronJob` instance and register via `schedulerRegistry.addCronJob('crypto-news-polling', job)`
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 4.3 Add bootstrap logging
    - Log effective interval, SSE mode, and role (primary vs fallback) at INFO level
    - Example: `"Crypto-news polling initialized: interval=5 min, SSE=enabled (fallback mode)"`
    - _Requirements: 9.4_

  - [ ] 4.4 Verify deduplication reuse
    - Confirm existing `tick()` logic already uses `EnqueueMatchingMessageUseCase`
    - No changes needed to tick implementation (deduplication logic lives in use case)
    - _Requirements: 2.4, 5.1_

- [ ] 5. Wire ProcessCryptoNewsMessageHandler in CryptoNewsIntegrationModule
  - [ ] 5.1 Add handler to module providers
    - Open `apps/backend/src/telegram/crypto-news-integration/crypto-news-integration.module.ts`
    - Add `ProcessCryptoNewsMessageHandler` to `providers` array
    - _Requirements: 8.1_

  - [ ] 5.2 Export handler for IngestionCoordinator
    - Add `ProcessCryptoNewsMessageHandler` to `exports` array (IngestionCoordinator is in different module)
    - _Requirements: 8.1_

- [ ] 6. Checkpoint - Verify SSE path compiles and wires correctly
  - Run `npm run build` in `apps/backend` to verify TypeScript compilation
  - Start backend in dev mode: `cd apps/backend && npm run start:dev`
  - Verify bootstrap logs show crypto-news polling initialized with correct interval
  - Check no DI errors related to ProcessCryptoNewsMessageHandler
  - _Validates: Tasks 1-5 complete, module wiring correct_

- [ ] 7. Write unit tests for ProcessCryptoNewsMessageHandler
  - [ ] 7.1 Create test file and setup
    - Create `apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.spec.ts`
    - Set up test module with mocked dependencies (FilteredCryptoNewsService, EnqueueMatchingMessageUseCase, MatchingConfigRepository, PublisherQueueRepository)
    - _Requirements: 10.1_

  - [ ] 7.2 Test happy path (message matched and enqueued)
    - Mock FilteredCryptoNewsService to return matched message
    - Mock PublisherQueueRepository to return null (no existing entry)
    - Mock MatchingConfig with `enabled=true`
    - Call `handler.handle(raw)` and verify EnqueueMatchingMessageUseCase was called
    - Verify INFO latency log emitted (spy on logger)
    - _Requirements: 10.1_

  - [ ] 7.3 Test no keyword match scenario
    - Mock FilteredCryptoNewsService to return empty array
    - Verify EnqueueMatchingMessageUseCase NOT called
    - Verify no latency log emitted
    - _Requirements: 10.1_

  - [ ] 7.4 Test matchingEnabled flag disabled
    - Mock MatchingConfig with `enabled=false`
    - Verify early return (FilteredCryptoNewsService NOT called)
    - _Requirements: 10.1, 1.5_

  - [ ] 7.5 Test deduplication scenarios
    - Test status=PENDING: verify skip, log dedup decision
    - Test status=PUBLISHED: verify skip, log dedup decision
    - Test status=FAILED + blocking reason: verify skip using `isBlockingFailureReason()`
    - Test status=FAILED + non-blocking reason: verify re-enqueue allowed
    - _Requirements: 10.1, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 7.6 Test error handling
    - Test FilteredCryptoNewsService throws: verify error logged, no throw, no enqueue
    - Test EnqueueMatchingMessageUseCase throws: verify error logged, no throw
    - _Requirements: 10.1_

  - [ ] 7.7 Test latency measurement
    - Test latency <10s: verify INFO log with ✅ emoji
    - Test latency ≥10s: verify WARN log with ⚠️ emoji
    - Test invalid ingestedAt: verify warning logged, calculation skipped
    - _Requirements: 10.1, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 8. Write unit tests for modified EnqueueMatchingCronScheduler
  - [ ] 8.1 Test dynamic cron registration with SSE enabled
    - Mock config with `useSseCryptoNews=true`, `pollingIntervalMinutes=5`
    - Call `onApplicationBootstrap()`
    - Verify `schedulerRegistry.addCronJob()` called with `*/5 * * * *` expression
    - Verify bootstrap log shows "interval=5 min, SSE=enabled (fallback mode)"
    - _Requirements: 10.4_

  - [ ] 8.2 Test dynamic cron registration with SSE disabled
    - Mock config with `useSseCryptoNews=false`
    - Call `onApplicationBootstrap()`
    - Verify `schedulerRegistry.addCronJob()` called with `*/1 * * * *` expression
    - Verify bootstrap log shows "interval=1 min, SSE=disabled (primary mode)"
    - _Requirements: 10.4_

  - [ ] 8.3 Test tick() skips when matchingEnabled=false
    - Verify existing test still passes (no changes to tick logic needed)
    - _Requirements: 10.4_

- [ ] 9. Write unit tests for modified IngestionCoordinator
  - [ ] 9.1 Test crypto-news message routing
    - Create test spec `apps/backend/src/telegram/ingestion/shared/application/ingestion-coordinator.service.spec.ts` if not exists
    - Mock TelegramRawMessage with `messageType='crypto-news'`
    - Verify `ProcessCryptoNewsMessageHandler.handle()` called with raw message
    - _Requirements: 10.1, 8.1, 8.2_

  - [ ] 9.2 Test handler error boundary
    - Mock handler to throw error
    - Verify error logged with ERROR level
    - Verify error NOT propagated (no throw)
    - _Requirements: 10.1, 8.4, 8.5_

  - [ ] 9.3 Test KOL routing unchanged (regression)
    - Mock TelegramRawMessage with `messageType='kol'`
    - Verify `KolIngestionOrchestratorUseCase` still called
    - Verify ProcessCryptoNewsMessageHandler NOT called
    - _Requirements: 10.1_

- [ ] 10. Write integration test for end-to-end SSE flow
  - [ ] 10.1 Create integration test file
    - Create `apps/backend/test/crypto-news-sse-latency.integration.spec.ts`
    - Set up test module with real dependencies (except SSE stream, which is mocked)
    - _Requirements: 10.2_

  - [ ] 10.2 Test SSE event to queue entry flow
    - Mock SSE stream emitting crypto-news event
    - Trigger IngestionCoordinator routing
    - Verify ProcessCryptoNewsMessageHandler processes message
    - Verify FilteredCryptoNewsService called
    - Verify EnqueueMatchingMessageUseCase creates PublisherQueueEntry with status=PENDING
    - Verify latency logged
    - _Requirements: 10.2_

  - [ ] 10.3 Add teardown
    - Disconnect mock SSE stream
    - Clean up test database entries
    - _Requirements: 10.2_

- [ ] 11. Write integration test for deduplication across SSE and polling
  - [ ] 11.1 Create deduplication integration test file
    - Create `apps/backend/test/deduplication-hybrid.integration.spec.ts`
    - Set up test database with PublisherQueueEntry fixtures
    - _Requirements: 10.3_

  - [ ] 11.2 Test SSE + polling both process same message
    - Create existing PublisherQueueEntry with status=PENDING
    - Simulate SSE handler processing same channelId:messageId (should skip)
    - Simulate polling scheduler processing same channelId:messageId (should skip)
    - Verify only ONE entry exists in database
    - Verify logs show deduplication skip messages
    - _Requirements: 10.3, 5.1_

  - [ ] 11.3 Test deduplication with all status combinations
    - Repeat test with status=PUBLISHED (both skip)
    - Repeat with status=FAILED + blocking reason (both skip)
    - Repeat with status=FAILED + non-blocking reason (both allow re-enqueue)
    - _Requirements: 10.3, 5.2, 5.3, 5.4, 5.5_

- [ ] 12. Write integration test for fallback polling during SSE gap
  - [ ] 12.1 Create SSE gap recovery test file
    - Create `apps/backend/test/sse-gap-recovery.integration.spec.ts`
    - Set up test with controllable SSE stream (can disconnect/reconnect)
    - _Requirements: 10.3_

  - [ ] 12.2 Simulate SSE gap and polling recovery
    - Start SSE subscription
    - Send 2 messages while SSE connected (verify both enqueued)
    - Disconnect SSE
    - Send 3 messages during gap (verify NOT enqueued by SSE)
    - Wait for polling tick (5 minutes simulated or manual trigger)
    - Verify polling caught all 3 missed messages
    - Verify total 5 messages enqueued (no duplicates)
    - _Requirements: 10.3, 2.1, 2.2_

- [ ] 13. Write integration test for configuration flag combinations
  - [ ] 13.1 Create config flags integration test file
    - Create `apps/backend/test/crypto-news-config-flags.integration.spec.ts`
    - Set up test harness that can restart scheduler with different config
    - _Requirements: 10.4_

  - [ ] 13.2 Test all 4 flag combinations
    - Test `USE_SSE_CRYPTO_NEWS=true + matchingEnabled=true`: verify SSE handler processes, polling runs every 5 min
    - Test `USE_SSE_CRYPTO_NEWS=true + matchingEnabled=false`: verify SSE handler skips, polling skips
    - Test `USE_SSE_CRYPTO_NEWS=false + matchingEnabled=true`: verify SSE inactive, polling runs every 1 min
    - Test `USE_SSE_CRYPTO_NEWS=false + matchingEnabled=false`: verify no ingestion
    - _Requirements: 10.4, 3.3, 3.4, 3.5_

- [ ] 14. Update backend AGENTS.md documentation
  - [ ] 14.1 Update CRYPTO-NEWS section
    - Document dual-path architecture (SSE primary + polling fallback)
    - Add truth table showing `USE_SSE_CRYPTO_NEWS` × `matchingEnabled` behavior
    - Document `ProcessCryptoNewsMessageHandler` as new component
    - Update data flow diagram to show both SSE and polling paths
    - Document latency measurement (<10s target)
    - _Requirements: 9.4_

  - [ ] 14.2 Update SCHEDULERS section
    - Document EnqueueMatchingCronScheduler dynamic interval behavior
    - Explain interval switch: 5 min (SSE fallback) vs 1 min (polling primary)
    - _Requirements: 9.4_

  - [ ] 14.3 Update ENV INVENTORY section
    - Add `USE_SSE_CRYPTO_NEWS` (boolean, default true)
    - Add `CRYPTO_NEWS_POLLING_INTERVAL_MINUTES` (number, default 5, min 1, max 60)
    - _Requirements: 9.4_

- [ ] 15. Update environment template files
  - [ ] 15.1 Update .env.example
    - Add crypto-news SSE section with both variables
    - Add comments explaining primary vs fallback modes
    - _Requirements: 9.4_

  - [ ] 15.2 Update .env.staging.template and .env.production.template
    - Set `USE_SSE_CRYPTO_NEWS=true` (SSE is recommended for staging/prod)
    - Set `CRYPTO_NEWS_POLLING_INTERVAL_MINUTES=5`
    - Add migration notes if applicable
    - _Requirements: 9.4, 9.5_

- [ ] 16. Final checkpoint - End-to-end verification
  - Start backend with SSE enabled: `USE_SSE_CRYPTO_NEWS=true npm run start:dev`
  - Start ingestion-telegram to generate crypto-news events
  - Monitor logs for:
    - SSE connection to ingestion-telegram
    - Crypto-news events received by IngestionCoordinator
    - ProcessCryptoNewsMessageHandler processing messages
    - Latency measurements (<10s target)
    - Fallback polling running every 5 minutes
  - Verify PublisherQueueEntry created with status=PENDING
  - Verify no duplicate enqueues when polling runs
  - Test rollback: set `USE_SSE_CRYPTO_NEWS=false`, restart, verify 1-minute polling active
  - _Validates: Requirements 1-10, full pipeline operational_

## Notes

- Tasks marked with `*` are optional test-related sub-tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at critical integration points
- The implementation maintains Opción A architecture: ingestion-telegram stores RAW content, backend applies filters on-read
- Deduplication logic is shared between SSE and polling paths via PublisherQueueRepository status checks
- Latency measurement verifies <10 second target achievement in production
- Configuration flags enable operational flexibility: SSE can be disabled for rollback without code changes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "4.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "3.1", "4.2"] },
    { "id": 3, "tasks": ["2.5", "3.2", "4.3", "5.1"] },
    { "id": 4, "tasks": ["3.3", "4.4", "5.2"] },
    { "id": 5, "tasks": ["6"] },
    { "id": 6, "tasks": ["7.1", "8.1", "9.1", "10.1", "11.1", "12.1", "13.1"] },
    {
      "id": 7,
      "tasks": [
        "7.2",
        "7.3",
        "7.4",
        "8.2",
        "9.2",
        "10.2",
        "11.2",
        "12.2",
        "13.2"
      ]
    },
    { "id": 8, "tasks": ["7.5", "7.6", "8.3", "9.3", "10.3", "11.3"] },
    { "id": 9, "tasks": ["7.7"] },
    { "id": 10, "tasks": ["14.1", "15.1"] },
    { "id": 11, "tasks": ["14.2", "14.3", "15.2"] },
    { "id": 12, "tasks": ["16"] }
  ]
}
```
