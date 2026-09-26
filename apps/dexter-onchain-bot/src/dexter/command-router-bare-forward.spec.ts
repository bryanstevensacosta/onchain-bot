import { CommandRouterService } from './command-router.service';
import { DEFAULT_CHAT_SETTINGS } from './chat-settings';
import { extractForwardCandidates } from './forward-extractor';
import type { TelegramUpdate } from './bot-client';

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
    { isAllowed: () => true } as never,
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
