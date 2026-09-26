import { SettingsViewHandler } from './settings-view.handler';
import { TbTradeButtonsHandler } from './tb-trade-buttons.handler';
import type { CommandContext } from '../command-handler';
import { DEFAULT_CHAT_SETTINGS } from '../chat-settings';

function makeContext(): CommandContext {
  return {
    chatId: 42,
    chatType: 'group',
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

describe('/settings (chat config view)', () => {
  it('renders the current chat settings', async () => {
    const bot = makeBot();
    const handler = new SettingsViewHandler(bot as never);
    await handler.handle([], makeContext());
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].text).toMatch(/Configuraci/);
    expect(bot.sent[0].text).toMatch(/DEX/);
  });
});

describe('/tb (trade-button settings)', () => {
  it('restores defaults on /tb on and clears on /tb off', async () => {
    const bot = makeBot();
    let saved: string[] | null = null;
    const chatSettings = {
      updateSettings: async (_chat: string, patch: { enabledTradeButtons: string[] }) => {
        saved = patch.enabledTradeButtons;
        return {};
      },
    };
    const registry = {
      getDefaultCodes: () => ['DEX', 'PHO', 'TRO'],
      getAllCodes: () => ['DEX', 'PHO', 'TRO'],
      isKnownCode: (c: string) => ['DEX', 'PHO', 'TRO'].includes(c),
    };
    const keyboards = {
      buildTradeButtonsConfigKeyboard: () => ({ inline_keyboard: [] }),
    };
    const handler = new TbTradeButtonsHandler(
      chatSettings as never,
      registry as never,
      keyboards as never,
      bot as never,
    );
    await handler.handle(['on'], makeContext());
    expect(saved).toEqual(['DEX', 'PHO', 'TRO']);
    await handler.handle(['off'], makeContext());
    expect(saved).toEqual([]);
    expect(bot.sent).toHaveLength(2);
  });
});
