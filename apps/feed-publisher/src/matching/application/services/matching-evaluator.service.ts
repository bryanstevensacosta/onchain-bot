import { Injectable, Logger } from '@nestjs/common';
import type { FeedMessage } from '../../domain/feed-message';
import type { FeedMedia } from '../../domain/feed-message';
import type { Keyword } from '../../../keywords/domain/keyword.entity';
import type { BlacklistPhrase } from '../../../keywords/domain/blacklist-phrase.entity';
import type { ChannelFilterRule } from '../../../filters/application/ports/channel-filter.repository';
import { AllowedKeywordMatcher } from '../../../keywords/application/services/keyword-matcher.service';
import { BlacklistMatcher } from '../../../keywords/application/services/blacklist-matcher.service';
import { ContentFilterService } from '../../../filters/application/services/content-filter.service';

export interface FilteredFeedMessage extends FeedMessage {
  /** Content AFTER per-channel regex transforms (on-read, never persisted). */
  readonly content: string;
  /** Allowed keywords that triggered inclusion (template binding at publish). */
  readonly matchedKeywords: Keyword[];
  /** True when the message carries photo/video (never link previews). */
  readonly hasMedia: boolean;
}

export interface MessageMatchResult {
  readonly matched: boolean;
  readonly blocked: boolean;
  readonly filteredTitle: string | null;
  readonly filteredContent: string;
  readonly matchedKeywords: Keyword[];
  readonly blockedBy: BlacklistPhrase[];
  readonly hasMedia: boolean;
}

/**
 * Pure match core: filter-transform then allowed-match then blacklist-block.
 *
 * Stateless and side-effect free (no I/O): FilteredFeedService owns
 * fetching, EvaluateMessageMatchUseCase owns rule loading. Album siblings
 * sharing (channelId, groupedId) collapse to a single entry whose media is
 * the union of the batch siblings, ordered by (messageId, index); each
 * item keeps its original per-message index (ingestion file URLs key off
 * it — reindexing breaks resolution).
 */
@Injectable()
export class MatchingEvaluator {
  private readonly logger = new Logger(MatchingEvaluator.name);
  private readonly allowed = new AllowedKeywordMatcher();
  private readonly blocked = new BlacklistMatcher();
  private readonly transforms = new ContentFilterService();

  public evaluateMessage(
    raw: FeedMessage,
    keywords: readonly Keyword[],
    blacklist: readonly BlacklistPhrase[],
    filters: ReadonlyArray<ChannelFilterRule>,
  ): MessageMatchResult {
    const { title: filteredTitle, content: filteredContent } =
      this.transforms.filterTitleAndContent(raw.title, raw.content, filters);
    const hasMedia = raw.media.some(
      (m) => m.type === 'photo' || m.type === 'video',
    );
    const matchedKeywords = this.allowed.findMatches(
      keywords,
      filteredContent,
      hasMedia,
      raw.channelId,
    );
    if (matchedKeywords.length === 0) {
      this.logger.debug(
        `No keyword matched: channelId=${raw.channelId}, messageId=${raw.messageId}`,
      );
      return {
        matched: false,
        blocked: false,
        filteredTitle,
        filteredContent,
        matchedKeywords: [],
        blockedBy: [],
        hasMedia,
      };
    }
    const blockedBy = this.blocked.findMatches(
      blacklist,
      filteredContent,
      hasMedia,
      raw.channelId,
    );
    if (blockedBy.length > 0) {
      this.logger.debug(
        `Message blocked by blacklist: channelId=${raw.channelId}, messageId=${raw.messageId}`,
      );
      return {
        matched: false,
        blocked: true,
        filteredTitle,
        filteredContent,
        matchedKeywords,
        blockedBy: [...blockedBy],
        hasMedia,
      };
    }
    return {
      matched: true,
      blocked: false,
      filteredTitle,
      filteredContent,
      matchedKeywords,
      blockedBy: [],
      hasMedia,
    };
  }

  public toFilteredMessage(
    raw: FeedMessage,
    result: MessageMatchResult,
  ): FilteredFeedMessage {
    return {
      ...raw,
      title: result.filteredTitle,
      content: result.filteredContent,
      matchedKeywords: result.matchedKeywords,
      hasMedia: result.hasMedia,
    };
  }

  public mergeAlbumGroups(
    matched: ReadonlyArray<FilteredFeedMessage>,
    rawBatch: ReadonlyArray<FeedMessage>,
  ): FilteredFeedMessage[] {
    const acceptedGroups = new Set<string>();
    const out: FilteredFeedMessage[] = [];
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
      const merged: FeedMedia[] = [];
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
}
