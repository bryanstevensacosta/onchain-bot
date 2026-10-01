import { PublishFromTemplateUseCase } from './publish-from-template.use-case';
import { ManualPublishUseCase } from './manual-publish.use-case';
import { InMemoryPublishingJobRepository } from '@/telegram/infrastructure/repositories/in-memory-publishing-job.repository';
import { InMemoryCallApprovalRepository } from '@/approval/infrastructure/repositories/in-memory-call-approval.repository';
import { InMemoryTemplateRepository } from '@/templates/infrastructure/repositories/in-memory-template.repository';
import { InMemoryTelegramBotRepository } from '@/templates/infrastructure/repositories/in-memory-telegram-bot.repository';
import { PublishingTemplate } from '@/templates/domain/entities/publishing-template.entity';
import { TelegramBot } from '@/templates/domain/entities/telegram-bot.entity';
import { VipMessageFormatter } from '@/telegram/infrastructure/formatters/vip-message-formatter';
import type { BotTokenResolverPort } from '@/target/telegram-ports';
import type { TelegramPublisherPort } from '@/target/telegram-ports';
import type { TargetDispatcherPort } from '@/target/application/ports/target-dispatcher.port';

const baseInput = {
  templateId: 'vip-calls',
  mentionId: 'solana:ABC:k1:1:0',
  ticker: 'BONK',
  chain: 'solana',
  address: 'ABC',
};

async function verifiedTemplate() {
  const jobs = new InMemoryPublishingJobRepository();
  const approvals = new InMemoryCallApprovalRepository();
  const templates = new InMemoryTemplateRepository();
  const bots = new InMemoryTelegramBotRepository();
  await templates.save(
    PublishingTemplate.create({ id: 'vip-calls', name: 'vip-calls' }),
  );
  const tpl = (await templates.findById('vip-calls'))!;
  tpl.assignChannel('bot-1', '@mirror');
  tpl.markChannelVerified();
  await templates.save(tpl);
  await bots.save(
    TelegramBot.create({ id: 'bot-1', label: 'b', encryptedToken: 'x' }),
  );
  return { jobs, approvals, templates, bots };
}

function dispatcherStub(result: {
  ok: boolean;
  remoteId?: string;
  error?: string;
}) {
  const dispatched: Array<{ target: string; botId: string; chatId: string }> =
    [];
  const targets = {
    dispatch: async (input: {
      target: string;
      botId: string;
      chatId: string;
    }) => {
      dispatched.push({
        target: input.target,
        botId: input.botId,
        chatId: input.chatId,
      });
      return result.ok
        ? { ok: true as const, remoteId: result.remoteId ?? 'thread-1' }
        : { ok: false as const, error: result.error ?? 'threads boom' };
    },
  };
  return { targets, dispatched };
}

describe('publish via target/ threads leg (todo 10)', () => {
  it('PublishFromTemplateUseCase dispatches threads targets to threads-publisher', async () => {
    const { jobs, approvals, templates, bots } = await verifiedTemplate();
    const { targets, dispatched } = dispatcherStub({ ok: true });
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async () => 'TOKEN-1',
    };
    const telegram = {
      sendMessage: async (): Promise<never> => {
        throw new Error('telegram leg must not run for threads targets');
      },
    } as unknown as TelegramPublisherPort;
    const uc = new PublishFromTemplateUseCase(
      jobs,
      approvals,
      templates,
      resolver,
      telegram,
      new VipMessageFormatter(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      targets,
    );
    expect(bots).toBeDefined();
    const out = await uc.execute({ ...baseInput, target: 'threads' });
    expect(out.published).toBe(true);
    expect(out.messageId).toBeNull();
    expect(out.message).toContain('$BONK');
    expect(dispatched).toEqual([
      { target: 'threads', botId: 'bot-1', chatId: '@mirror' },
    ]);
    expect(await jobs.count()).toBe(1);
  });

  it('PublishFromTemplateUseCase marks the job failed when the threads leg fails', async () => {
    const { jobs, approvals, templates } = await verifiedTemplate();
    const { targets } = dispatcherStub({ ok: false });
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async () => 'TOKEN-1',
    };
    const telegram = {
      sendMessage: async () => ({ ok: true, messageId: 1, error: null }),
    } as unknown as TelegramPublisherPort;
    const uc = new PublishFromTemplateUseCase(
      jobs,
      approvals,
      templates,
      resolver,
      telegram,
      new VipMessageFormatter(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      targets,
    );
    const out = await uc.execute({ ...baseInput, target: 'threads' });
    expect(out.published).toBe(false);
    expect(out.reason).toContain('threads boom');
  });

  it('ManualPublishUseCase dispatches threads targets to threads-publisher', async () => {
    const jobs = new InMemoryPublishingJobRepository();
    const { targets, dispatched } = dispatcherStub({ ok: true });
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async () => 'TOKEN',
    };
    const telegram = {
      sendMessage: async (): Promise<never> => {
        throw new Error('telegram leg must not run for threads targets');
      },
    } as unknown as TelegramPublisherPort;
    const uc = new ManualPublishUseCase(
      jobs,
      resolver,
      telegram,
      new VipMessageFormatter(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      targets,
    );
    const out = await uc.execute({
      botId: 'bot-1',
      channelTarget: '@mirror',
      mentionId: 'm1',
      ticker: 'BONK',
      chain: 'solana',
      address: 'ABC',
      target: 'threads',
    });
    expect(out.messageId).toBeNull();
    expect(out.message).toContain('$BONK');
    expect(dispatched).toEqual([
      { target: 'threads', botId: 'bot-1', chatId: '@mirror' },
    ]);
    expect(await jobs.count()).toBe(1);
  });
});
