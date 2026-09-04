# Requirements Document: Shared Ingestion Service with Multi-Backend Broadcast

## Introduction

This document specifies the requirements for enabling a single ingestion-service instance to ingest Telegram messages from one MTProto session and broadcast them to multiple backend instances (production and staging) via Server-Sent Events (SSE). The goal is to eliminate duplicate MTProto connections, media downloads, and ingestion processing while allowing each backend to maintain independent source whitelists and databases.

## Glossary

- **Ingestion_Service**: NestJS application that connects to Telegram via MTProto, ingests messages, downloads media, and broadcasts to backends
- **Backend**: Production or staging NestJS application that subscribes to Ingestion_Service SSE stream and persists messages
- **SSE_Stream**: Server-Sent Events streaming endpoint exposed by Ingestion_Service for message broadcast
- **Source_Whitelist**: Set of Telegram channel/user IDs that a specific Backend wants to receive messages from
- **MTProto_Session**: Single authenticated Telegram connection managed by Ingestion_Service
- **Backfill_Window**: Time window (72 hours) during which Ingestion_Service retains messages for late-connecting Backends
- **Channel_Union**: Combined set of all channel IDs requested by all connected Backends
- **Backend_Registration**: Process by which a Backend identifies itself and provides its Source_Whitelist to Ingestion_Service
- **Broadcast_Event**: JSON message sent via SSE containing ingested Telegram message data
- **Media_Path**: Filesystem path to downloaded media file, shared across Backends via volume mount
- **Disconnection_Window**: Time period during which a Backend is offline but can still receive missed messages upon reconnect
- **Rate_Limit_Budget**: Maximum number of Telegram API requests allowed per time window, shared across all channel subscriptions

## Requirements

### Requirement 1: Multi-Backend Channel Registration

**User Story:** As a Backend, I want to register my Source_Whitelist with Ingestion_Service, so that Ingestion_Service knows which channels to subscribe to for me.

#### Acceptance Criteria

1. WHEN a Backend starts, THE Backend SHALL send an HTTP POST request to Ingestion_Service with its identifier and Source_Whitelist
2. WHEN Ingestion_Service receives a registration request, THE Ingestion_Service SHALL store the Backend identifier and Source_Whitelist in memory
3. WHEN multiple Backends register, THE Ingestion_Service SHALL compute the Channel_Union from all registered Source_Whitelists
4. WHEN the Channel_Union changes, THE Ingestion_Service SHALL update its MTProto subscriptions to include all channels in the Channel_Union
5. WHEN a Backend registration includes a channel already in the Channel_Union, THE Ingestion_Service SHALL NOT create a duplicate MTProto subscription

### Requirement 2: SSE Stream Connection and Identification

**User Story:** As a Backend, I want to connect to the SSE_Stream with my identifier, so that Ingestion_Service knows who I am and can track my connection state.

#### Acceptance Criteria

1. WHEN a Backend connects to the SSE_Stream endpoint, THE Backend SHALL provide its identifier as a query parameter
2. WHEN Ingestion_Service receives an SSE connection request, THE Ingestion_Service SHALL validate the Backend identifier against registered Backends
3. IF the Backend identifier is not registered, THEN THE Ingestion_Service SHALL reject the connection with HTTP 401
4. WHEN a valid Backend connects, THE Ingestion_Service SHALL add the Backend to its list of active SSE connections
5. WHEN a Backend disconnects, THE Ingestion_Service SHALL record the disconnection timestamp for backfill tracking

### Requirement 3: Message Broadcast to Connected Backends

**User Story:** As Ingestion_Service, I want to broadcast each ingested message to all connected Backends via SSE, so that all Backends receive messages in real-time.

#### Acceptance Criteria

1. WHEN Ingestion_Service ingests a Telegram message, THE Ingestion_Service SHALL create a Broadcast_Event containing the message data
2. WHEN a Broadcast_Event is created, THE Ingestion_Service SHALL send it to ALL connected Backend SSE streams
3. WHEN sending a Broadcast_Event fails for a specific Backend, THE Ingestion_Service SHALL log the failure and continue broadcasting to other Backends
4. THE Ingestion_Service SHALL include the source channel ID in every Broadcast_Event
5. THE Ingestion_Service SHALL include the Media_Path in the Broadcast_Event when the message contains media

### Requirement 4: Backend-Side Message Filtering

**User Story:** As a Backend, I want to filter received Broadcast_Events against my Source_Whitelist, so that I only persist messages from channels I care about.

#### Acceptance Criteria

1. WHEN a Backend receives a Broadcast_Event, THE Backend SHALL extract the source channel ID from the event
2. WHEN the source channel ID is in the Backend's Source_Whitelist, THE Backend SHALL persist the message to its database
3. WHEN the source channel ID is NOT in the Backend's Source_Whitelist, THE Backend SHALL discard the message without persisting
4. THE Backend SHALL log all filtered-out messages at DEBUG level for observability
5. WHEN a Backend persists a message with a Media_Path, THE Backend SHALL store the Media_Path as-is without downloading the media again

### Requirement 5: Backfill on Reconnection

**User Story:** As a Backend, I want to receive missed messages when I reconnect after a disconnection, so that I don't lose messages due to temporary network failures.

#### Acceptance Criteria

1. WHEN Ingestion_Service ingests a message, THE Ingestion_Service SHALL store the message in a circular buffer with timestamps
2. THE circular buffer SHALL retain messages for at least 72 hours (Backfill_Window)
3. WHEN a Backend reconnects to the SSE_Stream, THE Backend SHALL provide its last-received message timestamp as a query parameter
4. WHEN Ingestion_Service accepts a reconnection, THE Ingestion_Service SHALL query the circular buffer for all messages after the provided timestamp
5. WHEN backfill messages exist, THE Ingestion_Service SHALL send them to the reconnecting Backend before resuming real-time broadcast
6. WHEN a Backend has been disconnected for longer than the Backfill_Window, THE Ingestion_Service SHALL send a backfill-unavailable event and resume real-time only

### Requirement 6: Channel Subscription Deduplication

**User Story:** As Ingestion_Service, I want to subscribe to each channel exactly once via MTProto, so that I respect Telegram rate limits and avoid redundant processing.

#### Acceptance Criteria

1. WHEN computing the Channel_Union from multiple Source_Whitelists, THE Ingestion_Service SHALL remove duplicate channel IDs
2. WHEN the Channel_Union changes, THE Ingestion_Service SHALL calculate the set difference between the new and old Channel_Union
3. WHEN channels are added to the Channel_Union, THE Ingestion_Service SHALL subscribe to the new channels via MTProto
4. WHEN channels are removed from the Channel_Union, THE Ingestion_Service SHALL unsubscribe from the removed channels via MTProto
5. THE Ingestion_Service SHALL maintain exactly one active MTProto subscription per channel ID at any time

### Requirement 7: Media File Sharing

**User Story:** As a Backend, I want to access media files downloaded by Ingestion_Service, so that I don't need to download them again from Telegram.

#### Acceptance Criteria

1. WHEN Ingestion_Service receives a message with media, THE Ingestion_Service SHALL download the media file to a shared filesystem path
2. THE shared filesystem path SHALL be accessible to all Backend instances via Docker volume mount
3. WHEN Ingestion_Service sends a Broadcast_Event for a message with media, THE Ingestion_Service SHALL include the Media_Path in the event
4. WHEN a Backend persists a message with a Media_Path, THE Backend SHALL store the Media_Path without downloading the file
5. THE Media_Path SHALL be relative to the shared volume mount point for portability across environments

### Requirement 8: Resilient Broadcast

**User Story:** As Ingestion_Service, I want to continue operating when some Backends are offline, so that available Backends are not affected by unavailable ones.

#### Acceptance Criteria

1. WHEN a Backend SSE connection fails, THE Ingestion_Service SHALL remove the Backend from the active connections list
2. WHEN broadcasting to a failed Backend, THE Ingestion_Service SHALL NOT block or retry the broadcast
3. WHEN all Backends are disconnected, THE Ingestion_Service SHALL continue ingesting messages and storing them in the backfill buffer
4. THE Ingestion_Service SHALL log Backend disconnections at WARN level for monitoring
5. THE Ingestion_Service SHALL emit a metric for the count of active Backend connections

### Requirement 9: Rate Limit Protection

**User Story:** As Ingestion_Service, I want to respect Telegram rate limits when the Channel_Union exceeds normal subscription capacity, so that my MTProto session is not banned.

#### Acceptance Criteria

1. THE Ingestion_Service SHALL track the number of channels in the Channel_Union
2. WHEN the Channel_Union exceeds 100 channels, THE Ingestion_Service SHALL log a warning about potential rate limit risk
3. THE Ingestion_Service SHALL implement exponential backoff when Telegram returns rate limit errors
4. WHEN a rate limit error occurs, THE Ingestion_Service SHALL delay new subscriptions by at least 60 seconds
5. THE Ingestion_Service SHALL expose a metric for the current Channel_Union size

### Requirement 10: Observability and Monitoring

**User Story:** As an operator, I want to monitor broadcast success rates and connection health, so that I can detect issues before they impact production.

#### Acceptance Criteria

1. THE Ingestion_Service SHALL expose a GET /api/ingestion/stream/status endpoint returning active Backend count and Channel_Union size
2. THE Ingestion_Service SHALL emit a metric for the count of Broadcast_Events sent per Backend identifier
3. THE Ingestion_Service SHALL emit a metric for the count of broadcast failures per Backend identifier
4. THE Ingestion_Service SHALL emit a metric for the size of the backfill buffer (number of messages retained)
5. THE Ingestion_Service SHALL log all Backend registrations, connections, and disconnections at INFO level

### Requirement 11: Backward Compatibility

**User Story:** As an operator, I want to deploy this feature without breaking the existing single-backend setup, so that I can roll back if issues occur.

#### Acceptance Criteria

1. WHEN no Backends register, THE Ingestion_Service SHALL fall back to the legacy BackendChannelProviderService behavior
2. WHEN the SSE registration endpoint is disabled via feature flag, THE Ingestion_Service SHALL use the legacy HTTP polling for channel IDs
3. THE Ingestion_Service SHALL continue supporting the existing SSE_Stream endpoint without authentication during the migration period
4. WHEN both legacy and new registration mechanisms are active, THE Ingestion_Service SHALL union the channels from both sources
5. THE Ingestion_Service SHALL log which channel registration mechanism is active on startup

### Requirement 12: Parser Round-Trip Property

**User Story:** As a developer, I want to ensure Broadcast_Event serialization is lossless, so that Backends receive complete message data.

#### Acceptance Criteria

1. THE Ingestion_Service SHALL define a Broadcast_Event JSON schema
2. THE Ingestion_Service SHALL implement a parser to deserialize Broadcast_Event JSON
3. THE Ingestion_Service SHALL implement a pretty printer to serialize Broadcast_Event objects to JSON
4. FOR ALL valid Broadcast_Event objects, parsing then printing then parsing SHALL produce an equivalent object (round-trip property)
5. THE parser SHALL return a descriptive error when the JSON does not match the schema

## Non-Functional Requirements

### NFR1: Latency

- Broadcast latency from Telegram message receipt to SSE delivery MUST be less than 500ms at p99
- Backend reconnection with backfill MUST complete within 10 seconds for 1000 buffered messages

### NFR2: Reliability

- Ingestion_Service MUST continue operating when ANY Backend is offline
- Backfill buffer MUST survive Ingestion_Service restarts by persisting to database
- SSE heartbeat MUST prevent proxy timeouts (30-second interval)

### NFR3: Scalability

- Ingestion_Service MUST support up to 5 concurrent Backend connections
- Backfill buffer MUST support at least 10,000 messages without degrading broadcast latency
- Channel_Union MUST support at least 200 unique channel IDs

### NFR4: Observability

- All broadcast failures MUST be logged with Backend identifier and error details
- Prometheus metrics MUST be exposed for active connections, broadcast count, and buffer size
- Health check endpoint MUST report status of MTProto connection and SSE broadcast readiness

## Recommendations for Open Decision Points

### Backfill Strategy

**Recommendation:** Hybrid approach — in-memory ring buffer (5000 messages) + database persistence for restart recovery.

**Rationale:**

- In-memory ring buffer provides O(1) lookup for recent messages during reconnections
- Database persistence ensures backfill survives Ingestion_Service restarts
- Ring buffer size (5000 messages) covers ~2 hours of traffic at peak load (40 msg/min across all channels)
- On startup, Ingestion_Service loads last 72h of messages from DB into ring buffer

### Failure Handling

**Recommendation:** Best-effort broadcast with circuit breaker per Backend.

**Rationale:**

- Circuit breaker opens after 3 consecutive broadcast failures to a Backend (30-second timeout)
- While open, Ingestion_Service skips broadcast attempts to that Backend but continues backfill buffering
- Circuit breaker half-opens after 5 minutes to allow reconnection attempts
- This prevents one slow/failing Backend from blocking broadcasts to healthy Backends

### Channel Conflict Resolution

**Recommendation:** Union-based subscription with Backend-level filtering.

**Rationale:**

- If production disables a channel but staging still needs it, Ingestion_Service keeps the MTProto subscription active
- Production Backend filters out the channel on its side (Requirement 4)
- Ingestion_Service only unsubscribes when NO Backend requests the channel
- This prevents staging from being blocked by production decisions
- Trade-off: Slightly higher MTProto traffic, but preserves Backend independence

### Backfill Window Duration

**Recommendation:** 72 hours (3 days).

**Rationale:**

- Covers weekend maintenance windows (Backend offline Friday evening → Monday morning)
- Balances storage cost vs. recovery window (10,000 messages @ 5KB avg = 50MB)
- Matches typical incident response SLA for non-critical services
- Longer windows require database archival strategy (out of scope for v1)

## Out of Scope (Future Considerations)

- Multi-region Ingestion_Service deployment (single region for v1)
- Dynamic Backend priority (all Backends treated equally in v1)
- Message replay API for arbitrary time ranges (only automatic backfill on reconnect)
- Compression of Broadcast_Events (raw JSON for v1)
- Authentication tokens for Backend registration (network-level security sufficient for v1)
