# Requirements Document

## Introduction

This feature reduces crypto-news publishing latency from ~2 minutes (worst case) to ~5-10 seconds by replacing polling-based message discovery with event-driven SSE consumption. The backend currently polls the ingestion-telegram HTTP API every minute to fetch new crypto-news messages. By switching to SSE event subscription (already working for KOL messages), the backend receives crypto-news events in real-time and can enqueue matched messages immediately.

The change maintains Opción A architecture invariants: ingestion-telegram stores RAW content, backend applies filters on-read, and the 3-flag control system (`matchingEnabled`, `llmEnabled`, `publishingEnabled`) remains unchanged. Polling is retained as a fallback mechanism to catch messages missed during SSE reconnection gaps.

## Glossary

- **Backend**: NestJS application (apps/backend) that processes crypto-news messages
- **Ingestion_Service**: Centralized MTProto listener (:3031) that stores RAW crypto-news messages
- **SSE_Stream**: Server-Sent Events stream at `GET /api/ingestion/stream`
- **EnqueueMatchingCronScheduler**: Current polling-based scheduler (every 1 minute)
- **FilteredCryptoNewsService**: Service that applies content filters and keyword matching
- **EnqueueMatchingMessageUseCase**: Use case that enqueues matched messages to publisher queue
- **PublisherCronScheduler**: Scheduler that drains queue and publishes (every 1 minute, unchanged)
- **IngestionCoordinator**: Service that routes incoming SSE messages by messageType
- **TelegramSseListenerAdapter**: SSE client adapter (already working for KOL messages)
- **MatchingConfig**: Entity controlling `matchingEnabled` flag
- **PublisherQueueEntry**: Queue entry entity with status (PENDING/PUBLISHED/FAILED)

## Requirements

### Requirement 1: Event-Driven Crypto-News Ingestion

**User Story:** As a system operator, I want crypto-news messages to be ingested via SSE events, so that matched messages are enqueued within seconds instead of waiting up to 2 minutes.

#### Acceptance Criteria

1. WHEN the Backend receives an SSE event with `messageType='crypto-news'`, THE Backend SHALL route the message to a crypto-news handler
2. WHEN a crypto-news message is routed to the handler, THE Handler SHALL apply FilteredCryptoNewsService logic (content filters + keyword matching + blacklist checking)
3. IF the message matches keywords AND is not blacklisted, THEN THE Handler SHALL enqueue via EnqueueMatchingMessageUseCase
4. WHEN enqueueing a message, THE Handler SHALL check PublisherQueueEntry deduplication status (PENDING/PUBLISHED blocks, FAILED with blocking reasons blocks)
5. THE Handler SHALL respect MatchingConfig.enabled flag (skip processing when disabled)

### Requirement 2: Fallback Polling Mechanism

**User Story:** As a system operator, I want polling to continue as a fallback, so that messages missed during SSE disconnections are eventually processed.

#### Acceptance Criteria

1. THE EnqueueMatchingCronScheduler SHALL continue to run with reduced frequency (configurable, default every 5 minutes)
2. WHEN SSE is enabled AND MatchingConfig.enabled is true, THE EnqueueMatchingCronScheduler SHALL fetch messages via FilteredCryptoNewsService
3. THE EnqueueMatchingCronScheduler SHALL use the same deduplication logic as the SSE handler (check PublisherQueueEntry status)
4. WHEN a message is already enqueued by SSE, THE EnqueueMatchingCronScheduler SHALL skip re-enqueueing (idempotent)
5. WHERE SSE is disabled, THE EnqueueMatchingCronScheduler SHALL run at original frequency (every 1 minute) as primary ingestion path

### Requirement 3: Configuration Flags

**User Story:** As a system operator, I want independent control over SSE and polling modes, so that I can disable either path without breaking the system.

#### Acceptance Criteria

1. THE Backend SHALL read `USE_SSE_CRYPTO_NEWS` environment variable (boolean, default true)
2. THE Backend SHALL read `CRYPTO_NEWS_POLLING_INTERVAL_MINUTES` environment variable (number, default 5)
3. WHEN USE_SSE_CRYPTO_NEWS is true, THE Backend SHALL subscribe to SSE crypto-news events
4. WHEN USE_SSE_CRYPTO_NEWS is false, THE Backend SHALL rely solely on polling (interval = CRYPTO_NEWS_POLLING_INTERVAL_MINUTES)
5. WHEN USE_SSE_CRYPTO_NEWS is true, THE Backend SHALL run polling as fallback (interval = CRYPTO_NEWS_POLLING_INTERVAL_MINUTES)

### Requirement 4: Latency Measurement

**User Story:** As a system operator, I want to measure message ingestion latency, so that I can verify the <10 second target is met.

#### Acceptance Criteria

1. WHEN a crypto-news message is enqueued, THE Backend SHALL log the latency from `ingestedAt` (ingestion-telegram timestamp) to enqueue timestamp
2. THE Backend SHALL calculate latency as `Date.now() - message.ingestedAt.getTime()`
3. THE Backend SHALL log latency with level INFO for latencies <10 seconds
4. THE Backend SHALL log latency with level WARN for latencies ≥10 seconds
5. THE Backend SHALL include channelId and messageId in latency logs for debugging

### Requirement 5: Deduplication Consistency

**User Story:** As a system operator, I want messages to be deduplicated consistently across SSE and polling paths, so that duplicate enqueues never occur.

#### Acceptance Criteria

1. BEFORE enqueueing a message, THE Backend SHALL query PublisherQueueEntry by channelId and messageId
2. IF an entry exists with status=PENDING, THEN THE Backend SHALL skip enqueue (already in queue)
3. IF an entry exists with status=PUBLISHED, THEN THE Backend SHALL skip enqueue (already published)
4. IF an entry exists with status=FAILED AND failure reason is blocking (per isBlockingFailureReason logic), THEN THE Backend SHALL skip enqueue
5. IF an entry exists with status=FAILED AND failure reason is non-blocking (e.g., "Expired: exceeded 24h in queue"), THEN THE Backend SHALL allow re-enqueue

### Requirement 6: No Telegram Rate Limit Impact

**User Story:** As a system operator, I want zero additional Telegram API requests, so that switching to SSE does not affect rate limits.

#### Acceptance Criteria

1. THE Backend SHALL NOT make additional requests to Telegram API when using SSE (ingestion-telegram already polls MTProto)
2. THE Backend SHALL receive crypto-news messages passively via SSE push model
3. THE Backend SHALL use the same HTTP endpoints for fallback polling (no new ingestion-telegram API calls)
4. THE Backend SHALL NOT duplicate media downloads (ingestion-telegram owns media, backend reads via HTTP)

### Requirement 7: Publisher Behavior Unchanged

**User Story:** As a system operator, I want the publisher queue and scheduling to remain unchanged, so that this feature only affects ingestion latency.

#### Acceptance Criteria

1. THE PublisherCronScheduler SHALL continue to run every 1 minute (unchanged)
2. THE PublisherCronScheduler SHALL drain the queue using existing logic (ProcessNextQueuedArticleUseCase)
3. THE PublisherQueueEntry queue cap SHALL remain 36 (EnqueueMatchingMessageUseCase.MAX_QUEUE_DEPTH)
4. THE 3-flag control system SHALL remain unchanged (`matchingEnabled`, `llmEnabled`, `publishingEnabled`)
5. THE LLM generation dependency SHALL remain unchanged (LLM only runs when both `llmEnabled=true` AND `publishingEnabled=true`)

### Requirement 8: IngestionCoordinator Integration

**User Story:** As a developer, I want the IngestionCoordinator to route crypto-news messages to a new handler, so that SSE events are processed correctly.

#### Acceptance Criteria

1. WHEN IngestionCoordinator.route() receives a TelegramRawMessage with messageType='crypto-news', THE Coordinator SHALL call a new crypto-news handler
2. THE Coordinator SHALL replace the current skip-with-log behavior (line ~80) with handler invocation
3. THE Coordinator SHALL pass the full TelegramRawMessage payload to the handler
4. THE Coordinator SHALL log handler errors with ERROR level (same pattern as KOL handler)
5. THE Coordinator SHALL NOT throw on handler errors (defensive error boundary)

### Requirement 9: Backward Compatibility

**User Story:** As a system operator, I want to rollback to polling-only mode if SSE has issues, so that crypto-news ingestion never stops completely.

#### Acceptance Criteria

1. WHEN USE_SSE_CRYPTO_NEWS is set to false, THE Backend SHALL disable SSE subscription for crypto-news
2. WHEN USE_SSE_CRYPTO_NEWS is false, THE EnqueueMatchingCronScheduler SHALL revert to 1-minute interval (primary path)
3. THE Backend SHALL support dynamic flag changes via environment variable (restart required)
4. THE Backend SHALL log SSE enable/disable status at application bootstrap with INFO level
5. THE Backend SHALL NOT break existing functionality when SSE is disabled

### Requirement 10: Testing Coverage

**User Story:** As a developer, I want comprehensive test coverage, so that the event-driven path is verified correct.

#### Acceptance Criteria

1. THE Backend SHALL include unit tests for the crypto-news SSE handler (mocked dependencies)
2. THE Backend SHALL include integration tests for end-to-end flow (SSE event → filter → enqueue → queue state verified)
3. THE Backend SHALL include tests for deduplication logic (SSE + polling, same message, idempotent)
4. THE Backend SHALL include tests for flag-driven behavior (USE_SSE_CRYPTO_NEWS true/false)
5. THE Backend SHALL include tests for latency measurement (mock timestamps, verify log output)
