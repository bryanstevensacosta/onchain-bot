import { ZCompactScanHandler } from './z-compact-scan.handler';
import { CTokenChartHandler, VALID_TIMEFRAMES } from './c-token-chart.handler';
import { CcChartOnlyHandler } from './cc-chart-only.handler';
import type { CommandContext } from '@/commands/domain/ports/command-handler.port';
import { DEFAULT_CHAT_SETTINGS } from '@/settings/domain/chat-settings';
import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import { MessageTemplate } from '@/templates/domain/message-template.entity';
import { InMemoryMessageTemplateRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-message-template.repository';

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

interface SentMessage {
  readonly chatId: number | string;
  readonly text: string;
  readonly options?: Record<string, unknown>;
}

function makeBot() {
  const sent: SentMessage[] = [];
  return {
    sent,
    sendMessage: async (
      chatId: number | string,
      text: string,
      options?: Record<string, unknown>,
    ): Promise<{ ok: true; messageId: null; error: null }> => {
      sent.push({ chatId, text, options });
      return { ok: true, messageId: null, error: null };
    },
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
  totalSupply: null,
  circulatingSupply: null,
  maxSupply: null,
  devWallets: null,
  devPctSupply: null,
  poolAddress: null,
  source: 'market-data-http',
};

function makeRenderer(): TemplateRendererService {
  // Resolver-less interim (todo 13 binds DISPLAY_RESOLVER):
  // `{{chainDisplay}}` renders as `""`.
  return new TemplateRendererService();
}

async function seedActive(
  command: 'z' | 'c' | 'cc',
  bodyMarkdown: string,
): Promise<InMemoryMessageTemplateRepository> {
  const repo = new InMemoryMessageTemplateRepository();
  const template = MessageTemplate.create({
    command,
    name: `${command}-spec-v1`,
    bodyMarkdown,
  });
  template.activate();
  await repo.save(template);
  return repo;
}

describe('/z with an active compact template', () => {
  it('renders the template as MarkdownV2 without reply_markup', async () => {
    const bot = makeBot();
    const repo = await seedActive(
      'z',
      '${{symbol}} | {{name}}\n💰 {{priceUsd}} ({{priceChange24h}}) • MC {{marketCapUsd}}',
    );
    const handler = new ZCompactScanHandler(
      { resolve: async () => FIXTURE } as never,
      {} as never,
      bot as never,
      repo,
      makeRenderer(),
    );
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('$SOL');
    expect(bot.sent[0].text).toContain('Solana');
    expect(bot.sent[0].options).toMatchObject({ parse_mode: 'MarkdownV2' });
    expect(bot.sent[0].options ?? {}).not.toHaveProperty('reply_markup');
  });

  it('falls back to the built-in legacy Markdown compact card with no active template', async () => {
    const bot = makeBot();
    const formatter = {
      formatTokenScan: () => ({ text: 'COMPACT $SOL', truncated: false }),
    };
    const handler = new ZCompactScanHandler(
      { resolve: async () => FIXTURE } as never,
      formatter as never,
      bot as never,
      new InMemoryMessageTemplateRepository(),
      makeRenderer(),
    );
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('COMPACT $SOL');
    expect(bot.sent[0].options).toMatchObject({ parse_mode: 'Markdown' });
  });

  it('keeps usage + unresolvable texts hardcoded', async () => {
    const bot = makeBot();
    const handler = new ZCompactScanHandler(
      { resolve: async () => FIXTURE } as never,
      {} as never,
      bot as never,
      new InMemoryMessageTemplateRepository(),
      makeRenderer(),
    );
    await handler.handle([], makeContext());
    expect(bot.sent[0].text).toMatch(/Uso: \/z/);

    const bot2 = makeBot();
    const handler2 = new ZCompactScanHandler(
      { resolve: async () => null } as never,
      {} as never,
      bot2 as never,
      new InMemoryMessageTemplateRepository(),
      makeRenderer(),
    );
    await handler2.handle([SOL], makeContext());
    expect(bot2.sent[0].text).toMatch(/No se pudo resolver/);
  });
});

describe('/c with an active chart template', () => {
  it('renders timeframe + dexscreener URL as MarkdownV2 without reply_markup', async () => {
    const bot = makeBot();
    const repo = await seedActive(
      'c',
      '📈 Chart ({{timeframe}}): {{dexscreenerUrl}}\n🔗 {{scanLinks}}',
    );
    const handler = new CTokenChartHandler(
      { resolve: async () => FIXTURE } as never,
      bot as never,
      repo,
      makeRenderer(),
    );
    await handler.handle([SOL, '1h'], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('1h');
    expect(bot.sent[0].text).toContain(`https://dexscreener.com/solana/${SOL}`);
    expect(bot.sent[0].options).toMatchObject({ parse_mode: 'MarkdownV2' });
    expect(bot.sent[0].options ?? {}).not.toHaveProperty('reply_markup');
  });

  it('rejects an invalid timeframe without touching templates', async () => {
    const bot = makeBot();
    let resolveCalls = 0;
    let lookupCalls = 0;
    const repo = new InMemoryMessageTemplateRepository();
    const countingRepo = {
      findActiveByCommand: async (
        ...args: Parameters<typeof repo.findActiveByCommand>
      ): Promise<Awaited<ReturnType<typeof repo.findActiveByCommand>>> => {
        lookupCalls += 1;
        return repo.findActiveByCommand(...args);
      },
    };
    const handler = new CTokenChartHandler(
      {
        resolve: async () => {
          resolveCalls += 1;
          return FIXTURE;
        },
      } as never,
      bot as never,
      countingRepo as never,
      makeRenderer(),
    );
    await handler.handle([SOL, '9m'], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toMatch(/Timeframe inválido/);
    expect(resolveCalls).toBe(0);
    expect(lookupCalls).toBe(0);
  });

  it('renders a body without {{timeframe}} fine (optional placeholder)', async () => {
    const bot = makeBot();
    const repo = await seedActive('c', '📈 Chart: {{dexscreenerUrl}}');
    const handler = new CTokenChartHandler(
      { resolve: async () => FIXTURE } as never,
      bot as never,
      repo,
      makeRenderer(),
    );
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain(`https://dexscreener.com/solana/${SOL}`);
    expect(bot.sent[0].text).not.toContain('{{');
  });
});

describe('/cc with an active chart-only template', () => {
  it('renders timeframe + dexscreener URL as MarkdownV2 without reply_markup', async () => {
    const bot = makeBot();
    const repo = await seedActive(
      'cc',
      '📈 Chart ({{timeframe}}): {{dexscreenerUrl}}\n🔗 {{scanLinks}}',
    );
    const handler = new CcChartOnlyHandler(
      { resolve: async () => FIXTURE } as never,
      bot as never,
      repo,
      makeRenderer(),
    );
    await handler.handle([SOL, '4h'], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toContain('4h');
    expect(bot.sent[0].text).toContain(`https://dexscreener.com/solana/${SOL}`);
    expect(bot.sent[0].options).toMatchObject({ parse_mode: 'MarkdownV2' });
    expect(bot.sent[0].options ?? {}).not.toHaveProperty('reply_markup');
  });

  it('rejects an invalid timeframe without touching templates', async () => {
    const bot = makeBot();
    const handler = new CcChartOnlyHandler(
      { resolve: async () => FIXTURE } as never,
      bot as never,
      new InMemoryMessageTemplateRepository(),
      makeRenderer(),
    );
    await handler.handle([SOL, '9m'], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toMatch(/Timeframe inválido/);
  });

  it('shares the single VALID_TIMEFRAMES source with /c', () => {
    for (const tf of ['1m', '5m', '15m', '1h', '4h', '1d', '1w']) {
      expect(VALID_TIMEFRAMES.has(tf)).toBe(true);
    }
    expect(VALID_TIMEFRAMES.has('9m')).toBe(false);
  });
});
