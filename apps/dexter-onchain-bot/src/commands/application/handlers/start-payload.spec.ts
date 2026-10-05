import { StartCommandHandler } from './start.handler';
import type { CommandContext } from '@/commands/domain/ports/command-handler.port';
import { DEFAULT_CHAT_SETTINGS } from '@/settings/domain/chat-settings';
import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { MessageTemplate } from '@/templates/domain/message-template.entity';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';

const EVM = '0x1234567890abcdef1234567890abcdef12345678';
const SOL = 'So11111111111111111111111111111111111111112';

function makeContext(): CommandContext {
  return {
    chatId: 42,
    chatType: 'private',
    telegramChatId: '42',
    settings: { ...DEFAULT_CHAT_SETTINGS },
    user: { id: 7, username: 'tester', firstName: 'Test', isBot: false },
    isAdmin: false,
    raw: {},
  };
}

function makeBot() {
  const sent: Array<{ chatId: number; text: string }> = [];
  return {
    sent,
    sendMessage: async (chatId: number, text: string) => {
      sent.push({ chatId, text });
      return { ok: true as const };
    },
    answerCallbackQuery: async () => ({ ok: true as const }),
  };
}

const FIXTURE: ResolvedToken = {
  address: SOL,
  chain: 'solana',
  symbol: 'SOL',
  name: 'Solana',
  marketCapUsd: 1_000_000,
  fdvUsd: 1_000_000,
  priceUsd: 100,
  priceChange24h: 5,
  liquidityUsd: 50_000,
  lockedLiquidityPercent: null,
  burnedPercent: null,
  volume24hUsd: 10_000,
  holders: 1000,
  top10HolderPercent: 10,
  top20HolderPercent: null,
  poolAddress: null,
  source: 'market-data-http',
};

function makeHandler(
  bot: ReturnType<typeof makeBot>,
  resolved: ResolvedToken | null = FIXTURE,
) {
  const pipeline = { resolve: async () => resolved };
  const formatter = {
    formatScanCard: () => ({
      text: 'CARD $SOL',
      truncated: false,
      parseMode: 'MarkdownV2',
    }),
    escapeMarkdownV2: (s: string) => s,
  };
  return {
    pipeline,
    handler: new StartCommandHandler(
      bot as never,
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
    ),
  };
}

describe('/start <payload> (todo 11 deep-link)', () => {
  it('scans a valid EVM payload via the shared full-scan path', async () => {
    const bot = makeBot();
    const { pipeline, handler } = makeHandler(bot);
    const spy = jest.spyOn(pipeline, 'resolve');
    await handler.handle([EVM], makeContext());
    expect(spy).toHaveBeenCalledWith(EVM);
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('CARD $SOL');
  });

  it('scans a valid Solana payload via the shared full-scan path', async () => {
    const bot = makeBot();
    const { pipeline, handler } = makeHandler(bot);
    const spy = jest.spyOn(pipeline, 'resolve');
    await handler.handle([SOL], makeContext());
    expect(spy).toHaveBeenCalledWith(SOL);
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('CARD $SOL');
  });

  it('renders the ACTIVE ca template for a payload (no forked card)', async () => {
    const bot = makeBot();
    const pipeline = { resolve: async () => FIXTURE };
    const formatter = {
      formatScanCard: () => ({
        text: 'BUILT-IN-CARD',
        truncated: false,
        parseMode: 'MarkdownV2' as const,
      }),
      escapeMarkdownV2: (s: string) => s,
    };
    const repo = {
      findActiveByCommand: async () =>
        MessageTemplate.create({
          command: 'ca',
          name: 'full-dexter-v1',
          bodyMarkdown: 'Token ${{symbol}} on {{chain}}',
          isActive: true,
        }),
    };
    const handler = new StartCommandHandler(
      bot as never,
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
      repo as never,
      new TemplateRendererService(),
    );
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('SOL');
    expect(bot.sent[0].text).not.toBe('BUILT-IN-CARD');
  });

  it('answers the legacy text byte-identical for an invalid payload', async () => {
    const bareBot = makeBot();
    const garbageBot = makeBot();
    const { handler: bareHandler } = makeHandler(bareBot);
    const { handler: garbageHandler } = makeHandler(garbageBot);
    await bareHandler.handle([], makeContext());
    await garbageHandler.handle(['hello-world'], makeContext());
    expect(garbageBot.sent).toHaveLength(1);
    expect(garbageBot.sent[0].text).toBe(bareBot.sent[0].text);
    expect(garbageBot.sent[0].text).toMatch(/\/ca/);
    expect(garbageBot.sent[0].text).toMatch(/lookup/i);
  });

  it('answers the legacy text for a payload with no detectable address', async () => {
    const bot = makeBot();
    const { handler } = makeHandler(bot);
    await handler.handle(['!!!'], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toMatch(/Dexter lookup bot/);
  });

  it('reports explicitly when the payload cannot resolve', async () => {
    const bot = makeBot();
    const { handler } = makeHandler(bot, null);
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toMatch(/No se pudo resolver/);
  });
});
