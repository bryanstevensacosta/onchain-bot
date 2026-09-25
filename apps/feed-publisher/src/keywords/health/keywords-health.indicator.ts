import { Injectable } from '@nestjs/common';
import { KeywordRepository } from '../application/ports/keyword.repository';
import { BlacklistPhraseRepository } from '../application/ports/blacklist-phrase.repository';

export interface KeywordsHealth {
  readonly component: string;
  readonly status: 'up' | 'down';
  readonly keywords: number;
  readonly blacklistPhrases: number;
}

/**
 * P21 hook point: keywords health indicator (counts only, no liveness
 * claims beyond repository reachability).
 */
@Injectable()
export class KeywordsHealthIndicator {
  public constructor(
    private readonly keywords: KeywordRepository,
    private readonly blacklist: BlacklistPhraseRepository,
  ) {}

  public async check(): Promise<KeywordsHealth> {
    try {
      const [kws, bls] = await Promise.all([
        this.keywords.findAll(),
        this.blacklist.findAll(),
      ]);
      return {
        component: 'keywords',
        status: 'up',
        keywords: kws.length,
        blacklistPhrases: bls.length,
      };
    } catch {
      return {
        component: 'keywords',
        status: 'down',
        keywords: 0,
        blacklistPhrases: 0,
      };
    }
  }
}
