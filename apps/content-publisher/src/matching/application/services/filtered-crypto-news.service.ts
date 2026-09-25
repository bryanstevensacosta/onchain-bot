import { Injectable, Logger } from '@nestjs/common';
import { CryptoNewsFeedPort } from '../../domain/ports/crypto-news-feed.port';
import { ChannelFilterRepository } from '../../../filters/application/ports/channel-filter.repository';
import { KeywordRepository } from '../../../keywords/application/ports/keyword.repository';
import { BlacklistPhraseRepository } from '../../../keywords/application/ports/blacklist-phrase.repository';
import {
  MatchingEvaluator,
  type FilteredCryptoNewsMessage,
} from './matching-evaluator.service';

/**
 * Fetch -> filter -> match orchestrator (moved from backend, filter on-read).
 *
 * 1. Fetch typed rows from the feed port (upstream already scoped with
 *    `?type=crypto-news`).
 * 2. Drop non-crypto rows client-side (second P10 barrier: the unified
 *    feed also carries the sibling feed type, which must never enter this
 *    pipeline; rows without a marker pass through for pre-unified fixtures).
 * 3. Per message: load channel rules, transform title+content on-read,
 *    evaluate allowed keywords (OR + AND-groups), then blacklist block.
 * 4. Collapse album groups so one Telegram album yields one entry.
 *
 * Fail-closed per message, fail-open per batch: a poisoned row is skipped,
 * a dead feed yields `[]` (never throws).
 */
@Injectable()
export class FilteredCryptoNewsService {
  private readonly logger = new Logger(FilteredCryptoNewsService.name);

  public constructor(
    private readonly feed: CryptoNewsFeedPort,
    private readonly channelFilters: ChannelFilterRepository,
    private readonly keywordRepo: KeywordRepository,
    private readonly blacklistRepo: BlacklistPhraseRepository,
    private readonly evaluator: MatchingEvaluator = new MatchingEvaluator(),
  ) {}

  public async getMatchingMessages(
    limit = 50,
    channelId?: string,
  ): Promise<ReadonlyArray<FilteredCryptoNewsMessage>> {
    let rawMessages;
    try {
      rawMessages = await this.feed.fetchRecentMessages(limit, channelId);
    } catch (error) {
      this.logger.error(
        `Failed to fetch feed messages: ${(error as Error).message}`,
      );
      return [];
    }
    const cryptoOnly = rawMessages.filter(
      (raw) =>
        (raw as { messageType?: unknown }).messageType === undefined ||
        raw.messageType === 'crypto-news',
    );
    if (cryptoOnly.length === 0) {
      this.logger.debug(
        `No crypto-news rows fetched (limit: ${limit}, channelId: ${channelId ?? 'all'})`,
      );
      return [];
    }
    const [keywords, blacklistPhrases] = await Promise.all([
      this.keywordRepo.findAll(),
      this.blacklistRepo.findAll(),
    ]);
    const matched: FilteredCryptoNewsMessage[] = [];
    for (const raw of cryptoOnly) {
      try {
        const filters = await this.channelFilters.findFiltersByChannelId(
          raw.channelId,
        );
        const result = this.evaluator.evaluateMessage(
          raw,
          keywords,
          blacklistPhrases,
          filters,
        );
        if (result.matched) {
          matched.push(this.evaluator.toFilteredMessage(raw, result));
        }
      } catch (error) {
        this.logger.error(
          `Failed to filter message ${raw.channelId}:${raw.messageId}: ${(error as Error).message}`,
        );
      }
    }
    const filtered = this.evaluator.mergeAlbumGroups(matched, cryptoOnly);
    this.logger.log(
      `Filtered ${cryptoOnly.length} raw messages -> ${filtered.length} matched (keywords + not blacklisted)`,
    );
    return filtered;
  }
}
