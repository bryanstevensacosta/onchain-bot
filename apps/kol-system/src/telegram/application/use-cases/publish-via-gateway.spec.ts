import { PublishFromTemplateUseCase } from './publish-from-template.use-case';
import { ManualPublishUseCase } from './manual-publish.use-case';
import { InMemoryPublishingJobRepository } from '../../infrastructure/repositories/in-memory-publishing-job.repository';
import { InMemoryCallApprovalRepository } from '../../../approval/infrastructure/repositories/in-memory-call-approval.repository';
import { InMemoryTemplateRepository } from '../../../templates/infrastructure/repositories/in-memory-template.repository';
import { PublishingTemplate } from '../../../templates/domain/entities/publishing-template.entity';
import { VipMessageFormatter } from '../../infrastructure/formatters/vip-message-formatter';
import type { TelegramPublisherPort } from '../../domain/ports/telegram-publisher.port';
import type { BotTokenResolverPort } from '../../domain/ports/bot-token-resolver.port';
import type { BotsGatewaySenderPort } from '../../domain/ports/bots-gateway-sender.port';
import { DualSendParityService } from '../services/dual-send-parity.service';
import { GatewayBotMappingService } from '../../infrastructure/gateway/gateway-bot-mapping.service';

function telegramConfig(mode: 'direct' | 'dual' | 'gateway') {
  return {
    get: (_key: string) => ({
      botToken: '',
      apiKey: '',
      botsGateway: {
        baseUrl: 'http://gateway:4070',
        clientId: 'kol-system',
        clientSecret: 's3cret',
        publishMode: mode,
      },
    }),
  } as never;
}

function directStub() {
  const sent: Array<{ chatId: string; text: string }> = [];
  const port: TelegramPublisherPort = {
    sendMessage: async (input) => {
      sent.push({ chatId: input.chatId, text: input.text });
      return { ok: true, messageId: 7, error: null };
    },
  } as TelegramPublisherPort;
  return { port, sent };
}

function gatewayStub() {
  const sent: Array<{ botId: string; chatId: string; text: string }> = [];
  const port: BotsGatewaySenderPort = {
    sendViaGateway: async (input) => {
      sent.push({ botId: input.botId, chatId: input.chatId, text: input.text });
      return { ok: true, messageId: 4242, error: null };
    },
  } as BotsGatewaySenderPort;
  return { port, sent };
}

async function templateSetup() {
  const jobs = new InMemoryPublishingJobRepository();
  const approvals = new InMemoryCallApprovalRepository();
  const templates = new InMemoryTemplateRepository();
  await templates.save(
    PublishingTemplate.create({ id: 'vip-calls', name: 'vip-calls' }),
  );
  const tpl = (await templates.findById('vip-calls'))!;
  tpl.assignChannel('bot-1', '@mirror');
  tpl.markChannelVerified();
  await templates.save(tpl);
  return { jobs, approvals, templates };
}

const baseInput = {
  templateId: 'vip-calls',
  mentionId: 'solana:ABC:k1:1:0',
  ticker: 'BONK',
  chain: 'solana',
  address: 'ABC',
};

describe('gateway publish modes (gateway todo 4, failing-first)', () => {
  it('gateway mode sends ONLY via the gateway (no direct call, no token resolution)', async () => {
    const { jobs, approvals, templates } = await templateSetup();
    const { port: direct, sent: directSent } = directStub();
    const { port: gateway, sent: gatewaySent } = gatewayStub();
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async () => {
        throw new Error('must not resolve tokens in gateway mode');
      },
    };
    const uc = new PublishFromTemplateUseCase(
      jobs,
      approvals,
      templates,
      resolver,
      direct,
      new VipMessageFormatter(),
      undefined,
      gateway,
      new DualSendParityService(),
      new GatewayBotMappingService(),
      telegramConfig('gateway'),
    );
    const out = await uc.execute(baseInput);
    expect(out.published).toBe(true);
    expect(out.messageId).toBe(4242);
    expect(directSent).toHaveLength(0);
    expect(gatewaySent).toHaveLength(1);
    expect(gatewaySent[0]).toMatchObject({ botId: 'bot-1', chatId: '@mirror' });
  });

  it('dual mode sends via both legs and records parity (returns the direct leg)', async () => {
    const { jobs, approvals, templates } = await templateSetup();
    const { port: direct, sent: directSent } = directStub();
    const { port: gateway, sent: gatewaySent } = gatewayStub();
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async () => 'TOKEN-1',
    };
    const parity = new DualSendParityService();
    const uc = new PublishFromTemplateUseCase(
      jobs,
      approvals,
      templates,
      resolver,
      direct,
      new VipMessageFormatter(),
      undefined,
      gateway,
      parity,
      new GatewayBotMappingService(),
      telegramConfig('dual'),
    );
    const out = await uc.execute(baseInput);
    expect(out.published).toBe(true);
    expect(out.messageId).toBe(7);
    expect(directSent).toHaveLength(1);
    expect(gatewaySent).toHaveLength(1);
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 0 });
  });

  it('dual mode records a divergence when the gateway leg fails (no cutover)', async () => {
    const { jobs, approvals, templates } = await templateSetup();
    const { port: direct } = directStub();
    const failingGateway: BotsGatewaySenderPort = {
      sendViaGateway: async () => ({
        ok: false,
        messageId: null,
        error: 'connect refused',
      }),
    } as BotsGatewaySenderPort;
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async () => 'TOKEN-1',
    };
    const parity = new DualSendParityService();
    const uc = new PublishFromTemplateUseCase(
      jobs,
      approvals,
      templates,
      resolver,
      direct,
      new VipMessageFormatter(),
      undefined,
      failingGateway,
      parity,
      new GatewayBotMappingService(),
      telegramConfig('dual'),
    );
    const out = await uc.execute(baseInput);
    expect(out.published).toBe(true);
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 1 });
    expect(() => parity.assertNoDivergence()).toThrow();
  });

  it('manual publish in gateway mode never resolves the catalog token', async () => {
    const jobs = new InMemoryPublishingJobRepository();
    const { port: direct, sent: directSent } = directStub();
    const { port: gateway, sent: gatewaySent } = gatewayStub();
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async () => {
        throw new Error('must not resolve tokens in gateway mode');
      },
    };
    const uc = new ManualPublishUseCase(
      jobs,
      resolver,
      direct,
      new VipMessageFormatter(),
      undefined,
      undefined,
      gateway,
      new DualSendParityService(),
      new GatewayBotMappingService(),
      telegramConfig('gateway'),
    );
    const out = await uc.execute({
      botId: 'bot-9',
      channelTarget: '@ops',
      ticker: 'BONK',
      chain: 'solana',
      address: 'ABC',
    });
    expect(out.messageId).toBe(4242);
    expect(directSent).toHaveLength(0);
    expect(gatewaySent).toHaveLength(1);
  });

  it('manual publish in dual mode runs both legs and records parity', async () => {
    const jobs = new InMemoryPublishingJobRepository();
    const { port: direct, sent: directSent } = directStub();
    const { port: gateway, sent: gatewaySent } = gatewayStub();
    const resolver: BotTokenResolverPort = {
      resolveBotToken: async () => 'TOKEN-1',
    };
    const parity = new DualSendParityService();
    const uc = new ManualPublishUseCase(
      jobs,
      resolver,
      direct,
      new VipMessageFormatter(),
      undefined,
      undefined,
      gateway,
      parity,
      new GatewayBotMappingService(),
      telegramConfig('dual'),
    );
    const out = await uc.execute({
      botId: 'bot-9',
      channelTarget: '@ops',
      ticker: 'BONK',
      chain: 'solana',
      address: 'ABC',
    });
    expect(out.messageId).toBe(7);
    expect(directSent).toHaveLength(1);
    expect(gatewaySent).toHaveLength(1);
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 0 });
  });
});
