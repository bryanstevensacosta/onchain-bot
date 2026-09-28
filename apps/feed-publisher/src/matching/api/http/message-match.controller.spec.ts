import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MessageMatchController } from './message-match.controller';
import { MessageMatchStatusUseCase } from '@/matching/application/use-cases/message-match-status.use-case';
import { MessageMatchVerdictStore } from '@/matching/application/state/message-match-verdict.store';
import { EvaluateMessageMatchUseCase } from '@/matching/application/use-cases/evaluate-message-match.use-case';
import { MatchingEvaluator } from '@/matching/application/services/matching-evaluator.service';
import { FeedPort } from '@/matching/domain/ports/feed.port';
import { QueueManager } from '@/queue/application/services/queue-manager.service';
import { PublisherQueueRepository } from '@/queue/domain/ports/publisher-queue.repository';
import { InMemoryPublisherQueueRepository } from '@/queue/infrastructure/persistence/in-memory/in-memory-publisher-queue.repository';
import { KeywordRepository } from '@/keywords/application/ports/keyword.repository';
import { InMemoryKeywordRepository } from '@/keywords/infrastructure/persistence/in-memory/in-memory-keyword.repository';
import { BlacklistPhraseRepository } from '@/keywords/application/ports/blacklist-phrase.repository';
import { InMemoryBlacklistPhraseRepository } from '@/keywords/infrastructure/persistence/in-memory/in-memory-blacklist-phrase.repository';
import { ChannelFilterRepository } from '@/filters/application/ports/channel-filter.repository';
import { InMemoryChannelFilterRepository } from '@/filters/infrastructure/persistence/in-memory/in-memory-channel-filter.repository';
import { Keyword } from '@/keywords/domain/keyword.entity';

describe('MessageMatchController', () => {
  async function build() {
    const module = await Test.createTestingModule({
      controllers: [MessageMatchController],
      providers: [
        MatchingEvaluator,
        EvaluateMessageMatchUseCase,
        MessageMatchStatusUseCase,
        MessageMatchVerdictStore,
        {
          provide: FeedPort,
          useValue: { fetchRecentMessages: jest.fn().mockResolvedValue([]) },
        },
        QueueManager,
        {
          provide: PublisherQueueRepository,
          useClass: InMemoryPublisherQueueRepository,
        },
        { provide: KeywordRepository, useClass: InMemoryKeywordRepository },
        {
          provide: BlacklistPhraseRepository,
          useClass: InMemoryBlacklistPhraseRepository,
        },
        {
          provide: ChannelFilterRepository,
          useClass: InMemoryChannelFilterRepository,
        },
        {
          provide: ConfigService,
          useValue: { get: (key: string, fallback?: unknown) => fallback },
        },
      ],
    }).compile();
    const controller = module.get(MessageMatchController);
    const keywords = module.get(KeywordRepository);
    return { module, controller, keywords };
  }

  it('dry-runs a real message: match plus blacklist plus applied filters', async () => {
    const { controller, keywords, module } = await build();
    await keywords.save(
      Keyword.create({ phrase: 'etf', matchMode: 'substring' }),
    );
    const res = await controller.evaluate({
      channelId: '-1001',
      messageId: 7,
      title: null,
      content: 'spot etf inflows',
    });
    expect(res.matched).toBe(true);
    expect(res.blocked).toBe(false);
    expect(res.matchedKeywords).toHaveLength(1);
    expect(res.matchedKeywords[0].phrase).toBe('etf');
    expect(res.filteredContent).toBe('spot etf inflows');
    expect(res.reasons.length).toBeGreaterThan(0);
    await module.close();
  });

  it('dry-run reports no match for unrelated content', async () => {
    const { controller, keywords, module } = await build();
    await keywords.save(
      Keyword.create({ phrase: 'etf', matchMode: 'substring' }),
    );
    const res = await controller.evaluate({
      channelId: '-1001',
      messageId: 8,
      title: null,
      content: 'quiet markets today',
    });
    expect(res.matched).toBe(false);
    expect(res.blocked).toBe(false);
    await module.close();
  });

  it('dry-run honors requireMedia via hasMedia', async () => {
    const { controller, keywords, module } = await build();
    await keywords.save(
      Keyword.create({
        phrase: 'etf',
        matchMode: 'substring',
        requireMedia: true,
      }),
    );
    const withoutMedia = await controller.evaluate({
      channelId: '-1001',
      messageId: 9,
      title: null,
      content: 'spot etf inflows',
      hasMedia: false,
    });
    expect(withoutMedia.matched).toBe(false);
    const withMedia = await controller.evaluate({
      channelId: '-1001',
      messageId: 9,
      title: null,
      content: 'spot etf inflows',
      hasMedia: true,
    });
    expect(withMedia.matched).toBe(true);
    await module.close();
  });

  it('status rejects a non-numeric message id', async () => {
    const { controller, module } = await build();
    await expect(controller.getStatus('-1001', 'abc')).rejects.toThrow();
    await module.close();
  });

  it('status badges an unknown message as Not found when the feed is empty', async () => {
    const { controller, module } = await build();
    const status = await controller.getStatus('-1001', '99');
    expect(status.badge).toBe('Not found');
    expect(status.ingested).toBe(false);
    await module.close();
  });
});
