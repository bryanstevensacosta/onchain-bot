# Sistema Publisher — Matching Component

**Módulo**: `crypto-news-integration/`  
**Responsabilidad**: Fetch → Filter → Match → Enqueue

---

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura](#arquitectura)
3. [FilteredCryptoNewsService](#filteredcryptonewsservice)
4. [ProcessCryptoNewsMessageHandler](#processcryptonewsmessagehandler)
5. [EnqueueMatchingCronScheduler](#enqueuematchingcronscheduler)
6. [MatchingConfig](#matchingconfig)
7. [Content Filters](#content-filters)
8. [Keywords & Phrases](#keywords--phrases)
9. [Blacklist](#blacklist)
10. [APIs](#apis)

---

## Visión General

El componente **Matching** es el filtro inteligente entre ingestion-telegram (RAW content) y el publisher queue (matched content).

### Responsabilidades

1. **Feature Flag**: Master switch `matchingEnabled`
2. **Fetch**: HTTP client a ingestion-telegram API
3. **Filter**: Aplicar ContentFilterService regex transforms
4. **Match**: Evaluar keywords (simple + AND-groups)
5. **Block**: Check blacklist phrases
6. **Enqueue**: Enviar matches a PublisherQueue

### Dual-Path Architecture

```
PATH PRIMARIO (SSE, <10s latency)
═════════════════════════════════
Ingestion SSE stream
    ↓ messageType='crypto-news'
ProcessCryptoNewsMessageHandler
    ├─ matchingEnabled check
    ├─ Dedup check (optimization)
    ├─ FilteredCryptoNewsService
    └─ EnqueueMatchingMessageUseCase

FALLBACK (Polling)
══════════════════
EnqueueMatchingCronScheduler
    ├─ Interval: 5min (SSE) / 1min (polling-only)
    ├─ HTTP GET messages (batch 50)
    ├─ FilteredCryptoNewsService
    └─ EnqueueMatchingMessageUseCase
```

---

## Arquitectura

### Dependencias

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([MatchingConfigEntity, DeadLetterQueueEntity]),
    CryptoNewsIngestionModule, // ContentFilterService, ChannelFilterRepository
    CryptoNewsPublisherModule, // KeywordRepository, BlacklistPhraseRepository, EnqueueMatchingMessageUseCase
  ],
  providers: [
    CryptoNewsIngestionClient,
    FilteredCryptoNewsService,
    ProcessCryptoNewsMessageHandler,
    EnqueueMatchingCronScheduler,
    DeadLetterService,
    MatchingHealthState,
    // ...repositories
  ],
  exports: [MatchingConfigRepository, ProcessCryptoNewsMessageHandler],
})
export class CryptoNewsIntegrationModule {}
```

### Wiring

```
MessageRoutingService (shared)
    ↓ messageType='crypto-news'
ProcessCryptoNewsMessageHandler (integration)
    ↓ FilteredCryptoNewsService (integration)
    ├─ CryptoNewsIngestionClient (integration) → HTTP
    ├─ ContentFilterService (ingestion/crypto-news)
    ├─ KeywordRepository (publisher)
    ├─ BlacklistPhraseRepository (publisher)
    └─ EnqueueMatchingMessageUseCase (publisher)
```

---

## FilteredCryptoNewsService

**Ubicación**: `application/services/filtered-crypto-news.service.ts`

### Interface

```typescript
@Injectable()
export class FilteredCryptoNewsService {
  async getMatchingMessages(
    limit: number,
    channelId?: string,
  ): Promise<MatchedMessageDto[]>;
}
```

### Pipeline

```typescript
async getMatchingMessages(limit: number, channelId?: string) {
  // 1. Fetch RAW messages from ingestion-telegram
  const rawMessages = await this.ingestionClient.getRecentMessages({
    limit,
    channelId
  });

  // 2. Load filters + keywords + blacklist
  const [filters, keywords, blacklist] = await Promise.all([
    this.channelFilterRepo.findAll(),
    this.keywordRepo.findAllActive(),
    this.blacklistRepo.findAllActive()
  ]);

  const matched: MatchedMessageDto[] = [];

  for (const msg of rawMessages) {
    // 3. Apply per-channel content filters (regex transforms)
    const channelFilters = filters.filter(f => f.channelId === msg.channelId);
    const filteredContent = this.applyFilters(msg, channelFilters);

    // 4. Check blacklist (BLOCK si match)
    if (this.matchesBlacklist(filteredContent, blacklist)) {
      continue; // Skip this message
    }

    // 5. Evaluate keywords
    const matchedKeywords = this.evaluateKeywords(filteredContent, keywords);

    if (matchedKeywords.length > 0) {
      matched.push({
        channelId: msg.channelId,
        messageId: msg.messageId,
        rawContent: msg.content,
        rawTitle: msg.title,
        filteredTitle: filteredContent.title,
        filteredContent: filteredContent.content,
        imagePaths: msg.mediaUrls,
        groupedId: msg.groupedId,
        matchedKeywordIds: matchedKeywords.map(k => k.id),
        ingestedAt: msg.ingestedAt
      });
    }
  }

  return matched;
}
```

### Content Filter Application

```typescript
private applyFilters(
  message: CryptoNewsMessageDto,
  filters: ChannelContentFilterConfig[]
): { title: string; content: string } {
  let title = message.title || '';
  let content = message.content;

  // Sort by priority (ascending — lower numbers first)
  const sorted = filters.sort((a, b) => a.priority - b.priority);

  for (const filter of sorted) {
    if (!filter.isActive) continue;

    try {
      // Compile regex with timeout (ReDoS protection)
      const regex = new RegExp(filter.pattern, filter.flags);

      // Apply to title
      if (title) {
        title = title.replace(regex, filter.replacement);
      }

      // Apply to content
      content = content.replace(regex, filter.replacement);

    } catch (err) {
      this.logger.warn(
        `Filter ${filter.id} failed for channel ${message.channelId}: ${err.message}`
      );
      // Continue with next filter (fail-open)
    }
  }

  return { title: title.trim(), content: content.trim() };
}
```

### Keyword Evaluation

**Simple Keywords** (OR logic):

```typescript
private evaluateKeywords(
  content: { title: string; content: string },
  keywords: Keyword[]
): Keyword[] {
  const matched: Keyword[] = [];
  const combinedText = `${content.title} ${content.content}`.toLowerCase();

  for (const keyword of keywords) {
    if (keyword.type === 'SIMPLE') {
      // Case-insensitive substring match
      if (combinedText.includes(keyword.phrase.toLowerCase())) {
        matched.push(keyword);
      }
    }
  }

  return matched;
}
```

**AND-Group Keywords** (compound logic):

```typescript
// Keyword type='AND_GROUP', compoundPhrases=['bitcoin', 'etf', 'SEC']
// Match ONLY if ALL phrases present

for (const keyword of keywords) {
  if (keyword.type === 'AND_GROUP') {
    const allPresent = keyword.compoundPhrases.every((phrase) =>
      combinedText.includes(phrase.toLowerCase()),
    );

    if (allPresent) {
      matched.push(keyword);
    }
  }
}
```

### Blacklist Check

```typescript
private matchesBlacklist(
  content: { title: string; content: string },
  blacklist: BlacklistPhrase[]
): boolean {
  const combinedText = `${content.title} ${content.content}`.toLowerCase();

  for (const phrase of blacklist) {
    if (phrase.matchMode === 'EXACT') {
      // Exact match (case-insensitive)
      if (combinedText === phrase.phrase.toLowerCase()) {
        return true;
      }
    } else if (phrase.matchMode === 'CONTAINS') {
      // Substring match
      if (combinedText.includes(phrase.phrase.toLowerCase())) {
        return true;
      }
    } else if (phrase.matchMode === 'REGEX') {
      // Regex match
      try {
        const regex = new RegExp(phrase.phrase, 'i');
        if (regex.test(combinedText)) {
          return true;
        }
      } catch (err) {
        this.logger.warn(`Invalid regex in blacklist ${phrase.id}: ${err.message}`);
      }
    }
  }

  return false;
}
```

---

## ProcessCryptoNewsMessageHandler

**Ubicación**: `application/handlers/process-crypto-news-message.handler.ts`  
**Trigger**: SSE event `messageType='crypto-news'`

### Responsabilidades

1. Check `matchingEnabled` flag
2. Dedup check (ANTES de filter — optimization)
3. Filter + match (vía FilteredCryptoNewsService)
4. Enqueue si matched
5. Log latency (<10s target)

### Implementation

```typescript
@Injectable()
export class ProcessCryptoNewsMessageHandler {
  async handle(message: TelegramRawMessage): Promise<void> {
    const { channelId, messageId, occurredAt } = message;

    // 1. Check feature flag
    const config = await this.matchingConfigRepo.findOne();
    if (!config.enabled) {
      this.logger.log(`Matching disabled — skipping ${channelId}:${messageId}`);
      return;
    }

    // 2. Dedup check (optimization — avoid expensive HTTP/filter if already processed)
    const existing = await this.queueRepo.findByChannelIdAndMessageId(
      channelId,
      messageId,
    );

    if (existing) {
      // Already in queue
      if (existing.status === 'PENDING') return;

      // Already published
      if (existing.status === 'PUBLISHED') return;

      // Failed with blocking reason (content issue)
      if (
        existing.status === 'FAILED' &&
        isBlockingFailureReason(existing.lastError)
      ) {
        return;
      }

      // Allow retry for non-blocking failures (transient errors)
    }

    // 3. Fetch + filter + match (single message, channelId filter)
    const matches = await this.filteredService.getMatchingMessages(
      1,
      channelId,
    );

    if (matches.length === 0) {
      this.logger.debug(`No keywords matched for ${channelId}:${messageId}`);
      return;
    }

    const match = matches[0];

    // 4. Enqueue
    await this.enqueueUseCase.execute({
      channelId: match.channelId,
      messageId: match.messageId,
      rawContent: match.filteredContent, // Use FILTERED (not RAW)
      rawTitle: match.filteredTitle,
      imagePaths: match.imagePaths,
      groupedId: match.groupedId,
      matchedKeywordIds: match.matchedKeywordIds,
      messageReceivedAt: match.ingestedAt,
    });

    // 5. Log latency
    const latency = Date.now() - occurredAt.getTime();
    if (latency < 10_000) {
      this.logger.info(
        `✅ Latency ${(latency / 1000).toFixed(1)}s for ${channelId}:${messageId} (target <10s met)`,
      );
    } else {
      this.logger.warn(
        `⚠️ Latency ${(latency / 1000).toFixed(1)}s for ${channelId}:${messageId} (target <10s MISSED)`,
      );
    }
  }
}
```

### Error Handling

```typescript
// En MessageRoutingService.route()
try {
  await this.cryptoNewsHandler.handle(message);
  this.logger.debug(`[ROUTE-DEBUG] ✅ Crypto-news handler completed`);
} catch (err) {
  // Log pero NO throw — protege SSE stream
  this.logger.error(
    `[ROUTE-ERROR] Crypto-news handler failed for ` +
      `${message.channelId}:${message.messageId}: ${err.message}`,
  );
}
```

---

## EnqueueMatchingCronScheduler

**Ubicación**: `application/scheduling/enqueue-matching-cron.scheduler.ts`

### Responsabilidades

1. Fallback polling cuando SSE gaps
2. Primary mode cuando SSE disabled
3. Batch fetch (50 mensajes)
4. Mismo pipeline que SSE handler

### Dynamic Interval

```typescript
@Injectable()
export class EnqueueMatchingCronScheduler implements OnApplicationBootstrap {
  onApplicationBootstrap() {
    const config = this.configService.get<AppConfig['app']>('app');

    // Determinar interval
    const interval = config.ingestion.useSse
      ? config.cryptoNews.pollingIntervalMinutes || 5 // Fallback mode
      : 1; // Primary mode

    // Register cron
    const cronExpression = `*/${interval} * * * *`;

    const job = new CronJob(cronExpression, () => this.tick());
    this.schedulerRegistry.addCronJob('enqueue-matching', job);
    job.start();

    this.logger.log(
      `EnqueueMatchingCronScheduler ready ` +
        `(fetch limit: 50, enabled: ${config.enabled}, ` +
        `interval: ${interval}min, SSE: ${config.ingestion.useSse ? 'enabled' : 'disabled'})`,
    );
  }
}
```

### Tick Implementation

```typescript
async tick(): Promise<void> {
  // 1. Check feature flag
  const config = await this.matchingConfigRepo.findOne();
  if (!config.enabled) {
    this.logger.log('Matching disabled — skipping tick');
    return;
  }

  // 2. Fetch + filter + match (batch 50)
  const matches = await this.filteredService.getMatchingMessages(50);

  if (matches.length === 0) {
    this.logger.log('No matches found in batch');
    return;
  }

  // 3. Enqueue cada match
  let enqueued = 0;
  let skipped = 0;

  for (const match of matches) {
    try {
      await this.enqueueUseCase.execute({
        channelId: match.channelId,
        messageId: match.messageId,
        rawContent: match.filteredContent,
        rawTitle: match.filteredTitle,
        imagePaths: match.imagePaths,
        groupedId: match.groupedId,
        matchedKeywordIds: match.matchedKeywordIds,
        messageReceivedAt: match.ingestedAt
      });
      enqueued++;
    } catch (err) {
      // Enqueue use case handles dedup internally
      skipped++;
    }
  }

  this.logger.log(
    `Batch complete: ${enqueued} enqueued, ${skipped} skipped ` +
    `(${matches.length} total matches)`
  );

  // 4. Update health state
  this.healthState.update({
    lastCheckAt: new Date(),
    matchesFound: matches.length,
    enqueued,
    skipped
  });
}
```

---

## MatchingConfig

**Entity**: `domain/entities/matching-config.entity.ts`

### Props

```typescript
interface MatchingConfigProps {
  enabled: boolean; // Master switch
  updatedAt: Date;
  updatedBy: string | null;
}
```

### Singleton Pattern

```typescript
class MatchingConfig extends Entity<number> {
  static SINGLETON_ID = 1;

  static async load(repo: MatchingConfigRepository): Promise<MatchingConfig> {
    const config = await repo.findOne();
    if (!config) {
      // Create with fail-closed default
      return repo.save(MatchingConfig.create({ enabled: false }));
    }
    return config;
  }

  enable(updatedBy?: string): void {
    this.props.enabled = true;
    this.props.updatedAt = new Date();
    this.props.updatedBy = updatedBy || null;
  }

  disable(updatedBy?: string): void {
    this.props.enabled = false;
    this.props.updatedAt = new Date();
    this.props.updatedBy = updatedBy || null;
  }
}
```

### Database

```sql
CREATE TABLE crypto_news_integration_matching_config (
  id         INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  enabled    BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR
);

-- Seed
INSERT INTO crypto_news_integration_matching_config (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;
```

---

## Content Filters

**Ubicación**: `telegram/ingestion/crypto-news/filters/`  
**Entity**: `ChannelContentFilterConfig`

### Props

```typescript
interface ChannelContentFilterConfigProps {
  channelId: string; // Telegram channel (opaque, no FK)
  pattern: string; // Regex pattern
  replacement: string; // Replacement string
  flags: string; // Regex flags (e.g., 'gi')
  priority: number; // Execution order (lower first)
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Examples

**Remove promotional text**:

```typescript
{
  channelId: '-1001234567890',
  pattern: '🚀.*?🚀',
  replacement: '',
  flags: 'gs',
  priority: 10,
  description: 'Remove rocket emoji spam'
}
```

**Normalize whitespace**:

```typescript
{
  channelId: '-1001234567890',
  pattern: '\\s+',
  replacement: ' ',
  flags: 'g',
  priority: 100,
  description: 'Collapse multiple spaces'
}
```

**Extract title**:

```typescript
{
  channelId: '-1001234567890',
  pattern: '^\\[([^\\]]+)\\]',
  replacement: '$1',
  flags: '',
  priority: 1,
  description: 'Extract [TITLE] format'
}
```

### ReDoS Protection

```typescript
// ContentFilterService
const FILTER_TIMEOUT_MS = 100;

function applyFilter(text: string, pattern: string, replacement: string) {
  const startTime = Date.now();

  try {
    const regex = new RegExp(pattern, flags);

    return text.replace(regex, (...args) => {
      // Check timeout on each replacement
      if (Date.now() - startTime > FILTER_TIMEOUT_MS) {
        throw new Error('Filter timeout');
      }
      return replacement;
    });
  } catch (err) {
    logger.warn(`Filter failed: ${err.message}`);
    return text; // Fail-open
  }
}
```

---

## Keywords & Phrases

**Ubicación**: `telegram/crypto-news-publisher/domain/entities/keyword.entity.ts`

### Props

```typescript
interface KeywordProps {
  phrase: string; // Primary phrase (required)
  type: KeywordType; // SIMPLE | AND_GROUP
  compoundPhrases: string[]; // For AND_GROUP (all must match)
  channelId: string | null; // Per-channel override (null = global)
  priority: number; // Higher priority = preferred template
  templateId: string | null; // Override default template
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

enum KeywordType {
  SIMPLE = 'SIMPLE', // Single phrase OR match
  AND_GROUP = 'AND_GROUP', // All compound phrases must match
}
```

### Examples

**Simple Keyword**:

```typescript
{
  phrase: 'bitcoin',
  type: 'SIMPLE',
  compoundPhrases: [],
  channelId: null,           // Global
  priority: 10,
  templateId: null           // Use default template
}
```

**AND-Group Keyword** (compound logic):

```typescript
{
  phrase: 'BTC ETF Approval',  // Display name
  type: 'AND_GROUP',
  compoundPhrases: ['bitcoin', 'etf', 'sec'],  // All must match
  channelId: null,
  priority: 100,               // High priority
  templateId: 'template-uuid'  // Override template
}
```

**Channel-Specific Keyword**:

```typescript
{
  phrase: 'alpha',
  type: 'SIMPLE',
  compoundPhrases: [],
  channelId: '-1001234567890',  // Only for this channel
  priority: 50,
  templateId: null
}
```

### Validation

```typescript
class Keyword extends Entity<string> {
  static create(input: CreateKeywordInput): Keyword {
    // Validate phrase
    if (!input.phrase || input.phrase.trim().length === 0) {
      throw new DomainError('phrase', 'Phrase cannot be empty');
    }

    if (input.phrase.length > 200) {
      throw new DomainError('phrase', 'Phrase too long (max 200 chars)');
    }

    // Validate compound phrases for AND_GROUP
    if (input.type === KeywordType.AND_GROUP) {
      if (!input.compoundPhrases || input.compoundPhrases.length < 2) {
        throw new DomainError(
          'compoundPhrases',
          'AND_GROUP requires at least 2 compound phrases',
        );
      }

      if (input.compoundPhrases.some((p) => !p || p.trim().length === 0)) {
        throw new DomainError('compoundPhrases', 'Empty phrases not allowed');
      }
    }

    // ... create entity
  }
}
```

---

## Blacklist

**Ubicación**: `telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity.ts`

### Props

```typescript
interface BlacklistPhraseProps {
  phrase: string; // Phrase to block
  matchMode: BlacklistMatchMode; // EXACT | CONTAINS | REGEX
  reason: string | null; // Why blocked (optional)
  channelId: string | null; // Per-channel (null = global)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

enum BlacklistMatchMode {
  EXACT = 'EXACT', // Exact match (case-insensitive)
  CONTAINS = 'CONTAINS', // Substring match
  REGEX = 'REGEX', // Regex pattern
}
```

### Examples

**Exact Match**:

```typescript
{
  phrase: 'spam',
  matchMode: 'EXACT',
  reason: 'Known spam keyword',
  channelId: null,
  isActive: true
}
```

**Contains Match**:

```typescript
{
  phrase: 'pump and dump',
  matchMode: 'CONTAINS',
  reason: 'Pump & dump scheme language',
  channelId: null,
  isActive: true
}
```

**Regex Match**:

```typescript
{
  phrase: '(buy|invest)\\s+now',
  matchMode: 'REGEX',
  reason: 'Urgency manipulation',
  channelId: null,
  isActive: true
}
```

### Processing Order

```
1. Apply content filters (regex transforms)
2. Check blacklist (BLOCK si match)
3. Evaluate keywords (ALLOW si match)
```

**Rationale**: Blacklist veto power — incluso si keywords match, blacklist bloquea.

---

## APIs

### Matching Config

```http
GET /crypto-news-integration/matching/config
Response: {
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

PATCH /crypto-news-integration/matching/config
Body: { enabled: boolean }
Response: { success: true }
```

### Matching Health

```http
GET /crypto-news-integration/matching/health
Response: {
  enabled: boolean;
  lastCheckAt: string | null;
  stats: {
    matchesFound: number;
    enqueued: number;
    skipped: number;
  }
}
```

### Content Filters

```http
# List filters for channel
GET /crypto-news/sources/:channelId/filters
Response: { filters: ChannelContentFilterConfigDto[] }

# Create filter
POST /crypto-news/sources/:channelId/filters
Body: {
  pattern: string;
  replacement: string;
  flags: string;
  priority: number;
  description?: string;
}

# Update filter
PATCH /crypto-news/filters/:id
Body: { pattern?, replacement?, flags?, priority?, isActive? }

# Delete filter
DELETE /crypto-news/filters/:id
```

### Keywords

```http
# List all keywords
GET /crypto-news-publisher/keywords
Query: ?channelId=&type=&isActive=
Response: { keywords: KeywordDto[] }

# Create keyword
POST /crypto-news-publisher/keywords
Body: {
  phrase: string;
  type: 'SIMPLE' | 'AND_GROUP';
  compoundPhrases?: string[];
  channelId?: string;
  priority?: number;
  templateId?: string;
}

# Update keyword
PATCH /crypto-news-publisher/keywords/:id
Body: { phrase?, compoundPhrases?, priority?, templateId?, isActive? }

# Delete keyword
DELETE /crypto-news-publisher/keywords/:id
```

### Blacklist

```http
# List blacklist
GET /crypto-news-publisher/blacklist
Query: ?channelId=&isActive=
Response: { phrases: BlacklistPhraseDto[] }

# Create blacklist entry
POST /crypto-news-publisher/blacklist
Body: {
  phrase: string;
  matchMode: 'EXACT' | 'CONTAINS' | 'REGEX';
  reason?: string;
  channelId?: string;
}

# Update blacklist entry
PATCH /crypto-news-publisher/blacklist/:id
Body: { phrase?, matchMode?, reason?, isActive? }

# Delete blacklist entry
DELETE /crypto-news-publisher/blacklist/:id
```

---

**Navegación**: [← 01-overview.md](./01-overview.md) | [03-queue.md →](./03-queue.md)
