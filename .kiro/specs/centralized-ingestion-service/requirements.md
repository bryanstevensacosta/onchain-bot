# Centralized Ingestion Service - Requirements

## Introduction

This document defines requirements for a centralized Telegram ingestion service that eliminates resource duplication across multiple backend environments. Currently, each environment (dev, staging, production) runs its own MTProto client, resulting in 3x duplication of media downloads and message processing. The centralized service will provide a single ingestion instance that streams data to all environments via Server-Sent Events (SSE), reducing resource usage, operational complexity, and enabling horizontal scalability.

## Glossary

- **MTProto_Client**: Telegram's client protocol implementation for accessing Telegram channels
- **Ingestion_Service**: Standalone service that connects to Telegram channels and distributes messages
- **Backend_Client**: Component in backend environments that consumes messages from the Ingestion_Service
- **SSE_Stream**: Server-Sent Events protocol for real-time message delivery from server to clients
- **Media_Endpoint**: HTTP endpoint that serves downloaded media files (images, videos, documents)
- **Session_String**: Encrypted authentication token for MTProto client connection
- **Channel_Metadata**: Information about monitored Telegram channels (ID, title, participant count)
- **Message_Payload**: Structured data representing a Telegram message with metadata
- **Health_Endpoint**: HTTP endpoint that reports service operational status
- **Client_Connection**: Active SSE connection from a backend environment to the Ingestion_Service

## Architectural Constraints

**Source:** Current system implementation analysis

This section documents NON-NEGOTIABLE constraints from the current system that MUST be preserved during migration to ensure functional correctness and compliance.

**Invariant 1: Raw Text Isolation (ToS Compliance)**
- **Constraint:** Raw Telegram message text MUST NOT cross the event bus or be included in domain events.
- **Rationale:** Telegram Bot Dev ToS §4.3 compliance ("fix-1"). Only metadata (channelId, messageId, timestamp) may be broadcast.
- **Impact:** THE Ingestion_Service SHALL broadcast message metadata only. Raw text SHALL remain in the message body accessible via separate API calls.

**Invariant 2: Message Order Preservation**
- **Constraint:** Messages from the same channel MUST be delivered in order to all connected clients.
- **Rationale:** Downstream processing (extraction, parsing) assumes chronological order for state machines.
- **Impact:** THE Ingestion_Service SHALL broadcast messages sequentially per channel (no parallel broadcasting within a channel).

**Invariant 3: Deduplication at Source**
- **Constraint:** Duplicate messages (same channelId + messageId) MUST be filtered before broadcast.
- **Rationale:** Prevents double-processing in downstream use cases, avoids duplicate DB inserts.
- **Impact:** THE Ingestion_Service SHALL check if a message was already broadcast and skip duplicates.

**Invariant 4: TelegramListenerPort Abstraction**
- **Constraint:** Backend clients MUST consume via `TelegramListenerPort` interface, NOT by coupling to MTProto directly.
- **Rationale:** Existing abstraction enables drop-in replacement with SSE client adapter.
- **Impact:** THE Backend_Client SHALL implement `TelegramListenerPort` interface with same method signatures (subscribe, backfill, disconnect, resolveChannelMetadata, joinChannel).

**Invariant 5: Media as URLs, Not Paths**
- **Constraint:** Media references MUST be HTTP URLs pointing to the Ingestion_Service, NOT local file paths.
- **Rationale:** Backends no longer have local access to media files after extraction.
- **Impact:** THE Ingestion_Service SHALL construct media URLs in the format `http://<ingestion-service-host>/api/media/:channelId/:messageId/:index` and include them in the message payload.

**Invariant 6: State Persistence Requirements**
- **Constraint:** Last-seen message IDs MUST survive service restarts to avoid re-processing old messages.
- **Rationale:** Redis-backed LastSeenManager ensures cursor persistence across deployments.
- **Impact:** THE Ingestion_Service SHALL persist last-seen message IDs in Redis with keys `ingestion:lastSeen:{channelId}`.

**Invariant 7: Single MTProto Session**
- **Constraint:** Only ONE MTProto session MAY exist per Telegram account to avoid AUTH_KEY_DUPLICATED errors.
- **Rationale:** Telegram enforces single-session limit for non-media DCs (per 406 error documentation).
- **Impact:** THE Ingestion_Service SHALL be the ONLY process connecting to Telegram with the configured session. Backend environments SHALL NOT initialize MTProto clients.

## External Constraints and Regulatory Compliance

This section documents official Telegram policies and technical limits that constrain the design space.

### Telegram API Terms of Service Compliance

**Source:** https://core.telegram.org/api/terms

**Prohibited Activities (Ban Consequences):**

1. **Flooding & Spamming:** Using the API for flooding, spamming, or faking metrics results in permanent account ban.
   - **Constraint:** The Ingestion_Service SHALL implement rate limiting and flood protection to prevent exceeding Telegram's acceptable use thresholds.

2. **AI Training & Data Scraping:** Per Telegram's Content Licensing ToS (https://telegram.org/tos/content-licensing), scraping or aggregating data for AI/ML training, fine-tuning, or model development is strictly prohibited.
   - **Compliance:** The Ingestion_Service SHALL NOT aggregate, store, or expose data in formats designed for AI/ML training. The service SHALL only facilitate real-time message delivery for legitimate trading/alerting use cases.

3. **Account Observation:** All unofficial Telegram API clients are automatically placed under observation by Telegram's automated monitoring systems.
   - **Constraint:** The Ingestion_Service SHALL behave conservatively to avoid triggering automated ban systems, including implementing staggered polling, sleep windows, and FLOOD_WAIT compliance.

4. **API ID Requirements:** Each application must obtain its own api_id and api_hash (not share the example credentials).
   - **Compliance:** The Ingestion_Service deployment SHALL use unique API credentials obtained via https://my.telegram.org/apps.

### Technical Limits and Error Handling

**Source:** https://core.telegram.org/api/errors

**420 FLOOD Error:**
- **Description:** Maximum allowed attempts exceeded for a given method/parameters combination.
- **Error Format:** `FLOOD_WAIT_X` where X is the required wait time in seconds.
- **Handling Requirement:** THE Ingestion_Service SHALL detect FLOOD_WAIT_X errors, extract the wait duration X, pause all affected operations for X seconds plus exponential backoff, then retry. The service SHALL track FLOOD_WAIT occurrences and alert operators when thresholds are exceeded.

**401 UNAUTHORIZED Errors:**
- **SESSION_REVOKED:** User terminated all sessions.
- **SESSION_EXPIRED:** Authorization expired.
- **Handling Requirement:** THE Ingestion_Service SHALL fail-fast on SESSION_REVOKED/SESSION_EXPIRED errors and alert operators to regenerate the MTProto session.

**406 NOT_ACCEPTABLE - AUTH_KEY_DUPLICATED:**
- **Description:** Emitted when parallel sessions are detected from the same authorization key to non-media DCs.
- **Constraint:** THE Ingestion_Service SHALL maintain only a single MTProto session to non-media data centers. File transfer sessions to media DCs are exempt and may be opened in parallel as needed.

### Acceptable Use Guidelines

**Source:** https://core.telegram.org/api/obtaining_api_id

**What This Service Does (Compliant):**
- ✅ Reads messages from public Telegram channels using official MTProto API
- ✅ Downloads media attachments from public messages
- ✅ Provides real-time alerts for cryptocurrency trading signals
- ✅ Uses a single, aged, authorized Telegram account
- ✅ Operates passively (read-only, no writes, no user contact)

**What This Service Does NOT Do:**
- ❌ Train AI/ML models or aggregate data for machine learning
- ❌ Scrape private user data or contact users
- ❌ Send messages, add users, or perform write operations
- ❌ Fake metrics, subscriber counts, or view counters
- ❌ Use shared/example API credentials

## Current State (Problems)

### Problem 1: Resource Duplication

**User Story:** As a system architect, I need to eliminate redundant resource consumption, so that infrastructure costs scale efficiently with business growth.

#### Current Defects

1. WHEN each backend environment runs its own MTProto client, THEN the system SHALL create 3 separate connections to Telegram servers (1 per environment)
2. WHEN a Telegram message contains media, THEN the system SHALL download the same media file 3 times (once per environment)
3. WHEN each environment processes messages independently, THEN the system SHALL perform duplicate message parsing, validation, and transformation operations
4. WHEN a new environment is added, THEN resource consumption SHALL increase linearly (4x for 4 environments)

### Problem 2: Operational Complexity

**User Story:** As a DevOps engineer, I need simplified Telegram session management, so that I can troubleshoot issues efficiently and maintain system reliability.

#### Current Defects

1. WHEN managing MTProto sessions, THEN the system SHALL require 3 separate session strings stored in environment variables
2. WHEN a session expires or is invalidated, THEN the operator SHALL regenerate and update session strings in 3 different environments
3. WHEN debugging message ingestion issues, THEN the operator SHALL examine logs and state across 3 separate instances
4. WHEN data inconsistencies occur, THEN each environment MAY have different message processing results due to timing variations
5. WHEN monitoring ingestion health, THEN the operator SHALL check 3 separate health endpoints and connection states

### Problem 3: Scalability Limitations

**User Story:** As a system architect, I need a scalable ingestion architecture, so that the system can support multi-region deployments and increased load without proportional cost increases.

#### Current Defects

1. WHEN adding a new backend environment, THEN the system SHALL incur full ingestion overhead (network, storage, processing)
2. WHEN deploying to multiple regions, THEN each region SHALL require separate MTProto clients, multiplying Telegram API load
3. WHEN horizontal scaling is needed, THEN the current architecture SHALL NOT support multiple backend instances sharing a single ingestion source
4. WHEN Telegram rate limits are approached, THEN distributed clients SHALL lack coordination and MAY trigger rate limit violations

## Expected Behavior (Solution)

### Requirement 1: Single Ingestion Instance

**User Story:** As a system architect, I want a single MTProto client instance, so that I eliminate resource duplication and reduce infrastructure costs by 3x.

#### Acceptance Criteria

1. THE Ingestion_Service SHALL establish exactly one MTProto_Client connection to Telegram servers
2. WHEN a Telegram message arrives, THE Ingestion_Service SHALL download media files at most once per unique file
3. THE Ingestion_Service SHALL store downloaded media files in a shared storage location accessible via HTTP
4. WHEN multiple backend environments request the same media file, THE Ingestion_Service SHALL serve the cached file without re-downloading
5. THE Ingestion_Service SHALL maintain a single session string for MTProto authentication

### Requirement 2: SSE Streaming Distribution

**User Story:** As a backend developer, I want real-time message streaming via SSE, so that backend environments receive messages with low latency and automatic reconnection.

#### Acceptance Criteria

1. THE Ingestion_Service SHALL expose an SSE endpoint at `/stream/messages` that accepts client connections
2. WHEN a Backend_Client connects to the SSE endpoint, THE Ingestion_Service SHALL maintain a persistent HTTP connection for real-time updates
3. WHEN a Telegram message is received, THE Ingestion_Service SHALL broadcast the Message_Payload to all connected Backend_Clients within 500ms
4. WHEN a Backend_Client connection is lost, THE Backend_Client SHALL automatically reconnect with exponential backoff (starting at 1s, max 30s)
5. THE Ingestion_Service SHALL support at least 10 concurrent Client_Connections without performance degradation
6. WHEN a new Backend_Client connects, THE Ingestion_Service SHALL NOT send historical messages, only new messages received after connection

### Requirement 3: Backend Client Adapter

**User Story:** As a backend developer, I want a transparent client adapter, so that I can replace the MTProto client with minimal code changes.

#### Acceptance Criteria

1. THE Backend_Client SHALL implement the same interface as the existing MTProto client for backward compatibility
2. WHEN the Backend_Client initializes, THE Backend_Client SHALL establish an SSE connection to the Ingestion_Service
3. WHEN the Backend_Client receives a Message_Payload via SSE, THE Backend_Client SHALL emit the same events as the MTProto client
4. WHEN the Backend_Client needs to access media, THE Backend_Client SHALL construct URLs pointing to the Ingestion_Service Media_Endpoint
5. THE Backend_Client SHALL handle connection failures gracefully and log reconnection attempts
6. WHEN the SSE connection is interrupted, THE Backend_Client SHALL NOT crash the backend application

### Requirement 4: Media Serving API

**User Story:** As a backend developer, I want HTTP access to media files, so that I can display or process media without local downloads.

#### Acceptance Criteria

1. THE Ingestion_Service SHALL expose a Media_Endpoint at `/media/:fileId` that serves downloaded files
2. WHEN a Media_Endpoint request is received, THE Ingestion_Service SHALL respond with the file content and appropriate Content-Type header within 200ms
3. WHEN a requested media file does not exist, THE Ingestion_Service SHALL return HTTP 404 status code
4. THE Ingestion_Service SHALL store media files in a persistent volume that survives service restarts
5. THE Media_Endpoint SHALL support standard HTTP caching headers (ETag, Cache-Control) for efficient CDN integration

### Requirement 5: Health and Metadata API

**User Story:** As a DevOps engineer, I want health and metadata endpoints, so that I can monitor service status and validate configuration.

#### Acceptance Criteria

1. THE Ingestion_Service SHALL expose a Health_Endpoint at `/health` that returns service operational status
2. WHEN the Health_Endpoint is queried, THE Ingestion_Service SHALL respond within 100ms with JSON containing MTProto connection status and connected client count
3. THE Ingestion_Service SHALL expose a `/channels` endpoint that returns monitored Channel_Metadata as JSON
4. WHEN the MTProto_Client is connected, THE Health_Endpoint SHALL return HTTP 200 status code
5. WHEN the MTProto_Client is disconnected, THE Health_Endpoint SHALL return HTTP 503 status code
6. THE Health_Endpoint SHALL include uptime and last message timestamp in the response payload

### Requirement 6: Deployment Architecture

**User Story:** As a DevOps engineer, I want a standalone deployable service, so that I can manage the ingestion layer independently from backend environments.

#### Acceptance Criteria

1. THE Ingestion_Service SHALL be packaged as a Docker container with all runtime dependencies included
2. THE Ingestion_Service SHALL accept configuration via environment variables (Telegram credentials, storage paths, network ports)
3. THE Ingestion_Service SHALL listen on a configurable HTTP port (default 3031) for API requests
4. THE Ingestion_Service SHALL run as a single process with no external runtime dependencies beyond Docker
5. WHEN the Ingestion_Service container restarts, THE Ingestion_Service SHALL restore MTProto session state from the session string
6. THE Ingestion_Service SHALL support deployment on the same host as backend services with network accessibility

### Requirement 7: Migration Strategy

**User Story:** As a DevOps engineer, I want a phased migration plan, so that I can validate the centralized service before full cutover.

#### Acceptance Criteria

1. WHEN migrating to the Ingestion_Service, THE Backend_Client SHALL provide a feature flag to toggle between MTProto and SSE modes
2. THE migration SHALL deploy the Ingestion_Service to staging environment first, followed by production
3. WHEN the Backend_Client operates in SSE mode, THE Backend_Client SHALL NOT initialize the MTProto client
4. THE migration plan SHALL include a rollback procedure that restores MTProto mode within 5 minutes
5. WHEN the Ingestion_Service is unavailable during rollback, THE Backend_Client SHALL fall back to MTProto mode without data loss

### Requirement 8: Performance Requirements

**User Story:** As a system architect, I want defined performance thresholds, so that I can ensure the centralized service meets latency and throughput needs.

#### Acceptance Criteria

1. WHEN a Telegram message is received, THE Ingestion_Service SHALL deliver the Message_Payload to all connected clients within 500ms (p95)
2. THE Ingestion_Service SHALL support at least 10 concurrent Client_Connections without latency degradation
3. WHEN serving media files, THE Media_Endpoint SHALL respond within 200ms for cached files (p95)
4. THE Ingestion_Service SHALL maintain SSE connections stable for at least 24 hours without disconnection
5. WHEN message volume exceeds 100 messages per minute, THE Ingestion_Service SHALL NOT drop messages or miss broadcasts

### Requirement 9: Observability and Monitoring

**User Story:** As a DevOps engineer, I want structured logging and metrics, so that I can diagnose issues and monitor system health.

#### Acceptance Criteria

1. THE Ingestion_Service SHALL log all incoming Telegram messages with structured JSON format including timestamp, channel ID, and message ID
2. THE Ingestion_Service SHALL log client connection events (connect, disconnect, reconnect) with client identifier
3. THE Ingestion_Service SHALL log media download events with file ID, size, and download duration
4. WHEN an error occurs, THE Ingestion_Service SHALL log the error with stack trace and contextual information
5. THE Health_Endpoint SHALL expose metrics for monitoring: uptime, message count, client count, media cache size
6. THE Ingestion_Service SHALL define alert conditions: MTProto disconnected for >5min, zero clients for >10min, media storage >80% full

### Requirement 10: Functional Correctness

**User Story:** As a backend developer, I want guaranteed message delivery, so that no Telegram messages are lost during the migration.

#### Acceptance Criteria

1. WHEN the Ingestion_Service receives a Telegram message, THE Ingestion_Service SHALL broadcast it to all connected Backend_Clients without loss
2. WHEN a Backend_Client is temporarily disconnected, THE Backend_Client SHALL NOT receive messages sent during the disconnection period (no buffering)
3. WHEN a Backend_Client reconnects, THE Backend_Client SHALL only receive new messages from the reconnection point forward
4. THE Ingestion_Service SHALL preserve message order within each channel for all connected clients
5. WHEN comparing MTProto mode and SSE mode side-by-side, THE Backend_Client SHALL process identical message payloads with identical results

### Requirement 11: Telegram Anti-Ban Protection

**User Story:** As a system architect, I want robust anti-spam and anti-flood protection, so that the Telegram account remains in good standing and avoids bans or rate limit violations.

#### Acceptance Criteria

1. THE Ingestion_Service SHALL implement staggered polling with jitter to mimic human browsing behavior
   - WHEN polling N channels, THE Ingestion_Service SHALL distribute requests over the poll interval with random jitter (±30% default)
   - THE Ingestion_Service SHALL maintain a configurable base poll interval (default 90s per channel) to stay well below Telegram's flood limits
   - WHEN the number of monitored channels exceeds the configured maximum (default 50), THE Ingestion_Service SHALL log a warning and proceed with degraded polling frequency

2. THE Ingestion_Service SHALL detect and automatically handle FLOOD_WAIT errors from Telegram API
   - WHEN Telegram returns a FLOOD_WAIT error, THE Ingestion_Service SHALL pause the affected operation for the specified duration plus exponential backoff
   - THE Ingestion_Service SHALL track FLOOD_WAIT occurrences in a 24-hour sliding window and expose count via Health_Endpoint
   - WHEN FLOOD_WAIT errors exceed 10 occurrences in 24 hours, THE Ingestion_Service SHALL trigger an alert condition
   - THE Ingestion_Service SHALL implement retry logic with exponential backoff (initial 5s, multiplier 2x, max 1h, max 5 attempts)

3. THE Ingestion_Service SHALL support configurable sleep windows to reduce activity during high-risk periods
   - THE Ingestion_Service SHALL pause all polling operations during configured sleep window hours (default 04:00-08:00 UTC)
   - WHEN a sleep window is active, THE Health_Endpoint SHALL report status as "sleeping" with next wake time
   - THE Ingestion_Service SHALL NOT accumulate missed polls during sleep windows (no catch-up polling)

4. THE Ingestion_Service SHALL only perform read operations on public channels
   - THE Ingestion_Service SHALL NOT send messages, add users, or perform any write operations to Telegram
   - THE Ingestion_Service SHALL NOT scrape private user data or contact scraped users
   - THE Ingestion_Service SHALL only join channels that are explicitly configured in the seed configuration
   - WHEN a channel requires invitation or is private, THE Ingestion_Service SHALL log an error and skip monitoring

5. THE Ingestion_Service SHALL use aged, authorized Telegram accounts
   - THE Ingestion_Service SHALL require a valid MTProto session string from a pre-authorized account (not new/fresh accounts)
   - THE Ingestion_Service SHALL log session authorization status at startup and fail fast if unauthorized
   - THE Ingestion_Service documentation SHALL warn operators against using new accounts or frequently rotating sessions

6. THE Ingestion_Service SHALL expose safety configuration via JSON config file
   - THE Ingestion_Service SHALL load settings from `config/ingestion.config.json` with sensible defaults
   - Configuration SHALL include: maxChannels, pollIntervalBaseMs, jitterPercent, sleepWindow (start/end UTC), floodProtection (initial/multiplier/max backoff, maxAttempts)
   - WHEN the config file is missing or invalid, THE Ingestion_Service SHALL use built-in safe defaults and log a warning

7. THE Ingestion_Service SHALL expose metrics that indicate elevated ban risk
   - THE Health_Endpoint SHALL report: FLOOD_WAIT count in 24h window, max FLOOD_WAIT seconds encountered, consecutive failure count
   - WHEN consecutive FLOOD_WAIT failures exceed 3, THE Ingestion_Service SHALL trigger a "high-ban-risk" alert
   - THE Ingestion_Service SHALL log all Telegram API errors (not just FLOOD_WAIT) for operator visibility

## Success Criteria

### 12.1 Resource Reduction

WHEN all environments migrate to the Ingestion_Service, THEN media storage SHALL be reduced by at least 66% (from 3x to 1x duplication)

### 12.2 Functional Parity

WHEN the Ingestion_Service is deployed, THEN all backend environments SHALL process 100% of Telegram messages with identical results to MTProto mode

### 12.3 Connection Stability

WHEN SSE connections are monitored over 7 days, THEN 95% of connections SHALL remain stable for at least 24 hours without forced disconnection

### 12.4 Fast Rollback

WHEN a rollback is initiated, THEN the system SHALL restore MTProto mode functionality within 5 minutes with zero message loss

### 12.5 Complete Documentation

WHEN the feature is delivered, THEN documentation SHALL include: deployment guide, migration runbook, rollback procedure, monitoring playbook, and troubleshooting FAQ

### 12.6 Anti-Ban Protection Validation

WHEN the Ingestion_Service operates in production for 30 days, THEN zero Telegram account bans or suspensions SHALL occur, and FLOOD_WAIT errors SHALL remain below 10 occurrences per 24-hour period
