# Sistema Publisher — Ads & Rotation

**Módulo**: `crypto-news-ads/`  
**Responsabilidad**: Ad management, rotation logic, media library

---

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Ad Entity](#ad-entity)
3. [AdMedia & MediaLibrary](#admedia--medialibrary)
4. [Rotation Logic](#rotation-logic)
5. [AdsCronScheduler](#adscronscheduler)
6. [PublishAdUseCase](#publishadusecase)
7. [Media Upload](#media-upload)
8. [Rotation Configuration](#rotation-configuration)
9. [Database Schema](#database-schema)
10. [APIs](#apis)

---

## Visión General

El sistema de Ads intercala anuncios promocionales entre contenido crypto-news de forma automática.

### Características

- **Automated Rotation**: Round-robin entre ads activos
- **Interval Control**: Cada N posts de news + time-based fallback
- **Media Library**: Reutilizar imágenes entre ads
- **Slot Coordination**: Shared mutex con news (evita colisiones)
- **Throttling**: Random delay 30s-3min (más agresivo que news)
- **Manual Override**: Publish ad now (bypass rotation)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ADS SYSTEM                               │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   Ad Catalog │  │ Media Library│  │ Rotation Config │   │
│  │              │  │              │  │                 │   │
│  │ • Ad text    │  │ • Images     │  │ • enabled       │   │
│  │ • Media refs │  │ • Videos     │  │ • intervalPosts │   │
│  │ • isActive   │  │ • Reusable   │  │ • minHours      │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘   │
│         │                 │                    │            │
│         └─────────────────┴────────────────────┘            │
│                           │                                 │
│                  ┌────────▼─────────┐                       │
│                  │ RotationDecider  │                       │
│                  │                  │                       │
│                  │ • Check counter  │                       │
│                  │ • Check time     │                       │
│                  │ • Select next ad │                       │
│                  └────────┬─────────┘                       │
│                           │                                 │
│                  ┌────────▼─────────┐                       │
│                  │ AdsCronScheduler │                       │
│                  │ (EVERY_MINUTE)   │                       │
│                  └────────┬─────────┘                       │
│                           │                                 │
└───────────────────────────┼─────────────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │ BotApiPublisher (shared)   │
              │ + Slot Arbitrator          │
              │ + Throttle Scheduler       │
              └────────────────────────────┘
                            │
                            ▼
                    Telegram Channel
```

### Data Flow

```
News Published
    ↓
rotationStateRepo.incrementPostsSinceLastAd()
    ↓ postsSinceLastAd++
AdsCronScheduler.tick()
    ├─ Check rotationEnabled
    ├─ RotationDeciderService.shouldPublishAd()
    │  ├─ postsSinceLastAd >= intervalPosts?
    │  └─ hoursSinceLastAd >= minHoursBetweenAds?
    ├─ SI should publish:
    │  ├─ Select next ad (round-robin)
    │  ├─ SlotArbitratorPort.canPublishNow('ads')
    │  ├─ ThrottleScheduler.shouldPublish()
    │  ├─ PublishAdUseCase.execute()
    │  │  ├─ Download ad media a tmpdir
    │  │  ├─ BotApiPublisher.sendPhoto()
    │  │  └─ Cleanup tmpdir
    │  ├─ rotationState.reset() — postsSinceLastAd = 0
    │  ├─ rotationState.recordLastAdAt(now)
    │  └─ throttleScheduler.setLastPublishAt(now)
    └─ ELSE: skip
```

---

## Ad Entity

**Ubicación**: `domain/entities/ad.entity.ts`

### Props

```typescript
interface AdProps {
  // Content
  text: string; // Ad text (caption)
  mediaType: AdMediaType; // IMAGE | VIDEO | TEXT_ONLY

  // State
  isActive: boolean; // Enable/disable
  priority: number; // Higher = more frequent (reserved)

  // Scheduling
  scheduledStartDate: Date | null; // Activate on date (optional)
  scheduledEndDate: Date | null; // Deactivate on date (optional)

  // Stats (read-only, populated on publish)
  lastPublishedAt: Date | null;
  publishCount: number;

  // Audit
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

enum AdMediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  TEXT_ONLY = 'TEXT_ONLY',
}
```

### Validation

```typescript
class Ad extends AggregateRoot<string> {
  static create(input: {
    text: string;
    mediaType: AdMediaType;
    priority?: number;
    scheduledStartDate?: Date;
    scheduledEndDate?: Date;
    createdBy?: string;
  }): Ad {
    // Validate text
    if (!input.text || input.text.trim().length === 0) {
      throw new DomainError('text', 'Ad text cannot be empty');
    }

    if (input.text.length > 1024) {
      throw new DomainError('text', 'Ad text too long (max 1024 chars)');
    }

    // Validate date range
    if (input.scheduledStartDate && input.scheduledEndDate) {
      if (input.scheduledEndDate <= input.scheduledStartDate) {
        throw new DomainError(
          'scheduledEndDate',
          'End date must be after start date',
        );
      }
    }

    const props: AdProps = {
      text: input.text.trim(),
      mediaType: input.mediaType,
      isActive: true,
      priority: input.priority ?? 0,
      scheduledStartDate: input.scheduledStartDate || null,
      scheduledEndDate: input.scheduledEndDate || null,
      lastPublishedAt: null,
      publishCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: input.createdBy || null,
      updatedBy: null,
    };

    return new Ad(uuid(), props);
  }

  update(input: {
    text?: string;
    mediaType?: AdMediaType;
    priority?: number;
    isActive?: boolean;
    scheduledStartDate?: Date;
    scheduledEndDate?: Date;
    updatedBy?: string;
  }): void {
    if (input.text !== undefined) {
      if (input.text.trim().length === 0) {
        throw new DomainError('text', 'Ad text cannot be empty');
      }
      this.props.text = input.text.trim();
    }

    if (input.mediaType !== undefined) {
      this.props.mediaType = input.mediaType;
    }

    if (input.priority !== undefined) {
      this.props.priority = input.priority;
    }

    if (input.isActive !== undefined) {
      this.props.isActive = input.isActive;
    }

    if (input.scheduledStartDate !== undefined) {
      this.props.scheduledStartDate = input.scheduledStartDate;
    }

    if (input.scheduledEndDate !== undefined) {
      this.props.scheduledEndDate = input.scheduledEndDate;
    }

    this.props.updatedAt = new Date();
    this.props.updatedBy = input.updatedBy || null;
  }

  recordPublish(at: Date): void {
    this.props.lastPublishedAt = at;
    this.props.publishCount++;
    this.props.updatedAt = at;
  }

  isScheduledActive(now: Date): boolean {
    // Check scheduled date range
    if (this.props.scheduledStartDate && now < this.props.scheduledStartDate) {
      return false; // Not started yet
    }

    if (this.props.scheduledEndDate && now > this.props.scheduledEndDate) {
      return false; // Already ended
    }

    return this.props.isActive;
  }
}
```

### Example

```typescript
const ad = Ad.create({
  text: '🚀 Trade on CryptoExchange — Low fees, high liquidity!\n\nVisit: https://example.com',
  mediaType: AdMediaType.IMAGE,
  priority: 10,
  scheduledStartDate: new Date('2026-10-01'),
  scheduledEndDate: new Date('2026-12-31'),
  createdBy: 'admin@example.com',
});
```

---

## AdMedia & MediaLibrary

### AdMedia Entity

**Purpose**: Link ad → media files (1:N relationship)

```typescript
interface AdMediaProps {
  adId: string; // FK to Ad
  mediaUrl: string; // Local path or URL
  mediaType: 'IMAGE' | 'VIDEO';
  sequence: number; // Order (for multi-image ads)
  libraryImageId: string | null; // FK to AdMediaLibrary (if reused)

  createdAt: Date;
}

class AdMedia extends Entity<string> {
  static create(input: {
    adId: string;
    mediaUrl: string;
    mediaType: 'IMAGE' | 'VIDEO';
    sequence?: number;
    libraryImageId?: string;
  }): AdMedia {
    // Validate
    if (!input.adId || !input.mediaUrl) {
      throw new DomainError('adId/mediaUrl', 'Required fields missing');
    }

    const props: AdMediaProps = {
      adId: input.adId,
      mediaUrl: input.mediaUrl,
      mediaType: input.mediaType,
      sequence: input.sequence ?? 0,
      libraryImageId: input.libraryImageId || null,
      createdAt: new Date(),
    };

    return new AdMedia(uuid(), props);
  }
}
```

**Database**:

```sql
CREATE TABLE crypto_news_ad_media (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id             UUID NOT NULL REFERENCES crypto_news_ads(id) ON DELETE CASCADE,
  media_url         VARCHAR NOT NULL,
  media_type        VARCHAR NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO')),
  sequence          INTEGER NOT NULL DEFAULT 0,
  library_image_id  UUID REFERENCES crypto_news_ad_media_library(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_media_ad_id ON crypto_news_ad_media(ad_id);
CREATE INDEX idx_ad_media_sequence ON crypto_news_ad_media(ad_id, sequence);
```

---

### AdMediaLibrary Entity

**Purpose**: Shared image/video pool, reusable across ads

```typescript
interface AdMediaLibraryProps {
  filename: string; // Unique filename
  originalName: string; // Upload original name
  mimeType: string; // image/jpeg, video/mp4, etc.
  sizeBytes: number;
  mediaType: 'IMAGE' | 'VIDEO';
  storageUrl: string; // Local path (uploads/crypto-news-ads-library/)

  // Usage tracking
  usageCount: number; // How many ads use this

  // Metadata
  description: string | null;
  tags: string[]; // Searchable tags

  createdAt: Date;
  createdBy: string | null;
}

class AdMediaLibrary extends Entity<string> {
  static create(input: {
    filename: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    mediaType: 'IMAGE' | 'VIDEO';
    storageUrl: string;
    description?: string;
    tags?: string[];
    createdBy?: string;
  }): AdMediaLibrary {
    // Validate size (max 10MB)
    if (input.sizeBytes > 10 * 1024 * 1024) {
      throw new DomainError('sizeBytes', 'Media too large (max 10MB)');
    }

    const props: AdMediaLibraryProps = {
      filename: input.filename,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      mediaType: input.mediaType,
      storageUrl: input.storageUrl,
      usageCount: 0,
      description: input.description || null,
      tags: input.tags || [],
      createdAt: new Date(),
      createdBy: input.createdBy || null,
    };

    return new AdMediaLibrary(uuid(), props);
  }

  incrementUsage(): void {
    this.props.usageCount++;
  }

  decrementUsage(): void {
    if (this.props.usageCount > 0) {
      this.props.usageCount--;
    }
  }
}
```

**Database**:

```sql
CREATE TABLE crypto_news_ad_media_library (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename       VARCHAR NOT NULL UNIQUE,
  original_name  VARCHAR NOT NULL,
  mime_type      VARCHAR NOT NULL,
  size_bytes     INTEGER NOT NULL,
  media_type     VARCHAR NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO')),
  storage_url    VARCHAR NOT NULL,
  usage_count    INTEGER NOT NULL DEFAULT 0,
  description    TEXT,
  tags           TEXT[],
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     VARCHAR
);

CREATE INDEX idx_media_library_tags ON crypto_news_ad_media_library USING GIN(tags);
CREATE INDEX idx_media_library_media_type ON crypto_news_ad_media_library(media_type);
```

---

## Rotation Logic

### AdRotationConfig Entity

**Purpose**: Master configuration for rotation behavior

```typescript
interface AdRotationConfigProps {
  enabled: boolean; // Master switch
  intervalPosts: number; // Publish ad every N news posts
  minHoursBetweenAds: number; // Minimum hours between ads (fallback)

  updatedAt: Date;
  updatedBy: string | null;
}

class AdRotationConfig extends Entity<number> {
  static SINGLETON_ID = 1;

  static async load(
    repo: AdRotationConfigRepository,
  ): Promise<AdRotationConfig> {
    const config = await repo.findOne();
    if (!config) {
      // Seed with defaults
      return repo.save(
        AdRotationConfig.create({
          enabled: false, // Fail-closed
          intervalPosts: 10, // Every 10 news posts
          minHoursBetweenAds: 2, // Or at least 2 hours
        }),
      );
    }
    return config;
  }
}
```

**Database**:

```sql
CREATE TABLE crypto_news_ad_rotation_config (
  id                    INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  enabled               BOOLEAN NOT NULL DEFAULT false,
  interval_posts        INTEGER NOT NULL DEFAULT 10 CHECK (interval_posts > 0),
  min_hours_between_ads NUMERIC NOT NULL DEFAULT 2 CHECK (min_hours_between_ads >= 0),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            VARCHAR
);

-- Seed
INSERT INTO crypto_news_ad_rotation_config (id, enabled)
VALUES (1, false);
```

---

### AdRotationState Entity

**Purpose**: Track rotation state (counter + timestamp)

```typescript
interface AdRotationStateProps {
  postsSinceLastAd: number; // Counter desde último ad
  lastAdPublishedAt: Date | null; // Timestamp del último ad
  lastAdId: string | null; // FK to last published ad (round-robin)

  updatedAt: Date;
}

class AdRotationState extends Entity<number> {
  static SINGLETON_ID = 1;

  incrementPostsSinceLastAd(): void {
    this.props.postsSinceLastAd++;
    this.props.updatedAt = new Date();
  }

  reset(adId: string, at: Date): void {
    this.props.postsSinceLastAd = 0;
    this.props.lastAdPublishedAt = at;
    this.props.lastAdId = adId;
    this.props.updatedAt = at;
  }
}
```

**Database**:

```sql
CREATE TABLE crypto_news_ad_rotation_state (
  id                   INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  posts_since_last_ad  INTEGER NOT NULL DEFAULT 0,
  last_ad_published_at TIMESTAMPTZ,
  last_ad_id           UUID REFERENCES crypto_news_ads(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed
INSERT INTO crypto_news_ad_rotation_state (id)
VALUES (1);
```

---

### RotationDeciderService

**Ubicación**: `application/services/rotation-decider.service.ts`

```typescript
@Injectable()
export class RotationDeciderService {
  async shouldPublishAd(now: Date): Promise<RotationDecision> {
    // 1. Load config + state
    const config = await this.configRepo.load();
    const state = await this.stateRepo.load();

    if (!config.enabled) {
      return { shouldPublish: false, reason: 'Rotation disabled' };
    }

    // 2. Check interval-based condition
    if (state.postsSinceLastAd >= config.intervalPosts) {
      return {
        shouldPublish: true,
        reason: `Interval reached (${state.postsSinceLastAd}/${config.intervalPosts} posts)`,
      };
    }

    // 3. Check time-based fallback
    if (state.lastAdPublishedAt) {
      const hoursSinceLastAd =
        (now.getTime() - state.lastAdPublishedAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastAd >= config.minHoursBetweenAds) {
        return {
          shouldPublish: true,
          reason: `Time threshold reached (${hoursSinceLastAd.toFixed(1)}h >= ${config.minHoursBetweenAds}h)`,
        };
      }
    } else {
      // No ad published yet — allow first publish
      return {
        shouldPublish: true,
        reason: 'First ad publish',
      };
    }

    // 4. Not yet time to publish
    return {
      shouldPublish: false,
      reason: `Waiting (${state.postsSinceLastAd}/${config.intervalPosts} posts)`,
    };
  }

  async selectNextAd(now: Date): Promise<Ad | null> {
    const state = await this.stateRepo.load();

    // Get all active ads (scheduled check)
    const activeAds = await this.adRepo.findAllActive(now);

    if (activeAds.length === 0) {
      return null;
    }

    // Round-robin: find ad after last published
    if (state.lastAdId) {
      const lastIndex = activeAds.findIndex((ad) => ad.id === state.lastAdId);

      if (lastIndex >= 0) {
        // Return next ad (wrap around)
        const nextIndex = (lastIndex + 1) % activeAds.length;
        return activeAds[nextIndex];
      }
    }

    // Fallback: first ad
    return activeAds[0];
  }
}

interface RotationDecision {
  shouldPublish: boolean;
  reason: string;
}
```

---

## AdsCronScheduler

**Ubicación**: `application/scheduling/ads-cron.scheduler.ts`

```typescript
@Injectable()
export class AdsCronScheduler implements OnApplicationBootstrap {
  private readonly LOCK_KEY = 'crypto-news-ads-cron';

  constructor(
    private readonly rotationDecider: RotationDeciderService,
    private readonly publishAdUseCase: PublishAdUseCase,
    private readonly rotationStateRepo: AdRotationStateRepository,
    private readonly logger: Logger = new Logger(AdsCronScheduler.name),
  ) {}

  onApplicationBootstrap() {
    this.logger.log('AdsCronScheduler initialized (EVERY_MINUTE)');
  }

  @Cron('0 * * * * *') // Every minute
  async tick(): Promise<void> {
    try {
      const now = new Date();

      // 1. Check if should publish ad
      const decision = await this.rotationDecider.shouldPublishAd(now);

      if (!decision.shouldPublish) {
        this.logger.debug(`Ad rotation skipped: ${decision.reason}`);
        return;
      }

      // 2. Select next ad
      const ad = await this.rotationDecider.selectNextAd(now);

      if (!ad) {
        this.logger.warn('No active ads available for rotation');
        return;
      }

      // 3. Acquire lock
      const lockAcquired = await this.acquireLock();
      if (!lockAcquired) {
        this.logger.debug('Lock held by another instance — skipping tick');
        return;
      }

      try {
        // 4. Publish ad
        await this.publishAdUseCase.execute({ adId: ad.id });

        this.logger.log(
          `✅ Published ad ${ad.id} (rotation: ${decision.reason})`,
        );
      } finally {
        await this.releaseLock();
      }
    } catch (err) {
      this.logger.error(
        `Ads cron tick failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  private async acquireLock(): Promise<boolean> {
    // Same pattern as PublisherCronScheduler
    // ...
  }

  private async releaseLock(): Promise<void> {
    // ...
  }
}
```

---

## PublishAdUseCase

**Ubicación**: `application/handlers/publish-ad.use-case.ts`

```typescript
@Injectable()
export class PublishAdUseCase {
  async execute(input: { adId: string }): Promise<void> {
    const now = new Date();

    // 1. Load ad
    const ad = await this.adRepo.findById(input.adId);
    if (!ad) {
      throw new Error(`Ad ${input.adId} not found`);
    }

    if (!ad.isScheduledActive(now)) {
      throw new Error(`Ad ${ad.id} is not active`);
    }

    // 2. Slot check (mutex con news)
    const slot = await this.slotArbitrator.canPublishNow('ads', now);
    if (!slot.canPublish) {
      this.logger.log(`Slot held by '${slot.lastScope}' — skipping ad publish`);
      return;
    }

    // 3. Throttle check
    const throttleDecision = await this.throttleScheduler.shouldPublish(now);
    if (!throttleDecision.canPublish) {
      this.logger.log(
        `Throttle active — next ad publish in ${Math.round(throttleDecision.nextDelayMs / 1000)}s`,
      );
      return;
    }

    // 4. Load media
    const media = await this.adMediaRepo.findByAdId(ad.id);

    // 5. Publish to Telegram
    const result = await this.publishToTelegram(ad, media);

    if (!result.ok) {
      throw new Error(result.error ?? 'Telegram publish failed');
    }

    // 6. Record success
    ad.recordPublish(now);
    await this.adRepo.save(ad);

    // 7. Reset rotation state
    await this.rotationStateRepo.reset(ad.id, now);

    // 8. Update shared state
    await this.throttleScheduler.setLastPublishAt(now);
    await this.slotArbitrator.recordPublish('ads', now);

    this.logger.log(
      `✅ Published ad ${ad.id} as telegram message ${result.messageId}`,
    );
  }

  private async publishToTelegram(
    ad: Ad,
    media: AdMedia[],
  ): Promise<TelegramPublishResult> {
    if (ad.mediaType === AdMediaType.TEXT_ONLY) {
      return this.publisher.sendMessage({
        chatId: this.config.outputChannel,
        text: ad.text,
        parseMode: 'Markdown',
      });
    }

    // Download media to tmpdir
    const tmpDir = path.join(os.tmpdir(), `ad-publish-${uuid()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    try {
      const localPaths: string[] = [];

      for (const m of media) {
        const localPath = await this.downloadMedia(m.mediaUrl, tmpDir);
        localPaths.push(localPath);
      }

      // Publish with media
      return this.publisher.sendPhoto({
        chatId: this.config.outputChannel,
        caption: ad.text,
        imagePaths: localPaths,
        parseMode: 'Markdown',
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch((err) => {
        this.logger.warn(`Failed to cleanup ad tmpdir: ${err.message}`);
      });
    }
  }
}
```

---

## Media Upload

### UploadAdImageUseCase

```typescript
@Injectable()
export class UploadAdImageUseCase {
  async execute(input: {
    adId: string;
    file: Express.Multer.File;
    sequence?: number;
  }): Promise<{ mediaId: string }> {
    // 1. Validate ad exists
    const ad = await this.adRepo.findById(input.adId);
    if (!ad) {
      throw new Error(`Ad ${input.adId} not found`);
    }

    // 2. Validate file
    if (!input.file.mimetype.startsWith('image/')) {
      throw new Error('File must be an image');
    }

    if (input.file.size > 10 * 1024 * 1024) {
      throw new Error('Image too large (max 10MB)');
    }

    // 3. Store file
    const filename = `${uuid()}.${this.getExtension(input.file.mimetype)}`;
    const storageUrl = await this.mediaStorage.store(
      input.file.buffer,
      filename,
    );

    // 4. Create AdMedia
    const media = AdMedia.create({
      adId: input.adId,
      mediaUrl: storageUrl,
      mediaType: 'IMAGE',
      sequence: input.sequence ?? 0,
    });

    await this.adMediaRepo.save(media);

    return { mediaId: media.id };
  }

  private getExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    return map[mimeType] || 'bin';
  }
}
```

### ReuseLibraryImageUseCase

```typescript
@Injectable()
export class ReuseLibraryImageUseCase {
  async execute(input: {
    adId: string;
    libraryImageId: string;
    sequence?: number;
  }): Promise<{ mediaId: string }> {
    // 1. Load library image
    const libraryImage = await this.libraryRepo.findById(input.libraryImageId);
    if (!libraryImage) {
      throw new Error(`Library image ${input.libraryImageId} not found`);
    }

    // 2. Create AdMedia linking to library
    const media = AdMedia.create({
      adId: input.adId,
      mediaUrl: libraryImage.storageUrl,
      mediaType: libraryImage.mediaType,
      sequence: input.sequence ?? 0,
      libraryImageId: libraryImage.id,
    });

    await this.adMediaRepo.save(media);

    // 3. Increment usage counter
    libraryImage.incrementUsage();
    await this.libraryRepo.save(libraryImage);

    return { mediaId: media.id };
  }
}
```

---

## Rotation Configuration

### Default Settings

```typescript
const DEFAULT_ROTATION_CONFIG = {
  enabled: false, // Fail-closed (operator must enable)
  intervalPosts: 10, // Every 10 news posts
  minHoursBetweenAds: 2, // Or at least 2 hours
};
```

### Example Scenarios

**Scenario 1: High frequency**

```typescript
{
  enabled: true,
  intervalPosts: 5,         // Every 5 news posts
  minHoursBetweenAds: 1     // Or 1 hour
}
// Result: ~4-6 ads/hour (if publishing 20-30 news/hour)
```

**Scenario 2: Low frequency**

```typescript
{
  enabled: true,
  intervalPosts: 20,        // Every 20 news posts
  minHoursBetweenAds: 4     // Or 4 hours
}
// Result: ~2-3 ads/day (if publishing 20 news/day)
```

**Scenario 3: Time-only**

```typescript
{
  enabled: true,
  intervalPosts: 999,       // Effectively disabled
  minHoursBetweenAds: 6     // Every 6 hours
}
// Result: 4 ads/day (fixed schedule)
```

---

## Database Schema

### Complete Schema

```sql
-- Ads catalog
CREATE TABLE crypto_news_ads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text                  TEXT NOT NULL,
  media_type            VARCHAR NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO', 'TEXT_ONLY')),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  priority              INTEGER NOT NULL DEFAULT 0,
  scheduled_start_date  TIMESTAMPTZ,
  scheduled_end_date    TIMESTAMPTZ,
  last_published_at     TIMESTAMPTZ,
  publish_count         INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            VARCHAR,
  updated_by            VARCHAR,

  CONSTRAINT chk_scheduled_dates
    CHECK (scheduled_end_date IS NULL OR scheduled_start_date IS NULL OR scheduled_end_date > scheduled_start_date)
);

-- Ad media (1:N with ads)
CREATE TABLE crypto_news_ad_media (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id             UUID NOT NULL REFERENCES crypto_news_ads(id) ON DELETE CASCADE,
  media_url         VARCHAR NOT NULL,
  media_type        VARCHAR NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO')),
  sequence          INTEGER NOT NULL DEFAULT 0,
  library_image_id  UUID REFERENCES crypto_news_ad_media_library(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Media library (shared pool)
CREATE TABLE crypto_news_ad_media_library (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename       VARCHAR NOT NULL UNIQUE,
  original_name  VARCHAR NOT NULL,
  mime_type      VARCHAR NOT NULL,
  size_bytes     INTEGER NOT NULL,
  media_type     VARCHAR NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO')),
  storage_url    VARCHAR NOT NULL,
  usage_count    INTEGER NOT NULL DEFAULT 0,
  description    TEXT,
  tags           TEXT[],
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     VARCHAR
);

-- Rotation config (singleton)
CREATE TABLE crypto_news_ad_rotation_config (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  enabled               BOOLEAN NOT NULL DEFAULT false,
  interval_posts        INTEGER NOT NULL DEFAULT 10 CHECK (interval_posts > 0),
  min_hours_between_ads NUMERIC NOT NULL DEFAULT 2 CHECK (min_hours_between_ads >= 0),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            VARCHAR
);

-- Rotation state (singleton)
CREATE TABLE crypto_news_ad_rotation_state (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  posts_since_last_ad  INTEGER NOT NULL DEFAULT 0,
  last_ad_published_at TIMESTAMPTZ,
  last_ad_id           UUID REFERENCES crypto_news_ads(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Throttle state (singleton, separate from news)
CREATE TABLE crypto_news_ads_throttle_state (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  last_publish_at  TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ads_active ON crypto_news_ads(is_active) WHERE is_active = true;
CREATE INDEX idx_ads_scheduled ON crypto_news_ads(scheduled_start_date, scheduled_end_date);
CREATE INDEX idx_ad_media_ad_id ON crypto_news_ad_media(ad_id);
CREATE INDEX idx_media_library_tags ON crypto_news_ad_media_library USING GIN(tags);
```

---

## APIs

### Ad Management

```http
# List ads
GET /crypto-news-ads/ads
Query: ?isActive=true&limit=50&offset=0
Response: { ads: AdDto[], total: number }

# Create ad
POST /crypto-news-ads/ads
Body: {
  text: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'TEXT_ONLY';
  priority?: number;
  scheduledStartDate?: string;
  scheduledEndDate?: string;
}
Response: { id: string }

# Update ad
PATCH /crypto-news-ads/ads/:id
Body: { text?, mediaType?, priority?, isActive?, scheduledStartDate?, scheduledEndDate? }

# Delete ad
DELETE /crypto-news-ads/ads/:id

# Publish ad now (manual override)
POST /crypto-news-ads/ads/:id/publish-now
Response: { success: true, messageId: string }
```

### Media Management

```http
# Upload image for ad
POST /crypto-news-ads/ads/:adId/images
Content-Type: multipart/form-data
Body: file (image)
Response: { mediaId: string }

# Clear ad media
DELETE /crypto-news-ads/ads/:adId/media

# Upload to library
POST /crypto-news-ads/media/library
Content-Type: multipart/form-data
Body: file, description?, tags[]
Response: { id: string }

# List library
GET /crypto-news-ads/media/library
Query: ?tags[]=crypto&mediaType=IMAGE
Response: { items: LibraryItemDto[] }

# Reuse library image
POST /crypto-news-ads/ads/:adId/images/reuse
Body: { libraryImageId: string, sequence?: number }
Response: { mediaId: string }
```

### Rotation Config

```http
# Get rotation config
GET /crypto-news-ads/rotation-config
Response: {
  enabled: boolean;
  intervalPosts: number;
  minHoursBetweenAds: number;
  updatedAt: string;
}

# Update rotation config
PATCH /crypto-news-ads/rotation-config
Body: {
  enabled?: boolean;
  intervalPosts?: number;
  minHoursBetweenAds?: number;
}
Response: { success: true }

# Get rotation state
GET /crypto-news-ads/rotation-state
Response: {
  postsSinceLastAd: number;
  lastAdPublishedAt: string | null;
  lastAdId: string | null;
}
```

---

**Navegación**: [← 05-publishing.md](./05-publishing.md) | [07-deduplication.md →](./07-deduplication.md)
