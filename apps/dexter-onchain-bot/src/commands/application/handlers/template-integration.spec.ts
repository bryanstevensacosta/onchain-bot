import { CaScanHandler } from './ca.handler';
import { XTokenScanHandler } from './x-token-scan.handler';
import { BareAddressHandler } from './bare-address.handler';
import type { CommandContext } from '@/commands/domain/ports/command-handler.port';
import { DEFAULT_CHAT_SETTINGS } from '@/settings/domain/chat-settings';
import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { MessageTemplate } from '@/templates/domain/message-template.entity';
import type { TemplateCommand } from '@/placeholders/domain/placeholder-registry';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';

const SOL = 'So11111111111111111111111111111111111111112';

const TOKEN: ResolvedToken = {
  address: SOL,
  chain: 'solana',
  symbol: 'SOL',
  name: 'Solana',
  marketCapUsd: 1_000_000,
  fdvUsd: 2_000_000,
  priceUsd: 100,
  priceChange24h: 5,
  liquidityUsd: 50_000,
  lockedLiquidityPercent: null,
  burnedPercent: null,
  volume24hUsd: 10_000,
  holders: 1000,
  top10HolderPercent: 10,
  top20HolderPercent: 20,
  totalSupply: 500_000_000,
  circulatingSupply: 400_000_000,
  maxSupply: 1_000_000_000,
  devWallets: null,
  devPctSupply: null,
  poolAddress: null,
  source: 'market-data-http',
};

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
  const sent: Array<{
    chatId: number;
    text: string;
    options?: Record<string, unknown>;
  }> = [];
  return {
    sent,
    sendMessage: async (
      chatId: number,
      text: string,
      options?: Record<string, unknown>,
    ) => {
      sent.push({ chatId, text, options });
      return { ok: true as const, messageId: 1, error: null };
    },
    answerCallbackQuery: async () => ({ ok: true as const }),
  };
}

function makeRepo(
  actives: Partial<Record<TemplateCommand, MessageTemplate | null>>,
  seen: TemplateCommand[] = [],
) {
  return {
    seen,
    findAll: async () => [],
    findByCommand: async () => [],
    findById: async () => null,
    findActiveByCommand: async (
      cmd: TemplateCommand,
    ): Promise<MessageTemplate | null> => {
      seen.push(cmd);
      return actives[cmd] ?? null;
    },
    save: async (t: MessageTemplate) => t,
    delete: async () => false,
  };
}

const formatter = {
  formatScanCard: () => ({
    text: 'BUILT-IN-CARD',
    truncated: false,
    parseMode: 'MarkdownV2' as const,
  }),
  escapeMarkdownV2: (s: string) => s,
};
const pipeline = { resolve: async () => TOKEN };
const renderer = (): TemplateRendererService => new TemplateRendererService();

const active = (
  command: TemplateCommand,
  name: string,
  bodyMarkdown: string,
): MessageTemplate =>
  MessageTemplate.create({ command, name, bodyMarkdown, isActive: true });

describe('template integration across /ca /x + bare (todo 10)', () => {
  it('/ca renders the active ca template with {{symbol}} substituted', async () => {
    const bot = makeBot();
    const seen: TemplateCommand[] = [];
    const handler = new CaScanHandler(
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
      bot as never,
      makeRepo(
        { ca: active('ca', 'full-dexter-v1', 'CA-CARD ${{symbol}}') },
        seen,
      ) as never,
      renderer() as never,
    );
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('CA-CARD $SOL');
    expect(bot.sent[0].options).toMatchObject({ parse_mode: 'MarkdownV2' });
    expect(bot.sent[0].options).not.toHaveProperty('reply_markup');
    expect(seen).toEqual(['ca']);
  });

  it('/ca without an active template falls back to the built-in card', async () => {
    const bot = makeBot();
    const handler = new CaScanHandler(
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
      bot as never,
      makeRepo({}) as never,
      renderer() as never,
    );
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toBe('BUILT-IN-CARD');
  });

  it('/ca with a broken active template answers an explicit error without crashing', async () => {
    const bot = makeBot();
    const handler = new CaScanHandler(
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
      bot as never,
      makeRepo({
        ca: active('ca', 'broken-v1', 'oops {{xxx}}'),
      }) as never,
      renderer() as never,
    );
    await expect(handler.handle([SOL], makeContext())).resolves.toBeUndefined();
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toMatch(/plantilla activa/);
  });

  it('/x renders its own active template and never looks up ca', async () => {
    const bot = makeBot();
    const seen: TemplateCommand[] = [];
    const handler = new XTokenScanHandler(
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
      bot as never,
      makeRepo(
        {
          ca: active('ca', 'full-dexter-v1', 'CA-CARD ${{symbol}}'),
          x: active('x', 'full-dexter-v1', 'X-CARD ${{symbol}}'),
        },
        seen,
      ) as never,
      renderer() as never,
    );
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('X-CARD $SOL');
    expect(seen).toEqual(['x']);
  });

  it('/x without an active template falls back to the built-in card', async () => {
    const bot = makeBot();
    const handler = new XTokenScanHandler(
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
      bot as never,
      makeRepo({}) as never,
      renderer() as never,
    );
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toBe('BUILT-IN-CARD');
  });

  it('bare prefers its own active template over ca', async () => {
    const bot = makeBot();
    const seen: TemplateCommand[] = [];
    const handler = new BareAddressHandler(
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
      bot as never,
      makeRepo(
        {
          bare: active('bare', 'bare-ca-v1', 'BARE-CARD ${{symbol}}'),
          ca: active('ca', 'full-dexter-v1', 'CA-CARD ${{symbol}}'),
        },
        seen,
      ) as never,
      renderer() as never,
    );
    await handler.handleText(SOL, makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('BARE-CARD $SOL');
    expect(seen).toEqual(['bare']);
  });

  it('bare falls back to the active ca template when bare has none', async () => {
    const bot = makeBot();
    const seen: TemplateCommand[] = [];
    const handler = new BareAddressHandler(
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
      bot as never,
      makeRepo(
        { ca: active('ca', 'full-dexter-v1', 'CA-CARD ${{symbol}}') },
        seen,
      ) as never,
      renderer() as never,
    );
    await handler.handleText(`mira esto ${SOL} en jupiter`, makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('CA-CARD $SOL');
    expect(seen).toEqual(['bare', 'ca']);
  });

  it('bare without any active template falls back to the built-in card', async () => {
    const bot = makeBot();
    const seen: TemplateCommand[] = [];
    const handler = new BareAddressHandler(
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
      bot as never,
      makeRepo({}, seen) as never,
      renderer() as never,
    );
    await handler.handleText(SOL, makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toBe('BUILT-IN-CARD');
    expect(seen).toEqual(['bare', 'ca']);
  });
});
