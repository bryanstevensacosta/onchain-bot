import { Injectable } from '@nestjs/common';
import { BlacklistPhrase } from '../../domain/blacklist-phrase.entity';
import { groupByAndGroupId } from './compound-group.evaluator';

/**
 * Block-list matcher: same OR + AND-group shape as the allowed matcher,
 * opposite polarity. Simple phrases match via `checkMatchesWithMedia`
 * (media gate included); AND-groups require every member to match with
 * the group vetoed when any member requires media on a media-less message.
 */
@Injectable()
export class BlacklistMatcher {
  public findMatches(
    phrases: readonly BlacklistPhrase[],
    content: string,
    hasMedia: boolean,
    channelId?: string,
  ): BlacklistPhrase[] {
    const eligible = phrases.filter(
      (p) =>
        p.enabled && (channelId === undefined || p.isApplicableTo(channelId)),
    );
    const { simples, compounds } = groupByAndGroupId(eligible);
    const matched: BlacklistPhrase[] = [];
    for (const phrase of simples) {
      if (phrase.checkMatchesWithMedia(content, hasMedia)) {
        matched.push(phrase);
      }
    }
    for (const [, members] of compounds) {
      if (!members.every((p) => p.matches(content))) {
        continue;
      }
      if (members.some((p) => p.requireMedia) && !hasMedia) {
        continue;
      }
      for (const p of members) {
        if (!matched.some((m) => m.id === p.id)) {
          matched.push(p);
        }
      }
    }
    return matched;
  }
}
