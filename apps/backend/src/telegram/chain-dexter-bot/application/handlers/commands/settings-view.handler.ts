import { Injectable } from '@nestjs/common';
import type { CommandContext, CommandHandler } from '../command-handler';
import { TelegramBotClient } from '../../../infrastructure/telegram/bot-client';

@Injectable()
export class SettingsViewHandler implements CommandHandler {
  public readonly name = 'settings';

  public constructor(private readonly bot: TelegramBotClient) {}

  public async handle(_args: string[], context: CommandContext): Promise<void> {
    const s = context.settings;
    const enabled = (s.enabledTradeButtons ?? []).join(', ') || '(ninguno)';
    const position = s.tradeButtonsPosition ?? 'bot';
    const limit = s.tradeButtonsLimit ?? 3;
    const emoji = s.emojiMode !== false ? 'ON' : 'OFF';
    const groupMode = s.groupMode !== false ? 'ON' : 'OFF';
    const autoResp = s.autoResponder !== false ? 'ON' : 'OFF';
    const priceMode = s.priceMode ?? 'adv';

    const text = [
      '⚙️ *Configuración del chat*',
      '',
      `🎯 Trade Buttons: ${enabled} (límite: ${limit})`,
      `📍 Posición: ${position}`,
      `😊 Emoji mode: ${emoji}`,
      `👥 Group mode: ${groupMode}`,
      `🤖 Auto-responder: ${autoResp}`,
      `💰 Price mode: ${priceMode}`,
    ].join('\n');

    await this.bot.sendMessage(context.chatId, text, {
      parse_mode: 'Markdown',
    });
  }
}
