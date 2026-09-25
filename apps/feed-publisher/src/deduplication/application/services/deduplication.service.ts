import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeduplicationStorePort } from '../../domain/ports/deduplication-store.port';
import { Fingerprint } from '../../domain/value-objects/fingerprint.vo';
import { DedupRecord } from '../../domain/entities/dedup-record.entity';
import { EmbeddingPort } from '../ports/embedding.port';
import { ContentNormalizerService } from './content-normalizer.service';
import { UrlNormalizerService } from './url-normalizer.service';
import { ContentHashService } from './content-hash.service';
import { DedupScorerService } from './dedup-scorer.service';
import { SemanticScorerService } from './semantic-scorer.service';

export type DuplicateStrategy = 'exact' | 'content' | 'semantic' | 'none';

export interface DuplicateReference {
  readonly channelId: string;
  readonly messageId: number;
  readonly entryId?: string | null;
}

export interface DuplicateCheck {
  readonly isDuplicate: boolean;
  readonly strategy: DuplicateStrategy;
  readonly blockedReason: string | null;
  readonly similarity: number | null;
  readonly duplicateOf: DuplicateReference | null;
}

/**
 * DeduplicationService: exact -> content -> semantic cascade (fail-open).
 *
 * Moved from backend shared/deduplication (todo 4), trimmed to the queue
 * contract: `checkDuplicate` answers "block or not", `markAsSeen`
 * persists the four fingerprint rows. NOTHING here ever throws to the
 * caller: store/embedding failures degrade to "not a duplicate" (the
 * adversarial case — embeddings down — must still enqueue). The semantic
 * stage runs only when `DEDUP_ENABLED` is not 'false' AND the embedding
 * provider reports available; gray-zone scores never block.
 */
@Injectable()
export class DeduplicationService {
  private readonly logger = new Logger(DeduplicationService.name);
  private readonly semanticWindowMs = 48 * 60 * 60 * 1000;

  public constructor(
    private readonly store: DeduplicationStorePort,
    private readonly embedding: EmbeddingPort,
    private readonly normalizer: ContentNormalizerService,
    private readonly urls: UrlNormalizerService,
    private readonly hashing: ContentHashService,
    private readonly scorer: DedupScorerService,
    private readonly semantic: SemanticScorerService,
    private readonly config: ConfigService,
  ) {}

  public async checkDuplicate(input: {
    source: string;
    channelId: string;
    messageId: number;
    content: string;
  }): Promise<DuplicateCheck> {
    const notDuplicate: DuplicateCheck = {
      isDuplicate: false,
      strategy: 'none',
      blockedReason: null,
      similarity: null,
      duplicateOf: null,
    };
    try {
      const exact = await this.store.findExact(
        input.source,
        input.channelId,
        input.messageId,
      );
      if (exact !== null) {
        return {
          isDuplicate: true,
          strategy: 'exact',
          blockedReason: 'Duplicate of queue',
          similarity: 1,
          duplicateOf: this.referenceOf(exact),
        };
      }
      const contentHash = this.hashing.hash(input.content);
      const byContent = await this.store.findByContentHash(
        input.source,
        contentHash,
      );
      if (byContent !== null) {
        return {
          isDuplicate: true,
          strategy: 'content',
          blockedReason: 'Duplicate content of queue',
          similarity: 1,
          duplicateOf: this.referenceOf(byContent),
        };
      }
      return await this.checkSemantic(input, contentHash);
    } catch (err) {
      this.logger.warn(
        `Dedup probe failed (fail-open): ${(err as Error).message}`,
      );
      return notDuplicate;
    }
  }

  public async markAsSeen(input: {
    source: string;
    channelId: string;
    messageId: number;
    content: string;
    entryId?: string;
  }): Promise<void> {
    try {
      const normalized = this.normalizer.normalize(input.content);
      const contentHash = this.hashing.hash(input.content);
      const urlHashes = this.urls
        .extractUrls(input.content)
        .map((url) => this.urls.hashUrl(url));
      const numbers = this.normalizer.extractNumbers(input.content);
      const entities = this.normalizer.extractEntities(input.content);
      const cashtags = this.normalizer.extractCashtags(input.content);
      const tokens = this.normalizer.tokens(normalized);
      let embedding: number[] | null = null;
      try {
        const vector = this.embedding.isAvailable()
          ? await this.embedding.embed(input.content)
          : null;
        embedding = vector ? [...vector] : null;
      } catch (err) {
        this.logger.warn(
          `Embedding on markAsSeen failed (fail-open): ${(err as Error).message}`,
        );
      }
      const base = {
        source: input.source,
        channelId: input.channelId,
        messageId: input.messageId,
        referencedEntryId: input.entryId ?? null,
      };
      await this.store.save(
        DedupRecord.create({
          ...base,
          fingerprint: Fingerprint.exact(input.channelId, input.messageId),
        }),
      );
      await this.store.save(
        DedupRecord.create({
          ...base,
          fingerprint: Fingerprint.content(contentHash),
          contentHash,
          urlHashes,
          tokens,
          numbers,
          entities,
          cashtags,
          content: input.content,
          embedding,
        }),
      );
      for (const urlHash of urlHashes) {
        await this.store.save(
          DedupRecord.create({
            ...base,
            fingerprint: Fingerprint.of('url', urlHash),
            contentHash,
            urlHashes: [urlHash],
          }),
        );
      }
    } catch (err) {
      this.logger.warn(
        `markAsSeen failed (fail-open): ${(err as Error).message}`,
      );
    }
  }

  private async checkSemantic(
    input: {
      source: string;
      channelId: string;
      messageId: number;
      content: string;
    },
    contentHash: string,
  ): Promise<DuplicateCheck> {
    const notDuplicate: DuplicateCheck = {
      isDuplicate: false,
      strategy: 'none',
      blockedReason: null,
      similarity: null,
      duplicateOf: null,
    };
    if (this.config.get<string>('DEDUP_ENABLED', 'true') === 'false') {
      return notDuplicate;
    }
    if (!this.embedding.isAvailable()) {
      return notDuplicate;
    }
    let vector: ReadonlyArray<number> | null = null;
    try {
      vector = await this.embedding.embed(input.content);
    } catch (err) {
      this.logger.warn(
        `Semantic embed failed (fail-open): ${(err as Error).message}`,
      );
      return notDuplicate;
    }
    if (vector === null) {
      return notDuplicate;
    }
    const since = new Date(Date.now() - this.semanticWindowMs);
    const candidates = await this.store.findRecentWithEmbeddings(
      input.source,
      since,
    );
    const normalized = this.normalizer.normalize(input.content);
    const tokens = this.normalizer.tokens(normalized);
    const numbers = this.normalizer.extractNumbers(input.content);
    const entities = this.normalizer.extractEntities(input.content);
    const cashtags = this.normalizer.extractCashtags(input.content);
    const urlHashes = new Set(
      this.urls.extractUrls(input.content).map((url) => this.urls.hashUrl(url)),
    );
    let best: { score: number; record: DedupRecord } | null = null;
    for (const candidate of candidates) {
      const candidateEmbedding = candidate.embedding;
      if (candidateEmbedding === null) {
        continue;
      }
      const semantic = this.semantic.cosineSimilarity(
        vector,
        candidateEmbedding,
      );
      const candidateTokens = this.normalizer.tokens(
        this.normalizer.normalize(candidate.content ?? ''),
      );
      const minutesApart = Math.abs(
        (Date.now() - candidate.createdAt.getTime()) / 60000,
      );
      const overlap = candidate.urlHashes.filter((h) =>
        urlHashes.has(h),
      ).length;
      const { score, zone } = this.scorer.computeScore({
        semantic,
        jaccard: this.scorer.jaccard(tokens, candidateTokens),
        urlOverlap: overlap,
        minutesApart,
        numberJaccard: this.scorer.jaccard(
          numbers.map(String),
          candidate.numbers.map(String),
        ),
        entityJaccard: this.scorer.jaccard(entities, [...candidate.entities]),
        cashtagJaccard: this.scorer.jaccard(cashtags, [...candidate.cashtags]),
        hasNumbers: numbers.length > 0 || candidate.numbers.length > 0,
        hasEntities: entities.length > 0 || candidate.entities.length > 0,
        hasCashtags: cashtags.length > 0 || candidate.cashtags.length > 0,
      });
      void contentHash;
      if (zone === 'duplicate' && (best === null || score > best.score)) {
        best = { score, record: candidate };
      }
    }
    if (best === null) {
      return notDuplicate;
    }
    return {
      isDuplicate: true,
      strategy: 'semantic',
      blockedReason: 'Semantic duplicate of queue',
      similarity: best.score,
      duplicateOf: this.referenceOf(best.record),
    };
  }

  private referenceOf(record: DedupRecord): DuplicateReference {
    return {
      channelId: record.channelId,
      messageId: record.messageId,
      entryId: record.referencedEntryId,
    };
  }
}
