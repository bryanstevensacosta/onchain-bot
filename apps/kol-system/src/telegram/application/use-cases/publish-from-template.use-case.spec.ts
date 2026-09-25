import { PublishFromTemplateUseCase } from './publish-from-template.use-case';
import { InMemoryPublishingJobRepository } from '../../infrastructure/repositories/in-memory-publishing-job.repository';
import { InMemoryCallApprovalRepository } from '../../../approval/infrastructure/repositories/in-memory-call-approval.repository';
import { InMemoryTemplateRepository } from '../../../templates/infrastructure/repositories/in-memory-template.repository';
import { InMemoryTelegramBotRepository } from '../../../templates/infrastructure/repositories/in-memory-telegram-bot.repository';
import { PublishingTemplate } from '../../../templates/domain/entities/publishing-template.entity';
import { TelegramBot } from '../../../templates/domain/entities/telegram-bot.entity';
import { VipMessageFormatter } from '../../infrastructure/formatters/vip-message-formatter';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { TelegramPublisherPort } from '../../domain/ports/telegram-publisher.port';
import type { BotTokenResolverPort } from '../../domain/ports/bot-token-resolver.port';

function publisherStub() {
  const sent: Array<{ chatId: string; text: string }> = [];
  const port: TelegramPublisherPort = {
    sendMessage: async (input) => {
      sent.push({ chatId: input.chatId, text: input.text });
      return { ok: true, messageId: 7, error: null };
    },
  } as TelegramPublisherPort;
  return { port, sent };
}

async function setup() {
  const jobs = new InMemoryPublishingJobRepository();
  const approvals = new InMemoryCallApprovalRepository();
  const templates = new InMemoryTemplateRepository();
  const bots = new InMemoryTelegramBotRepository();
  await templates.save(
    PublishingTemplate.create({ id: 'vip-calls', name: 'vip-calls' }),
  );
  return { jobs, approvals, templates, bots };
}

const baseInput = {
  templateId: 'vip-calls',
  mentionId: 'solana:ABC:k1:1:0',
  ticker: 'BONK',
  chain: 'solana',
  address: 'ABC',
};

describe('PublishFromTemplateUseCase (todo 11, failing-first)', () => {
  it('publishes via the template catalog bot when verified', async () => {
    const { jobs, approvals, templates, bots } = await setup();
    const tpl = (await templates.findById('vip-calls'))!;
    tpl.assignChannel('bot-1', '@mirror');
    tpl.markChannelVerified();
    await templates.save(tpl);
    await bots.save(
      TelegramBot.create({ id: 'bot-1', label: 'b', encryptedToken: 'x' }),
    );
    const { port, sent } = publisherStub();
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async () => 'TOKEN-1',
    };
    const uc = new PublishFromTemplateUseCase(
      jobs,
      approvals,
      templates,
      resolver,
      port,
      new VipMessageFormatter(),
    );
    const out = await uc.execute(baseInput);
    expect(out.published).toBe(true);
    expect(out.messageId).toBe(7);
    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe('@mirror');
    expect(sent[0].text).toContain('$BONK');
    expect(await jobs.count()).toBe(1);
  });

  it('degrades to dashboard-only when the template has no bot (no Telegram call)', async () => {
    const { jobs, approvals, templates } = await setup();
    const { port, sent } = publisherStub();
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async () => {
        throw new DomainError(ErrorCode.UNAUTHORIZED, 'nope');
      },
    };
    const uc = new PublishFromTemplateUseCase(
      jobs,
      approvals,
      templates,
      resolver,
      port,
      new VipMessageFormatter(),
    );
    const out = await uc.execute(baseInput);
    expect(out.published).toBe(false);
    expect(out.reason).toBe('BOT_NOT_CONFIGURED');
    expect(sent).toHaveLength(0);
    expect(await jobs.count()).toBe(0);
  });

  it('rejects a null ticker pre-publisher without posting', async () => {
    const { jobs, approvals, templates, bots } = await setup();
    const tpl = (await templates.findById('vip-calls'))!;
    tpl.assignChannel('bot-1', '@mirror');
    tpl.markChannelVerified();
    await templates.save(tpl);
    await bots.save(
      TelegramBot.create({ id: 'bot-1', label: 'b', encryptedToken: 'x' }),
    );
    const { port, sent } = publisherStub();
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async () => 'TOKEN-1',
    };
    const uc = new PublishFromTemplateUseCase(
      jobs,
      approvals,
      templates,
      resolver,
      port,
      new VipMessageFormatter(),
    );
    await expect(uc.execute({ ...baseInput, ticker: null })).rejects.toThrow(
      /ticker must be resolved before publishing/,
    );
    expect(sent).toHaveLength(0);
  });

  it('surfaces missing catalog token as UNAUTHORIZED without posting (adversarial)', async () => {
    const { jobs, approvals, templates } = await setup();
    const tpl = (await templates.findById('vip-calls'))!;
    tpl.assignChannel('ghost-bot', '@mirror');
    tpl.markChannelVerified();
    await templates.save(tpl);
    const { port, sent } = publisherStub();
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async (botId: string) => {
        throw new DomainError(
          'UNAUTHORIZED',
          `bot not configured: ${botId} (dashboard-only, no post attempted)`,
        );
      },
    };
    const uc = new PublishFromTemplateUseCase(
      jobs,
      approvals,
      templates,
      resolver,
      port,
      new VipMessageFormatter(),
    );
    await expect(uc.execute(baseInput)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(sent).toHaveLength(0);
  });

  it('vip-calls seed can publish once a bot is assigned (P14)', async () => {
    const { templates } = await setup();
    const before = (await templates.findById('vip-calls'))!;
    expect(before.canPublish()).toBe(false);
    before.assignChannel('bot-1', '@mirror');
    before.markChannelVerified();
    expect(before.canPublish()).toBe(true);
  });
});
