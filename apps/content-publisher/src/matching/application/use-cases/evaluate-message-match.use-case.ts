import { Injectable } from '@nestjs/common';
import { MatchingEvaluator } from '../services/matching-evaluator.service';
import { KeywordRepository } from '../../../keywords/application/ports/keyword.repository';
import { BlacklistPhraseRepository } from '../../../keywords/application/ports/blacklist-phrase.repository';
import { ChannelFilterRepository } from '../../../filters/application/ports/channel-filter.repository';

export interface EvaluateMessageMatchInput {
  readonly channelId: string;
  readonly messageId: number;
  readonly title: string | null;
  readonly content: string;
  readonly hasMedia: boolean;
}

export interface EvaluateMessageMatchResult {
  readonly matched: boolean;
  readonly blocked: boolean;
  readonly filteredTitle: string | null;
  readonly filteredContent: string;
  readonly matchedKeywordIds: string[];
  readonly blockedByIds: string[];
  readonly hasMedia: boolean;
}

/**
 * Single-message match evaluation against live rules (no feed I/O).
 *
 * Powers admin dry-runs ("would this message match?") and unit-level
 * verification of the rule set without polling the feed.
 */
@Injectable()
export class EvaluateMessageMatchUseCase {
  public constructor(
    private readonly evaluator: MatchingEvaluator,
    private readonly keywordRepo: KeywordRepository,
    private readonly blacklistRepo: BlacklistPhraseRepository,
    private readonly channelFilters: ChannelFilterRepository,
  ) {}

  public async execute(
    input: EvaluateMessageMatchInput,
  ): Promise<EvaluateMessageMatchResult> {
    const [keywords, blacklist, filters] = await Promise.all([
      this.keywordRepo.findAll(),
      this.blacklistRepo.findAll(),
      this.channelFilters.findFiltersByChannelId(input.channelId),
    ]);
    const result = this.evaluator.evaluateMessage(
      {
        channelId: input.channelId,
        messageId: input.messageId,
        title: input.title,
        content: input.content,
        publishedAt: new Date().toISOString(),
        ingestedAt: new Date().toISOString(),
        media: [],
        groupedId: null,
        messageType: 'crypto-news',
      },
      keywords,
      blacklist,
      filters,
    );
    return {
      matched: result.matched,
      blocked: result.blocked,
      filteredTitle: result.filteredTitle,
      filteredContent: result.filteredContent,
      matchedKeywordIds: result.matchedKeywords.map((k) => k.id),
      blockedByIds: result.blockedBy.map((p) => p.id),
      hasMedia: input.hasMedia,
    };
  }
}
