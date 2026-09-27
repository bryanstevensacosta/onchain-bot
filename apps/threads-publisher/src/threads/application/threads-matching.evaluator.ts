import { Injectable } from '@nestjs/common';
import { ThreadsKeyword } from '../domain/threads-keyword.entity';
import { ThreadsBlacklistPhrase } from '../domain/threads-blacklist-phrase.entity';

/**
 * Matching evaluator (backend parity): keywords AND-groups, blacklist block.
 */
@Injectable()
export class ThreadsMatchingEvaluator {
  public evaluate(input: {
    text: string;
    keywords: ThreadsKeyword[];
    blacklist: ThreadsBlacklistPhrase[];
  }): { matched: boolean; matchedIds: string[]; blocked: boolean } {
    const text = input.text ?? '';
    for (const b of input.blacklist) {
      if (b.blocksText(text)) {
        return { matched: false, matchedIds: [], blocked: true };
      }
    }
    const matchedIds = input.keywords
      .filter((k) => k.matchesText(text))
      .map((k) => k.id);
    return { matched: matchedIds.length > 0, matchedIds, blocked: false };
  }
}
