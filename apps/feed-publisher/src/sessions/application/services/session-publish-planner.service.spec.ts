import { ConfigService } from '@nestjs/config';
import { SessionPublishPlanner } from './session-publish-planner.service';
import { PublishingSession } from '../../domain/entities/publishing-session.entity';
import { InMemoryPublishingSessionRepository } from '../../infrastructure/repositories/in-memory-publishing-session.repository';
import { InMemoryTemplateBotRepository } from '../../../template/infrastructure/repositories/in-memory-template-bot.repository';
import { TemplateBot } from '../../../template/domain/entities/template-bot.entity';
import { DeduplicationService } from '../../../deduplication/application/services/deduplication.service';
import { InMemoryDeduplicationStore } from '../../../deduplication/infrastructure/repositories/in-memory-deduplication.store';
import { MockEmbeddingAdapter } from '../../../deduplication/infrastructure/ml/mock-embedding.adapter';
import { ContentNormalizerService } from '../../../deduplication/application/services/content-normalizer.service';
import { UrlNormalizerService } from '../../../deduplication/application/services/url-normalizer.service';
import { ContentHashService } from '../../../deduplication/application/services/content-hash.service';
import { DedupScorerService } from '../../../deduplication/application/services/dedup-scorer.service';
import { SemanticScorerService } from '../../../deduplication/application/services/semantic-scorer.service';

const config = {
  get: (key: string, fallback?: string): string => fallback ?? '',
} as unknown as ConfigService;

const limits = {
  telegram: { publishDelayMs: 0, dailyCap: 20 },
  threads: { publishDelayMs: 0, dailyCap: 20 },
};

async function harness(): Promise<{
  planner: SessionPublishPlanner;
  sessions: InMemoryPublishingSessionRepository;
}> {
  const sessions = new InMemoryPublishingSessionRepository();
  const bots = new InMemoryTemplateBotRepository();
  const bot = TemplateBot.create({
    id: 'tg-1',
    label: 'TG',
    target: 'telegram',
    tokenCiphertext: 'iv:tag:data',
    defaultChatId: '@news',
  });
  bot.markChannelVerified(new Date('2026-09-25T00:00:00Z'));
  await bots.save(bot);
  const dedup = new DeduplicationService(
    new InMemoryDeduplicationStore(),
    new MockEmbeddingAdapter(),
    new ContentNormalizerService(),
    new UrlNormalizerService(),
    new ContentHashService(),
    new DedupScorerService(),
    new SemanticScorerService(),
    config,
  );
  return {
    planner: new SessionPublishPlanner(sessions, bots, dedup),
    sessions,
  };
}

describe('SessionPublishPlanner', () => {
  it('inactive sessions consume and publish nothing', async () => {
    const { planner, sessions } = await harness();
    await sessions.save(
      PublishingSession.create({ name: 'Off', active: false }),
    );
    const plans = await planner.planForMessage(
      {
        channelId: 'c1',
        messageId: 1,
        content: 'fresh alpha',
        sourceId: 'src-a',
      },
      limits,
    );
    expect(plans).toEqual([]);
  });

  it('respects source toggles, keyword gates, and unknown bots per target', async () => {
    const { planner, sessions } = await harness();
    await sessions.save(
      PublishingSession.create({
        name: 'Scoped',
        sourceToggles: { 'src-a': false },
        keywordIds: ['kw-1'],
        telegramTargets: [{ botId: 'ghost-bot', chatId: '@x' }],
      }),
    );
    await expect(
      planner.planForMessage(
        {
          channelId: 'c1',
          messageId: 2,
          content: 'alpha two',
          sourceId: 'src-a',
        },
        limits,
      ),
    ).resolves.toEqual([]);
    await expect(
      planner.planForMessage(
        {
          channelId: 'c1',
          messageId: 3,
          content: 'alpha three',
          sourceId: 'src-b',
          keywordId: 'kw-9',
        },
        limits,
      ),
    ).resolves.toEqual([]);
    await expect(
      planner.planForMessage(
        {
          channelId: 'c1',
          messageId: 4,
          content: 'alpha four',
          sourceId: 'src-b',
          keywordId: 'kw-1',
        },
        limits,
      ),
    ).resolves.toEqual([]);
  });

  it('enforces P38 per-target delay and daily cap (holds, never drops)', async () => {
    const { planner, sessions } = await harness();
    await sessions.save(
      PublishingSession.create({
        name: 'Paced',
        telegramTargets: [{ botId: 'tg-1', chatId: '@news' }],
      }),
    );
    const strict = {
      telegram: { publishDelayMs: 3_600_000, dailyCap: 1 },
      threads: { publishDelayMs: 0, dailyCap: 20 },
    };
    const first = await planner.planForMessage(
      {
        channelId: 'c1',
        messageId: 10,
        content: 'paced one',
        sourceId: 'src-a',
      },
      strict,
      new Date('2026-09-25T10:00:00Z'),
    );
    expect(first).toHaveLength(1);
    const second = await planner.planForMessage(
      {
        channelId: 'c1',
        messageId: 11,
        content: 'paced two',
        sourceId: 'src-a',
      },
      strict,
      new Date('2026-09-25T10:01:00Z'),
    );
    expect(second).toEqual([]);
  });
});
