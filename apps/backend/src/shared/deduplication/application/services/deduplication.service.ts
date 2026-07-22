/**
 * Deduplication service for crypto news.
 *
 * Orchestrates different deduplication strategies:
 * - Level 1: Exact match (channelId:messageId)
 * - Level 2: Content hash match
 * - Level 3: URL match
 * - Level 4: Semantic similarity (optional, requires embedding service)
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DedupRecord } from 'shared/deduplication/domain/entities/dedup-record.entity';
import { Fingerprint } from 'shared/deduplication/domain/value-objects/fingerprint.vo';
import { ContentNormalizerService } from 'shared/deduplication/domain/services/content-normalizer.service';
import { ContentHashService } from 'shared/deduplication/domain/services/content-hash.service';
import { UrlNormalizerService } from 'shared/deduplication/domain/services/url-normalizer.service';
import { DedupScorer } from 'shared/deduplication/domain/services/dedup-scorer.service';
import { DeduplicationStore } from '../ports/deduplication-store.port';

/**
 * Result of a deduplication check.
 */
export interface DedupResult {
  isDuplicate: boolean;
  blockedReason?: string;
  zone: 'duplicate' | 'different' | 'gray_zone';
  eventRelation?: 'duplicate' | 'update' | 'different';
  similarity?: number;
  signals?: Array<{ name: string; contribution: number }>;
  existingRecord?: DedupRecord;
}

/**
 * Classification of event relation between two items.
 */
export type EventRelation = 'duplicate' | 'update' | 'different';

/**
 * Embedding service interface for semantic similarity.
 */
export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
}

/**
 * Deduplication service.
 *
 * Coordinates multiple deduplication strategies:
 * - Exact match: channelId + messageId
 * - Content match: normalized content hash
 * - URL match: normalized URL hash
 * - Semantic match: embedding similarity (optional)
 */
@Injectable()
export class DeduplicationService {
  private readonly logger = new Logger(DeduplicationService.name);

  constructor(
    private readonly store: DeduplicationStore,
    @Optional() private readonly embeddingService?: EmbeddingService,
    @Optional()
    private readonly arbiterService?: {
      classifyRelation(
        textA: string,
        textB: string,
      ): Promise<{
        relation: 'duplicate' | 'update' | 'different';
        confidence: number;
        reason?: string;
      }>;
    },
  ) {
    // Static services are used directly without injection:
    // - ContentNormalizerService.normalize()
    // - ContentHashService.hash()
    // - UrlNormalizerService.extractUrls(), .normalize(), .hash()
  }

  /**
   * Level 1: Exact match check.
   *
   * Checks if the exact (channelId, messageId) combination already exists.
   */
  async checkExact(
    source: string,
    channelId: string,
    messageId: number,
  ): Promise<DedupResult> {
    const fingerprint = Fingerprint.exact(channelId, messageId);
    const existing = await this.store.findExisting(fingerprint, source);

    if (existing) {
      return {
        isDuplicate: true,
        zone: 'duplicate',
        blockedReason: 'Duplicate of queue',
        existingRecord: existing,
      };
    }

    return {
      isDuplicate: false,
      zone: 'different',
    };
  }

  /**
   * Level 2: Content hash match check.
   *
   * Normalizes content and checks if the hash already exists.
   */
  async checkContent(source: string, rawContent: string): Promise<DedupResult> {
    const hash = ContentHashService.hash(rawContent);
    const fingerprint = Fingerprint.content(hash);

    const existing = await this.store.findExisting(fingerprint, source);

    if (existing) {
      return {
        isDuplicate: true,
        zone: 'duplicate',
        blockedReason: 'Duplicate content of queue',
        existingRecord: existing,
      };
    }

    return {
      isDuplicate: false,
      zone: 'different',
    };
  }

  /**
   * Level 3: URL match check.
   *
   * Extracts URLs from content, normalizes, hashes, and checks for duplicates.
   */
  async checkUrl(source: string, rawContent: string): Promise<DedupResult> {
    const urls = UrlNormalizerService.extractUrls(rawContent);

    if (urls.length === 0) {
      return {
        isDuplicate: false,
        zone: 'different',
      };
    }

    // Check each URL
    const sinceDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours

    for (const url of urls) {
      const hash = UrlNormalizerService.hash(url);

      const existing = await this.store.findByUrlHash(hash, source, sinceDate);

      if (existing) {
        return {
          isDuplicate: true,
          zone: 'duplicate',
          blockedReason: 'Duplicate URL',
          existingRecord: existing,
        };
      }
    }

    return {
      isDuplicate: false,
      zone: 'different',
    };
  }

  /**
   * Level 4: Semantic similarity check.
   *
   * Uses embeddings to find semantically similar content.
   * Falls back to different if embedding service is not available.
   */
  async checkSemantic(
    source: string,
    rawContent: string,
    _channelId: string,
    _messageId: number,
  ): Promise<DedupResult> {
    // Extract numbers, entities, cashtags for scoring
    const numbers = ContentNormalizerService.extractNumbers(rawContent);
    const entities = ContentNormalizerService.extractEntities(rawContent);
    const cashtags = ContentNormalizerService.extractCashtags(rawContent);

    // Normalize content for tokenization
    const normalized = ContentNormalizerService.normalize(rawContent);
    const tokens = this.extractTokens(normalized);

    // Check if embedding service is available
    if (!this.embeddingService) {
      this.logger.debug(
        'EmbeddingService not available, skipping semantic check',
      );
      return {
        isDuplicate: false,
        zone: 'different',
      };
    }

    // Compute embedding
    let embedding: number[];
    try {
      embedding = await this.embeddingService.embed(rawContent);
    } catch (error) {
      this.logger.warn(`Failed to compute embedding: ${error}`);
      return {
        isDuplicate: false,
        zone: 'different',
      };
    }

    // Search for similar embeddings (48h window, threshold 0.50)
    const sinceDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const candidates = await this.store.findSimilarEmbeddings(
      embedding,
      source,
      sinceDate,
      0.5,
    );

    if (candidates.length === 0) {
      return {
        isDuplicate: false,
        zone: 'different',
      };
    }

    // Score each candidate
    let bestScore = -Infinity;
    let bestCandidate: DedupRecord | null = null;
    let bestSignals: Array<{ name: string; contribution: number }> = [];

    for (const { record } of candidates) {
      const scoreResult = DedupScorer.computeScore({
        embeddingM: embedding,
        embeddingE: record.embedding ? [...record.embedding] : [],
        tokensM: tokens,
        tokensE: [...record.tokens],
        numbersM: numbers,
        numbersE: [...record.numbers],
        entitiesM: entities,
        entitiesE: [...record.entities],
        cashtagsM: cashtags,
        cashtagsE: [...record.cashtags],
        urlOverlapCount: 0, // Not available at this point
        sameSource: record.source === source,
        timeDiffMinutes: (Date.now() - record.createdAt.getTime()) / 60000,
      });

      if (scoreResult.score > bestScore) {
        bestScore = scoreResult.score;
        bestCandidate = record;
        bestSignals = scoreResult.signals;
      }
    }

    if (!bestCandidate) {
      return {
        isDuplicate: false,
        zone: 'different',
      };
    }

    // Determine zone from best score
    const bestScoreResult = DedupScorer.computeScore({
      embeddingM: embedding,
      embeddingE: bestCandidate.embedding ? [...bestCandidate.embedding] : [],
      tokensM: tokens,
      tokensE: [...bestCandidate.tokens],
      numbersM: numbers,
      numbersE: [...bestCandidate.numbers],
      entitiesM: entities,
      entitiesE: [...bestCandidate.entities],
      cashtagsM: cashtags,
      cashtagsE: [...bestCandidate.cashtags],
      urlOverlapCount: 0,
      sameSource: bestCandidate.source === source,
      timeDiffMinutes: (Date.now() - bestCandidate.createdAt.getTime()) / 60000,
    });

    if (bestScoreResult.zone === 'duplicate') {
      return {
        isDuplicate: true,
        zone: 'duplicate',
        blockedReason: 'Semantic duplicate of queue',
        similarity: bestScore,
        signals: bestSignals,
        existingRecord: bestCandidate,
      };
    }

    if (bestScoreResult.zone === 'different') {
      return {
        isDuplicate: false,
        zone: 'different',
      };
    }

    // Gray zone - need LLM arbitration
    if (bestScoreResult.zone === 'gray_zone') {
      if (!this.arbiterService) {
        // Fail-open: no LLM means we treat as different
        this.logger.debug(
          'Gray zone without LLM arbiter, failing open to different',
        );
        return {
          isDuplicate: false,
          zone: 'gray_zone',
        };
      }

      // Call LLM to arbitrate
      try {
        const arbiterResult = await this.arbiterService.classifyRelation(
          normalized,
          ContentNormalizerService.normalize(
            `source: ${bestCandidate.source}, channel: ${bestCandidate.channelId}`,
          ),
        );

        if (arbiterResult.relation === 'duplicate') {
          return {
            isDuplicate: true,
            zone: 'duplicate',
            blockedReason: 'Semantic duplicate (LLM confirmed)',
            similarity: bestScore,
            signals: bestSignals,
            eventRelation: 'duplicate',
            existingRecord: bestCandidate,
          };
        }

        if (arbiterResult.relation === 'update') {
          return {
            isDuplicate: false,
            zone: 'different',
            eventRelation: 'update',
            existingRecord: bestCandidate,
          };
        }

        return {
          isDuplicate: false,
          zone: 'different',
          eventRelation: 'different',
        };
      } catch (error) {
        this.logger.warn(`LLM arbitration failed: ${error}`);
        // Fail-open on LLM error
        return {
          isDuplicate: false,
          zone: 'gray_zone',
        };
      }
    }

    return {
      isDuplicate: false,
      zone: 'different',
    };
  }

  /**
   * Marks a message as seen by creating all fingerprint types.
   */
  async markAsSeen(
    source: string,
    channelId: string,
    messageId: number,
    rawContent: string,
    embedding?: number[],
    referencedEntryId?: string,
  ): Promise<void> {
    // Normalize content
    const normalized = ContentNormalizerService.normalize(rawContent);
    const contentHash = ContentHashService.hash(rawContent);

    // Extract URLs and hash them
    const urls = UrlNormalizerService.extractUrls(rawContent);
    const urlsHashes = urls.map((url) => UrlNormalizerService.hash(url));

    // Extract features
    const numbers = ContentNormalizerService.extractNumbers(rawContent);
    const entities = ContentNormalizerService.extractEntities(rawContent);
    const cashtags = ContentNormalizerService.extractCashtags(rawContent);

    // Tokenize
    const tokens = this.extractTokens(normalized);

    // Create fingerprints for each type
    const fingerprints: Fingerprint[] = [];

    // Exact fingerprint
    fingerprints.push(Fingerprint.exact(channelId, messageId));

    // Content fingerprint
    fingerprints.push(Fingerprint.content(contentHash));

    // URL fingerprints (one per URL)
    for (const urlHash of urlsHashes) {
      fingerprints.push(Fingerprint.url(urlHash));
    }

    // Semantic fingerprint
    fingerprints.push(Fingerprint.semantic(channelId, messageId));

    // Create and save records for each fingerprint
    for (const fingerprint of fingerprints) {
      const record = DedupRecord.create({
        fingerprint,
        source,
        channelId,
        messageId,
        urlsHashes,
        tokens,
        numbers,
        entities,
        cashtags: cashtags,
        embedding: embedding ?? null,
        referencedEntryId: referencedEntryId ?? null,
      });

      await this.store.save(record);
    }
  }

  /**
   * Classifies the event relation between two items.
   * Uses LLM if available, otherwise returns null.
   */
  async classifyEvent(
    normalizedContent: string,
    candidate: DedupRecord,
  ): Promise<EventRelation | null> {
    if (!this.arbiterService) {
      return null;
    }

    try {
      const result = await this.arbiterService.classifyRelation(
        normalizedContent,
        ContentNormalizerService.normalize(
          `source: ${candidate.source}, channel: ${candidate.channelId}`,
        ),
      );

      return result.relation;
    } catch (error) {
      this.logger.warn(`Event classification failed: ${error}`);
      return null;
    }
  }

  /**
   * Extracts tokens from normalized content.
   *
   * Splits by whitespace, filters empty, removes duplicates, and sorts.
   */
  extractTokens(normalized: string): string[] {
    const tokens = normalized.split(/\s+/).filter((t) => t.length > 0);
    const unique = [...new Set(tokens)];
    return unique.sort();
  }
}
