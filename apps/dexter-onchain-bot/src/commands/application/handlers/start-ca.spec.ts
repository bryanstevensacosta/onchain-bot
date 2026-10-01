import { CaScanHandler } from './ca.handler';
import { StartCommandHandler } from './start.handler';
import type { CommandContext } from '@/commands/domain/ports/command-handler.port';
import { DEFAULT_CHAT_SETTINGS } from '@/settings/domain/chat-settings';
import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { MessageTemplate } from '@/templates/domain/message-template.entity';
import type { TemplateCommand } from '@/placeholders/domain/placeholder-registry';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';

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

describe('/start (rewritten info+usage, lookup-only)', () => {
  it('explains lookup usage and never promises channel publishing', async () => {
    const bot = makeBot();
    const handler = new StartCommandHandler(bot as never);
    await handler.handle([], makeContext());
    expect(bot.sent).toHaveLength(1);
    const text = bot.sent[0].text;
    expect(text).toMatch(/\/ca/);
    expect(text).toMatch(/lookup/i);
    expect(text).not.toMatch(/publish/i);
    expect(text).not.toMatch(/channel/i);
  });
});

describe('/ca <contract> (full token card via market-data HTTP)', () => {
  it('resolves the fixture and sends the own scan card via gateway', async () => {
    const bot = makeBot();
    const pipeline = { resolve: async () => FIXTURE };
    const formatter = {
      formatScanCard: () => ({
        text: 'CARD $SOL',
        truncated: false,
        parseMode: 'MarkdownV2',
      }),
    };
    const registry = {
      getButtonsForChain: () => [
        { code: 'DEX', label: 'DexScreener', kind: 'analysis' },
      ],
    };
    const keyboards = {
      buildScanKeyboard: () => ({ inline_keyboard: [] }),
    };
    const handler = new CaScanHandler(
      pipeline as never,
      formatter as never,
      registry as never,
      keyboards as never,
      bot as never,
    );
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('CARD $SOL');
  });

  it('asks for usage when no contract is given', async () => {
    const bot = makeBot();
    const pipeline = { resolve: async () => FIXTURE };
    const handler = new CaScanHandler(
      pipeline as never,
      {} as never,
      {} as never,
      {} as never,
      bot as never,
    );
    await handler.handle([], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toMatch(/\/ca/);
  });

  it('reports explicitly when market-data cannot resolve', async () => {
    const bot = makeBot();
    const pipeline = { resolve: async () => null };
    const formatter = { escapeMarkdownV2: (s: string) => s };
    const handler = new CaScanHandler(
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
      bot as never,
    );
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toMatch(/No se pudo resolver/);
  });
});

describe('/ca template integration (todo 10: active render + built-in fallback)', () => {
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

  function makeBotWithOptions() {
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

  it('active template renders {{symbol}} substituted via MarkdownV2 without reply_markup', async () => {
    const bot = makeBotWithOptions();
    const seen: TemplateCommand[] = [];
    const repo = makeRepo(
      {
        ca: MessageTemplate.create({
          command: 'ca',
          name: 'full-dexter-v1',
          bodyMarkdown: 'Token ${{symbol}} on {{chain}}',
          isActive: true,
        }),
      },
      seen,
    );
    const handler = new CaScanHandler(
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
      bot as never,
      repo as never,
      new TemplateRendererService() as never,
    );
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('SOL');
    expect(bot.sent[0].options).toMatchObject({ parse_mode: 'MarkdownV2' });
    expect(bot.sent[0].options).not.toHaveProperty('reply_markup');
    expect(seen).toEqual(['ca']);
  });

  it('no active template falls back to the built-in card', async () => {
    const bot = makeBotWithOptions();
    const repo = makeRepo({});
    const handler = new CaScanHandler(
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
      bot as never,
      repo as never,
      new TemplateRendererService() as never,
    );
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toBe('BUILT-IN-CARD');
  });

  it('unknown placeholder in the active template answers an explicit user error without crashing', async () => {
    const bot = makeBotWithOptions();
    const repo = makeRepo({
      ca: MessageTemplate.create({
        command: 'ca',
        name: 'broken-v1',
        bodyMarkdown: 'oops {{xxx}}',
        isActive: true,
      }),
    });
    const handler = new CaScanHandler(
      pipeline as never,
      formatter as never,
      {} as never,
      {} as never,
      bot as never,
      repo as never,
      new TemplateRendererService() as never,
    );
    await expect(handler.handle([SOL], makeContext())).resolves.toBeUndefined();
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toMatch(/plantilla activa/);
    expect(bot.sent[0].text).toContain('{{xxx}}');
  });
});
