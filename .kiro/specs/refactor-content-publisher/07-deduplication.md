# Sistema Publisher — Deduplication

**Módulo**: `shared/deduplication/` + `crypto-news-publisher/`  
**Responsabilidad**: Prevenir publicación de contenido duplicado

---

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura](#arquitectura)
3. [Fingerprint Generation](#fingerprint-generation)
4. [Similarity Scoring](#similarity-scoring)
5. [Cascade Strategy](#cascade-strategy)
6. [Storage & Lookup](#storage--lookup)
7. [Integration Points](#integration-points)
8. [Blocking vs Non-Blocking](#blocking-vs-non-blocking)
9. [Database Schema](#database-schema)
10. [Configuration](#configuration)

---

## Visión General

El sistema de deduplicación previene publicación de contenido duplicado usando un cascade de 3 estrategias: exact match → content similarity → semantic similarity.

### Propósitos

1. **Evitar spam**: Mismo mensaje publicado múltiples veces
2. **Detectar rewrites**: Contenido similar con diferente wording
3. **Cross-channel dedup**: Detectar duplicados entre canales
4. **Fail-open**: Si dedup falla, permitir publicación (availability > consistency)

### Características

- **3-Level Cascade**: Exact → Content → Semantic
- **Configurable Threshold**: `DEDUP_SEMANTIC_ARBITER_THRESHOLD` (default 0.7)
- **Optional Integration**: `@Optional()` injection — sin service, queue funciona
- **Post-Publish Storage**: Fingerprint guardado DESPUÉS de publish exitoso
- **URL-Aware**: Normaliza URLs para mejor matching

### Decision Flow

```
EnqueueMatchingMessageUseCase.execute()
    ↓
1. Exact Match (channelId + messageId)
   ├─ UNIQUE constraint en DB
   └─ Si existe: check status (PUBLISHED/PENDING/FAILED/BLOCKED)
    ↓
2. Content-Based Match (si dedupService disponible)
   ├─ Generate fingerprint (title + content + URLs)
   ├─ DeduplicationService.findDuplicate()
   │  ├─ Exact match: fingerprint hash identical
   │  ├─ Content similarity: Levenshtein + URL overlap
   │  └─ Semantic similarity: embedding cosine similarity
   ├─ Si similarity >= threshold: BLOCK
   └─ Else: ALLOW
    ↓
3. Enqueue + Store Fingerprint
   ├─ Create PublisherQueueEntry
   ├─ Save to queue
   └─ DeduplicationService.markAsSeen(fingerprint, entryId)
```

---

## Arquitectura

### Módulos

**`shared/deduplication/`** (shared kernel):

- `DeduplicationService` — Orchestrator
- `ContentNormalizer` — Text normalization
- `UrlNormalizer` — URL normalization
- `DedupScorer` — Similarity scoring
- `FingerprintGenerator` — Hash generation
- `DeduplicationRepository` — Storage port

**`crypto-news-publisher/`** (consumer):

- `EnqueueMatchingMessageUseCase` — Integration point
- `CRYPTO_NEWS_DEDUP_SOURCE` — Source identifier
- `DEDUP_SEMANTIC_ARBITER_THRESHOLD` — Threshold config

### Wiring

```typescript
// crypto-news-publisher.module.ts
@Module({
  imports: [
    forwardRef(() => DeduplicationModule), // Circular dependency
  ],
  providers: [
    EnqueueMatchingMessageUseCase,
    // ...
  ]
})
export class CryptoNewsPublisherModule {}

// EnqueueMatchingMessageUseCase
constructor(
  // ...
  @Optional() private readonly dedupService?: DeduplicationService
) {}
```

**Optional Injection**: Si `DeduplicationModule` no wired, `dedupService` es `undefined` → enqueue funciona sin dedup.

---

## Fingerprint Generation

### Fingerprint Structure

```typescript
interface Fingerprint {
  hash: string; // SHA-256 hash del normalized content
  normalizedTitle: string; // Normalized title
  normalizedContent: string; // Normalized content
  normalizedUrls: string[]; // Normalized URLs
  rawLength: number; // Original content length
}
```

### ContentNormalizer

**Purpose**: Canonicalize text para mejor matching

```typescript
class ContentNormalizer {
  normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .trim();
  }
}

// Example:
// Input:  "🚀 Bitcoin   hits $50k!!!"
// Output: "bitcoin hits 50k"
```

### UrlNormalizer

**Purpose**: Canonicalize URLs (remove tracking params, normalize domains)

```typescript
class UrlNormalizer {
  normalize(url: string): string {
    try {
      const parsed = new URL(url);

      // Remove tracking params
      const trackingParams = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'ref',
        'source',
      ];
      trackingParams.forEach((param) => parsed.searchParams.delete(param));

      // Normalize domain (www. → apex)
      const host = parsed.hostname.replace(/^www\./, '');

      // Rebuild
      return `${parsed.protocol}//${host}${parsed.pathname}${parsed.search}`;
    } catch {
      return url; // Invalid URL, return as-is
    }
  }
}

// Example:
// Input:  "https://www.example.com/article?utm_source=twitter&id=123"
// Output: "https://example.com/article?id=123"
```

### FingerprintGenerator

```typescript
class FingerprintGenerator {
  async generate(input: {
    title: string;
    content: string;
    urls: string[];
  }): Promise<Fingerprint> {
    // 1. Normalize
    const normalizedTitle = this.contentNormalizer.normalize(input.title);
    const normalizedContent = this.contentNormalizer.normalize(input.content);
    const normalizedUrls = input.urls.map((url) =>
      this.urlNormalizer.normalize(url),
    );

    // 2. Combine
    const combined = [
      normalizedTitle,
      normalizedContent,
      ...normalizedUrls,
    ].join('|');

    // 3. Hash
    const hash = crypto
      .createHash('sha256')
      .update(combined, 'utf8')
      .digest('hex');

    return {
      hash,
      normalizedTitle,
      normalizedContent,
      normalizedUrls,
      rawLength: input.content.length,
    };
  }
}
```

---

## Similarity Scoring

### DedupScorer

**Methods**:

1. `exactMatch(fp1, fp2)` — Hash comparison
2. `contentSimilarity(fp1, fp2)` — Levenshtein + URL overlap
3. `semanticSimilarity(fp1, fp2)` — Embedding cosine similarity

### Exact Match

```typescript
exactMatch(fp1: Fingerprint, fp2: Fingerprint): number {
  return fp1.hash === fp2.hash ? 1.0 : 0.0;
}
```

### Content Similarity

```typescript
contentSimilarity(fp1: Fingerprint, fp2: Fingerprint): number {
  // 1. Text similarity (Levenshtein distance)
  const textSim = this.levenshteinSimilarity(
    fp1.normalizedContent,
    fp2.normalizedContent
  );

  // 2. URL overlap
  const urlSim = this.urlOverlap(
    fp1.normalizedUrls,
    fp2.normalizedUrls
  );

  // 3. Weighted average
  return 0.7 * textSim + 0.3 * urlSim;
}

private levenshteinSimilarity(s1: string, s2: string): number {
  const distance = this.levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);

  if (maxLen === 0) return 1.0;

  return 1 - (distance / maxLen);
}

private levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

private urlOverlap(urls1: string[], urls2: string[]): number {
  if (urls1.length === 0 && urls2.length === 0) return 1.0;
  if (urls1.length === 0 || urls2.length === 0) return 0.0;

  const set1 = new Set(urls1);
  const set2 = new Set(urls2);

  const intersection = [...set1].filter(url => set2.has(url)).length;
  const union = new Set([...urls1, ...urls2]).size;

  return intersection / union; // Jaccard similarity
}
```

### Semantic Similarity

**Requires**: Embedding model (e.g., sentence-transformers)

```typescript
async semanticSimilarity(fp1: Fingerprint, fp2: Fingerprint): Promise<number> {
  // 1. Generate embeddings (cached)
  const embedding1 = await this.embeddingService.getEmbedding(fp1.normalizedContent);
  const embedding2 = await this.embeddingService.getEmbedding(fp2.normalizedContent);

  // 2. Cosine similarity
  return this.cosineSimilarity(embedding1, embedding2);
}

private cosineSimilarity(vec1: number[], vec2: number[]): number {
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
  const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

  return dotProduct / (mag1 * mag2);
}
```

---

## Cascade Strategy

### DeduplicationService.findDuplicate()

```typescript
@Injectable()
export class DeduplicationService {
  async findDuplicate(
    fingerprint: Fingerprint,
    source: string,
    threshold: number,
  ): Promise<DuplicateMatch | null> {
    // 1. Exact match (fastest)
    const exactMatch = await this.repo.findByHash(fingerprint.hash, source);
    if (exactMatch) {
      return {
        entryId: exactMatch.entryId,
        similarity: 1.0,
        matchType: 'exact',
      };
    }

    // 2. Content similarity (medium cost)
    const recentRecords = await this.repo.findRecent(source, 1000); // Last 1000

    for (const record of recentRecords) {
      const contentSim = this.scorer.contentSimilarity(
        fingerprint,
        record.fingerprint,
      );

      if (contentSim >= threshold) {
        return {
          entryId: record.entryId,
          similarity: contentSim,
          matchType: 'content',
        };
      }
    }

    // 3. Semantic similarity (expensive — optional)
    if (this.embeddingService) {
      for (const record of recentRecords.slice(0, 100)) {
        // Top 100 only
        const semanticSim = await this.scorer.semanticSimilarity(
          fingerprint,
          record.fingerprint,
        );

        if (semanticSim >= threshold) {
          return {
            entryId: record.entryId,
            similarity: semanticSim,
            matchType: 'semantic',
          };
        }
      }
    }

    // No duplicate found
    return null;
  }
}

interface DuplicateMatch {
  entryId: string;
  similarity: number;
  matchType: 'exact' | 'content' | 'semantic';
}
```

### Performance Optimization

**Strategies**:

1. **Exact match first**: O(1) hash lookup
2. **Limit candidates**: Only check recent 1000 records
3. **Early termination**: Stop at first match >= threshold
4. **Semantic last**: Most expensive, smallest candidate set (100)
5. **Caching**: Embeddings cached by content hash

**Time Complexity**:

- Exact: O(1)
- Content: O(n × m) where n = candidates, m = content length
- Semantic: O(n × d) where n = candidates, d = embedding dimension

---

## Storage & Lookup

### DedupRecord Entity

```typescript
interface DedupRecordProps {
  fingerprint: Fingerprint;
  entryId: string; // FK to PublisherQueueEntry
  source: string; // 'crypto-news-publisher'
  recordedAt: Date;
}

class DedupRecord extends Entity<string> {
  static create(input: {
    fingerprint: Fingerprint;
    entryId: string;
    source: string;
  }): DedupRecord {
    const props: DedupRecordProps = {
      fingerprint: input.fingerprint,
      entryId: input.entryId,
      source: input.source,
      recordedAt: new Date(),
    };

    return new DedupRecord(uuid(), props);
  }
}
```

### Repository Interface

```typescript
interface DeduplicationRepository {
  // Store fingerprint
  save(record: DedupRecord): Promise<void>;

  // Lookup
  findByHash(hash: string, source: string): Promise<DedupRecord | null>;
  findRecent(source: string, limit: number): Promise<DedupRecord[]>;

  // Cleanup
  deleteOlderThan(cutoff: Date): Promise<number>;
}
```

### TypeORM Implementation

```typescript
@Injectable()
export class TypeOrmDeduplicationRepository implements DeduplicationRepository {
  async findByHash(hash: string, source: string): Promise<DedupRecord | null> {
    return this.repo.findOne({
      where: {
        'fingerprint.hash': hash,
        source,
      },
    });
  }

  async findRecent(source: string, limit: number): Promise<DedupRecord[]> {
    return this.repo.find({
      where: { source },
      order: { recordedAt: 'DESC' },
      take: limit,
    });
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.repo.delete({
      recordedAt: LessThan(cutoff),
    });

    return result.affected ?? 0;
  }
}
```

---

## Integration Points

### EnqueueMatchingMessageUseCase

```typescript
async execute(input: EnqueueMessageDto): Promise<void> {
  // 1. Exact match check (DB UNIQUE constraint)
  const existing = await this.queueRepo.findByChannelIdAndMessageId(
    input.channelId,
    input.messageId
  );

  if (existing) {
    // Handle existing entry (see status checks)
    // ...
    return;
  }

  // 2. Semantic dedup check (optional service)
  if (this.dedupService) {
    const fingerprint = await this.dedupService.generateFingerprint({
      title: input.rawTitle || '',
      content: input.rawContent,
      urls: this.extractUrls(input.rawContent)
    });

    const duplicate = await this.dedupService.findDuplicate(
      fingerprint,
      CRYPTO_NEWS_DEDUP_SOURCE,
      DEDUP_SEMANTIC_ARBITER_THRESHOLD
    );

    if (duplicate && duplicate.similarity >= DEDUP_SEMANTIC_ARBITER_THRESHOLD) {
      // Create BLOCKED entry
      const entry = PublisherQueueEntry.create(input);
      entry.markBlocked(
        `Semantic duplicate (similarity ${duplicate.similarity.toFixed(2)}, type ${duplicate.matchType})`,
        { entryId: duplicate.entryId }
      );
      await this.queueRepo.save(entry);

      this.logger.info(
        `Entry blocked as duplicate of ${duplicate.entryId} ` +
        `(similarity ${duplicate.similarity.toFixed(2)}, type ${duplicate.matchType})`
      );
      return;
    }
  }

  // 3. Create and save
  const entry = PublisherQueueEntry.create(input);
  await this.queueRepo.save(entry);

  // 4. Store fingerprint AFTER successful save
  if (this.dedupService) {
    try {
      const fingerprint = await this.dedupService.generateFingerprint({
        title: input.rawTitle || '',
        content: input.rawContent,
        urls: this.extractUrls(input.rawContent)
      });

      await this.dedupService.markAsSeen(
        fingerprint,
        entry.id,
        CRYPTO_NEWS_DEDUP_SOURCE
      );
    } catch (err) {
      this.logger.warn(
        `Failed to store fingerprint for ${entry.id}: ${err.message} ` +
        `(entry saved, dedup tracking failed)`
      );
      // Don't throw — entry already saved
    }
  }
}

private extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  return text.match(urlRegex) || [];
}
```

### ProcessNextQueuedArticleUseCase

**Post-publish storage** (also in use case):

```typescript
async execute(): Promise<void> {
  // ... publish logic

  // After successful publish
  await this.queueRepo.markPublished(entry.id, telegramMessageId, llmData);

  // Store fingerprint
  await this.storeFingerprint(entry);

  // ...
}

private async storeFingerprint(entry: PublisherQueueEntry): Promise<void> {
  if (!this.dedupService) return;

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
      `Failed to store fingerprint for ${entry.id}: ${err.message}`
    );
  }
}
```

---

## Blocking vs Non-Blocking

### Blocking Failures (permanent)

**Always block re-enqueue**:

```typescript
const BLOCKING_FAILURE_REASONS = [
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
```

**Helper**:

```typescript
export function isBlockingFailureReason(reason: string | null): boolean {
  if (!reason) return false;

  const lower = reason.toLowerCase();
  return BLOCKING_FAILURE_REASONS.some((blocked) =>
    lower.includes(blocked.toLowerCase()),
  );
}
```

### Non-Blocking Failures (transient)

**Allow retry**:

- `"Expired: exceeded 24h in queue"`
- `"Publisher not configured"`
- `"Rate limit exceeded"`
- `"LLM generation failed"`
- `"Network timeout"`

### Status Check Logic

```typescript
if (existing) {
  // Always block
  if (existing.status === 'PENDING') return;
  if (existing.status === 'PUBLISHED') return;
  if (existing.status === 'BLOCKED') return;

  // Conditionally block
  if (existing.status === 'FAILED') {
    if (isBlockingFailureReason(existing.lastError)) {
      return; // Permanent block
    }
    // Allow re-enqueue for non-blocking failures
  }
}
```

---

## Database Schema

### DedupRecord Table

```sql
CREATE TABLE dedup_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_hash    VARCHAR NOT NULL,
  normalized_title    TEXT NOT NULL,
  normalized_content  TEXT NOT NULL,
  normalized_urls     TEXT[],
  raw_length          INTEGER NOT NULL,
  entry_id            UUID NOT NULL,  -- FK to publisher_queue (soft)
  source              VARCHAR NOT NULL,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_fingerprint_source UNIQUE (fingerprint_hash, source)
);

-- Indexes
CREATE INDEX idx_dedup_hash ON dedup_records(fingerprint_hash);
CREATE INDEX idx_dedup_source_recorded ON dedup_records(source, recorded_at DESC);
CREATE INDEX idx_dedup_entry_id ON dedup_records(entry_id);
```

### Cleanup Job

**Purpose**: Delete old records (retention 30 days)

```typescript
@Injectable()
export class DedupCleanupScheduler {
  @Cron('0 2 * * *') // Daily at 2am
  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const deleted = await this.repo.deleteOlderThan(cutoff);

    this.logger.log(
      `Deleted ${deleted} dedup records older than ${cutoff.toISOString()}`,
    );
  }
}
```

---

## Configuration

### Environment Variables

```bash
# Threshold for semantic dedup
DEDUP_SEMANTIC_ARBITER_THRESHOLD=0.7

# Source identifier
CRYPTO_NEWS_DEDUP_SOURCE=crypto-news-publisher

# Embedding service (optional)
EMBEDDING_SERVICE_URL=http://...
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
```

### Module Configuration

```typescript
// deduplication.module.ts
@Module({
  providers: [
    DeduplicationService,
    ContentNormalizer,
    UrlNormalizer,
    DedupScorer,
    FingerprintGenerator,
    {
      provide: DEDUP_THRESHOLD,
      useValue: parseFloat(
        process.env.DEDUP_SEMANTIC_ARBITER_THRESHOLD || '0.7',
      ),
    },
    {
      provide: DeduplicationRepository,
      useClass: TypeOrmDeduplicationRepository,
    },
    // Embedding service (optional)
    ...(process.env.EMBEDDING_SERVICE_URL
      ? [
          {
            provide: EmbeddingService,
            useClass: HttpEmbeddingService,
          },
        ]
      : []),
  ],
  exports: [DeduplicationService],
})
export class DeduplicationModule {}
```

### Fail-Open Design

**If dedup service unavailable**:

```typescript
// EnqueueMatchingMessageUseCase
if (this.dedupService) {
  // Try dedup
  try {
    const duplicate = await this.dedupService.findDuplicate(...);
    if (duplicate) {
      // Block
      return;
    }
  } catch (err) {
    this.logger.warn(`Dedup check failed: ${err.message} — allowing enqueue`);
    // Continue (fail-open)
  }
}

// Always proceed with enqueue if dedup unavailable
const entry = PublisherQueueEntry.create(input);
await this.queueRepo.save(entry);
```

---

**Navegación**: [← 06-ads.md](./06-ads.md) | [08-apis.md →](./08-apis.md)
