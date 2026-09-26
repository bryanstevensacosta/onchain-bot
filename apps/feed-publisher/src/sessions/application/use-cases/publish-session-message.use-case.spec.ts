import { TemplateBot } from '../../../template/domain/entities/template-bot.entity';
import { InMemoryTemplateBotRepository } from '../../../template/infrastructure/repositories/in-memory-template-bot.repository';
import { ErrorCode } from 'shared/kernel/domain-error';
import { InMemoryPublishingSessionRepository } from '../../infrastructure/repositories/in-memory-publishing-session.repository';
import { RecordingSessionPublisher } from '../../infrastructure/publish/recording-session-publisher.adapter';
import { PublishingSession } from '../../domain/entities/publishing-session.entity';
import { PublishAuditLog } from '../services/publish-audit-log.service';
import { PublishRateLimiter } from '../services/publish-rate-limiter.service';
import { SessionPublishAuthorizer } from '../services/session-publish-authorizer.service';
import { PublishSessionMessageUseCase } from './publish-session-message.use-case';

async function harness(): Promise<{
  useCase: PublishSessionMessageUseCase;
  audit: PublishAuditLog;
  publisher: RecordingSessionPublisher;
}> {
  const sessions = new InMemoryPublishingSessionRepository();
  const bots = new InMemoryTemplateBotRepository();
  const bot = TemplateBot.create({
    id: 'tg-1',
    label: 'News',
    target: 'telegram',
    tokenCiphertext: 'iv:tag:data',
    defaultChatId: '@news',
  });
  bot.markChannelVerified(new Date('2026-09-25T00:00:00Z'));
  await bots.save(bot);
  await sessions.save(
    PublishingSession.create({
      id: 'tab-news',
      name: 'News',
      telegramTargets: [{ botId: 'tg-1', chatId: '@news' }],
    }),
  );
  const publisher = new RecordingSessionPublisher();
  const audit = new PublishAuditLog();
  const useCase = new PublishSessionMessageUseCase(
    sessions,
    new SessionPublishAuthorizer(bots),
    new PublishRateLimiter(10, 60_000),
    publisher,
    audit,
  );
  return { useCase, audit, publisher };
}

describe('PublishSessionMessageUseCase (todo 14, P50)', () => {
  it('publishes a bound session x target and audits it', async () => {
    const { useCase, audit, publisher } = await harness();
    const result = await useCase.execute({
      sessionId: 'tab-news',
      target: 'telegram',
      botId: 'tg-1',
      chatId: '@news',
      content: 'market alpha',
    });
    expect(result.plan.sessionId).toBe('tab-news');
    expect(publisher.deliveredFor('tab-news')).toHaveLength(1);
    expect(audit.list()).toHaveLength(1);
    expect(audit.list()[0]).toMatchObject({ result: 'published' });
  });

  it('resolves the vault id when a gateway mapping is wired (todo 5)', async () => {
    const sessions = new InMemoryPublishingSessionRepository();
    const bots = new InMemoryTemplateBotRepository();
    const bot = TemplateBot.create({
      id: 'tg-1',
      label: 'News',
      target: 'telegram',
      tokenCiphertext: 'iv:tag:data',
      defaultChatId: '@news',
    });
    bot.markChannelVerified(new Date('2026-09-25T00:00:00Z'));
    await bots.save(bot);
    await sessions.save(
      PublishingSession.create({
        id: 'tab-news',
        name: 'News',
        telegramTargets: [{ botId: 'tg-1', chatId: '@news' }],
      }),
    );
    const publisher = new RecordingSessionPublisher();
    const mapping = {
      resolveGatewayId: (id: string): string =>
        id === 'tg-1' ? 'vault-tg-1' : id,
    };
    const useCase = new PublishSessionMessageUseCase(
      sessions,
      new SessionPublishAuthorizer(bots),
      new PublishRateLimiter(10, 60_000),
      publisher,
      new PublishAuditLog(),
      mapping as unknown as import('../../../telegram/infrastructure/gateway/gateway-bot-mapping.service').GatewayBotMappingService,
    );
    const result = await useCase.execute({
      sessionId: 'tab-news',
      target: 'telegram',
      botId: 'tg-1',
      chatId: '@news',
      content: 'market alpha',
    });
    expect(result.plan.botId).toBe('vault-tg-1');
    expect(publisher.deliveredFor('tab-news')[0]?.botId).toBe('vault-tg-1');
  });

  it('404s unknown sessions', async () => {
    const { useCase } = await harness();
    await expect(
      useCase.execute({
        sessionId: 'ghost',
        target: 'telegram',
        botId: 'tg-1',
        chatId: '@news',
        content: 'x',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('403s foreign bindings and audits the block (no publish)', async () => {
    const { useCase, audit, publisher } = await harness();
    await expect(
      useCase.execute({
        sessionId: 'tab-news',
        target: 'telegram',
        botId: 'tg-1',
        chatId: '@evil',
        content: 'hijack',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    expect(publisher.delivered()).toEqual([]);
    expect(audit.list()[0]).toMatchObject({ result: 'blocked' });
  });

  it('429s rate-limited sessions and audits the block (no publish)', async () => {
    const sessions = new InMemoryPublishingSessionRepository();
    const bots = new InMemoryTemplateBotRepository();
    const bot = TemplateBot.create({
      id: 'tg-1',
      label: 'News',
      target: 'telegram',
      tokenCiphertext: 'iv:tag:data',
      defaultChatId: '@news',
    });
    bot.markChannelVerified();
    await bots.save(bot);
    await sessions.save(
      PublishingSession.create({
        id: 'tab-news',
        name: 'News',
        telegramTargets: [{ botId: 'tg-1', chatId: '@news' }],
      }),
    );
    const publisher = new RecordingSessionPublisher();
    const audit = new PublishAuditLog();
    const useCase = new PublishSessionMessageUseCase(
      sessions,
      new SessionPublishAuthorizer(bots),
      new PublishRateLimiter(1, 60_000),
      publisher,
      audit,
    );
    await useCase.execute({
      sessionId: 'tab-news',
      target: 'telegram',
      botId: 'tg-1',
      chatId: '@news',
      content: 'first',
    });
    await expect(
      useCase.execute({
        sessionId: 'tab-news',
        target: 'telegram',
        botId: 'tg-1',
        chatId: '@news',
        content: 'second',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.RATE_LIMITED });
    expect(publisher.delivered()).toHaveLength(1);
    expect(audit.list()[1]).toMatchObject({ result: 'rate-limited' });
  });
});
