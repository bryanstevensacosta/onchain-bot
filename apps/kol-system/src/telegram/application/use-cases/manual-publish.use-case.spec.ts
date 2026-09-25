import { ManualPublishUseCase } from './manual-publish.use-case';
import { DomainError } from '../../../shared/kernel/domain-error';
import { InMemoryPublishingJobRepository } from '../../infrastructure/repositories/in-memory-publishing-job.repository';
import { VipMessageFormatter } from '../../infrastructure/formatters/vip-message-formatter';
import type { TelegramPublisherPort } from '../../domain/ports/telegram-publisher.port';
import type { BotTokenResolverPort } from '../../domain/ports/bot-token-resolver.port';

describe('ManualPublishUseCase (todo 11, failing-first)', () => {
  it('publishes with an explicit bot + channel and records the job', async () => {
    const jobs = new InMemoryPublishingJobRepository();
    const sent: string[] = [];
    const publisher = {
      sendMessage: async (input: { text: string }) => {
        sent.push(input.text);
        return { ok: true, messageId: 9, error: null };
      },
    } as unknown as TelegramPublisherPort;
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async () => 'TOKEN',
    };
    const uc = new ManualPublishUseCase(
      jobs,
      resolver,
      publisher,
      new VipMessageFormatter(),
    );
    const out = await uc.execute({
      botId: 'bot-1',
      channelTarget: '@mirror',
      mentionId: 'm1',
      ticker: 'BONK',
      chain: 'solana',
      address: 'ABC',
    });
    expect(out.messageId).toBe(9);
    expect(sent[0]).toContain('$BONK');
    expect(await jobs.count()).toBe(1);
  });

  it('401s without posting when the bot token is missing', async () => {
    const jobs = new InMemoryPublishingJobRepository();
    let posted = 0;
    const publisher = {
      sendMessage: async () => {
        posted += 1;
        return { ok: true, messageId: 1, error: null };
      },
    } as unknown as TelegramPublisherPort;
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async () => {
        throw new DomainError(
          'UNAUTHORIZED',
          'bot not configured: ghost (dashboard-only, no post attempted)',
        );
      },
    };
    const uc = new ManualPublishUseCase(
      jobs,
      resolver,
      publisher,
      new VipMessageFormatter(),
    );
    await expect(
      uc.execute({
        botId: 'ghost',
        channelTarget: '@mirror',
        ticker: 'BONK',
        chain: 'solana',
        address: 'ABC',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(posted).toBe(0);
    expect(await jobs.count()).toBe(0);
  });
});
