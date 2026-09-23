# KOL & Crypto-News Refactor Recommendations

> **Created:** 2026-09-20  
> **Branch:** dev  
> **Context:** Post-split architecture (2026-09-08)  
> **Purpose:** Detailed recommendations for improving the KOL/Crypto-News system

---

## Table of Contents

1. [Priority Matrix](#priority-matrix)
2. [Architectural Clarity](#architectural-clarity)
3. [Code Quality](#code-quality)
4. [Performance](#performance)
5. [Observability](#observability)
6. [Documentation](#documentation)
7. [Implementation Examples](#implementation-examples)

---

## Priority Matrix

| Priority | Recommendation | Impact | Effort | Rationale |
|----------|---------------|--------|--------|-----------|
| 🔴 **HIGH** | Metrics + Alerts | Critical | Medium | Detect issues before users complain |
| 🔴 **HIGH** | Dual-Path Documentation | High | Low | Prevent confusion in future refactors |
| 🔴 **HIGH** | Configuration Reference | High | Low | Eliminate "what does this variable do?" in deploys |
| 🟡 **MEDIUM** | Rename Coordinators | Medium | Low | Eliminate class name ambiguity |
| 🟡 **MEDIUM** | 2-Flag Validation | Medium | Low | Prevent invalid configurations |
| 🟡 **MEDIUM** | Error Handling with DLQ | Medium | Medium | Don't lose messages silently |
| 🟢 **LOW** | Adaptive Polling | Low | Medium | Performance optimization |
| 🟢 **LOW** | OpenAPI Docs | Low | Medium | Help frontend/QA teams |
| 🟢 **LOW** | Migration Guides | Low | Medium | Useful when onboarding new devs |

**Suggested Implementation Order:** Work top-to-bottom within each priority level.

---

## Architectural Clarity

### 1. Document Dual-Path Explicitly

**Current Problem:**  
The system has two paths for processing crypto-news (SSE + Polling), but this is not documented explicitly in code.

**Current State:**
```typescript
// apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts
@Cron('*/5 * * * *')
async pollMessages() {
  const messages = await this.fetch();
  await this.enqueue(messages);
}
```

**Recommended State:**
```typescript
/**
 * FALLBACK PATH: Polling scheduler for crypto-news messages
 * 
 * Architecture: Dual-Path Ingestion
 * - PRIMARY PATH: SSE events (<10s latency target)
 * - FALLBACK PATH: This poller (catches gaps from SSE disconnections)
 * 
 * Polling Intervals:
 * - SSE enabled: 5min (light polling, catches rare gaps)
 * - SSE disabled: 1min (primary ingestion mode, SSE unavailable)
 * 
 * See: docs/architecture/crypto-news-dual-path.md
 */
@Cron('*/5 * * * *')
async pollMessages() {
  const messages = await this.fetch();
  await this.enqueue(messages);
}
```

**Files to Update:**
- `apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts`
- `apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts`

**Impact:**  
Future developers will understand WHY two mechanisms exist and when to use each.

---

### 2. Consolidate Coordinator Logic

**Current Problem:**  
Two classes named `IngestionCoordinator` with different responsibilities:

| Service | Class | Responsibility | File |
|---------|-------|----------------|------|
| Backend | `IngestionCoordinator` | **Routing** (KOL vs crypto-news) | `apps/backend/src/telegram/ingestion/shared/application/ingestion-coordinator.service.ts` |
| Ingestion-Telegram | `IngestionCoordinator` | **Persistence** (save to DB) | `apps/ingestion-telegram/src/telegram/shared/application/coordinators/ingestion.coordinator.ts` |

**Confusion Example:**
```typescript
// In backend:
IngestionCoordinator.route(raw, 'kol')  // ❓ Does this save or just route?

// In ingestion-telegram:
IngestionCoordinator.route(raw, 'crypto-news')  // ❓ Does this do the same?
```

**Recommended Refactor:**

**Backend:**
```typescript
// OLD: apps/backend/src/telegram/ingestion/shared/application/ingestion-coordinator.service.ts
export class IngestionCoordinator { ... }

// NEW: Rename to clarify responsibility
export class MessageRoutingService {  // or TelegramMessageRouter
  async route(raw: TelegramRawMessage): Promise<void> {
    const type = raw.messageType; // 'kol' | 'crypto-news'
    
    if (type === 'kol') {
      await this.kolOrchestrator.handle(raw);
    } else if (type === 'crypto-news') {
      await this.cryptoNewsHandler.handle(raw);
    }
  }
}
```

**Ingestion-Telegram:**
```typescript
// OLD: apps/ingestion-telegram/src/telegram/shared/application/coordinators/ingestion.coordinator.ts
export class IngestionCoordinator { ... }

// NEW: Rename to clarify responsibility
export class MessagePersistenceCoordinator {  // or IngestionPersistenceService
  async persist(raw: TelegramRawMessage, type: 'kol' | 'crypto-news'): Promise<void> {
    if (type === 'kol') {
      // KOL messages are NOT persisted (ToS compliance)
      await this.stream.broadcast({ type: 'message:telegram', data: raw });
    } else if (type === 'crypto-news') {
      await this.cryptoNewsRepo.save(raw);
      await this.stream.broadcast({ type: 'message:telegram', data: raw });
    }
  }
}
```

**Migration Strategy:**
1. Create new classes with clear names
2. Update all imports (use IDE refactoring)
3. Add deprecation notice to old classes
4. Remove old classes after 1 sprint

**Impact:**  
Class names now explicitly communicate their responsibility. No more "which coordinator does what?"

---

### 3. Formalize 2-Flag System

**Current Problem:**  
`llmEnabled` and `publishingEnabled` are interdependent (LLM only runs if publishing is active), but there's no validation.

**Problematic Scenario:**
```typescript
// User updates config via API:
await updateLlmConfig({ 
  llmEnabled: true, 
  publishingEnabled: false 
});

// ❌ LLM will NEVER run, but no error or warning is shown
// User expects LLM refinement, but gets nothing
```

**Current Behavior Table:**

| llmEnabled | publishingEnabled | Actual Behavior | User Expectation |
|------------|-------------------|-----------------|------------------|
| ✅ true    | ❌ false          | **No LLM, no publish** | ❌ "LLM should run" |
| ✅ true    | ✅ true           | LLM + publish | ✅ Correct |
| ❌ false   | ✅ true           | Publish raw | ✅ Correct |

**Recommendation Option 1: Add Validation**

```typescript
// apps/backend/src/telegram/crypto-news-publisher/application/handlers/update-llm-config.use-case.ts
export class UpdateLlmConfigUseCase {
  async execute(dto: UpdateLlmConfigDto): Promise<void> {
    // Validate flag dependency
    if (dto.llmEnabled && !dto.publishingEnabled) {
      throw new BadRequestException(
        'Cannot enable LLM when publishing is disabled. ' +
        'LLM refinement only runs when publishing is active. ' +
        'Set publishingEnabled=true first, then enable LLM.'
      );
    }
    
    await this.repository.update(dto);
    
    this.logger.log(`LLM config updated: ${JSON.stringify(dto)}`);
  }
}
```

**API Response Example:**
```json
// PATCH /crypto-news-publisher/config
{
  "llmEnabled": true,
  "publishingEnabled": false
}

// Response: 400 Bad Request
{
  "statusCode": 400,
  "message": "Cannot enable LLM when publishing is disabled. LLM refinement only runs when publishing is active. Set publishingEnabled=true first, then enable LLM.",
  "error": "Bad Request"
}
```

**Recommendation Option 2: Merge Flags (If Coupling is Intentional)**

```typescript
// Instead of 2 separate flags:
interface LlmConfig {
  llmEnabled: boolean;
  publishingEnabled: boolean;
}

// Consider a single flag with 3 states:
type PublishingMode = 'DISABLED' | 'RAW' | 'LLM_REFINED';

interface PublisherConfig {
  mode: PublishingMode;
}

// Simplified logic:
async publishNext() {
  const entry = await this.queue.getNext();
  
  switch (this.config.mode) {
    case 'DISABLED':
      return; // Skip
      
    case 'RAW':
      await this.botApi.sendMessage(entry.content.text);
      break;
      
    case 'LLM_REFINED':
      const refined = await this.llm.refine(entry.content.text);
      await this.botApi.sendMessage(refined);
      break;
  }
}
```

**Database Migration:**
```sql
-- Old schema
CREATE TABLE crypto_news_llm_config (
  llm_enabled BOOLEAN,
  publishing_enabled BOOLEAN
);

-- New schema (Option 2)
CREATE TABLE crypto_news_publisher_config (
  mode VARCHAR CHECK (mode IN ('DISABLED', 'RAW', 'LLM_REFINED'))
);

-- Migrate data
UPDATE crypto_news_publisher_config
SET mode = CASE
  WHEN NOT publishing_enabled THEN 'DISABLED'
  WHEN NOT llm_enabled THEN 'RAW'
  ELSE 'LLM_REFINED'
END;
```

**Impact:**  
- **Option 1:** Prevents invalid configurations with clear error messages
- **Option 2:** Simplifies codebase if coupling is intentional (fewer flags, clearer state machine)

**Recommendation:** Start with **Option 1** (quick win), evaluate **Option 2** if you find yourself always changing both flags together.

---

## Code Quality

### 1. Remove Spanish Comments

**Current Problem:**  
Mixed Spanish/English comments create confusion.

**Files to Update:**

**Found via search:**
```bash
rg "(Detecta|Emite|vía|otros\s+\d+|para\s+KOL)" --type typescript
```

**Example Fix:**
```typescript
// ❌ Before
// Detecta mensaje de canal KOL
if (this.isKolChannel(channelId)) {
  // Emite SSE sin texto
  await this.stream.broadcast({ ... });
}

// ✅ After
// Detect KOL channel message
if (this.isKolChannel(channelId)) {
  // Emit SSE without text (ToS compliance)
  await this.stream.broadcast({ ... });
}
```

**Impact:**  
Consistent English codebase, easier for international developers.

---

### 2. Type Safety Improvements

#### A) Document Opaque Foreign Keys

**Current Problem:**  
`channel_id` in backend tables has NO FK to ingestion DB (cross-database, opaque by design).

**Risk:**
```typescript
// Backend can insert IDs that don't exist in ingestion DB
await queueRepo.save({
  channelId: '-999999999999',  // ❌ No FK constraint, accepts ANY value
  messageId: 123
});
// Publishing will fail later with 404 from ingestion API
```

**Recommended Documentation:**
```typescript
// apps/backend/src/telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/publisher-queue.entity.ts
@Entity('crypto_news_publisher_queue')
export class PublisherQueueEntity {
  /**
   * Opaque channel ID reference.
   * 
   * IMPORTANT: No FK constraint to ingestion DB (cross-database architecture).
   * 
   * Validation Strategy:
   * - Ingestion-telegram API validates channel existence during message fetch
   * - Invalid IDs fail during publishing with 404 from ingestion API
   * - Failures are logged with status=FAILED and reason="Channel not found"
   * 
   * To validate manually:
   * ```
   * GET {INGESTION_TELEGRAM_URL}/api/crypto-news/sources
   * ```
   */
  @Column('varchar')
  channelId: string;
}
```

#### B) Migrate TEXT to JSONB

**Current Problem:**  
`message_entities` is TEXT (JSON stringified), limiting query capabilities.

**Current Schema:**
```sql
CREATE TABLE crypto_news_messages (
  message_entities TEXT  -- ❌ Cannot query structure
);
```

**Limitation:**
```sql
-- ❌ This fails
SELECT * FROM crypto_news_messages 
WHERE message_entities->>'type' = 'url';

-- Error: operator -> does not exist for type text
```

**Recommended Migration:**

**1. Create Migration:**
```typescript
// apps/ingestion-telegram/migrations/1727000000000-MigrateMessageEntitiesToJsonb.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateMessageEntitiesToJsonb1727000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Change column type from TEXT to JSONB
    await queryRunner.query(`
      ALTER TABLE crypto_news_messages 
      ALTER COLUMN message_entities 
      TYPE JSONB 
      USING message_entities::JSONB
    `);
    
    // Add GIN index for fast JSONB queries
    await queryRunner.query(`
      CREATE INDEX idx_crypto_news_messages_entities_gin 
      ON crypto_news_messages 
      USING GIN (message_entities)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_crypto_news_messages_entities_gin`);
    await queryRunner.query(`
      ALTER TABLE crypto_news_messages 
      ALTER COLUMN message_entities 
      TYPE TEXT 
      USING message_entities::TEXT
    `);
  }
}
```

**2. Update Entity:**
```typescript
// apps/ingestion-telegram/src/telegram/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity.ts
@Entity('crypto_news_messages')
export class CryptoNewsMessageEntity {
  @Column('jsonb', { nullable: true })  // Changed from 'text'
  messageEntities: TelegramEntity[] | null;
}
```

**3. Now You Can Query:**
```sql
-- ✅ Find messages with URL entities
SELECT * FROM crypto_news_messages 
WHERE message_entities @> '[{"type": "url"}]';

-- ✅ Find messages with specific URL
SELECT * FROM crypto_news_messages 
WHERE message_entities @> '[{"type": "url", "url": "https://example.com"}]';

-- ✅ Count messages by entity type
SELECT 
  jsonb_array_elements(message_entities)->>'type' as entity_type,
  COUNT(*) as count
FROM crypto_news_messages
WHERE message_entities IS NOT NULL
GROUP BY entity_type;
```

**Impact:**  
Enables powerful structured queries on Telegram entities (URLs, mentions, hashtags, etc.)

---

### 3. Error Handling with Dead Letter Queue

**Current Problem:**  
SSE consumer swallows errors silently — failed messages are lost without trace.

**Current Code:**
```typescript
// apps/backend/src/telegram/ingestion/shared/application/ingestion-coordinator.service.ts
async routeMessage(raw: TelegramRawMessage) {
  try {
    await this.handler.handle(raw);
  } catch (err) {
    this.logger.error(`Route failed`, err);  // ❌ Only logged, no recovery
    // Message is LOST
  }
}
```

**Recommended Implementation:**

**1. Create DLQ Repository:**
```typescript
// apps/backend/src/shared/infrastructure/persistence/typeorm/entities/dead-letter-queue.entity.ts
@Entity('dead_letter_queue')
export class DeadLetterQueueEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  source: string; // 'crypto-news-sse' | 'kol-sse' | 'polling'

  @Column('jsonb')
  payload: any; // Original TelegramRawMessage

  @Column('text')
  errorMessage: string;

  @Column('text')
  errorStack: string;

  @Column('int', { default: 0 })
  retryCount: number;

  @Column('timestamptz')
  enqueuedAt: Date;

  @Column('timestamptz', { nullable: true })
  retriedAt: Date | null;

  @Column('varchar', { default: 'PENDING' })
  status: 'PENDING' | 'RETRIED' | 'DISCARDED';
}
```

**2. Update Error Handling:**
```typescript
async routeMessage(raw: TelegramRawMessage) {
  try {
    await this.handler.handle(raw);
  } catch (err) {
    this.logger.error(`Route failed for ${raw.peerId}:${raw.messageId}`, err);
    
    // ✅ Emit metric
    this.metricsService.increment('crypto_news.routing.failures', {
      channelId: raw.peerId,
      errorType: err.constructor.name
    });
    
    // ✅ Enqueue to DLQ for manual retry
    await this.dlqRepo.save({
      source: 'crypto-news-sse',
      payload: raw,
      errorMessage: err.message,
      errorStack: err.stack,
      enqueuedAt: new Date(),
      status: 'PENDING'
    });
  }
}
```

**3. Add Retry Mechanism:**
```typescript
// apps/backend/src/shared/application/handlers/retry-dlq-messages.use-case.ts
export class RetryDlqMessagesUseCase {
  async execute(options: { maxRetries?: number } = {}): Promise<void> {
    const maxRetries = options.maxRetries ?? 3;
    
    const messages = await this.dlqRepo.find({
      where: { 
        status: 'PENDING',
        retryCount: LessThan(maxRetries)
      },
      order: { enqueuedAt: 'ASC' },
      take: 10
    });
    
    for (const msg of messages) {
      try {
        // Retry original operation
        await this.router.route(msg.payload);
        
        msg.status = 'RETRIED';
        msg.retriedAt = new Date();
        await this.dlqRepo.save(msg);
        
        this.logger.log(`DLQ message ${msg.id} retried successfully`);
      } catch (err) {
        msg.retryCount++;
        
        if (msg.retryCount >= maxRetries) {
          msg.status = 'DISCARDED';
          this.logger.error(`DLQ message ${msg.id} discarded after ${maxRetries} retries`);
        }
        
        await this.dlqRepo.save(msg);
      }
    }
  }
}
```

**4. Add CLI Command:**
```typescript
// apps/backend/src/cli/commands/retry-dlq.command.ts
@Command({
  command: 'dlq:retry',
  describe: 'Retry failed messages from Dead Letter Queue'
})
export class RetryDlqCommand {
  async run() {
    const useCase = this.moduleRef.get(RetryDlqMessagesUseCase);
    await useCase.execute({ maxRetries: 3 });
  }
}

// Usage:
// npm run cli dlq:retry
```

**Impact:**  
- Failed messages are preserved for investigation
- Manual retry capability (ops can recover from transient failures)
- Metrics track failure patterns

---

## Performance

### 1. Configurable SSE Heartbeat

**Current Problem:**  
30s interval is hardcoded in multiple places.

**Current Code:**
```typescript
// ingestion-telegram
setInterval(() => this.sendHeartbeat(), 30_000);  // ❌ Magic number

// backend SSE consumer
this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);  // ❌ Magic number
```

**Recommended Changes:**

**1. Add Environment Variables:**
```bash
# apps/ingestion-telegram/.env
SSE_HEARTBEAT_INTERVAL_MS=30000

# apps/backend/.env
SSE_RECONNECT_MAX_DELAY_MS=30000
SSE_RECONNECT_INITIAL_DELAY_MS=1000
```

**2. Update Config:**
```typescript
// apps/ingestion-telegram/src/shared/common/config/stream.config.ts
export const streamConfig = registerAs('stream', () => ({
  heartbeatIntervalMs: parseInt(process.env.SSE_HEARTBEAT_INTERVAL_MS ?? '30000', 10),
  port: parseInt(process.env.INGESTION_API_PORT ?? '3031', 10)
}));
```

**3. Use Config:**
```typescript
// apps/ingestion-telegram/src/stream/application/services/stream.service.ts
export class StreamService {
  constructor(
    @Inject(streamConfig.KEY)
    private readonly config: ConfigType<typeof streamConfig>
  ) {}
  
  async addClient(res: Response): Promise<void> {
    // ...
    
    const heartbeatInterval = setInterval(
      () => this.sendHeartbeat(res),
      this.config.heartbeatIntervalMs  // ✅ Configurable
    );
  }
}
```

**Impact:**  
Operators can tune heartbeat based on network conditions without code changes.

---

### 2. Adaptive Polling

**Current Problem:**  
Fixed polling interval doesn't adapt to message volume.

**Current Code:**
```typescript
@Cron('*/5 * * * *')  // ❌ Always 5min, even if 1000 messages pending
async pollMessages() {
  const messages = await this.fetch({ limit: 50 });
  await this.enqueue(messages);
}
```

**Recommended Implementation:**
```typescript
export class EnqueueMatchingCronScheduler {
  private isPolling = false;
  private consecutiveFullBatches = 0;
  
  @Cron('*/5 * * * *')
  async pollMessages() {
    if (this.isPolling) {
      this.logger.warn('Previous poll still running, skipping');
      return;
    }
    
    this.isPolling = true;
    
    try {
      await this.pollWithAdaptiveInterval();
    } finally {
      this.isPolling = false;
    }
  }
  
  private async pollWithAdaptiveInterval(): Promise<void> {
    const BATCH_SIZE = 50;
    const FULL_BATCH_THRESHOLD = 3; // Trigger fast polling after 3 full batches
    
    const messages = await this.fetch({ limit: BATCH_SIZE });
    await this.enqueue(messages);
    
    // Detect high volume
    if (messages.length === BATCH_SIZE) {
      this.consecutiveFullBatches++;
      
      if (this.consecutiveFullBatches >= FULL_BATCH_THRESHOLD) {
        this.logger.warn(
          `High message volume detected (${this.consecutiveFullBatches} full batches), ` +
          `scheduling immediate re-poll`
        );
        
        // Re-poll immediately (don't wait for next cron cycle)
        setTimeout(() => this.pollWithAdaptiveInterval(), 10_000); // 10s
      }
    } else {
      // Reset counter when batch is not full
      this.consecutiveFullBatches = 0;
    }
  }
}
```

**Impact:**  
System automatically speeds up polling during high-volume periods, reducing latency.

---

### 3. Intelligent Media Cleanup

**Current Problem:**  
Cleanup runs every hour regardless of disk usage.

**Current Code:**
```typescript
@Cron('0 * * * *')  // Every hour
async cleanupExpiredContent() {
  await this.deleteExpiredMessages();
  await this.deleteExpiredMedia();
}
```

**Recommended Implementation:**

**1. Add Disk Monitor:**
```typescript
// apps/ingestion-telegram/src/telegram/crypto-news/application/services/disk-monitor.service.ts
export class DiskMonitorService {
  async getDiskUsage(directory: string): Promise<{
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    percentUsed: number;
  }> {
    const stats = await fs.statfs(directory);
    
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bfree * stats.bsize;
    const usedBytes = totalBytes - freeBytes;
    const percentUsed = (usedBytes / totalBytes) * 100;
    
    return { totalBytes, usedBytes, freeBytes, percentUsed };
  }
  
  async getDirectorySize(directory: string): Promise<number> {
    let totalSize = 0;
    
    const files = await fs.readdir(directory, { withFileTypes: true });
    
    for (const file of files) {
      const filePath = path.join(directory, file.name);
      
      if (file.isDirectory()) {
        totalSize += await this.getDirectorySize(filePath);
      } else {
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  }
}
```

**2. Update Scheduler:**
```typescript
// apps/ingestion-telegram/src/telegram/crypto-news/application/scheduling/crypto-news-retention-cleanup.scheduler.ts
export class CryptoNewsRetentionCleanupScheduler {
  private readonly DISK_WARNING_THRESHOLD = 80; // 80%
  private readonly DISK_CRITICAL_THRESHOLD = 90; // 90%
  
  // Regular cleanup (daily at 3 AM)
  @Cron('0 3 * * *')
  async scheduledCleanup() {
    await this.cleanupExpiredContent();
  }
  
  // Emergency cleanup check (every hour)
  @Cron('0 * * * *')
  async checkDiskUsage() {
    const mediaDir = 'uploads/crypto-news/media';
    const usage = await this.diskMonitor.getDiskUsage(mediaDir);
    
    this.logger.log(`Disk usage: ${usage.percentUsed.toFixed(2)}%`);
    
    // Emit metric
    this.metricsService.gauge('crypto_news.disk.percent_used', usage.percentUsed);
    
    if (usage.percentUsed >= this.DISK_CRITICAL_THRESHOLD) {
      this.logger.error(
        `CRITICAL: Disk usage >${this.DISK_CRITICAL_THRESHOLD}%, ` +
        `triggering aggressive cleanup`
      );
      await this.aggressiveCleanup();
    } else if (usage.percentUsed >= this.DISK_WARNING_THRESHOLD) {
      this.logger.warn(
        `WARNING: Disk usage >${this.DISK_WARNING_THRESHOLD}%, ` +
        `triggering cleanup`
      );
      await this.cleanupExpiredContent();
    }
  }
  
  private async aggressiveCleanup(): Promise<void> {
    // Reduce retention from 72h to 48h temporarily
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    
    const deleted = await this.cleanupOlderThan(cutoff);
    
    this.logger.log(`Aggressive cleanup: deleted ${deleted.messages} messages, ${deleted.mediaCount} files, freed ${deleted.bytesFreed} bytes`);
  }
}
```

**Impact:**  
- Prevents disk full scenarios
- Reduces unnecessary cleanup runs
- Automatically handles high-volume periods

---

## Observability

### 1. Metrics Implementation

**Recommended Metrics Service:**

```typescript
// apps/backend/src/shared/observability/metrics.service.ts
import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry: Registry;
  
  // Counters
  private readonly sseConnectionsCounter: Counter;
  private readonly routingFailuresCounter: Counter;
  private readonly queueCapReachedCounter: Counter;
  private readonly sloMissCounter: Counter;
  
  // Gauges
  private readonly sseConnectedGauge: Gauge;
  private readonly queueDepthGauge: Gauge;
  private readonly diskUsageGauge: Gauge;
  
  // Histograms
  private readonly latencyHistogram: Histogram;
  
  constructor() {
    this.registry = new Registry();
    
    // Initialize metrics
    this.sseConnectionsCounter = new Counter({
      name: 'crypto_news_sse_connections_total',
      help: 'Total SSE connection attempts',
      labelNames: ['status'],
      registers: [this.registry]
    });
    
    this.sseConnectedGauge = new Gauge({
      name: 'crypto_news_sse_connected',
      help: 'SSE connection status (1=connected, 0=disconnected)',
      registers: [this.registry]
    });
    
    this.latencyHistogram = new Histogram({
      name: 'crypto_news_latency_ms',
      help: 'Latency from ingestion to enqueue (milliseconds)',
      buckets: [100, 500, 1000, 2500, 5000, 10000, 30000, 60000],
      registers: [this.registry]
    });
    
    this.queueDepthGauge = new Gauge({
      name: 'crypto_news_queue_depth',
      help: 'Current number of PENDING messages in publisher queue',
      registers: [this.registry]
    });
    
    this.queueCapReachedCounter = new Counter({
      name: 'crypto_news_queue_cap_reached_total',
      help: 'Number of times queue cap (36) was reached',
      registers: [this.registry]
    });
    
    this.sloMissCounter = new Counter({
      name: 'crypto_news_latency_slo_miss_total',
      help: 'Number of times latency SLO (<10s) was missed',
      registers: [this.registry]
    });
    
    this.routingFailuresCounter = new Counter({
      name: 'crypto_news_routing_failures_total',
      help: 'Total message routing failures',
      labelNames: ['error_type'],
      registers: [this.registry]
    });
    
    this.diskUsageGauge = new Gauge({
      name: 'crypto_news_disk_usage_percent',
      help: 'Disk usage percentage for media directory',
      registers: [this.registry]
    });
  }
  
  // SSE Metrics
  recordSSEConnection(connected: boolean): void {
    this.sseConnectionsCounter.inc({ status: connected ? 'success' : 'failure' });
    this.sseConnectedGauge.set(connected ? 1 : 0);
  }
  
  // Latency Metrics
  recordLatency(ingestedAt: Date, enqueuedAt: Date): void {
    const latencyMs = enqueuedAt.getTime() - ingestedAt.getTime();
    this.latencyHistogram.observe(latencyMs);
    
    if (latencyMs > 10_000) {
      this.sloMissCounter.inc();
    }
  }
  
  // Queue Metrics
  recordQueueDepth(count: number): void {
    this.queueDepthGauge.set(count);
    
    if (count >= 36) {
      this.queueCapReachedCounter.inc();
    }
  }
  
  // Error Metrics
  recordRoutingFailure(errorType: string): void {
    this.routingFailuresCounter.inc({ error_type: errorType });
  }
  
  // Disk Metrics
  recordDiskUsage(percentUsed: number): void {
    this.diskUsageGauge.set(percentUsed);
  }
  
  // Expose metrics endpoint
  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
```

**2. Integrate with Application:**

```typescript
// apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts
export class ProcessCryptoNewsMessageHandler {
  constructor(
    private readonly metrics: MetricsService,
    // ... other deps
  ) {}
  
  async handle(raw: TelegramRawMessage): Promise<void> {
    const startTime = Date.now();
    
    try {
      // ... existing logic
      
      // Record latency
      const ingestedAt = new Date(raw.occurredAt);
      const enqueuedAt = new Date();
      this.metrics.recordLatency(ingestedAt, enqueuedAt);
      
      // Update queue depth
      const depth = await this.queueRepo.countPending();
      this.metrics.recordQueueDepth(depth);
      
    } catch (err) {
      this.metrics.recordRoutingFailure(err.constructor.name);
      throw err;
    }
  }
}
```

**3. Add Metrics Endpoint:**

```typescript
// apps/backend/src/shared/observability/metrics.controller.ts
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}
  
  @Get()
  async getMetrics(): Promise<string> {
    return this.metrics.getMetrics();
  }
}

// Access at: http://localhost:3030/metrics
```

**4. Configure Prometheus:**

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'onchain-bot-backend'
    static_configs:
      - targets: ['localhost:3030']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

**Impact:**  
- Real-time visibility into system health
- Proactive issue detection
- Data-driven optimization decisions

---

### 2. Alerting Rules

**Recommended Prometheus Alerts:**

```yaml
# alerts/crypto-news.yml
groups:
  - name: crypto_news
    interval: 30s
    rules:
      # SSE Disconnection
      - alert: CryptoNewsSSEDisconnected
        expr: crypto_news_sse_connected == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Crypto-news SSE disconnected for >5min"
          description: "SSE connection to ingestion-telegram has been down for {{ $value }} minutes. Messages may be delayed."
      
      # Queue Saturation
      - alert: CryptoNewsQueueFull
        expr: crypto_news_queue_depth >= 36
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Crypto-news queue at capacity"
          description: "Publisher queue has reached cap (36). New messages cannot be enqueued."
      
      # Latency SLO Violation
      - alert: CryptoNewsLatencySLOMiss
        expr: rate(crypto_news_latency_slo_miss_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Crypto-news latency SLO (<10s) violated"
          description: "{{ $value | humanizePercentage }} of messages exceeded 10s latency in last 5min."
      
      # High Routing Failures
      - alert: CryptoNewsHighFailureRate
        expr: rate(crypto_news_routing_failures_total[5m]) > 0.05
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "High crypto-news routing failure rate"
          description: "{{ $value | humanize }} failures/sec in last 5min."
      
      # Disk Space Warning
      - alert: CryptoNewsMediaDiskWarning
        expr: crypto_news_disk_usage_percent > 80
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Crypto-news media disk usage high"
          description: "Media directory is {{ $value }}% full. Consider increasing retention cleanup frequency."
      
      # Disk Space Critical
      - alert: CryptoNewsMediaDiskCritical
        expr: crypto_news_disk_usage_percent > 90
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Crypto-news media disk usage critical"
          description: "Media directory is {{ $value }}% full. Automatic aggressive cleanup triggered."
```

**Integration with Alertmanager:**

```yaml
# alertmanager.yml
route:
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'slack-critical'
  
  routes:
    - match:
        severity: critical
      receiver: 'slack-critical'
    
    - match:
        severity: warning
      receiver: 'slack-warnings'

receivers:
  - name: 'slack-critical'
    slack_configs:
      - api_url: 'YOUR_SLACK_WEBHOOK_URL'
        channel: '#alerts-critical'
        title: '🔴 {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
  
  - name: 'slack-warnings'
    slack_configs:
      - api_url: 'YOUR_SLACK_WEBHOOK_URL'
        channel: '#alerts-warnings'
        title: '⚠️ {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

**Impact:**  
Operations team is notified BEFORE users complain.

---

### 3. Structured Logging with Correlation IDs

**Current Problem:**  
Logs are fragmented — hard to trace a single message through the system.

**Recommended Implementation:**

**1. Add Correlation ID Middleware:**

```typescript
// apps/backend/src/shared/middleware/correlation-id.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const CORRELATION_ID_HEADER = 'X-Correlation-ID';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = req.headers[CORRELATION_ID_HEADER.toLowerCase()] || uuidv4();
    
    req['correlationId'] = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    
    next();
  }
}
```

**2. Add to Logger:**

```typescript
// apps/backend/src/shared/logger/logger.service.ts
import { Injectable, Scope } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService {
  constructor(
    private readonly asyncLocalStorage: AsyncLocalStorage<{ correlationId?: string }>
  ) {}
  
  log(message: string, context?: string): void {
    const correlationId = this.asyncLocalStorage.getStore()?.correlationId;
    
    console.log(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      correlationId,
      context,
      message
    }));
  }
  
  error(message: string, trace?: string, context?: string): void {
    const correlationId = this.asyncLocalStorage.getStore()?.correlationId;
    
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      correlationId,
      context,
      message,
      trace
    }));
  }
}
```

**3. Use in Application:**

```typescript
// apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts
export class ProcessCryptoNewsMessageHandler {
  async handle(raw: TelegramRawMessage): Promise<void> {
    // Generate correlation ID for this message
    const correlationId = `cn-${raw.peerId}:${raw.messageId}`;
    
    this.logger.setCorrelationId(correlationId);
    
    this.logger.log('Processing crypto-news message', 'CryptoNewsHandler');
    
    // ... processing logic
    
    this.logger.log('Message enqueued successfully', 'CryptoNewsHandler');
  }
}
```

**4. Example Log Output:**

```json
// Ingestion
{"level":"info","timestamp":"2026-09-20T10:00:00.000Z","correlationId":"cn--1001234567890:123","context":"IngestionPersister","message":"Message persisted to DB"}

// SSE Broadcast
{"level":"info","timestamp":"2026-09-20T10:00:00.100Z","correlationId":"cn--1001234567890:123","context":"StreamService","message":"Broadcasted to 3 SSE clients"}

// Backend Routing
{"level":"info","timestamp":"2026-09-20T10:00:00.500Z","correlationId":"cn--1001234567890:123","context":"MessageRouter","message":"Routing to crypto-news handler"}

// Filtering
{"level":"info","timestamp":"2026-09-20T10:00:01.200Z","correlationId":"cn--1001234567890:123","context":"ContentFilter","message":"Applied 2 regex filters"}

// Enqueue
{"level":"info","timestamp":"2026-09-20T10:00:02.000Z","correlationId":"cn--1001234567890:123","context":"PublisherQueue","message":"Enqueued (latency: 2000ms)"}

// Publishing
{"level":"info","timestamp":"2026-09-20T10:01:00.000Z","correlationId":"cn--1001234567890:123","context":"Publisher","message":"Published to Telegram Bot API"}
```

**5. Query Logs:**

```bash
# Trace a single message through the entire pipeline
cat logs/app.log | jq 'select(.correlationId == "cn--1001234567890:123")'

# Find all failed enqueues
cat logs/app.log | jq 'select(.level == "error" and .context == "PublisherQueue")'
```

**Impact:**  
- End-to-end message tracing
- Faster debugging
- Better production observability

---

## Documentation

### 1. OpenAPI/Swagger Specification

**Implementation for Ingestion-Telegram:**

```typescript
// apps/ingestion-telegram/src/main.ts
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // OpenAPI configuration
  const config = new DocumentBuilder()
    .setTitle('Ingestion-Telegram API')
    .setDescription('Centralized Telegram MTProto ingestion service')
    .setVersion('1.0.0')
    .addTag('crypto-news', 'Crypto-news sources and messages')
    .addTag('media', 'Media serving endpoints')
    .addTag('stream', 'SSE streaming endpoints')
    .addTag('health', 'Health check endpoints')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  
  await app.listen(3031);
  
  console.log(`🚀 Ingestion-Telegram API running on http://localhost:3031`);
  console.log(`📚 API Docs available at http://localhost:3031/api/docs`);
}
```

**Annotate Controllers:**

```typescript
// apps/ingestion-telegram/src/telegram/crypto-news/api/crypto-news.controller.ts
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

@ApiTags('crypto-news')
@Controller('api/crypto-news')
export class CryptoNewsController {
  
  @Get('sources')
  @ApiOperation({ 
    summary: 'List all crypto-news sources',
    description: 'Returns all registered Telegram channels monitored for crypto news'
  })
  @ApiQuery({ name: 'active', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of sources',
    schema: {
      example: [
        {
          channelId: "-1001234567890",
          title: "Crypto News Channel",
          handle: "cryptonewschannel",
          isActive: true,
          lifecycleStatus: "ACTIVE",
          addedAt: "2026-09-01T00:00:00Z"
        }
      ]
    }
  })
  async getSources(@Query('active') active?: boolean) {
    return this.service.findAll({ active });
  }
  
  @Get('messages')
  @ApiOperation({
    summary: 'List recent crypto-news messages',
    description: 'Returns RAW messages (no content filters applied). Backend applies filters on-read.'
  })
  @ApiQuery({ name: 'channelId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({
    status: 200,
    description: 'List of messages',
    schema: {
      example: [
        {
          id: "uuid",
          channelId: "-1001234567890",
          messageId: 123,
          title: "Breaking News",
          content: "Bitcoin reaches new ATH 🚀",
          publishedAt: "2026-09-20T10:00:00Z",
          ingestedAt: "2026-09-20T10:00:01Z",
          media: [
            {
              type: "photo",
              url: "http://localhost:3032/api/media/-1001234567890/123/0"
            }
          ]
        }
      ]
    }
  })
  async getMessages(
    @Query('channelId') channelId?: string,
    @Query('limit') limit?: number
  ) {
    return this.service.findMessages({ channelId, limit });
  }
}
```

**Impact:**  
- Interactive API documentation
- Easier frontend integration
- Better API discoverability

---

### 2. Configuration Reference Document

**Create: `docs/configuration/CRYPTO_NEWS_ENV_REFERENCE.md`**

```markdown
# Crypto-News Configuration Reference

## Overview

This document describes ALL environment variables used by the crypto-news system across both services.

---

## Ingestion-Telegram Service

### MTProto Configuration (CRITICAL)

| Variable | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `INGESTION_TELEGRAM_MTPROTO_SESSION` | ✅ Yes | string | - | **Base64-encoded session string**. Generate ONCE with `npm run telegram:gen-session`. **NEVER duplicate** across environments (causes `AUTH_KEY_DUPLICATED` error). |
| `INGESTION_TELEGRAM_MTPROTO_API_ID` | ✅ Yes | number | - | Telegram API ID from [my.telegram.org](https://my.telegram.org) |
| `INGESTION_TELEGRAM_MTPROTO_API_HASH` | ✅ Yes | string | - | Telegram API hash from [my.telegram.org](https://my.telegram.org) |
| `INGESTION_TELEGRAM_MTPROTO_LOG_LEVEL` | ❌ No | enum | `ERROR` | GramJS log level. Options: `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `INGESTION_TELEGRAM_MTPROTO_USE_WSS` | ❌ No | boolean | `false` | Use WebSocket Secure for MTProto connection (useful in restrictive networks) |
| `INGESTION_TELEGRAM_MTPROTO_STARTUP_DELAY_MS` | ❌ No | number | `0` | Delay before connecting to Telegram (useful for ordered container startup) |

**Security Warning:**  
MTProto credentials are PRODUCTION SECRETS. Never commit to git. Store in password manager or secret management system (e.g., AWS Secrets Manager, HashiCorp Vault).

---

### Database Configuration

| Variable | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `INGESTION_DATABASE_HOST` | ✅ Yes | string | `localhost` | PostgreSQL host for ingestion DB |
| `INGESTION_DATABASE_PORT` | ✅ Yes | number | `5432` | PostgreSQL port |
| `INGESTION_DATABASE_NAME` | ✅ Yes | string | - | Database name (e.g., `alpha_meta_token_scanner_ingestion`) |
| `INGESTION_DATABASE_USER` | ✅ Yes | string | - | PostgreSQL username |
| `INGESTION_DATABASE_PASSWORD` | ✅ Yes | string | - | PostgreSQL password |
| `INGESTION_DATABASE_SYNCHRONIZE` | ❌ No | boolean | `false` | Auto-sync schema (TypeORM). **Use `true` in dev ONLY, `false` in staging/prod** |
| `DATABASE_ENABLED` | ✅ Yes | boolean | `true` | Enable database connection. Set `false` for tests that don't need DB. |

---

### Redis Configuration

| Variable | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `INGESTION_REDIS_ENABLED` | ❌ No | boolean | `true` | Enable Redis (used for cursor tracking) |
| `INGESTION_REDIS_HOST` | ✅ Yes (if enabled) | string | `localhost` | Redis host |
| `INGESTION_REDIS_PORT` | ✅ Yes (if enabled) | number | `6379` | Redis port |

---

### Retention Configuration

| Variable | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS` | ❌ No | number | `72` | Media/message retention window in hours. Cleanup scheduler runs every hour. |

---

### API Configuration

| Variable | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `INGESTION_API_PORT` | ❌ No | number | `3031` | HTTP API listen port (dev: 3031, prod droplet: 3032 on host) |
| `INGESTION_API_BASE_URL` | ❌ No | string | `http://localhost:3031` | Base URL for self-reference |
| `SSE_HEARTBEAT_INTERVAL_MS` | ❌ No | number | `30000` | SSE heartbeat ping interval (prevents client timeouts) |

---

### Backend Integration

| Variable | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `BACKEND_PORT` | ✅ Yes | number | `3030` | Backend API port (for polling KOL IDs) |

---

## Backend Service

### Ingestion-Telegram Connection

| Variable | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `INGESTION_TELEGRAM_URL` | ✅ Yes | string | `http://localhost:3031` | Ingestion-telegram API URL. **Prod:** `http://cryptoganster.tailf01c61.ts.net:3032` |
| `USE_SSE_INGESTION` | ❌ No | boolean | `true` | Enable SSE consumer (real-time) |
| `USE_SSE_CRYPTO_NEWS` | ❌ No | boolean | `true` | Enable SSE for crypto-news specifically |
| `SSE_RECONNECT_INITIAL_DELAY_MS` | ❌ No | number | `1000` | Initial reconnect delay (exponential backoff starts here) |
| `SSE_RECONNECT_MAX_DELAY_MS` | ❌ No | number | `30000` | Max reconnect delay (exponential backoff caps here) |

---

### Crypto-News Polling Configuration

| Variable | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `CRYPTO_NEWS_POLLING_INTERVAL_MINUTES` | ❌ No | number | `5` | Polling interval when SSE is **enabled** (light fallback). Falls back to `1` when SSE is **disabled** (primary mode). |

---

### Publishing Configuration

| Variable | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `CRYPTO_NEWS_BOT_TOKEN` | ✅ Yes | string | - | Telegram Bot API token for publishing |
| `CRYPTO_NEWS_OUTPUT_CHANNEL` | ✅ Yes | string | - | Target channel ID for publishing (e.g., `-1001234567890`) |

---

### LLM Configuration (Optional)

| Variable | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `USE_MOCK_AI` | ❌ No | boolean | `false` | Use mock LLM (returns input unchanged). Useful for testing without LLM costs. |
| `LLM_API_URL` | ❌ No | string | - | LLM gateway URL (e.g., `http://localhost:4000` for LiteLLM) |

---

## Flag Dependencies

**Critical Dependency:**

```
llmEnabled=true requires publishingEnabled=true
```

LLM refinement **only runs** when BOTH flags are `true`. Setting `llmEnabled=true` with `publishingEnabled=false` will NOT run LLM (no error, silent no-op).

**Recommended Configuration:**

| Use Case | matchingEnabled | llmEnabled | publishingEnabled |
|----------|-----------------|------------|-------------------|
| **Full pipeline** | ✅ true | ✅ true | ✅ true |
| **Raw publishing (no LLM cost)** | ✅ true | ❌ false | ✅ true |
| **Enqueue only (no publish)** | ✅ true | ❌ false | ❌ false |
| **Drain queue (no new enqueue)** | ❌ false | ❌ false | ✅ true |
| **Emergency stop** | ❌ false | ❌ false | ❌ false |

---

## Troubleshooting

### Q: Messages not appearing in backend?

**Check:**
1. SSE connection status: `curl http://localhost:3030/api/health` → check `sseConnected: true`
2. Matching config: `curl http://localhost:3030/crypto-news-integration/matching` → `enabled: true`
3. Source is active: `curl http://localhost:3031/api/crypto-news/sources` → check `isActive: true`

### Q: Messages matched but not published?

**Check:**
1. Publishing config: `curl http://localhost:3030/crypto-news-publisher/config` → `publishingEnabled: true`
2. Queue status: `curl http://localhost:3030/crypto-news-publisher/queue?status=FAILED` → check `failureReason`
3. Bot token valid: Test with `curl https://api.telegram.org/bot<TOKEN>/getMe`

### Q: `AUTH_KEY_DUPLICATED` error?

**Cause:** MTProto session is duplicated across multiple instances.

**Solution:**
1. Ensure `INGESTION_TELEGRAM_MTPROTO_SESSION` exists in ONLY ONE `.env` file
2. Stop all ingestion-telegram instances
3. Wait 60 seconds (Telegram session cleanup)
4. Start single instance

### Q: High latency (>10s)?

**Check:**
1. SSE connection: `curl http://localhost:3030/api/health` → if `sseConnected: false`, messages are delayed until next poll cycle
2. Queue depth: `curl http://localhost:3030/crypto-news-publisher/queue?status=PENDING` → if queue is full (36), new messages cannot be enqueued
3. Filter complexity: Check regex patterns in `channel_content_filter_configs` → complex patterns may timeout (100ms limit)

---

**Last Updated:** 2026-09-20  
**Maintainer:** DevOps Team
```

**Impact:**  
- Eliminates "what does this variable do?" questions
- Centralized troubleshooting guide
- Faster onboarding

---

### 3. Migration Guides

**Create: `docs/guides/ADD_CRYPTO_NEWS_SOURCE.md`**

```markdown
# How to Add a New Crypto-News Source

## Prerequisites

- Telegram channel ID (e.g., `-1001234567890`)
- Channel must be:
  - **PUBLIC** (username-based, e.g., `@cryptonewschannel`), OR
  - **PRIVATE** with bot as member (admin access not required)

## Steps

### 1. Register Source

**Via HTTP API:**

```bash
curl -X POST http://localhost:3031/api/crypto-news/sources \
  -H 'Content-Type: application/json' \
  -d '{
    "channelId": "-1001234567890",
    "title": "Crypto News Channel",
    "handle": "cryptonewschannel"
  }'
```

**Response:**
```json
{
  "channelId": "-1001234567890",
  "title": "Crypto News Channel",
  "handle": "cryptonewschannel",
  "isActive": true,
  "lifecycleStatus": "ACTIVE",
  "addedAt": "2026-09-20T10:00:00Z"
}
```

**Via Database (if API unavailable):**

```sql
-- Connect to ingestion DB
psql -h localhost -U postgres -d alpha_meta_token_scanner_ingestion

-- Insert source
INSERT INTO crypto_news_sources (channel_id, title, handle, is_active, lifecycle_status)
VALUES ('-1001234567890', 'Crypto News Channel', 'cryptonewschannel', true, 'ACTIVE');
```

---

### 2. Verify Ingestion

**Wait 30 seconds** (next MTProto polling cycle), then check:

```bash
# Check messages from new source
curl "http://localhost:3031/api/crypto-news/messages?channelId=-1001234567890&limit=5"
```

**Expected Response:**
```json
[
  {
    "id": "uuid",
    "channelId": "-1001234567890",
    "messageId": 123,
    "content": "Bitcoin reaches new ATH 🚀",
    "ingestedAt": "2026-09-20T10:01:00Z",
    "publishedAt": "2026-09-20T10:00:00Z"
  }
]
```

**If empty:** Check ingestion-telegram logs for errors:
```bash
docker logs onchain-bot-ingestion-telegram -f | grep "-1001234567890"
```

---

### 3. Configure Content Filters (Optional)

**Use Case:** Transform message content before matching (e.g., remove emojis, normalize text).

```bash
curl -X POST http://localhost:3030/crypto-news/filters \
  -H 'Content-Type: application/json' \
  -d '{
    "channelId": "-1001234567890",
    "pattern": "🚀",
    "replacement": "[ROCKET]",
    "priority": 1,
    "isActive": true
  }'
```

**Pattern Examples:**

| Use Case | Pattern | Replacement |
|----------|---------|-------------|
| Remove emojis | `[\\p{Emoji}]+` | `` |
| Normalize whitespace | `\\s+` | ` ` |
| Remove URLs | `https?://\\S+` | `[URL]` |
| Convert uppercase | `.+` | (use JS: `.toLowerCase()` in filter logic) |

**Priority:** Lower numbers run first (1 → 2 → 3).

---

### 4. Configure Keywords

**Use Case:** Match messages containing specific keywords.

**Simple Keywords (OR logic):**
```bash
curl -X POST http://localhost:3030/crypto-news/keywords \
  -H 'Content-Type: application/json' \
  -d '{
    "channelId": "-1001234567890",
    "keywords": [
      "bitcoin",
      "ethereum",
      "solana"
    ],
    "type": "SIMPLE"
  }'
```

**AND-Group Keywords (ALL must match):**
```bash
curl -X POST http://localhost:3030/crypto-news/keywords \
  -H 'Content-Type: application/json' \
  -d '{
    "channelId": "-1001234567890",
    "keywords": [
      "airdrop",
      "free"
    ],
    "type": "AND_GROUP",
    "groupId": "group1"
  }'
```

**Matching Logic:**
- Message matches if: (ANY simple keyword) OR (ALL keywords in ANY AND-group)
- Blacklist takes precedence (checked first)

---

### 5. Configure Blacklist (Optional)

**Use Case:** Block messages containing spam/scam phrases.

```bash
curl -X POST http://localhost:3030/crypto-news/blacklist \
  -H 'Content-Type: application/json' \
  -d '{
    "channelId": "-1001234567890",
    "phrases": [
      "scam",
      "fake",
      "phishing",
      "click here to win"
    ]
  }'
```

**Note:** Blacklist is case-insensitive and uses substring matching.

---

### 6. Monitor Matching

**Check Publisher Queue:**
```bash
# Check PENDING messages
curl "http://localhost:3030/crypto-news-publisher/queue?status=PENDING&limit=10"

# Check FAILED messages (with reasons)
curl "http://localhost:3030/crypto-news-publisher/queue?status=FAILED&limit=10"
```

**Expected Response (PENDING):**
```json
[
  {
    "id": "uuid",
    "channelId": "-1001234567890",
    "messageId": 123,
    "status": "PENDING",
    "queuedAt": "2026-09-20T10:05:00Z",
    "content": {
      "title": "Breaking News",
      "text": "Bitcoin reaches new ATH",
      "mediaUrls": []
    }
  }
]
```

---

### 7. Verify Publishing

**Check Published Messages:**
```bash
# Wait 1 minute (PublisherCronScheduler cycle)
curl "http://localhost:3030/crypto-news-publisher/queue?status=PUBLISHED&limit=10"
```

**Check Telegram Channel:**
Open your crypto-news output channel and verify the message was published.

---

## Troubleshooting

### Problem: No messages ingested

**Symptoms:**
```bash
curl "http://localhost:3031/api/crypto-news/messages?channelId=-1001234567890&limit=5"
# Returns: []
```

**Solutions:**

1. **Check source is active:**
   ```bash
   curl http://localhost:3031/api/crypto-news/sources | jq '.[] | select(.channelId == "-1001234567890")'
   ```
   - If `isActive: false` → update: `curl -X PATCH http://localhost:3031/api/crypto-news/sources/-1001234567890 -d '{"isActive":true}'`

2. **Check MTProto session:**
   ```bash
   # Check ingestion-telegram logs
   docker logs onchain-bot-ingestion-telegram | grep "Session not authorized"
   ```
   - If found → regenerate session: `cd apps/ingestion-telegram && npm run telegram:gen-session`

3. **Check channel permissions:**
   - Public channels: No special permissions needed
   - Private channels: Bot must be a member (admin not required)

---

### Problem: Messages ingested but not matched

**Symptoms:**
```bash
# Messages exist in ingestion
curl "http://localhost:3031/api/crypto-news/messages?channelId=-1001234567890&limit=5"
# Returns: [...]

# But queue is empty
curl "http://localhost:3030/crypto-news-publisher/queue?status=PENDING"
# Returns: []
```

**Solutions:**

1. **Check matching is enabled:**
   ```bash
   curl http://localhost:3030/crypto-news-integration/matching
   # Expected: {"enabled": true}
   ```
   - If `false` → enable: `curl -X PATCH http://localhost:3030/crypto-news-integration/matching -d '{"enabled":true}'`

2. **Check keywords exist:**
   ```bash
   curl "http://localhost:3030/crypto-news/keywords?channelId=-1001234567890"
   ```
   - If empty → add keywords (see step 4)

3. **Check blacklist:**
   ```bash
   curl "http://localhost:3030/crypto-news/blacklist?channelId=-1001234567890"
   ```
   - If blacklist is blocking → remove phrase: `curl -X DELETE http://localhost:3030/crypto-news/blacklist/<id>`

4. **Check backend SSE connection:**
   ```bash
   curl http://localhost:3030/api/health | jq '.sseConnected'
   # Expected: true
   ```
   - If `false` → check `INGESTION_TELEGRAM_URL` in backend `.env`

---

### Problem: Messages matched but not published

**Symptoms:**
```bash
# Messages in queue
curl "http://localhost:3030/crypto-news-publisher/queue?status=PENDING"
# Returns: [...]

# But not published to Telegram
```

**Solutions:**

1. **Check publishing is enabled:**
   ```bash
   curl http://localhost:3030/crypto-news-publisher/config
   # Expected: {"publishingEnabled": true}
   ```
   - If `false` → enable: `curl -X PATCH http://localhost:3030/crypto-news-publisher/config -d '{"publishingEnabled":true}'`

2. **Check for failures:**
   ```bash
   curl "http://localhost:3030/crypto-news-publisher/queue?status=FAILED&limit=10"
   ```
   - If failures exist → check `failureReason` field

3. **Check bot token:**
   ```bash
   curl "https://api.telegram.org/bot<CRYPTO_NEWS_BOT_TOKEN>/getMe"
   ```
   - If error → bot token is invalid or revoked

4. **Check output channel:**
   - Verify bot is admin in output channel
   - Verify channel ID is correct (negative number for supergroups)

---

## Rollback

**Remove source:**
```bash
curl -X DELETE http://localhost:3031/api/crypto-news/sources/-1001234567890
```

**Or deactivate (keeps historical data):**
```bash
curl -X PATCH http://localhost:3031/api/crypto-news/sources/-1001234567890 \
  -H 'Content-Type: application/json' \
  -d '{"isActive": false}'
```

---

**Related Guides:**
- [Add KOL Identity](./ADD_KOL_IDENTITY.md)
- [Debug Latency Issues](./DEBUG_LATENCY.md)
- [Configure LLM Refinement](./CONFIGURE_LLM.md)
```

**Impact:**  
- Self-service source addition (reduces ops load)
- Comprehensive troubleshooting (faster resolution)
- Clear rollback procedure (reduces risk)

---

## Implementation Examples

### Full Example: Adding Metrics to a Handler

**File:** `apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '@/shared/observability/metrics.service';

@Injectable()
export class ProcessCryptoNewsMessageHandler {
  private readonly logger = new Logger(ProcessCryptoNewsMessageHandler.name);

  constructor(
    private readonly filteredService: FilteredCryptoNewsService,
    private readonly enqueueUseCase: EnqueueMatchingMessageUseCase,
    private readonly queueRepo: PublisherQueueRepository,
    private readonly metrics: MetricsService,  // ✅ Inject
  ) {}

  async handle(raw: TelegramRawMessage): Promise<void> {
    const startTime = Date.now();
    const correlationId = `cn-${raw.peerId}:${raw.messageId}`;

    try {
      // 1. Check deduplication
      const shouldProcess = await this.shouldProcess(raw.peerId, raw.messageId);
      if (!shouldProcess) {
        this.logger.debug(`Message ${correlationId} already processed, skip`);
        return;
      }

      // 2. Fetch + filter + match
      const filtered = await this.filteredService.fetchAndFilterMessages({
        channelId: raw.peerId,
        limit: 1
      });

      if (filtered.length === 0) {
        this.logger.debug(`Message ${correlationId} did not match keywords`);
        return;
      }

      // 3. Enqueue
      await this.enqueueUseCase.execute({
        channelId: raw.peerId,
        messageId: raw.messageId,
        content: filtered[0]
      });

      // ✅ Record latency
      const ingestedAt = new Date(raw.occurredAt);
      const enqueuedAt = new Date();
      const latencyMs = enqueuedAt.getTime() - ingestedAt.getTime();

      this.metrics.recordLatency(ingestedAt, enqueuedAt);

      if (latencyMs < 10_000) {
        this.logger.log(`✅ Message ${correlationId} enqueued in ${latencyMs}ms (SLO met)`);
      } else {
        this.logger.warn(`⚠️ Message ${correlationId} enqueued in ${latencyMs}ms (SLO missed)`);
      }

      // ✅ Update queue depth gauge
      const queueDepth = await this.queueRepo.countPending();
      this.metrics.recordQueueDepth(queueDepth);

    } catch (err) {
      this.logger.error(`Failed to process message ${correlationId}`, err.stack);

      // ✅ Record failure
      this.metrics.recordRoutingFailure(err.constructor.name);

      // ✅ Enqueue to DLQ
      await this.dlqService.enqueue({
        source: 'crypto-news-sse',
        payload: raw,
        errorMessage: err.message,
        errorStack: err.stack
      });
    }
  }

  private async shouldProcess(channelId: string, messageId: number): Promise<boolean> {
    const existing = await this.queueRepo.findByChannelAndMessage(channelId, messageId);

    if (!existing) return true;

    if (existing.status === 'PUBLISHED') return false;
    if (existing.status === 'PENDING') return false;
    if (existing.status === 'FAILED' && this.isBlockingFailure(existing.failureReason)) {
      return false;
    }

    return true; // Allow retry for transient failures
  }

  private isBlockingFailure(reason: string | null): boolean {
    if (!reason) return false;

    const blockingPatterns = ['blacklist', 'content violation', 'invalid format', 'expired'];
    return blockingPatterns.some(pattern => reason.toLowerCase().includes(pattern));
  }
}
```

---

## Summary

These recommendations are prioritized by:
1. **Impact** — How much value they deliver
2. **Effort** — How difficult they are to implement
3. **Risk** — How likely they are to break things

**High-priority items** (Metrics, Documentation, Dual-Path Comments) deliver immediate value with low effort and low risk.

**Medium-priority items** (Rename Coordinators, 2-Flag Validation, Error Handling) improve maintainability and prevent bugs.

**Low-priority items** (Adaptive Polling, OpenAPI, Migration Guides) are nice-to-haves that polish the system.

---

**Next Steps:**

1. Review priorities with team
2. Create GitHub issues for agreed items
3. Assign owners
4. Implement in sprints (1-3 items per sprint)

---

**Document Maintenance:**

- Update this document when recommendations are implemented
- Mark completed items with ✅
- Add new recommendations as system evolves

---

**Last Updated:** 2026-09-20  
**Maintainer:** Engineering Team  
**Status:** Draft for Review
