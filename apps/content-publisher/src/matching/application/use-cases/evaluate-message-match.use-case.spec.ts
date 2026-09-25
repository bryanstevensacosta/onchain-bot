import { EvaluateMessageMatchUseCase } from './evaluate-message-match.use-case';
import { MatchingEvaluator } from '../services/matching-evaluator.service';
import { KeywordRepository } from '../../../keywords/application/ports/keyword.repository';
import { BlacklistPhraseRepository } from '../../../keywords/application/ports/blacklist-phrase.repository';
import { ChannelFilterRepository } from '../../../filters/application/ports/channel-filter.repository';
import { Keyword } from '../../../keywords/domain/keyword.entity';

describe('EvaluateMessageMatchUseCase', () => {
  function build() {
    const keywords: KeywordRepository = {
      findAll: jest
        .fn()
        .mockResolvedValue([
          Keyword.create({ phrase: 'etf', matchMode: 'substring' }),
        ]),
      findEnabled: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const blacklist: BlacklistPhraseRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      findEnabled: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const filters: ChannelFilterRepository = {
      findFiltersByChannelId: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
    };
    return new EvaluateMessageMatchUseCase(
      new MatchingEvaluator(),
      keywords,
      blacklist,
      filters,
    );
  }

  it('evaluates a single raw message against live rules', async () => {
    const uc = build();
    const res = await uc.execute({
      channelId: '-1001',
      messageId: 9,
      title: null,
      content: 'spot etf inflows',
      hasMedia: false,
    });
    expect(res.matched).toBe(true);
    expect(res.matchedKeywordIds).toHaveLength(1);
  });

  it('reports no match for unrelated content', async () => {
    const uc = build();
    const res = await uc.execute({
      channelId: '-1001',
      messageId: 10,
      title: null,
      content: 'quiet markets today',
      hasMedia: false,
    });
    expect(res.matched).toBe(false);
    expect(res.blocked).toBe(false);
  });
});
