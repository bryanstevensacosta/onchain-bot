import { CaScanHandler } from './ca.handler';
import { StartCommandHandler } from './start.handler';
import type { CommandContext } from '../command-handler';
import { DEFAULT_CHAT_SETTINGS } from '../chat-settings';
import type { ResolvedToken } from '../token-scan.pipeline';

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
  it('resolves the fixture and sends a card with trade buttons', async () => {
    const bot = makeBot();
    const pipeline = { resolve: async () => FIXTURE };
    const formatter = {
      formatTokenScan: () => ({ text: 'CARD $SOL', truncated: false }),
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
    const handler = new CaScanHandler(
      pipeline as never,
      {} as never,
      {} as never,
      {} as never,
      bot as never,
    );
    await handler.handle([SOL], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toMatch(/No se pudo resolver/);
  });
});
