import { ConfigService } from '@nestjs/config';
import { SessionPublishPlanner } from './application/services/session-publish-planner.service';
import { PublishingSession } from './domain/entities/publishing-session.entity';
import { InMemoryPublishingSessionRepository } from './infrastructure/repositories/in-memory-publishing-session.repository';
import { RecordingSessionPublisher } from './infrastructure/publish/recording-session-publisher.adapter';
import { InMemoryTemplateBotRepository } from '../template/infrastructure/repositories/in-memory-template-bot.repository';
import { TemplateBot } from '../template/domain/entities/template-bot.entity';
import { DeduplicationService } from '../deduplication/application/services/deduplication.service';
import { InMemoryDeduplicationStore } from '../deduplication/infrastructure/repositories/in-memory-deduplication.store';
import { MockEmbeddingAdapter } from '../deduplication/infrastructure/ml/mock-embedding.adapter';
import { ContentNormalizerService } from '../deduplication/application/services/content-normalizer.service';
import { UrlNormalizerService } from '../deduplication/application/services/url-normalizer.service';
import { ContentHashService } from '../deduplication/application/services/content-hash.service';
import { DedupScorerService } from '../deduplication/application/services/dedup-scorer.service';
import { SemanticScorerService } from '../deduplication/application/services/semantic-scorer.service';

const config = {
  get: (key: string, fallback?: string): string => fallback ?? '',
} as unknown as ConfigService;

const limits = {
  telegram: { publishDelayMs: 0, dailyCap: 20 },
  threads: { publishDelayMs: 0, dailyCap: 20 },
};

/**
 * Acceptance: two active sessions with different configs publish to
 * different targets over the SHARED global dedup; the inactive
 * session stays silent.
 */
describe('sessions multi-tab publish (acceptance)', () => {
  it('routes per-session targets with one shared dedup', async () => {
    const sessions = new InMemoryPublishingSessionRepository();
    const bots = new InMemoryTemplateBotRepository();
    const newsBot = TemplateBot.create({
      id: 'tg-news',
      label: 'News',
      target: 'telegram',
      tokenCiphertext: 'iv:tag:data',
      defaultChatId: '@news',
    });
    newsBot.markChannelVerified(new Date('2026-09-25T00:00:00Z'));
    await bots.save(newsBot);
    const digestBot = TemplateBot.create({
      id: 'th-digest',
      label: 'Digest',
      target: 'threads',
      tokenCiphertext: 'iv:tag:data',
      defaultChatId: '@digest',
    });
    digestBot.markChannelVerified(new Date('2026-09-25T00:00:00Z'));
    await bots.save(digestBot);
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
    const planner = new SessionPublishPlanner(sessions, bots, dedup);
    const publisher = new RecordingSessionPublisher();
    await sessions.save(
      PublishingSession.create({
        id: 'tab-news',
        name: 'News Tab',
        telegramTargets: [{ botId: 'tg-news', chatId: '@news' }],
      }),
    );
    await sessions.save(
      PublishingSession.create({
        id: 'tab-digest',
        name: 'Digest Tab',
        threadsTargets: [{ botId: 'th-digest', chatId: '@digest' }],
      }),
    );
    await sessions.save(
      PublishingSession.create({ id: 'tab-off', name: 'Off', active: false }),
    );
    const plans = await planner.planForMessage(
      {
        channelId: 'c1',
        messageId: 100,
        content: 'shared market alpha',
        sourceId: 'src-a',
      },
      limits,
    );
    for (const plan of plans) {
      await publisher.publish(plan);
    }
    const news = publisher.deliveredFor('tab-news');
    const digest = publisher.deliveredFor('tab-digest');
    expect(news).toHaveLength(1);
    expect(news[0]?.target).toBe('telegram');
    expect(digest).toHaveLength(1);
    expect(digest[0]?.target).toBe('threads');
    expect(publisher.deliveredFor('tab-off')).toEqual([]);
    const replay = await planner.planForMessage(
      {
        channelId: 'c1',
        messageId: 100,
        content: 'shared market alpha',
        sourceId: 'src-a',
      },
      limits,
    );
    expect(replay).toEqual([]);
  });
});
