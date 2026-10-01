import { CommandRouterService } from './command-router.service';
import { DEFAULT_CHAT_SETTINGS } from '@/settings/domain/chat-settings';
import { extractForwardCandidates } from '@/scan/domain/extractor/forward-extractor';
import type { TelegramUpdate } from '@/gateway/domain/ports/telegram.port';
import { BareAddressHandler } from '../handlers/bare-address.handler';
import { MessageTemplate } from '@/templates/domain/message-template.entity';
import type { TemplateCommand } from '@/placeholders/domain/placeholder-registry';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';

const SOL = 'So11111111111111111111111111111111111111112';

function makeUpdate(text: string, userId = 7): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1,
      chat: { id: 42, type: 'private' },
      from: { id: userId, is_bot: false, first_name: 'Test' },
      text,
    },
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

function makeHarness() {
  const bot = makeBot();
  const scanned: string[] = [];
  const fallback = {
    handleText: async (_text: string, ctx: { chatId: number }) => {
      const candidates = extractForwardCandidates(_text);
      if (candidates.addresses.length === 0) {
        await bot.sendMessage(
          ctx.chatId,
          '🔍 No veo ningún contrato en ese mensaje.',
        );
        return;
      }
      scanned.push(candidates.addresses[0]);
      await bot.sendMessage(ctx.chatId, `SCAN:${candidates.addresses[0]}`);
    },
  };
  const contextResolver = {
    resolve: async () => ({
      chatId: 42,
      chatType: 'private' as const,
      telegramChatId: '42',
      settings: { ...DEFAULT_CHAT_SETTINGS },
      user: { id: 7, isBot: false as const },
      isAdmin: false,
      raw: {},
    }),
  };
  const router = new CommandRouterService(
    contextResolver as never,
    bot as never,
    { toggleTradeButton: async () => ({}) } as never,
    { buildScanKeyboard: () => ({ inline_keyboard: [] }) } as never,
    { isAllowed: () => true },
    fallback as never,
  );
  return { bot, scanned, router };
}

describe('CommandRouter bare-address + forward handling', () => {
  it('bare: a lone contract (no slash) triggers a scan', async () => {
    const { bot, scanned, router } = makeHarness();
    await router.dispatch(makeUpdate(SOL));
    expect(scanned).toEqual([SOL]);
    expect(bot.sent[0].text).toBe(`SCAN:${SOL}`);
  });

  it('forward-ok: free text with a contract triggers a scan', async () => {
    const { scanned, router } = makeHarness();
    await router.dispatch(makeUpdate(`mira esto ${SOL} en jupiter`));
    expect(scanned).toHaveLength(1);
    expect(scanned[0]).toContain(SOL);
  });

  it('forward-empty: free text without contracts gets a helpful reply, no scan', async () => {
    const { bot, scanned, router } = makeHarness();
    await router.dispatch(makeUpdate('gm team, markets look green'));
    expect(scanned).toEqual([]);
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toMatch(/No veo/);
  });

  it('unknown slash commands still get the unknown-command reply', async () => {
    const { bot, router } = makeHarness();
    await router.dispatch(makeUpdate('/nope arg'));
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toMatch(/desconocido/);
  });
});

describe('CommandRouter bare-address + template integration (todo 10)', () => {
  const TOKEN = {
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

  function makeRepo(
    actives: Partial<Record<TemplateCommand, MessageTemplate | null>>,
  ) {
    return {
      findAll: async () => [],
      findByCommand: async () => [],
      findById: async () => null,
      findActiveByCommand: async (
        cmd: TemplateCommand,
      ): Promise<MessageTemplate | null> => actives[cmd] ?? null,
      save: async (t: MessageTemplate) => t,
      delete: async () => false,
    };
  }

  function makeLiveHarness(
    actives: Partial<Record<TemplateCommand, MessageTemplate | null>>,
  ) {
    const bot = makeBot();
    const fallback = new BareAddressHandler(
      { resolve: async () => TOKEN } as never,
      {
        formatScanCard: () => ({
          text: 'BUILT-IN-CARD',
          truncated: false,
          parseMode: 'MarkdownV2' as const,
        }),
        escapeMarkdownV2: (s: string) => s,
      } as never,
      {} as never,
      {} as never,
      bot as never,
      makeRepo(actives) as never,
      new TemplateRendererService() as never,
    );
    const contextResolver = {
      resolve: async () => ({
        chatId: 42,
        chatType: 'private' as const,
        telegramChatId: '42',
        settings: { ...DEFAULT_CHAT_SETTINGS },
        user: { id: 7, isBot: false as const },
        isAdmin: false,
        raw: {},
      }),
    };
    const router = new CommandRouterService(
      contextResolver as never,
      bot as never,
      { toggleTradeButton: async () => ({}) } as never,
      { buildScanKeyboard: () => ({ inline_keyboard: [] }) } as never,
      { isAllowed: () => true },
      fallback as never,
    );
    return { bot, router };
  }

  it('bare with an active bare template renders it through the router', async () => {
    const { bot, router } = makeLiveHarness({
      bare: MessageTemplate.create({
        command: 'bare',
        name: 'bare-ca-v1',
        bodyMarkdown: 'BARE-CARD ${{symbol}}',
        isActive: true,
      }),
    });
    await router.dispatch(makeUpdate(SOL));
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('BARE-CARD $SOL');
  });

  it('bare without actives falls back to the built-in card through the router', async () => {
    const { bot, router } = makeLiveHarness({});
    await router.dispatch(makeUpdate(SOL));
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toBe('BUILT-IN-CARD');
  });
});
