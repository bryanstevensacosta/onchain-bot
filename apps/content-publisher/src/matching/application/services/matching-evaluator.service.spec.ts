import { MatchingEvaluator } from './matching-evaluator.service';
import { Keyword } from '../../../keywords/domain/keyword.entity';
import { BlacklistPhrase } from '../../../keywords/domain/blacklist-phrase.entity';
import type { CryptoNewsFeedMessage } from '../../domain/crypto-news-feed-message';

function msg(
  channelId: string,
  messageId: number,
  content: string,
  extra?: Partial<CryptoNewsFeedMessage>,
): CryptoNewsFeedMessage {
  return {
    channelId,
    messageId,
    title: null,
    content,
    publishedAt: new Date().toISOString(),
    ingestedAt: new Date().toISOString(),
    media: [],
    groupedId: null,
    messageType: 'crypto-news',
    ...extra,
  };
}

describe('MatchingEvaluator', () => {
  const evaluator = new MatchingEvaluator();

  it('matches on OR keyword and reports matched ids', () => {
    const keywords = [
      Keyword.create({ phrase: 'etf', matchMode: 'substring' }),
    ];
    const res = evaluator.evaluateMessage(
      msg('-1001', 1, 'spot etf inflows'),
      keywords,
      [],
      [],
    );
    expect(res.matched).toBe(true);
    expect(res.matchedKeywords).toHaveLength(1);
    expect(res.blocked).toBe(false);
  });

  it('requires every AND-group member before matching', () => {
    const g = 'g-1';
    const keywords = [
      Keyword.create({ phrase: 'etf', matchMode: 'substring', andGroupId: g }),
      Keyword.create({
        phrase: 'inflow',
        matchMode: 'substring',
        andGroupId: g,
      }),
    ];
    const partial = evaluator.evaluateMessage(
      msg('-1001', 2, 'etf outflows'),
      keywords,
      [],
      [],
    );
    expect(partial.matched).toBe(false);
    const full = evaluator.evaluateMessage(
      msg('-1001', 3, 'etf inflows'),
      keywords,
      [],
      [],
    );
    expect(full.matched).toBe(true);
  });

  it('blacklist blocks an otherwise matching message', () => {
    const keywords = [
      Keyword.create({ phrase: 'airdrop', matchMode: 'substring' }),
    ];
    const blacklist = [
      BlacklistPhrase.create({ phrase: 'scam', matchMode: 'substring' }),
    ];
    const res = evaluator.evaluateMessage(
      msg('-1001', 4, 'airdrop is a scam'),
      keywords,
      blacklist,
      [],
    );
    expect(res.matched).toBe(false);
    expect(res.blocked).toBe(true);
    expect(res.blockedBy).toHaveLength(1);
  });

  it('applies content-filter transforms before matching', () => {
    const keywords = [
      Keyword.create({ phrase: 'bitcoin', matchMode: 'substring' }),
    ];
    const res = evaluator.evaluateMessage(
      msg('-1001', 5, 'BTC breaks out'),
      keywords,
      [],
      [
        {
          pattern: 'BTC',
          replacement: 'bitcoin',
          flags: 'g',
          priority: 0,
          isActive: true,
        },
      ],
    );
    expect(res.matched).toBe(true);
    expect(res.filteredContent).toBe('bitcoin breaks out');
  });

  it('merges album siblings into a single entry with all media', () => {
    const base = msg('-1001', 10, 'etf chart', {
      groupedId: 'album-1',
      media: [{ index: 0, type: 'photo', url: 'u0', mimeType: 'image/jpeg' }],
    });
    const sibling = msg('-1001', 11, '', {
      groupedId: 'album-1',
      media: [{ index: 0, type: 'photo', url: 'u1', mimeType: 'image/jpeg' }],
    });
    const merged = evaluator.mergeAlbumGroups(
      [{ ...base, matchedKeywords: [], hasMedia: true }],
      [base, sibling],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].media).toHaveLength(2);
  });
});
