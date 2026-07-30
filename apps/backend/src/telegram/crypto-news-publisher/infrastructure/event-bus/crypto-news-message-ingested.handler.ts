import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageIngestedEvent } from 'telegram/ingestion/crypto-news/domain/events/crypto-news-message-ingested.event';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';
import { BlacklistPhraseRepository } from 'telegram/crypto-news-publisher/application/ports/blacklist-phrase.repository';
import { BlacklistPhrase } from 'telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { EnqueueMatchingMessageUseCase } from 'telegram/crypto-news-publisher/application/handlers/enqueue-matching-message.use-case';
import { DeduplicationService } from 'shared/deduplication/application/services/deduplication.service';

/**
 * Event handler: reacts to ingested crypto-news messages.
 *
 * Listens to `CryptoNewsMessageIngestedEvent` and tests the message content
 * against enabled keywords. On a match, enqueues the message for publication.
 *
 * Per fix-1 (Bot Dev ToS §4.3 compliance): this handler must NOT log raw
 * `content`. Only channelId, messageId, and title (from the event) are logged.
 * The full message is fetched via `findByChannelAndMessageId` only to test
 * keyword matching — content does not cross the event bus.
 */
@Injectable()
export class CryptoNewsMessageIngestedHandler {
  private readonly logger = new Logger(CryptoNewsMessageIngestedHandler.name);

  /**
   * Cache TTL for enabled keywords. Avoids DB hit on every ingested message.
   */
  private static readonly KEYWORD_CACHE_TTL_MS = 10_000;

  /**
   * Cache TTL for enabled blacklist phrases. Same as keywords.
   */
  private static readonly BLACKLIST_CACHE_TTL_MS = 10_000;

  /**
   * Cached enabled keywords, refreshed after KEYWORD_CACHE_TTL_MS.
   */
  private cachedKeywords: readonly Keyword[] = [];
  private keywordCacheTimestamp: number = 0;

  /**
   * Cached enabled blacklist phrases, refreshed after BLACKLIST_CACHE_TTL_MS.
   */
  private cachedBlacklistPhrases: readonly BlacklistPhrase[] = [];
  private blacklistCacheTimestamp: number = 0;

  public constructor(
    private readonly messageRepo: CryptoNewsMessageRepository,
    private readonly keywordRepo: KeywordRepository,
    private readonly blacklistRepo: BlacklistPhraseRepository,
    private readonly queueRepo: PublisherQueueRepository,
    private readonly enqueue: EnqueueMatchingMessageUseCase,
    private readonly deduplicationService: DeduplicationService,
  ) {}

  /**
   * Handle incoming crypto-news message.
   *
   * Flow:
   *  1. Fetch full message (with content) via repository lookup
   *  2. Get enabled keywords (cached with 10s TTL)
   *  3. Test keyword.matches() against message content
   *  4. On match, check blacklist phrases
   *  5. If blocked by blacklist, create queue entry with BLOCKED status
   *  6. Otherwise, enqueue via use case
   *  7. Log result (without leaking content)
   */
  @OnEvent('crypto-news.message.ingested')
  async handle(event: CryptoNewsMessageIngestedEvent): Promise<void> {
    const { channelId, messageId, title } = event.payload;

    try {
      // Fetch full message for keyword matching (event only carries metadata)
      const message = await this.messageRepo.findByChannelAndMessageId(
        channelId,
        messageId,
      );

      if (!message) {
        this.logger.warn(
          `Message not found: channelId=${channelId}, messageId=${messageId}`,
        );
        return;
      }

      const allKeywords = await this.getEnabledKeywords();
      const keywords = allKeywords.filter(
        (kw) =>
          kw.sourceChannelIds.length === 0 ||
          kw.sourceChannelIds.includes(channelId),
      );

      // Test each keyword against content - find ALL matches
      // Separate simples (andGroupId=null) from compounds (grouped by andGroupId)
      const hasMedia = this.messageHasMedia(message);
      const matchedKeywords = this.findMatchingKeywords(
        keywords,
        message.content,
        hasMedia,
      );

      if (matchedKeywords.length === 0) {
        this.logger.debug(
          `No keyword matched: channelId=${channelId}, messageId=${messageId}, title=${title ?? '(none)'}`,
        );
        return;
      }

      // Check blacklist AFTER keyword match, BEFORE enqueue.
      // If the blacklist repo fails (e.g. transient error), we proceed as-if
      // no blacklist matched — a blacklist outage must not block publication.
      let blockingPhrases: readonly BlacklistPhrase[] = [];
      try {
        blockingPhrases = await this.checkBlacklist(
          channelId,
          message.content,
          hasMedia,
        );
      } catch (blErr) {
        this.logger.warn(
          `Blacklist check failed, proceeding without blocking: channelId=${channelId}, messageId=${messageId}, title=${title ?? '(none)'}: ${(blErr as Error).message}`,
        );
      }

      if (blockingPhrases.length > 0) {
        // Message matched a keyword but also matched a blacklist phrase - block it
        const reason = blockingPhrases.map((p) => p.phrase).join(', ');
        const imagePaths = await this.collectAlbumImagePaths(message);
        const entry = PublisherQueueEntry.create({
          channelId: message.channelId,
          messageId: message.messageId,
          rawContent: message.content,
          rawTitle: message.title,
          imagePaths,
          groupedId: message.groupedId,
          messageReceivedAt: new Date(),
          matchedKeywordIds: matchedKeywords.map((k) => k.id),
          keywordTemplateId: matchedKeywords[0]?.templateId ?? null,
        });
        // Override status to BLOCKED and set blockedReason
        (
          entry as unknown as {
            state: { status: string; blockedReason: string };
          }
        ).state = {
          ...(
            entry as unknown as {
              state: { status: string; blockedReason: string };
            }
          ).state,
          status: 'BLOCKED',
          blockedReason: reason,
        };
        await this.queueRepo.enqueue(entry);
        this.logger.debug(
          `Message blocked: channelId=${channelId}, messageId=${messageId}, title=${title ?? '(none)'}, keyword="${matchedKeywords.map((k) => k.phrase).join(',')}", blacklist="${reason}"`,
        );
        return;
      }

      // DEDUP: Run dedup pipeline after keyword match + blacklist pass
      // If the dedup service fails (e.g., transient error), we proceed as-if
      // no duplicate was found — a dedup outage must not block publication.
      const source = 'crypto-news-publisher';
      const content = message.content || '';

      try {
        // Level 1: Exact match check
        const exactResult = await this.deduplicationService.checkExact(
          source,
          channelId,
          messageId,
        );
        if (exactResult.isDuplicate) {
          this.logger.debug(
            `Dedup exact match: channelId=${channelId}, messageId=${messageId}`,
          );
          await this.createBlockedEntry(
            message,
            matchedKeywords,
            exactResult.blockedReason ?? 'Duplicate: exact match',
            exactResult.existingRecord?.channelId,
            exactResult.existingRecord?.messageId,
            exactResult.existingRecord?.id,
          );
          return;
        }

        // Level 2: Content hash check
        const contentResult = await this.deduplicationService.checkContent(
          source,
          content,
        );
        if (contentResult.isDuplicate) {
          this.logger.debug(
            `Dedup content match: channelId=${channelId}, messageId=${messageId}`,
          );
          await this.createBlockedEntry(
            message,
            matchedKeywords,
            contentResult.blockedReason ?? 'Duplicate: content match',
            contentResult.existingRecord?.channelId,
            contentResult.existingRecord?.messageId,
            contentResult.existingRecord?.id,
          );
          return;
        }

        // Level 3: URL check (now returns urlOverlapCount as signal, not hard block)
        const urlResult = await this.deduplicationService.checkUrl(
          source,
          content,
        );
        const urlOverlapCount = urlResult.urlOverlapCount ?? 0;

        // Level 4: Semantic check (pass urlOverlapCount as signal to scorer)
        const semanticResult = await this.deduplicationService.checkSemantic(
          source,
          content,
          channelId,
          messageId,
          urlOverlapCount,
        );

        if (semanticResult.isDuplicate) {
          this.logger.debug(
            `Dedup semantic match: channelId=${channelId}, messageId=${messageId}`,
          );
          await this.createBlockedEntry(
            message,
            matchedKeywords,
            semanticResult.blockedReason ?? 'Duplicate: semantic match',
            semanticResult.existingRecord?.channelId,
            semanticResult.existingRecord?.messageId,
            semanticResult.existingRecord?.id,
          );
          return;
        }

        // Handle UPDATE case - event is related but adds new info
        if (semanticResult.eventRelation === 'update') {
          // Mark the current message as seen with reference to the existing record
          if (semanticResult.existingRecord) {
            await this.deduplicationService.markAsSeen(
              source,
              channelId,
              messageId,
              content,
              semanticResult.embedding,
              semanticResult.existingRecord.id,
            );
          }
          // Proceed to enqueue but it's an UPDATE
          this.logger.debug(
            `Dedup update: channelId=${channelId}, messageId=${messageId}, referencedEntryId=${semanticResult.existingRecord?.id}`,
          );
        } else {
          await this.deduplicationService.markAsSeen(
            source,
            channelId,
            messageId,
            content,
            semanticResult.embedding,
          );
        }
      } catch (dedupErr) {
        this.logger.warn(
          `Dedup check failed, proceeding without dedup: channelId=${channelId}, messageId=${messageId}, title=${title ?? '(none)'}: ${(dedupErr as Error).message}`,
        );
      }

      // Pass all matched keywords so their `templateId` is frozen onto the
      // queue entry — a later template edit cannot retroactively
      // re-route an already-queued entry.
      const entry = await this.enqueue.execute({
        message,
        matchedKeywords,
      });

      if (!entry) {
        return;
      }

      this.logger.log(
        `Keyword matched and enqueued: channelId=${channelId}, messageId=${messageId}, title=${title ?? '(none)'}, keywords="${matchedKeywords.map((k) => k.phrase).join(',')}", queueId=${entry.id}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to process crypto-news message: channelId=${channelId}, messageId=${messageId}, title=${title ?? '(none)'}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // Fail open: don't re-throw. A failed match shouldn't block the pipeline.
    }
  }

  /**
   * Collect file paths from the message's own media, then (when the
   * message belongs to a Telegram album) also fetch sibling messages
   * in the same album group and merge their media paths. Deduplicates
   * by path. Returns a flat, unique array of absolute file paths.
   *
   * Shared logic with `EnqueueMatchingMessageUseCase.collectAlbumImagePaths`.
   */
  private async collectAlbumImagePaths(
    message: CryptoNewsMessage,
  ): Promise<string[]> {
    const ownPaths = message.media
      .map((m) => m.filePath)
      .filter((p): p is string => p !== null && p !== undefined);
    if (!message.groupedId) {
      return ownPaths;
    }
    try {
      const siblings = await this.messageRepo.findByChannelAndGroupedId(
        message.channelId,
        message.groupedId,
      );
      const siblingPaths = siblings
        .filter((s) => s.messageId !== message.messageId)
        .flatMap((s) =>
          s.media
            .map((m) => m.filePath)
            .filter((p): p is string => p !== null && p !== undefined),
        );
      return [...new Set([...ownPaths, ...siblingPaths])];
    } catch (err) {
      this.logger.warn(
        `Failed to fetch grouped siblings for ${message.channelId}:${message.messageId} (groupedId=${message.groupedId}): ${(err as Error).message} — falling back to own media only`,
      );
      return ownPaths;
    }
  }

  private async createBlockedEntry(
    message: CryptoNewsMessage,
    matchedKeywords: Keyword[],
    blockedReason: string,
    duplicateOfChannelId?: string,
    duplicateOfMessageId?: number,
    duplicateOfEntryId?: string,
  ): Promise<void> {
    const imagePaths = await this.collectAlbumImagePaths(message);
    const entry = PublisherQueueEntry.create({
      channelId: message.channelId,
      messageId: message.messageId,
      rawContent: message.content,
      rawTitle: message.title,
      imagePaths,
      groupedId: message.groupedId,
      messageReceivedAt: new Date(),
      matchedKeywordIds: matchedKeywords.map((k) => k.id),
      keywordTemplateId: matchedKeywords[0]?.templateId ?? null,
    });
    (
      entry as unknown as {
        state: {
          status: string;
          blockedReason: string;
          duplicateOfChannelId: string | null;
          duplicateOfMessageId: number | null;
          duplicateOfEntryId: string | null;
        };
      }
    ).state = {
      ...(
        entry as unknown as {
          state: {
            status: string;
            blockedReason: string;
            duplicateOfChannelId: string | null;
            duplicateOfMessageId: number | null;
            duplicateOfEntryId: string | null;
          };
        }
      ).state,
      status: 'BLOCKED',
      blockedReason,
      duplicateOfChannelId: duplicateOfChannelId ?? null,
      duplicateOfMessageId: duplicateOfMessageId ?? null,
      duplicateOfEntryId: duplicateOfEntryId ?? null,
    };
    await this.queueRepo.enqueue(entry);
  }

  /**
   * Get enabled keywords, using a simple TTL cache.
   */
  private async getEnabledKeywords(): Promise<readonly Keyword[]> {
    const now = Date.now();

    if (
      this.cachedKeywords.length === 0 ||
      now - this.keywordCacheTimestamp >
        CryptoNewsMessageIngestedHandler.KEYWORD_CACHE_TTL_MS
    ) {
      this.cachedKeywords = await this.keywordRepo.findEnabled();
      this.keywordCacheTimestamp = now;
      this.logger.debug(
        `Refreshed keyword cache: ${this.cachedKeywords.length} enabled keywords`,
      );
    }

    return this.cachedKeywords;
  }

  /**
   * Get enabled blacklist phrases, using a simple TTL cache.
   */
  private async getEnabledBlacklistPhrases(): Promise<
    readonly BlacklistPhrase[]
  > {
    const now = Date.now();

    if (
      this.cachedBlacklistPhrases.length === 0 ||
      now - this.blacklistCacheTimestamp >
        CryptoNewsMessageIngestedHandler.BLACKLIST_CACHE_TTL_MS
    ) {
      this.cachedBlacklistPhrases = await this.blacklistRepo.findEnabled();
      this.blacklistCacheTimestamp = now;
      this.logger.debug(
        `Refreshed blacklist cache: ${this.cachedBlacklistPhrases.length} enabled phrases`,
      );
    }

    return this.cachedBlacklistPhrases;
  }

  /**
   * Check if message content matches any blacklist phrase applicable to the channel.
   * Returns all matching BlacklistPhrases (empty array if none).
   */
  private async checkBlacklist(
    channelId: string,
    content: string,
    hasMedia: boolean,
  ): Promise<readonly BlacklistPhrase[]> {
    const allBlacklist = await this.getEnabledBlacklistPhrases();

    const applicableBlacklist = allBlacklist.filter((phrase) =>
      phrase.isApplicableTo(channelId),
    );

    return this.findMatchingBlacklistPhrases(
      applicableBlacklist,
      content,
      hasMedia,
    );
  }

  private messageHasMedia(message: CryptoNewsMessage): boolean {
    return message.media.length > 0;
  }

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
