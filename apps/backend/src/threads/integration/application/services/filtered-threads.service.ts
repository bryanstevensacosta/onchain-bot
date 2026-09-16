import { Injectable, Logger } from '@nestjs/common';
import { ThreadsIngestionClient } from '../../infrastructure/http/threads-ingestion-client.service';
import type {
  ThreadsMessageDto,
  ThreadsMessageMedia,
} from '../../infrastructure/http/threads-ingestion-client.service';
// Import-only reuse of the crypto-news filter slice (public module exports
// of `CryptoNewsIngestionModule` — NEVER edited, NEVER vendorized):
// - `ContentFilterService` (regex transforms, `filterTitleAndContent`)
// - `ChannelFilterRepository` (per-channel rules; the ENTITY
//   `ChannelContentFilterConfigEntity` is never imported directly)
import { ContentFilterService } from 'telegram/ingestion/crypto-news/application/services/content-filter.service';
import type { FilterRule } from 'telegram/ingestion/crypto-news/application/services/content-filter.service';
import { ChannelFilterRepository } from 'telegram/ingestion/crypto-news/application/ports/channel-filter.repository';
import { ThreadsKeywordRepository } from 'threads/publisher/application/ports/threads-keyword.repository';
import { ThreadsBlacklistPhraseRepository } from 'threads/publisher/application/ports/threads-blacklist-phrase.repository';
import { ThreadsKeyword } from 'threads/publisher/domain/entities/threads-keyword.entity';
import { ThreadsBlacklistPhrase } from 'threads/publisher/domain/entities/threads-blacklist-phrase.entity';

/**
 * Filtered threads message with transformed content.
 *
 * Shape matches ThreadsMessageDto but with filtered content.
 * Used by the threads publisher to enqueue messages for LLM processing.
 */
export interface FilteredThreadsMessage extends ThreadsMessageDto {
  /** Content AFTER applying ContentFilterService rules (per-channel regex transforms) */
  readonly content: string;
  /** Matched keywords that triggered inclusion (for template binding) */
  readonly matchedKeywords: ThreadsKeyword[];
  /** Whether message has media (photo/video, NOT webpage) */
  readonly hasMedia: boolean;
}

/**
 * FilteredThreadsService - Orchestrates fetch→filter→match pipeline.
 *
 * Threads-typed mirror of crypto `FilteredCryptoNewsService`
 * (`telegram/crypto-news-integration/application/services/filtered-crypto-news.service.ts`):
 * 1. Fetch RAW messages from ingestion-service (ThreadsIngestionClient —
 *    same `/api/crypto-news/messages` feed, zero ingestion-service changes)
 * 2. Apply ContentFilterService per-channel regex rules (transform on-read,
 *    IMPORTED as-is from `telegram/ingestion/crypto-news`)
 * 3. Evaluate threads keywords AND-groups + blacklist phrases
 * 4. Return filtered messages with matched keywords for enqueue
 *
 * **Used by:**
 * - Threads polling scheduler (5min SSE-fallback / 1min primary)
 * - SSE handler (real-time `messageType='crypto-news'` events)
 *
 * **Not used by:**
 * - Frontend display (frontend reads RAW from ingestion-service directly)
 * - Ingestion flow (ingestion stores RAW, doesn't transform)
 */
@Injectable()
export class FilteredThreadsService {
  private readonly logger = new Logger(FilteredThreadsService.name);

  constructor(
    private readonly ingestionClient: ThreadsIngestionClient,
    private readonly contentFilter: ContentFilterService,
    private readonly channelFilters: ChannelFilterRepository,
    private readonly keywordRepo: ThreadsKeywordRepository,
    private readonly blacklistRepo: ThreadsBlacklistPhraseRepository,
  ) {}

  /**
   * Fetch recent messages and return ONLY those matching threads keywords
   * (not blacklisted).
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
  ): Promise<ReadonlyArray<FilteredThreadsMessage>> {
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

      // Step 2: Load threads keywords and blacklist phrases
      const [keywords, blacklistPhrases] = await Promise.all([
        this.keywordRepo.findAll(),
        this.blacklistRepo.findAll(),
      ]);

      // Step 3: Filter and match each message
      const matched: FilteredThreadsMessage[] = [];

      for (const raw of rawMessages) {
        const result = await this.filterAndMatch(
          raw,
          keywords,
          blacklistPhrases,
        );
        if (result) {
          matched.push(result);
        }
      }

      // Step 4: Merge album siblings + collapse multi-match groups so one
      // Telegram album produces exactly one queue entry with all its photos.
      const filtered = this.mergeAlbumGroups(matched, rawMessages);

      this.logger.log(
        `Filtered ${rawMessages.length} raw messages → ${filtered.length} matched (threads keywords + not blacklisted)`,
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
   * Merge album siblings into matched entries and collapse groups.
   *
   * Mirror of crypto `mergeAlbumGroups`: for every matched message with a
   * groupedId, media is collected from ALL raw batch members with the same
   * key (matched or not), ordered by (messageId, index). Each item KEEPS
   * its original per-message index and is tagged with its owner's Telegram
   * id. When several group members match, only the first is kept.
   *
   * @param matched - Messages that passed filter + match
   * @param rawBatch - Full raw batch they were matched from (siblings source)
   * @returns Collapsed list, one entry per album group at most
   */
  public mergeAlbumGroups(
    matched: readonly FilteredThreadsMessage[],
    rawBatch: readonly ThreadsMessageDto[],
  ): FilteredThreadsMessage[] {
    const acceptedGroups = new Set<string>();
    const out: FilteredThreadsMessage[] = [];
    for (const m of matched) {
      const key = m.groupedId !== null ? `${m.channelId}:${m.groupedId}` : null;
      if (key === null) {
        out.push(m);
        continue;
      }
      if (acceptedGroups.has(key)) {
        this.logger.debug(
          `Album ${key} already covered, skipping ${m.messageId}`,
        );
        continue;
      }
      acceptedGroups.add(key);
      const siblings = rawBatch
        .filter(
          (r) => r.channelId === m.channelId && r.groupedId === m.groupedId,
        )
        .sort((a, b) => a.messageId - b.messageId);
      const merged: ThreadsMessageMedia[] = [];
      for (const sib of siblings) {
        const items = [...sib.media].sort((a, b) => a.index - b.index);
        for (const item of items) {
          const locator = item.url ?? item.filePath;
          if (
            locator &&
            merged.some((e) => (e.url ?? e.filePath) === locator)
          ) {
            continue;
          }
          merged.push({ ...item, ownerMessageId: sib.messageId });
        }
      }
      out.push({ ...m, media: merged });
    }
    return out;
  }

  /**
   * Filter and match a single raw message.
   *
   * Returns the filtered message if it matches threads keywords AND NOT
   * blacklisted. Returns null if no keyword match or blacklisted.
   */
  private async filterAndMatch(
    raw: ThreadsMessageDto,
    keywords: readonly ThreadsKeyword[],
    blacklistPhrases: readonly ThreadsBlacklistPhrase[],
  ): Promise<FilteredThreadsMessage | null> {
    try {
      // Step 1: Load per-channel content filters
      const filters = await this.channelFilters.findFiltersByChannelId(
        raw.channelId,
      );

      // Step 2: Apply content filters (regex transformations).
      // ChannelFilterRepository yields `ChannelFilterRule`; the content
      // filter service consumes `FilterRule` — same structural shape.
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
          `No threads keyword matched: channelId=${raw.channelId}, messageId=${raw.messageId}`,
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
          `Message blocked by threads blacklist: channelId=${raw.channelId}, messageId=${raw.messageId}, phrases="${blockingPhrases.map((p) => p.phrase).join(',')}"`,
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
   * Apply content filters to title and content via the shared
   * ContentFilterService with per-channel FilterRule array.
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
   * Find threads keywords matching the content.
   *
   * Mirror of crypto `findMatchingKeywords`:
   * - Separates simple keywords (andGroupId=null) from compounds (grouped by andGroupId)
   * - Simple keywords: match individually
   * - AND-groups: ALL keywords in group must match
   * - Respects requireMedia flag (skip if keyword requires media but message has none)
   */
  private findMatchingKeywords(
    keywords: readonly ThreadsKeyword[],
    content: string,
    hasMedia: boolean,
  ): ThreadsKeyword[] {
    const simples: ThreadsKeyword[] = [];
    const compounds = new Map<string, ThreadsKeyword[]>();

    for (const kw of keywords) {
      if (kw.andGroupId === null) {
        simples.push(kw);
      } else {
        const group = compounds.get(kw.andGroupId) ?? [];
        group.push(kw);
        compounds.set(kw.andGroupId, group);
      }
    }

    const matched: ThreadsKeyword[] = [];

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
   * Find threads blacklist phrases matching the content.
   *
   * Mirror of crypto `findMatchingBlacklistPhrases`:
   * - Separates simple phrases (andGroupId=null) from compounds (grouped by andGroupId)
   * - Simple phrases: match individually
   * - AND-groups: ALL phrases in group must match
   * - Respects requireMedia flag
   */
  private findMatchingBlacklistPhrases(
    phrases: readonly ThreadsBlacklistPhrase[],
    content: string,
    hasMedia: boolean,
  ): readonly ThreadsBlacklistPhrase[] {
    const simples: ThreadsBlacklistPhrase[] = [];
    const compounds = new Map<string, ThreadsBlacklistPhrase[]>();

    for (const phrase of phrases) {
      if (phrase.andGroupId === null) {
        simples.push(phrase);
      } else {
        const group = compounds.get(phrase.andGroupId) ?? [];
        group.push(phrase);
        compounds.set(phrase.andGroupId, group);
      }
    }

    const matched: ThreadsBlacklistPhrase[] = [];

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
