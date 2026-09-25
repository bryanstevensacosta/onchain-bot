import { Injectable } from '@nestjs/common';
import { Keyword } from '../../domain/keyword.entity';
import { groupByAndGroupId } from './compound-group.evaluator';

/**
 * Allowed-list matcher: OR over simple keywords + AND-groups.
 *
 * A keyword participates only when enabled and applicable to the channel
 * (`sourceChannelIds` empty = every channel). `requireMedia` drops the
 * match for media-less messages (simple) or vetoes the whole group when
 * any member requires media (AND-group).
 */
@Injectable()
export class AllowedKeywordMatcher {
  public findMatches(
    keywords: readonly Keyword[],
    content: string,
    hasMedia: boolean,
    channelId?: string,
  ): Keyword[] {
    const eligible = keywords.filter(
      (kw) =>
        kw.enabled && (channelId === undefined || kw.isApplicableTo(channelId)),
    );
    const { simples, compounds } = groupByAndGroupId(eligible);
    const matched: Keyword[] = [];
    for (const kw of simples) {
      if (kw.matches(content) && (!kw.requireMedia || hasMedia)) {
        matched.push(kw);
      }
    }
    for (const [, members] of compounds) {
      if (!members.every((kw) => kw.matches(content))) {
        continue;
      }
      if (members.some((kw) => kw.requireMedia) && !hasMedia) {
        continue;
      }
      for (const kw of members) {
        if (!matched.some((m) => m.id === kw.id)) {
          matched.push(kw);
        }
      }
    }
    return matched;
  }
}
