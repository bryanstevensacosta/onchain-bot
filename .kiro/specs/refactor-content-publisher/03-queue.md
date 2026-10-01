# Sistema Publisher — Queue Management

**Módulo**: `crypto-news-publisher/`  
**Responsabilidad**: FIFO buffer, state machine, retry logic, TTL

---

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [PublisherQueueEntry Entity](#publisherqueueentry-entity)
3. [State Machine](#state-machine)
4. [Deduplication](#deduplication)
5. [TTL & Expiration](#ttl--expiration)
6. [Overflow Management](#overflow-management)
7. [Repository Interface](#repository-interface)
8. [Database Schema](#database-schema)
9. [APIs](#apis)

---

## Visión General

El **Publisher Queue** es un buffer FIFO persistente que desacopla el matching (fast) del publishing (throttled).

### Características

- **Capacity**: 36 entries max (overflow → DeadLetterQueue)
- **TTL**: 24 horas para entries PENDING
- **Retry**: Hasta `llmMaxAttempts` (default 3)
- **Deduplication**: Por channelId+messageId (UNIQUE constraint)
- **State Tracking**: PENDING → SCHEDULED → PUBLISHED/FAILED/BLOCKED
- **Correlation**: `traceId` para debugging end-to-end

### Metrics

```typescript
interface QueueStats {
  pending: number; // Waiting to publish
  scheduled: number; // Reserved by cron (transient)
  published: number; // Successfully published
  failed: number; // Failed after retries
  blocked: number; // Duplicates or policy violations
  oldestPending: Date | null;
}
```

---

## PublisherQueueEntry Entity

**Ubicación**: `domain/entities/publisher-queue-entry.entity.ts`

### Props

```typescript
interface PublisherQueueEntryProps {
  // Identity & Correlation
  traceId: string; // UUID for end-to-end tracking
  channelId: string; // Telegram channel ID
  messageId: number; // Telegram message ID

  // Content (FILTERED — post-transform)
  rawContent: string; // Filtered content (NOT truly "raw")
  rawTitle: string | null; // Extracted title
  imagePath: string | null; // DEPRECATED (use imagePaths)
  imagePaths: string[]; // Media URLs (ingestion-telegram)
  groupedId: string | null; // Media group ID
  formattingEntities: string | null; // Telegram formatting JSON

  // Matching Metadata
  matchedKeywordIds: string[]; // Keywords que triggered match
  keywordTemplateId: string | null; // Template override (priority)

  // Timestamps
  messageReceivedAt: Date; // Original ingest time (ingestion-telegram)
  queuedAt: Date; // Enqueue timestamp (backend)
  publishedAt: Date | null; // Publish success timestamp

  // State Management
  status: PublisherQueueStatus; // Current state
  telegramMessageId: string | null; // Published message ID (Bot API)
  lastError: string | null; // Failure reason
  attempts: number; // Retry counter

  // LLM Generation Data (populated on publish, null if llmEnabled=false)
  generatedContent: string | null;
  generatedSystemPrompt: string | null;
  generatedUserPrompt: string | null;
  generatedTemperature: number | null;
  generatedReasoningEffort: string | null;
  generatedModel: string | null;

  // Deduplication References
  blockedReason: string | null; // Why BLOCKED
  duplicateOfChannelId: string | null;
  duplicateOfMessageId: number | null;
  duplicateOfEntryId: string | null;
}
```

### Status Enum

```typescript
enum PublisherQueueStatus {
  PENDING = 'PENDING', // Waiting in queue
  SCHEDULED = 'SCHEDULED', // Reserved by cron (transient, <1min)
  PUBLISHED = 'PUBLISHED', // Successfully published to Telegram
  FAILED = 'FAILED', // Failed after max retries
  BLOCKED = 'BLOCKED', // Duplicate or policy violation
}
```

### Factory Method

```typescript
class PublisherQueueEntry extends AggregateRoot<string> {
  static create(input: {
    channelId: string;
    messageId: number;
    rawContent: string;
    rawTitle?: string;
    imagePaths?: string[];
    groupedId?: string;
    matchedKeywordIds?: string[];
    keywordTemplateId?: string;
    formattingEntities?: string;
    messageReceivedAt?: Date;
  }): PublisherQueueEntry {
    // Validations
    if (!input.channelId || input.channelId.trim().length === 0) {
      throw new DomainError('channelId', 'channelId cannot be empty');
    }

    if (!input.messageId || input.messageId <= 0) {
      throw new DomainError('messageId', 'messageId must be positive');
    }

    if (!input.rawContent || input.rawContent.trim().length === 0) {
      throw new DomainError('rawContent', 'rawContent cannot be empty');
    }

    if (input.rawContent.length > 100_000) {
      throw new DomainError(
        'rawContent',
        'rawContent too long (max 100k chars)',
      );
    }

    // Create
    const props: PublisherQueueEntryProps = {
      traceId: uuid(),
      channelId: input.channelId.trim(),
      messageId: input.messageId,
      rawContent: input.rawContent.trim(),
      rawTitle: input.rawTitle?.trim() || null,
      imagePath: null, // DEPRECATED
      imagePaths: input.imagePaths || [],
      groupedId: input.groupedId || null,
      matchedKeywordIds: input.matchedKeywordIds || [],
      keywordTemplateId: input.keywordTemplateId || null,
      formattingEntities: input.formattingEntities || null,
      messageReceivedAt: input.messageReceivedAt || new Date(),
      queuedAt: new Date(),
      status: PublisherQueueStatus.PENDING,
      publishedAt: null,
      telegramMessageId: null,
      lastError: null,
      attempts: 0,
      generatedContent: null,
      generatedSystemPrompt: null,
      generatedUserPrompt: null,
      generatedTemperature: null,
      generatedReasoningEffort: null,
      generatedModel: null,
      blockedReason: null,
      duplicateOfChannelId: null,
      duplicateOfMessageId: null,
      duplicateOfEntryId: null,
    };

    return new PublisherQueueEntry(uuid(), props);
  }
}
```

### Getters

```typescript
// Identity
get traceId(): string { return this.props.traceId; }
get channelId(): string { return this.props.channelId; }
get messageId(): number { return this.props.messageId; }

// Content
get rawContent(): string { return this.props.rawContent; }
get rawTitle(): string | null { return this.props.rawTitle; }
get imagePaths(): string[] { return [...this.props.imagePaths]; }
get groupedId(): string | null { return this.props.groupedId; }

// Matching
get matchedKeywordIds(): string[] { return [...this.props.matchedKeywordIds]; }
get keywordTemplateId(): string | null { return this.props.keywordTemplateId; }

// Timestamps
get messageReceivedAt(): Date { return this.props.messageReceivedAt; }
get queuedAt(): Date { return this.props.queuedAt; }
get publishedAt(): Date | null { return this.props.publishedAt; }

// State
get status(): PublisherQueueStatus { return this.props.status; }
get telegramMessageId(): string | null { return this.props.telegramMessageId; }
get lastError(): string | null { return this.props.lastError; }
get attempts(): number { return this.props.attempts; }

// LLM data
get generatedContent(): string | null { return this.props.generatedContent; }
get generatedModel(): string | null { return this.props.generatedModel; }

// Dedup
get blockedReason(): string | null { return this.props.blockedReason; }
get duplicateOfChannelId(): string | null { return this.props.duplicateOfChannelId; }
get duplicateOfMessageId(): number | null { return this.props.duplicateOfMessageId; }
get duplicateOfEntryId(): string | null { return this.props.duplicateOfEntryId; }

// Computed
get isTerminal(): boolean {
  return this.status === PublisherQueueStatus.PUBLISHED ||
         this.status === PublisherQueueStatus.FAILED ||
         this.status === PublisherQueueStatus.BLOCKED;
}
```

---

## State Machine

### States & Transitions

```
┌─────────┐
│ PENDING │ ◄─────────┐
└────┬────┘           │
     │                │
     │ dequeue        │ retry (attempts < max)
     ▼                │
┌───────────┐         │
│ SCHEDULED │─────────┤
└─────┬─────┘         │
      │               │
      ├─ success ─────┴──► ┌───────────┐
      │                     │ PUBLISHED │
      │                     └───────────┘
      │
      ├─ failure ──────────► ┌────────┐
      │   (attempts >= max)  │ FAILED │
      │                      └────────┘
      │
      └─ duplicate ────────► ┌─────────┐
                             │ BLOCKED │
                             └─────────┘
```

### Transition Methods

**PENDING → SCHEDULED**:

```typescript
markScheduled(at: Date): void {
  this.assertTransitionFrom(PublisherQueueStatus.PENDING, 'markScheduled');

  this.props.status = PublisherQueueStatus.SCHEDULED;
  // No persiste timestamp — transient state (<1min)
}

private assertTransitionFrom(expected: PublisherQueueStatus, method: string): void {
  if (this.props.status !== expected) {
    throw new DomainError(
      'status',
      `Cannot ${method} from status ${this.props.status} (expected ${expected})`
    );
  }
}
```

**SCHEDULED → PUBLISHED**:

```typescript
markPublished(
  telegramMessageId: string,
  llmData?: {
    content: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    reasoningEffort: string | null;
    model: string;
  }
): void {
  this.assertTransitionFrom(PublisherQueueStatus.SCHEDULED, 'markPublished');

  // Validate telegram message ID
  if (!telegramMessageId || telegramMessageId.trim().length === 0) {
    throw new DomainError('telegramMessageId', 'telegramMessageId required');
  }

  // Update state
  this.props.status = PublisherQueueStatus.PUBLISHED;
  this.props.publishedAt = new Date();
  this.props.telegramMessageId = telegramMessageId.trim();
  this.props.lastError = null; // Clear any previous errors

  // Store LLM data si provided
  if (llmData) {
    this.props.generatedContent = llmData.content;
    this.props.generatedSystemPrompt = llmData.systemPrompt;
    this.props.generatedUserPrompt = llmData.userPrompt;
    this.props.generatedTemperature = llmData.temperature;
    this.props.generatedReasoningEffort = llmData.reasoningEffort;
    this.props.generatedModel = llmData.model;
  }
}
```

**SCHEDULED → PENDING** (retry):

```typescript
markFailed(reason: string): void {
  this.assertTransitionFrom(PublisherQueueStatus.SCHEDULED, 'markFailed');

  if (!reason || reason.trim().length === 0) {
    throw new DomainError('reason', 'Failure reason required');
  }

  // Increment attempts
  this.props.attempts++;
  this.props.lastError = reason.trim();

  // Determine next state based on attempts
  // Note: Caller (use case) decides retry vs terminal based on llmMaxAttempts
  this.props.status = PublisherQueueStatus.PENDING; // Back to queue
}
```

**SCHEDULED → FAILED** (terminal):

```typescript
markFailedTerminal(reason: string): void {
  this.assertTransitionFrom(PublisherQueueStatus.SCHEDULED, 'markFailedTerminal');

  this.props.status = PublisherQueueStatus.FAILED;
  this.props.lastError = reason.trim();
  // attempts already incremented by markFailed
}
```

**PENDING → BLOCKED** (duplicate):

```typescript
markBlocked(
  reason: string,
  duplicateOf?: {
    channelId?: string;
    messageId?: number;
    entryId?: string;
  }
): void {
  this.assertTransitionFrom(PublisherQueueStatus.PENDING, 'markBlocked');

  this.props.status = PublisherQueueStatus.BLOCKED;
  this.props.blockedReason = reason.trim();

  if (duplicateOf) {
    this.props.duplicateOfChannelId = duplicateOf.channelId || null;
    this.props.duplicateOfMessageId = duplicateOf.messageId || null;
    this.props.duplicateOfEntryId = duplicateOf.entryId || null;
  }
}
```

### Use Case Integration

```typescript
// ProcessNextQueuedArticleUseCase
async execute(): Promise<void> {
  // 1. Dequeue oldest PENDING
  const entry = await this.queueRepo.findNextPending();
  if (!entry) return;

  // 2. Mark SCHEDULED (transient)
  await this.queueRepo.markScheduled(entry.id, new Date());

  try {
    // 3. Generate content (LLM or raw)
    const content = await this.generateContent(entry);

    // 4. Publish to Telegram
    const result = await this.publisher.sendMessage(content);

    // 5. Mark PUBLISHED
    await this.queueRepo.markPublished(
      entry.id,
      result.messageId,
      content.llmData
    );

  } catch (err) {
    // 6. Retry or fail
    const cfg = await this.llmConfigRepo.load();

    entry.incrementAttempts();

    if (entry.attempts < cfg.llmMaxAttempts) {
      // Retry — back to PENDING
      await this.queueRepo.markFailed(entry.id, err.message);
    } else {
      // Terminal — mark FAILED
      await this.queueRepo.markFailedTerminal(
        entry.id,
        `Failed after ${entry.attempts} attempts: ${err.message}`
      );
    }
  }
}
```

---

## Deduplication

### Strategy 1: Exact Match (channelId + messageId)

**UNIQUE Constraint**:

```sql
CONSTRAINT uq_channel_message UNIQUE (channel_id, message_id)
```

**Repository Check**:

```typescript
async findByChannelIdAndMessageId(
  channelId: string,
  messageId: number
): Promise<PublisherQueueEntry | null> {
  return this.repo.findOne({
    where: { channelId, messageId }
  });
}
```

**Use Case Logic**:

```typescript
// EnqueueMatchingMessageUseCase
async execute(input: EnqueueMessageDto): Promise<void> {
  // 1. Check exact duplicate
  const existing = await this.queueRepo.findByChannelIdAndMessageId(
    input.channelId,
    input.messageId
  );

  if (existing) {
    // Already processed
    if (existing.status === PublisherQueueStatus.PENDING) {
      this.logger.debug(`Entry already PENDING: ${existing.id}`);
      return;
    }

    if (existing.status === PublisherQueueStatus.PUBLISHED) {
      this.logger.debug(`Entry already PUBLISHED: ${existing.id}`);
      return;
    }

    if (existing.status === PublisherQueueStatus.BLOCKED) {
      this.logger.debug(`Entry BLOCKED: ${existing.blockedReason}`);
      return;
    }

    // Check if failure is blocking (content issue) or non-blocking (transient)
    if (existing.status === PublisherQueueStatus.FAILED) {
      if (isBlockingFailureReason(existing.lastError)) {
        this.logger.debug(
          `Entry FAILED with blocking reason: ${existing.lastError}`
        );
        return; // Permanent block
      }

      // Non-blocking failure — allow retry
      this.logger.info(
        `Entry FAILED with non-blocking reason (${existing.lastError}), allowing re-enqueue`
      );
      // Fall through to create new entry
    }
  }

  // 2. Create new entry
  const entry = PublisherQueueEntry.create(input);
  await this.queueRepo.save(entry);
}
```

### Strategy 2: Semantic Deduplication

**Integration** con `DeduplicationService`:

```typescript
// EnqueueMatchingMessageUseCase (con @Optional() dedupService)
async execute(input: EnqueueMessageDto): Promise<void> {
  // ... exact match check (above)

  // Semantic dedup (optional — si service wired)
  if (this.dedupService) {
    const fingerprint = await this.dedupService.generateFingerprint({
      title: input.rawTitle || '',
      content: input.rawContent,
      urls: this.extractUrls(input.rawContent)
    });

    const duplicate = await this.dedupService.findDuplicate(
      fingerprint,
      CRYPTO_NEWS_DEDUP_SOURCE,
      DEDUP_SEMANTIC_ARBITER_THRESHOLD // 0.7
    );

    if (duplicate && duplicate.similarity >= DEDUP_SEMANTIC_ARBITER_THRESHOLD) {
      // Mark as BLOCKED
      const entry = PublisherQueueEntry.create(input);
      entry.markBlocked(
        `Semantic duplicate (similarity ${duplicate.similarity.toFixed(2)})`,
        { entryId: duplicate.entryId }
      );
      await this.queueRepo.save(entry);

      this.logger.info(
        `Entry blocked as semantic duplicate of ${duplicate.entryId} ` +
        `(similarity ${duplicate.similarity.toFixed(2)})`
      );
      return;
    }
  }

  // Create and save
  const entry = PublisherQueueEntry.create(input);
  await this.queueRepo.save(entry);

  // Store fingerprint AFTER successful save
  if (this.dedupService) {
    try {
      await this.dedupService.markAsSeen(
        fingerprint,
        entry.id,
        CRYPTO_NEWS_DEDUP_SOURCE
      );
    } catch (err) {
      this.logger.warn(
        `Failed to store fingerprint for ${entry.id}: ${err.message}`
      );
      // Don't throw — entry already saved
    }
  }
}
```

### Blocking vs Non-Blocking Failures

**Constants** (`shared/deduplication/domain/constants/blocking-failure-reasons.ts`):

```typescript
export const BLOCKING_FAILURE_REASONS = [
  'non-Latin character',
  'policy',
  'Content violates policy',
  'blacklist',
  'Blacklist match',
  'honeypot',
  'scam',
  'rug',
  'duplicate',
  'Semantic duplicate',
];

export function isBlockingFailureReason(reason: string | null): boolean {
  if (!reason) return false;

  const lower = reason.toLowerCase();
  return BLOCKING_FAILURE_REASONS.some((blocked) =>
    lower.includes(blocked.toLowerCase()),
  );
}
```

**Non-Blocking Failures** (allow retry):

- `"Expired: exceeded 24h in queue"`
- `"Publisher not configured"`
- `"Rate limit exceeded"`
- `"LLM generation failed"`
- `"Network timeout"`

---

## TTL & Expiration

### Purpose

Evitar unbounded queue growth cuando `publishingEnabled=false` por períodos extendidos.

### Implementation

**Scheduler**: `ExpireStaleQueueEntriesScheduler`

```typescript
@Injectable()
export class ExpireStaleQueueEntriesScheduler {
  private readonly TTL_HOURS = 24;

  @Cron('*/30 * * * *') // Every 30 minutes
  async tick(): Promise<void> {
    const cutoff = new Date(Date.now() - this.TTL_HOURS * 60 * 60 * 1000);

    const staleEntries = await this.queueRepo.findPendingOlderThan(cutoff);

    if (staleEntries.length === 0) {
      this.logger.debug('No stale entries found');
      return;
    }

    for (const entry of staleEntries) {
      await this.queueRepo.markFailed(
        entry.id,
        'Expired: exceeded 24h in queue without publishing',
      );
    }

    this.logger.log(
      `Expired ${staleEntries.length} stale entries (older than ${this.TTL_HOURS}h)`,
    );
  }
}
```

**Repository Query** (optimized con partial index):

```typescript
async findPendingOlderThan(cutoff: Date): Promise<PublisherQueueEntry[]> {
  return this.repo.find({
    where: {
      status: PublisherQueueStatus.PENDING,
      queuedAt: LessThan(cutoff)
    },
    order: { queuedAt: 'ASC' }
  });
}
```

**Database Index**:

```sql
CREATE INDEX idx_publisher_queue_status_queued_at
  ON crypto_news_publisher_queue(status, queued_at)
  WHERE status = 'PENDING';
```

### Rationale

- **24h TTL**: Crypto news loses relevance quickly
- **Prevents stale content**: Cuando publishing resume, queue solo tiene contenido fresco
- **Bounded growth**: Queue size nunca crece indefinidamente
- **Retry-friendly**: Expired entries pueden re-enqueued si mensaje reaparece

---

## Overflow Management

### Capacity Limit

**Hard Cap**: 36 entries PENDING

**Rationale**:

- Daily cap típico: 20-30 publishes
- Buffer para peaks: +6 entries
- Evita memory issues con miles de entries

### Overflow Handling

```typescript
// EnqueueMatchingMessageUseCase
const QUEUE_CAPACITY = 36;

async execute(input: EnqueueMessageDto): Promise<void> {
  // ... dedup checks

  // Check capacity
  const pendingCount = await this.queueRepo.countPending();

  if (pendingCount >= QUEUE_CAPACITY) {
    // Overflow → DeadLetterQueue
    await this.deadLetterService.capture({
      channelId: input.channelId,
      messageId: input.messageId,
      rawContent: input.rawContent,
      rawTitle: input.rawTitle,
      reason: 'Queue overflow',
      metadata: {
        pendingCount,
        capacity: QUEUE_CAPACITY
      }
    });

    this.logger.warn(
      `Queue overflow: ${pendingCount}/${QUEUE_CAPACITY} — ` +
      `message ${input.channelId}:${input.messageId} sent to DLQ`
    );
    return;
  }

  // Proceed with enqueue
  // ...
}
```

### DeadLetterQueue

**Entity**: `DeadLetterQueueEntry`

```typescript
interface DeadLetterQueueEntryProps {
  channelId: string;
  messageId: number;
  rawContent: string;
  rawTitle: string | null;
  reason: string; // Why sent to DLQ
  metadata: Record<string, any> | null;
  capturedAt: Date;
  retried: boolean; // Manual retry flag
  retriedAt: Date | null;
}
```

**Table**:

```sql
CREATE TABLE crypto_news_integration_dead_letter_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   VARCHAR NOT NULL,
  message_id   INTEGER NOT NULL,
  raw_content  TEXT NOT NULL,
  raw_title    VARCHAR,
  reason       VARCHAR NOT NULL,
  metadata     JSONB,
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retried      BOOLEAN NOT NULL DEFAULT false,
  retried_at   TIMESTAMPTZ,

  CONSTRAINT uq_dlq_channel_message UNIQUE (channel_id, message_id)
);
```

**Manual Retry**:

```http
POST /crypto-news-integration/dead-letter/retry/:id
Response: { success: true, entryId: string }
```

---

## Repository Interface

```typescript
interface PublisherQueueRepository {
  // Create
  save(entry: PublisherQueueEntry): Promise<void>;

  // Query
  findById(id: string): Promise<PublisherQueueEntry | null>;
  findByChannelIdAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<PublisherQueueEntry | null>;
  findNextPending(): Promise<PublisherQueueEntry | null>;
  findPendingOlderThan(cutoff: Date): Promise<PublisherQueueEntry[]>;

  // Count
  countPending(): Promise<number>;
  countByStatus(status: PublisherQueueStatus): Promise<number>;

  // State transitions
  markScheduled(id: string, at: Date): Promise<void>;
  markPublished(
    id: string,
    telegramMessageId: string,
    llmData?: LlmGenerationData,
  ): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
  markFailedTerminal(id: string, reason: string): Promise<void>;
  markBlocked(
    id: string,
    reason: string,
    duplicateOf?: DuplicateRef,
  ): Promise<void>;

  // Admin
  listQueue(filter: QueueFilter, pagination: Pagination): Promise<QueuePage>;
  getQueueStats(): Promise<QueueStats>;
  deleteEntry(id: string): Promise<void>;
}
```

### Implementation Notes

**findNextPending** (FIFO):

```typescript
async findNextPending(): Promise<PublisherQueueEntry | null> {
  return this.repo.findOne({
    where: { status: PublisherQueueStatus.PENDING },
    order: { queuedAt: 'ASC' }, // Oldest first
    lock: { mode: 'pessimistic_write' } // Row-level lock (multi-replica safe)
  });
}
```

**markScheduled** (atomic):

```typescript
async markScheduled(id: string, at: Date): Promise<void> {
  const result = await this.repo.update(
    { id, status: PublisherQueueStatus.PENDING }, // WHERE clause ensures state
    { status: PublisherQueueStatus.SCHEDULED }
  );

  if (result.affected === 0) {
    throw new Error(`Cannot mark entry ${id} as SCHEDULED (not PENDING)`);
  }
}
```

---

## Database Schema

```sql
CREATE TABLE crypto_news_publisher_queue (
  -- Identity
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id                    VARCHAR NOT NULL,
  channel_id                  VARCHAR NOT NULL,
  message_id                  INTEGER NOT NULL,

  -- Content
  raw_content                 TEXT NOT NULL,
  raw_title                   VARCHAR,
  image_path                  VARCHAR,              -- DEPRECATED
  image_paths                 TEXT[],
  grouped_id                  VARCHAR,
  formatting_entities         TEXT,

  -- Matching
  matched_keyword_ids         TEXT[],
  keyword_template_id         UUID,

  -- Timestamps
  message_received_at         TIMESTAMPTZ NOT NULL,
  queued_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at                TIMESTAMPTZ,

  -- State
  status                      VARCHAR NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'BLOCKED')),
  telegram_message_id         VARCHAR,
  last_error                  TEXT,
  attempts                    INTEGER NOT NULL DEFAULT 0,

  -- LLM Generation
  generated_content           TEXT,
  generated_system_prompt     TEXT,
  generated_user_prompt       TEXT,
  generated_temperature       NUMERIC,
  generated_reasoning_effort  VARCHAR,
  generated_model             VARCHAR,

  -- Deduplication
  blocked_reason              TEXT,
  duplicate_of_channel_id     VARCHAR,
  duplicate_of_message_id     INTEGER,
  duplicate_of_entry_id       UUID,

  -- Constraints
  CONSTRAINT uq_channel_message UNIQUE (channel_id, message_id)
);

-- Indexes
CREATE INDEX idx_publisher_queue_status
  ON crypto_news_publisher_queue(status);

CREATE INDEX idx_publisher_queue_status_queued_at
  ON crypto_news_publisher_queue(status, queued_at)
  WHERE status = 'PENDING';

CREATE INDEX idx_publisher_queue_trace_id
  ON crypto_news_publisher_queue(trace_id);

CREATE INDEX idx_publisher_queue_published_at
  ON crypto_news_publisher_queue(published_at)
  WHERE status = 'PUBLISHED';
```

---

## APIs

### Queue Listing

```http
GET /crypto-news-publisher/queue
Query Parameters:
  - status: PENDING | SCHEDULED | PUBLISHED | FAILED | BLOCKED
  - limit: number (default 50, max 100)
  - offset: number (default 0)
  - sortBy: queuedAt | publishedAt (default queuedAt)
  - sortOrder: ASC | DESC (default DESC)

Response: {
  entries: PublisherQueueEntryDto[];
  total: number;
  stats: QueueStats;
}
```

### Queue Stats

```http
GET /crypto-news-publisher/queue/stats
Response: {
  pending: number;
  scheduled: number;
  published: number;
  failed: number;
  blocked: number;
  oldestPending: string | null;  // ISO timestamp
}
```

### Get Entry

```http
GET /crypto-news-publisher/queue/:id
Response: PublisherQueueEntryDto
```

### Delete Entry

```http
DELETE /crypto-news-publisher/queue/:id
Response: { success: true }
```

### Media Serving

```http
GET /crypto-news-publisher/queue/media/:entryId/:index
Response: Image binary (JPEG/PNG/WebP)

# Proxy logic:
# 1. Try local cache first (tmpdir staging)
# 2. Fallback to ingestion-telegram: GET /api/media/:channelId/:messageId/:index
```

---

**Navegación**: [← 02-matching.md](./02-matching.md) | [04-llm.md →](./04-llm.md)
