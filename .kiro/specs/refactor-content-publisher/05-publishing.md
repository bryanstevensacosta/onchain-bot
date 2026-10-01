# Sistema Publisher — Publishing & Schedulers

**Módulo**: `crypto-news-publisher/`  
**Responsabilidad**: Bot API integration, cron orchestration, throttling

---

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [PublisherCronScheduler](#publishercronscheduler)
3. [ProcessNextQueuedArticleUseCase](#processnextqueuedarticleusecase)
4. [BotApiCryptoNewsPublisherAdapter](#botapicryptonewspublisheradapter)
5. [Throttling System](#throttling-system)
6. [Slot Arbitrator](#slot-arbitrator)
7. [Daily Cap Management](#daily-cap-management)
8. [Media Staging](#media-staging)
9. [Error Handling](#error-handling)
10. [Monitoring](#monitoring)

---

## Visión General

El sistema de publishing orquesta la publicación de contenido a Telegram Bot API con rate limiting, throttling y coordinación con ads.

### Características

- **Rate Limit**: 1 mensaje/minuto (Telegram Bot API)
- **Throttle**: Random delay 3-15 minutos entre publishes
- **Daily Cap**: Configurable (default 20 publishes/día)
- **Slot Coordination**: Mutex entre news y ads (evita colisiones)
- **Retry Logic**: Hasta `llmMaxAttempts` (default 3)
- **Media Support**: sendPhoto (images) + sendMessage (text-only)
- **Zero-Growth Cache**: Tmpdir staging + cleanup garantizado

### Pipeline

```
PublisherCronScheduler (EVERY_MINUTE)
    ↓
ProcessNextQueuedArticleUseCase.execute()
    ├─ Check publishingEnabled flag
    ├─ Advisory lock (multi-replica safe)
    ├─ SlotArbitratorPort.canPublishNow('news')
    ├─ Daily cap check
    ├─ Throttle check (random delay)
    ├─ Dequeue oldest PENDING
    ├─ LLM generation (si llmEnabled=true)
    ├─ Media download a tmpdir
    ├─ BotApiCryptoNewsPublisherAdapter.sendPhoto/sendMessage
    ├─ ON SUCCESS:
    │  ├─ markPublished(telegramMessageId, llmData)
    │  ├─ dedupService.markAsSeen(fingerprint)
    │  ├─ throttleScheduler.setLastPublishAt(now)
    │  ├─ slotArbitrator.recordPublish('news', now)
    │  ├─ rotationStateRepo.incrementPostsSinceLastAd()
    │  └─ mediaCleanup.cleanupPublishedMedia()
    └─ ON FAILURE:
       ├─ incrementAttempts()
       └─ markFailed(reason) o markFailedTerminal(reason)
```

---

## PublisherCronScheduler

**Ubicación**: `application/scheduling/publisher-cron.scheduler.ts`

### Responsibilities

1. **Master Switch**: Check `publishingEnabled` flag
2. **Cron Trigger**: Every minute (`:00` seconds)
3. **Advisory Lock**: Prevent multi-replica double-drain
4. **Delegation**: Call `ProcessNextQueuedArticleUseCase.execute()`

### Implementation

```typescript
@Injectable()
export class PublisherCronScheduler implements OnApplicationBootstrap {
  private readonly LOCK_KEY = 'crypto-news-publisher-cron';
  private readonly LOCK_TIMEOUT_MS = 55_000; // 55s (< 1min interval)

  constructor(
    private readonly processNextQueuedArticle: ProcessNextQueuedArticleUseCase,
    private readonly llmConfigRepo: LlmConfigRepository,
    private readonly logger: Logger = new Logger(PublisherCronScheduler.name),
  ) {}

  onApplicationBootstrap() {
    this.logger.log('PublisherCronScheduler initialized (EVERY_MINUTE)');
  }

  @Cron('0 * * * * *') // Every minute at :00 seconds
  async tick(): Promise<void> {
    try {
      // 1. Check feature flag
      const cfg = await this.llmConfigRepo.load();

      if (!cfg.publishingEnabled) {
        this.logger.debug('Publishing disabled — skipping tick');
        return;
      }

      // 2. Acquire advisory lock (multi-replica safe)
      const lockAcquired = await this.acquireLock();

      if (!lockAcquired) {
        this.logger.debug('Lock held by another instance — skipping tick');
        return;
      }

      try {
        // 3. Delegate to use case
        await this.processNextQueuedArticle.execute();
      } finally {
        // 4. Release lock
        await this.releaseLock();
      }
    } catch (err) {
      this.logger.error(
        `Cron tick failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      // Don't throw — next tick will retry
    }
  }

  private async acquireLock(): Promise<boolean> {
    // PostgreSQL advisory lock (session-level)
    const lockId = this.hashLockKey(this.LOCK_KEY);

    const result = await this.db.query(
      'SELECT pg_try_advisory_lock($1) as acquired',
      [lockId],
    );

    return result.rows[0]?.acquired === true;
  }

  private async releaseLock(): Promise<void> {
    const lockId = this.hashLockKey(this.LOCK_KEY);

    await this.db.query('SELECT pg_advisory_unlock($1)', [lockId]);
  }

  private hashLockKey(key: string): number {
    // Simple hash to convert string → bigint
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) - hash + key.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}
```

### Advisory Lock Pattern

**Why**: Multi-replica deployments (staging/prod) run same cron → need coordination

**PostgreSQL Advisory Locks**:

- `pg_try_advisory_lock(id)` — Non-blocking acquire
- `pg_advisory_unlock(id)` — Explicit release
- Session-level — auto-released on connection close
- Lightweight — no table writes

**Alternative**: Could use Redis SETNX, but Postgres advisory locks are simpler (no extra dependency).

---

## ProcessNextQueuedArticleUseCase

**Ubicación**: `application/handlers/process-next-queued-article.use-case.ts`

### Orchestration Steps

```typescript
@Injectable()
export class ProcessNextQueuedArticleUseCase {
  async execute(): Promise<void> {
    const cfg = await this.llmConfigRepo.load();
    const now = new Date();

    // 1. Slot check (mutex con ads)
    const slot = await this.slotArbitrator.canPublishNow('news', now);
    if (!slot.canPublish) {
      this.logger.log(
        `Slot held by '${slot.lastScope ?? 'unknown'}' — next slot in ${slot.remainingSeconds}s`,
      );
      return;
    }

    // 2. Daily cap check
    if (!(await this.canPublishToday(cfg))) {
      this.logger.log('Daily cap reached — skipping tick');
      return;
    }

    // 3. Throttle check (random delay 3-15min)
    const decision = await this.throttleScheduler.shouldPublish(now);
    if (!decision.canPublish) {
      this.logger.log(
        `Throttle active — next publish in ${Math.round(decision.nextDelayMs / 1000)}s`,
      );
      return;
    }

    // 4. Dequeue oldest PENDING
    const entry = await this.queueRepo.findNextPending();
    if (!entry) {
      this.logger.log('No pending entries — skipping tick');
      return;
    }

    // 5. Mark SCHEDULED (transient state)
    await this.queueRepo.markScheduled(entry.id, now);

    try {
      // 6. Generate content (LLM or raw)
      let contentToPublish: string;
      let generatedData: LlmGenerationResult | undefined;

      if (cfg.llmEnabled) {
        generatedData = await this.llmAdapter.generateForEntry(entry);

        if (
          !generatedData?.content ||
          generatedData.content.trim().length === 0
        ) {
          throw new Error('LLM returned empty content');
        }

        contentToPublish = generatedData.content;

        // Latin-only validation
        if (cfg.rejectNonLatin) {
          const bad = findNonLatinCharacter(contentToPublish);
          if (bad) {
            throw new Error(
              `Non-Latin character '${bad.char}' (U+${bad.codePoint.toString(16).toUpperCase()}) detected`,
            );
          }
        }
      } else {
        this.logger.log(
          `llmEnabled=false — publishing raw content for entry ${entry.id}`,
        );
        contentToPublish = entry.rawContent;
      }

      // 7. Publish to Telegram
      const result = await this.dispatchToTelegram(
        entry,
        contentToPublish,
        cfg,
      );

      if (!result.ok || !result.messageId) {
        throw new Error(result.error ?? 'Telegram publish returned no ID');
      }

      // 8. Mark PUBLISHED
      await this.queueRepo.markPublished(
        entry.id,
        String(result.messageId),
        generatedData,
      );

      // 9. Store fingerprint (dedup)
      await this.storeFingerprint(entry);

      // 10. Update shared state
      await this.throttleScheduler.setLastPublishAt(now);
      await this.slotArbitrator.recordPublish('news', now);
      await this.rotationStateRepo.incrementPostsSinceLastAd();

      // 11. Cleanup media (tmpdir)
      try {
        await this.mediaCleanup.cleanupPublishedMedia(
          entry.imagePaths,
          this.publisherConfig.config.publishing.mediaTtlDays,
        );
      } catch (cleanupErr) {
        this.logger.warn(
          `Media cleanup failed for entry ${entry.id} (publish succeeded): ${cleanupErr.message}`,
        );
      }

      this.logger.log(
        `✅ Published queue entry ${entry.id} as telegram message ${result.messageId}` +
          (cfg.llmEnabled ? ' (LLM)' : ' (raw)'),
      );
    } catch (err) {
      // 12. Handle failure (retry or terminal)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      entry.incrementAttempts();

      if (entry.attempts < cfg.llmMaxAttempts) {
        // Retry — back to PENDING
        await this.queueRepo.markFailed(entry.id, errorMessage);

        this.logger.warn(
          `Entry ${entry.id} failed (attempt ${entry.attempts}/${cfg.llmMaxAttempts}): ${errorMessage}`,
        );
      } else {
        // Terminal — mark FAILED
        await this.queueRepo.markFailedTerminal(
          entry.id,
          `Failed after ${entry.attempts} attempts: ${errorMessage}`,
        );

        this.logger.error(
          `Entry ${entry.id} failed terminally after ${entry.attempts} attempts: ${errorMessage}`,
        );
      }
    }
  }
}
```

### Daily Cap Check

```typescript
private async canPublishToday(cfg: LlmConfig): Promise<boolean> {
  const now = new Date();

  // Calculate reset window (UTC hour)
  const resetHour = cfg.dailyResetUtcHour;
  const windowStart = new Date(now);
  windowStart.setUTCHours(resetHour, 0, 0, 0);

  // If current time < reset hour today, window started yesterday
  if (now.getUTCHours() < resetHour) {
    windowStart.setUTCDate(windowStart.getUTCDate() - 1);
  }

  // Count PUBLISHED entries since window start
  const publishedCount = await this.queueRepo.countPublishedSince(windowStart);

  if (publishedCount >= cfg.dailyCap) {
    this.logger.warn(
      `Daily cap reached: ${publishedCount}/${cfg.dailyCap} ` +
      `(window started ${windowStart.toISOString()})`
    );
    return false;
  }

  return true;
}
```

### Dispatch to Telegram

```typescript
private async dispatchToTelegram(
  entry: PublisherQueueEntry,
  content: string,
  cfg: LlmConfig
): Promise<TelegramPublishResult> {
  // Check if entry has images
  if (entry.imagePaths.length > 0) {
    // sendPhoto (with caption)
    return this.publisher.sendPhoto({
      chatId: this.publisherConfig.config.publishing.outputChannel,
      caption: content,
      imagePaths: entry.imagePaths,
      parseMode: 'Markdown',
      disableNotification: false
    });
  } else {
    // sendMessage (text-only)
    return this.publisher.sendMessage({
      chatId: this.publisherConfig.config.publishing.outputChannel,
      text: content,
      parseMode: 'Markdown',
      disableWebPagePreview: false
    });
  }
}
```

### Store Fingerprint

```typescript
private async storeFingerprint(entry: PublisherQueueEntry): Promise<void> {
  if (!this.dedupService) {
    return; // Optional injection
  }

  try {
    const fingerprint = await this.dedupService.generateFingerprint({
      title: entry.rawTitle || '',
      content: entry.rawContent,
      urls: this.extractUrls(entry.rawContent)
    });

    await this.dedupService.markAsSeen(
      fingerprint,
      entry.id,
      CRYPTO_NEWS_DEDUP_SOURCE
    );

  } catch (err) {
    this.logger.warn(
      `Failed to store fingerprint for ${entry.id}: ${err.message} ` +
      `(publish succeeded, dedup tracking failed)`
    );
    // Don't throw — publish already succeeded
  }
}
```

---

## BotApiCryptoNewsPublisherAdapter

**Ubicación**: `infrastructure/senders/bot-api-crypto-news-publisher.adapter.ts`

### Responsibilities

1. **Telegram Bot API Integration**: HTTP requests a Bot API
2. **Media Download**: Fetch images de ingestion-telegram
3. **Multipart Upload**: sendPhoto con form-data
4. **Rate Limiting**: 1 mensaje/minuto enforcement
5. **Error Mapping**: Telegram errors → domain errors

### Interface (TelegramPublisherPort)

```typescript
// telegram/shared/domain/ports/telegram-publisher.port.ts
abstract class TelegramPublisherPort {
  abstract sendMessage(input: SendMessageInput): Promise<TelegramPublishResult>;
  abstract sendPhoto(input: SendPhotoInput): Promise<TelegramPublishResult>;
}

interface SendMessageInput {
  chatId: string;
  text: string;
  parseMode?: 'Markdown' | 'HTML';
  disableWebPagePreview?: boolean;
}

interface SendPhotoInput {
  chatId: string;
  caption: string;
  imagePaths: string[]; // URLs a ingestion-telegram
  parseMode?: 'Markdown' | 'HTML';
  disableNotification?: boolean;
}

interface TelegramPublishResult {
  ok: boolean;
  messageId: number | null;
  error: string | null;
}
```

### Implementation

```typescript
@Injectable()
export class BotApiCryptoNewsPublisherAdapter implements TelegramPublisherPort {
  private readonly BOT_TOKEN: string;
  private readonly API_BASE = 'https://api.telegram.org';

  constructor(
    private readonly config: ConfigService,
    private readonly logger: Logger = new Logger(
      BotApiCryptoNewsPublisherAdapter.name,
    ),
  ) {
    this.BOT_TOKEN = this.config.get<string>('CRYPTO_NEWS_BOT_TOKEN');

    if (!this.BOT_TOKEN) {
      throw new Error('CRYPTO_NEWS_BOT_TOKEN not configured');
    }
  }

  async sendMessage(input: SendMessageInput): Promise<TelegramPublishResult> {
    const url = `${this.API_BASE}/bot${this.BOT_TOKEN}/sendMessage`;

    try {
      // Validate text length (Telegram limit: 4096 chars)
      if (input.text.length > 4096) {
        return {
          ok: false,
          messageId: null,
          error: `Text too long: ${input.text.length} chars (max 4096)`,
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
          parse_mode: input.parseMode || 'Markdown',
          disable_web_page_preview: input.disableWebPagePreview ?? false,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        return {
          ok: false,
          messageId: null,
          error: data.description || 'Unknown Telegram API error',
        };
      }

      return {
        ok: true,
        messageId: data.result.message_id,
        error: null,
      };
    } catch (err) {
      return {
        ok: false,
        messageId: null,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  async sendPhoto(input: SendPhotoInput): Promise<TelegramPublishResult> {
    const url = `${this.API_BASE}/bot${this.BOT_TOKEN}/sendPhoto`;

    try {
      // 1. Download first image (Telegram sendPhoto: single image)
      const firstImageUrl = input.imagePaths[0];
      if (!firstImageUrl) {
        return {
          ok: false,
          messageId: null,
          error: 'No images provided',
        };
      }

      const tmpDir = path.join(os.tmpdir(), `telegram-publish-${uuid()}`);
      await fs.mkdir(tmpDir, { recursive: true });

      try {
        const imageBuffer = await this.downloadImage(firstImageUrl);
        const imagePath = path.join(tmpDir, 'image.jpg');
        await fs.writeFile(imagePath, imageBuffer);

        // 2. Build multipart form-data
        const formData = new FormData();
        formData.append('chat_id', input.chatId);
        formData.append('caption', input.caption);
        formData.append('parse_mode', input.parseMode || 'Markdown');
        formData.append(
          'disable_notification',
          String(input.disableNotification ?? false),
        );

        // Append image file
        const fileStream = require('fs').createReadStream(imagePath);
        formData.append('photo', fileStream, 'image.jpg');

        // 3. Upload to Telegram
        const response = await fetch(url, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!data.ok) {
          return {
            ok: false,
            messageId: null,
            error: data.description || 'Unknown Telegram API error',
          };
        }

        return {
          ok: true,
          messageId: data.result.message_id,
          error: null,
        };
      } finally {
        // 4. Cleanup tmpdir
        await fs.rm(tmpDir, { recursive: true, force: true }).catch((err) => {
          this.logger.warn(
            `Failed to cleanup tmpdir ${tmpDir}: ${err.message}`,
          );
        });
      }
    } catch (err) {
      return {
        ok: false,
        messageId: null,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  private async downloadImage(url: string): Promise<Buffer> {
    // Resolve full URL (relative → absolute)
    const fullUrl = url.startsWith('http')
      ? url
      : `${this.config.get('INGESTION_TELEGRAM_URL')}${url}`;

    const response = await fetch(fullUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to download image: ${response.status} ${response.statusText}`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
```

### Rate Limiting

**Telegram Bot API**: 30 messages/second por default, pero crypto-news usa **1 mensaje/minuto** para parecer "human-like".

**Enforcement**: Via throttle system (random delay 3-15min) + slot arbitrator (mutex con ads).

**No queue interno**: Single message per tick, natural rate limit.

---

## Throttling System

**Ubicación**: `telegram/shared/application/services/shared-throttle-scheduler.service.ts`

### Responsibilities

1. **Random Delay**: 3-15 minutos entre publishes consecutivos
2. **State Management**: Persist `lastPublishAt` timestamp
3. **Decision Logic**: `shouldPublish()` basado en elapsed time

### SharedThrottleSchedulerService

```typescript
@Injectable()
export class SharedThrottleSchedulerService {
  constructor(
    private readonly stateRepo: SharedThrottleStateRepository,
    @Inject(SHARED_THROTTLE_BOUNDS)
    private readonly bounds: { minDelayMs: number; maxDelayMs: number },
  ) {}

  async shouldPublish(now: Date): Promise<ThrottleDecision> {
    const state = await this.stateRepo.load();

    if (!state.lastPublishAt) {
      // First publish — always allow
      return { canPublish: true, nextDelayMs: 0 };
    }

    // Calculate random target delay (between bounds)
    const targetDelayMs = this.generateRandomDelay();

    // Check elapsed time
    const elapsedMs = now.getTime() - state.lastPublishAt.getTime();

    if (elapsedMs >= targetDelayMs) {
      return { canPublish: true, nextDelayMs: 0 };
    }

    // Not enough time elapsed
    const remainingMs = targetDelayMs - elapsedMs;
    return { canPublish: false, nextDelayMs: remainingMs };
  }

  async setLastPublishAt(timestamp: Date): Promise<void> {
    await this.stateRepo.updateLastPublishAt(timestamp);
  }

  private generateRandomDelay(): number {
    // Random between minDelayMs and maxDelayMs
    const { minDelayMs, maxDelayMs } = this.bounds;
    return minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
  }
}

interface ThrottleDecision {
  canPublish: boolean;
  nextDelayMs: number;
}
```

### Configuration (per module)

**Crypto-news publisher**:

```typescript
// crypto-news-publisher.module.ts
{
  provide: SHARED_THROTTLE_BOUNDS,
  useFactory: () => {
    const cfg = loadCryptoNewsPublisherConfig();
    return {
      minDelayMs: cfg.publishing.randomDelayMinMs,  // 3 min = 180_000
      maxDelayMs: cfg.publishing.randomDelayMaxMs   // 15 min = 900_000
    };
  }
}
```

**Ads**:

```typescript
// crypto-news-ads.module.ts
{
  provide: SharedThrottleSchedulerService,
  useFactory: (repo: SharedThrottleStateRepository) =>
    new SharedThrottleSchedulerService(repo, {
      minDelayMs: 30_000,   // 30 seconds
      maxDelayMs: 180_000   // 3 minutes
    }),
  inject: [SharedThrottleStateRepository]
}
```

### Database

```sql
CREATE TABLE crypto_news_publisher_throttle_state (
  id               INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  last_publish_at  TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed
INSERT INTO crypto_news_publisher_throttle_state (id, last_publish_at)
VALUES (1, NULL);
```

---

## Slot Arbitrator

**Ubicación**: `telegram/shared/infrastructure/persistence/typeorm/repositories/typeorm-slot-arbitrator.ts`

### Purpose

**Mutex entre news y ads** — evitar publicar ambos al mismo tiempo.

### SlotArbitratorPort

```typescript
// telegram/shared/domain/ports/slot-arbitrator.port.ts
abstract class SlotArbitratorPort {
  abstract canPublishNow(
    scope: 'news' | 'ads',
    now: Date,
  ): Promise<SlotDecision>;

  abstract recordPublish(scope: 'news' | 'ads', timestamp: Date): Promise<void>;
}

interface SlotDecision {
  canPublish: boolean;
  lastScope: 'news' | 'ads' | null;
  remainingSeconds: number;
}
```

### Implementation

```typescript
@Injectable()
export class TypeOrmSlotArbitrator implements SlotArbitratorPort {
  private readonly SLOT_DURATION_SECONDS = 60; // 1 minute hold

  async canPublishNow(scope: 'news' | 'ads', now: Date): Promise<SlotDecision> {
    const state = await this.stateRepo.load();

    if (!state.lastPublishAt) {
      // No publishes yet — slot free
      return {
        canPublish: true,
        lastScope: null,
        remainingSeconds: 0,
      };
    }

    // Check elapsed time since last publish
    const elapsedSeconds =
      (now.getTime() - state.lastPublishAt.getTime()) / 1000;

    if (elapsedSeconds >= this.SLOT_DURATION_SECONDS) {
      // Slot expired — free for anyone
      return {
        canPublish: true,
        lastScope: state.lastScope,
        remainingSeconds: 0,
      };
    }

    // Slot still held
    const remainingSeconds = Math.ceil(
      this.SLOT_DURATION_SECONDS - elapsedSeconds,
    );

    return {
      canPublish: false,
      lastScope: state.lastScope,
      remainingSeconds,
    };
  }

  async recordPublish(scope: 'news' | 'ads', timestamp: Date): Promise<void> {
    await this.stateRepo.update({
      lastPublishAt: timestamp,
      lastScope: scope,
    });
  }
}
```

### Database

```sql
CREATE TABLE crypto_news_publisher_slot_state (
  id               INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  last_publish_at  TIMESTAMPTZ,
  last_scope       VARCHAR CHECK (last_scope IN ('news', 'ads')),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed
INSERT INTO crypto_news_publisher_slot_state (id)
VALUES (1);
```

### Flow Example

```
T=0:00 — News publish
  ├─ canPublishNow('news', T=0:00) → { canPublish: true }
  ├─ sendMessage() → success
  └─ recordPublish('news', T=0:00)

T=0:30 — Ads tries to publish
  ├─ canPublishNow('ads', T=0:30) → { canPublish: false, remainingSeconds: 30 }
  └─ Skip (wait for slot)

T=1:01 — Ads publishes
  ├─ canPublishNow('ads', T=1:01) → { canPublish: true } (slot expired)
  ├─ sendPhoto() → success
  └─ recordPublish('ads', T=1:01)
```

---

## Daily Cap Management

### Purpose

Limitar número de publishes por día (evitar spam, ToS compliance).

### Implementation

**Config**:

```typescript
interface LlmConfig {
  dailyCap: number; // Max publishes per day (default 20)
  dailyResetUtcHour: number; // UTC hour for reset (default 0 = midnight)
}
```

**Reset Window Calculation**:

```typescript
function calculateResetWindow(now: Date, resetHour: number): Date {
  const windowStart = new Date(now);
  windowStart.setUTCHours(resetHour, 0, 0, 0);

  // If current time < reset hour today, window started yesterday
  if (now.getUTCHours() < resetHour) {
    windowStart.setUTCDate(windowStart.getUTCDate() - 1);
  }

  return windowStart;
}

// Example:
// now = 2026-09-23 14:00 UTC, resetHour = 0
// → windowStart = 2026-09-23 00:00 UTC (today)

// now = 2026-09-23 22:00 UTC, resetHour = 0
// → windowStart = 2026-09-23 00:00 UTC (today)

// now = 2026-09-24 02:00 UTC, resetHour = 5
// → windowStart = 2026-09-23 05:00 UTC (yesterday)
```

**Query**:

```typescript
async countPublishedSince(windowStart: Date): Promise<number> {
  return this.repo.count({
    where: {
      status: PublisherQueueStatus.PUBLISHED,
      publishedAt: MoreThanOrEqual(windowStart)
    }
  });
}
```

**Decision**:

```typescript
const publishedCount = await this.queueRepo.countPublishedSince(windowStart);

if (publishedCount >= cfg.dailyCap) {
  this.logger.warn(
    `Daily cap reached: ${publishedCount}/${cfg.dailyCap} ` +
      `(window: ${windowStart.toISOString()})`,
  );
  return false; // Skip publish
}
```

---

## Media Staging

### Zero-Growth Architecture

**Problem**: Backend media cache crecía indefinidamente.

**Solution**: Ephemeral tmpdir staging con cleanup garantizado.

### Flow

```typescript
async ensureLocalFiles(remotePaths: string[]): Promise<string[]> {
  if (remotePaths.length === 0) return [];

  // 1. Create tmpdir
  const tmpDir = path.join(os.tmpdir(), `backend-media-${uuid()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const localPaths: string[] = [];

    // 2. Download images
    for (const remotePath of remotePaths) {
      const fullUrl = `${INGESTION_URL}${remotePath}`;
      const response = await fetch(fullUrl);

      if (!response.ok) {
        this.logger.warn(`Failed to download ${remotePath}: ${response.status}`);
        continue;
      }

      const filename = `image-${localPaths.length}.jpg`;
      const localPath = path.join(tmpDir, filename);

      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(localPath, buffer);

      localPaths.push(localPath);
    }

    return localPaths;

  } catch (err) {
    // Cleanup on error
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

// Usage in use case:
try {
  const localPaths = await this.ensureLocalFiles(entry.imagePaths);

  // Use for LLM + Telegram
  await this.llmAdapter.generate(...);
  await this.publisher.sendPhoto(...);

} finally {
  // ALWAYS cleanup (success OR failure)
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(err => {
    this.logger.warn(`Cleanup failed: ${err.message}`);
  });
}
```

### MediaCleanupService

**Purpose**: Delete old backend-cached media (if any).

**Current State**: Backend NO persiste media (zero-growth), pero service existe para backward compatibility.

```typescript
@Injectable()
export class MediaCleanupService {
  async cleanupPublishedMedia(
    imagePaths: string[],
    ttlDays: number,
  ): Promise<void> {
    // No-op in zero-growth architecture
    // Ingestion-telegram owns media (72h retention)
    // Backend only stages to tmpdir (auto-cleaned)
    this.logger.debug('Media cleanup skipped (zero-growth architecture)');
  }
}
```

---

## Error Handling

### Retry Strategy

**Transient Errors** (retry):

- Network timeout
- Telegram API rate limit (429)
- LLM service unavailable
- Media download failed

**Permanent Errors** (terminal):

- Invalid content (non-Latin character)
- Policy violation
- Blacklist match
- Duplicate (semantic/exact)

### Implementation

```typescript
try {
  // ... publish logic

} catch (err) {
  const errorMessage = err instanceof Error ? err.message : 'Unknown error';

  // Check if error is transient or permanent
  const isPermanent = this.isPermanentError(errorMessage);

  if (isPermanent) {
    // Terminal — mark FAILED immediately
    await this.queueRepo.markFailedTerminal(entry.id, errorMessage);

    this.logger.error(
      `Entry ${entry.id} failed terminally (permanent error): ${errorMessage}`
    );
  } else {
    // Transient — retry
    entry.incrementAttempts();

    if (entry.attempts < cfg.llmMaxAttempts) {
      await this.queueRepo.markFailed(entry.id, errorMessage);

      this.logger.warn(
        `Entry ${entry.id} failed (attempt ${entry.attempts}/${cfg.llmMaxAttempts}): ${errorMessage}`
      );
    } else {
      await this.queueRepo.markFailedTerminal(
        entry.id,
        `Failed after ${entry.attempts} attempts: ${errorMessage}`
      );

      this.logger.error(
        `Entry ${entry.id} failed terminally after ${entry.attempts} attempts: ${errorMessage}`
      );
    }
  }
}

private isPermanentError(message: string): boolean {
  const permanentPatterns = [
    'non-Latin character',
    'policy violation',
    'blacklist',
    'duplicate',
    'invalid content'
  ];

  const lower = message.toLowerCase();
  return permanentPatterns.some(pattern => lower.includes(pattern));
}
```

### Error Logging

```typescript
// Correlation ID tracking
this.logger.error(
  `[PUBLISH-ERROR] Entry ${entry.id} (trace: ${entry.traceId}): ${err.message}`,
  err.stack,
);

// Structured logging (JSON)
this.logger.error({
  event: 'publish_failed',
  entryId: entry.id,
  traceId: entry.traceId,
  channelId: entry.channelId,
  messageId: entry.messageId,
  attempt: entry.attempts,
  maxAttempts: cfg.llmMaxAttempts,
  error: err.message,
  stack: err.stack,
});
```

---

## Monitoring

### Key Metrics

```typescript
interface PublishingMetrics {
  // Queue health
  queueSize: number;
  oldestPendingAge: number | null; // seconds

  // Publish stats (24h window)
  publishedCount: number;
  failedCount: number;
  blockedCount: number;

  // Performance
  avgLatency: number; // seconds (queued → published)
  successRate: number; // 0-1

  // Throttle state
  lastPublishAt: Date | null;
  nextPublishEta: number | null; // seconds

  // Daily cap
  dailyCapUsed: number;
  dailyCapTotal: number;
}
```

### Metrics Endpoint

```http
GET /crypto-news-publisher/metrics
Response: PublishingMetrics
```

### Logs to Watch

```
✅ Published queue entry {id} as telegram message {messageId} (LLM)
⚠️ Entry {id} failed (attempt {n}/{max}): {reason}
❌ Entry {id} failed terminally after {n} attempts: {reason}
🔒 Slot held by '{scope}' — next slot in {n}s
⏱️ Throttle active — next publish in {n}s
📊 Daily cap reached: {n}/{cap}
```

### Alerting Rules

1. **Queue backup**: `queueSize > 30` for >10 minutes
2. **Publish failures**: `failedCount > 10` in 1 hour
3. **Success rate drop**: `successRate < 0.8` in 1 hour
4. **Stale queue**: `oldestPendingAge > 3600` (1 hour)
5. **Daily cap hit early**: `dailyCapUsed >= dailyCapTotal` before 18:00 UTC

---

**Navegación**: [← 04-llm.md](./04-llm.md) | [06-ads.md →](./06-ads.md)
