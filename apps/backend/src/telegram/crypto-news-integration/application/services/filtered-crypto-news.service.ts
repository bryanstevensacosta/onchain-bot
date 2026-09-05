import { Injectable, Logger } from '@nestjs/common';
import { CryptoNewsIngestionClient } from 'telegram/crypto-news-integration/infrastructure/http/crypto-news-ingestion-client.service';
import type { CryptoNewsMessageDto } from 'telegram/crypto-news-integration/infrastructure/http/crypto-news-ingestion-client.service';
import { ContentFilterService } from 'telegram/ingestion/crypto-news/application/services/content-filter.service';
import type { FilterRule } from 'telegram/ingestion/crypto-news/application/services/content-filter.service';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { BlacklistPhraseRepository } from 'telegram/crypto-news-publisher/application/ports/blacklist-phrase.repository';
import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';
import { BlacklistPhrase } from 'telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity';

/**
 * Filtered crypto-news message with transformed content.
 *
 * Shape matches CryptoNewsMessageDto but with filtered content.
 * Used by publisher to enqueue messages for LLM processing.
 */
export interface FilteredCryptoNewsMessage extends CryptoNewsMessageDto {
  /** Content AFTER applying ContentFilterService rules (per-channel regex transforms) */
  readonly content: string;
  /** Matched keywords that triggered inclusion (for template binding) */
  readonly matchedKeywords: Keyword[];
  /** Whether message has media (photo/video, NOT webpage) */
  readonly hasMedia: boolean;
}

/**
 * FilteredCryptoNewsService - Orchestrates fetch→filter→match pipeline
 *
 * **Per Opción A architecture:**
 * 1. Fetch RAW messages from ingestion-service (CryptoNewsIngestionClient)
 * 2. Apply ContentFilterService per-channel regex rules (transform on-read)
 * 3. Evaluate keywords AND-groups + blacklist phrases
 * 4. Return filtered messages with matched keywords for enqueue
 *
 * **Responsibilities:**
 * - Fetch raw messages from ingestion-service HTTP API
 * - Load per-channel content filters from backend DB
 * - Apply regex transformations to content (title + body)
 * - Evaluate keyword matching (simple + AND-groups)
 * - Evaluate blacklist matching (block if any match)
 * - Return only messages that match keywords AND NOT blacklist
 *
 * **Used by:**
 * - Publisher cron (every 1 minute) — fetches recent messages for queue
 * - Manual enqueue triggers (admin tools)
 *
 * **Not used by:**
 * - Frontend display (frontend reads RAW from ingestion-service directly)
 * - Ingestion flow (ingestion stores RAW, doesn't transform)
 *
 * @injectable NestJS service
 */
@Injectable()
export class FilteredCryptoNewsService {
  private readonly logger = new Logger(FilteredCryptoNewsService.name);

  constructor(
    private readonly ingestionClient: CryptoNewsIngestionClient,
    private readonly contentFilter: ContentFilterService,
    private readonly sourceRepo: CryptoNewsSourceRepository,
    private readonly keywordRepo: KeywordRepository,
    private readonly blacklistRepo: BlacklistPhraseRepository,
  ) {}

  /**
   * Fetch recent messages and return ONLY those matching keywords (not blacklisted).
   *
   * Pipeline:
   * 1. Fetch raw messages from ingestion-service
   * 2. For each message:
   *    a. Load per-channel content filters
   *    b. Apply filters to title + content
   *    c. Evaluate keywords (simple + AND-groups)
   *    d. Evaluate blacklist phrases
   *    e. Include if keyword match AND NOT blacklisted
   *
   * @param limit - Max messages to fetch from ingestion-service (default 50)
   * @param channelId - Optional channel filter (fetches from all channels if omitted)
   * @returns Array of filtered messages with matched keywords (empty if none match)
   */
  async getMatchingMessages(
    limit = 50,
    channelId?: string,
  ): Promise<ReadonlyArray<FilteredCryptoNewsMessage>> {
    try {
      // Step 1: Fetch raw messages from ingestion-service
      const rawMessages = await this.ingestionClient.fetchRecentMessages(
        limit,
        channelId,
      );

      if (rawMessages.length === 0) {
        this.logger.debug(
          `No raw messages fetched from ingestion-service (limit: ${limit}, channelId: ${channelId ?? 'all'})`,
        );
        return [];
      }

      this.logger.debug(
        `Fetched ${rawMessages.length} raw messages, now filtering...`,
      );

      // Step 2: Load keywords and blacklist phrases (cache-friendly query)
      const [keywords, blacklistPhrases] = await Promise.all([
        this.keywordRepo.findAll(),
        this.blacklistRepo.findAll(),
      ]);

      // Step 3: Filter and match each message
      const filtered: FilteredCryptoNewsMessage[] = [];

      for (const raw of rawMessages) {
        const result = await this.filterAndMatch(
          raw,
          keywords,
          blacklistPhrases,
        );
        if (result) {
          filtered.push(result);
        }
      }

      this.logger.log(
        `Filtered ${rawMessages.length} raw messages → ${filtered.length} matched (keywords + not blacklisted)`,
      );

      return filtered;
    } catch (error) {
      this.logger.error(
        `Failed to get matching messages: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return [];
    }
  }

  /**
   * Filter and match a single raw message.
   *
   * Returns the filtered message if it matches keywords AND NOT blacklisted.
   * Returns null if no keyword match or blacklisted.
   *
   * @param raw - Raw message from ingestion-service
   * @param keywords - All active keywords
   * @param blacklistPhrases - All active blacklist phrases
   * @returns Filtered message with matched keywords, or null
   */
  private async filterAndMatch(
    raw: CryptoNewsMessageDto,
    keywords: readonly Keyword[],
    blacklistPhrases: readonly BlacklistPhrase[],
  ): Promise<FilteredCryptoNewsMessage | null> {
    try {
      // Step 1: Load per-channel content filters
      const filters = await this.sourceRepo.findFiltersByChannelId(
        raw.channelId,
      );

      // Step 2: Apply content filters (regex transformations)
      const { title, content } = this.applyContentFilters(
        raw.title,
        raw.content,
        filters,
      );

      // Step 3: Check if message has media (photo/video, NOT webpage)
      const hasMedia = raw.media.some(
        (m) => m.type === 'photo' || m.type === 'video',
      );

      // Step 4: Evaluate keyword matching (simple + AND-groups)
      const matchedKeywords = this.findMatchingKeywords(
        keywords,
        content,
        hasMedia,
      );

      if (matchedKeywords.length === 0) {
        this.logger.debug(
          `No keyword matched: channelId=${raw.channelId}, messageId=${raw.messageId}`,
        );
        return null;
      }

      // Step 5: Check blacklist AFTER keyword match
      const blockingPhrases = this.findMatchingBlacklistPhrases(
        blacklistPhrases,
        content,
        hasMedia,
      );

      if (blockingPhrases.length > 0) {
        this.logger.debug(
          `Message blocked by blacklist: channelId=${raw.channelId}, messageId=${raw.messageId}, phrases="${blockingPhrases.map((p) => p.phrase).join(',')}"`,
        );
        return null;
      }

      // Step 6: Return filtered message with matched keywords
      return {
        ...raw,
        title, // ← FILTERED title
        content, // ← FILTERED content
        matchedKeywords,
        hasMedia,
      };
    } catch (error) {
      this.logger.error(
        `Failed to filter and match message ${raw.channelId}:${raw.messageId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Apply content filters to title and content.
   *
   * Uses ContentFilterService with per-channel FilterRule array.
   *
   * @param title - Raw title from ingestion-service
   * @param content - Raw content from ingestion-service
   * @param filters - Per-channel filter rules
   * @returns Object with filtered title and content
   */
  private applyContentFilters(
    title: string | null,
    content: string,
    filters: ReadonlyArray<FilterRule>,
  ): { title: string | null; content: string } {
    if (filters.length === 0) {
      return { title, content };
    }

    return this.contentFilter.filterTitleAndContent(title, content, filters);
  }

  /**
   * Find keywords matching the content.
   *
   * Logic copied from CryptoNewsMessageIngestedHandler:
   * - Separates simple keywords (andGroupId=null) from compounds (grouped by andGroupId)
   * - Simple keywords: match individually
   * - AND-groups: ALL keywords in group must match
   * - Respects requireMedia flag (skip if keyword requires media but message has none)
   *
   * @param keywords - All active keywords
   * @param content - Filtered content
   * @param hasMedia - Whether message has photo/video media
   * @returns Array of matched keywords (empty if none match)
   */
  private findMatchingKeywords(
    keywords: readonly Keyword[],
    content: string,
    hasMedia: boolean,
  ): Keyword[] {
    const simples: Keyword[] = [];
    const compounds = new Map<string, Keyword[]>();

    for (const kw of keywords) {
      if (kw.andGroupId === null) {
        simples.push(kw);
      } else {
        const group = compounds.get(kw.andGroupId) ?? [];
        group.push(kw);
        compounds.set(kw.andGroupId, group);
      }
    }

    const matched: Keyword[] = [];

    for (const kw of simples) {
      if (kw.matches(content) && (!kw.requireMedia || hasMedia)) {
        matched.push(kw);
      }
    }

    for (const [, groupKeywords] of compounds) {
      const allMatch = groupKeywords.every((kw) => kw.matches(content));
      if (!allMatch) {
        continue;
      }
      const anyRequiresMedia = groupKeywords.some((kw) => kw.requireMedia);
      if (anyRequiresMedia && !hasMedia) {
        continue;
      }
      for (const kw of groupKeywords) {
        if (!matched.some((m) => m.id === kw.id)) {
          matched.push(kw);
        }
      }
    }

    return matched;
  }

  /**
   * Find blacklist phrases matching the content.
   *
   * Logic copied from CryptoNewsMessageIngestedHandler:
   * - Separates simple phrases (andGroupId=null) from compounds (grouped by andGroupId)
   * - Simple phrases: match individually
   * - AND-groups: ALL phrases in group must match
   * - Respects requireMedia flag
   *
   * @param phrases - All active blacklist phrases
   * @param content - Filtered content
   * @param hasMedia - Whether message has photo/video media
   * @returns Array of matched blacklist phrases (empty if none match)
   */
  private findMatchingBlacklistPhrases(
    phrases: readonly BlacklistPhrase[],
    content: string,
    hasMedia: boolean,
  ): readonly BlacklistPhrase[] {
    const simples: BlacklistPhrase[] = [];
    const compounds = new Map<string, BlacklistPhrase[]>();

    for (const phrase of phrases) {
      if (phrase.andGroupId === null) {
        simples.push(phrase);
      } else {
        const group = compounds.get(phrase.andGroupId) ?? [];
        group.push(phrase);
        compounds.set(phrase.andGroupId, group);
      }
    }

    const matched: BlacklistPhrase[] = [];

    for (const phrase of simples) {
      if (phrase.checkMatchesWithMedia(content, hasMedia)) {
        matched.push(phrase);
      }
    }

    for (const [, groupPhrases] of compounds) {
      const allMatch = groupPhrases.every((p) => p.matches(content));
      if (!allMatch) {
        continue;
      }
      const anyRequiresMedia = groupPhrases.some((p) => p.requireMedia);
      if (anyRequiresMedia && !hasMedia) {
        continue;
      }
      for (const p of groupPhrases) {
        if (!matched.some((m) => m.id === p.id)) {
          matched.push(p);
        }
      }
    }

    return matched;
  }
}
