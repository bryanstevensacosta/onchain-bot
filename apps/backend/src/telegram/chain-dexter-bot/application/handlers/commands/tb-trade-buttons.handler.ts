import { Injectable } from '@nestjs/common';
import type { CommandContext, CommandHandler } from '../command-handler';
import { InlineKeyboardBuilder } from '../../../infrastructure/telegram/inline-keyboard.builder';
import { TelegramBotClient } from '../../../infrastructure/telegram/bot-client';
import { ChatSettingsService } from '../chat-settings.service';
import { TradeButtonRegistry } from '../../../infrastructure/telegram/trade-button-registry';

@Injectable()
export class TbTradeButtonsHandler implements CommandHandler {
  public readonly name = 'tb';

  public constructor(
    private readonly chatSettingsService: ChatSettingsService,
    private readonly tradeButtonRegistry: TradeButtonRegistry,
    private readonly keyboards: InlineKeyboardBuilder,
    private readonly bot: TelegramBotClient,
  ) {}

  public async handle(args: string[], context: CommandContext): Promise<void> {
    const subcommand = args[0]?.toLowerCase();

    if (!subcommand) {
      await this.showConfigKeyboard(context);
      return;
    }

    if (subcommand === 'off') {
      await this.chatSettingsService.updateSettings(context.telegramChatId, {
        enabledTradeButtons: [],
      });
      await this.bot.sendMessage(
        context.chatId,
        '🚫 Trade buttons desactivados.',
      );
      return;
    }

    if (subcommand === 'on') {
      const defaults = this.tradeButtonRegistry.getDefaultCodes();
      await this.chatSettingsService.updateSettings(context.telegramChatId, {
        enabledTradeButtons: [...defaults],
      });
      await this.bot.sendMessage(
        context.chatId,
        `✅ Trade buttons restaurados a defaults: ${defaults.join(', ')}`,
      );
      return;
    }

    const requestedCodes = args.filter((a) =>
      this.tradeButtonRegistry.isKnownCode(a.toUpperCase()),
    );

    if (requestedCodes.length === 0) {
      const all = this.tradeButtonRegistry.getAllCodes();
      await this.bot.sendMessage(
        context.chatId,
        `❌ Código(s) inválido(s).\n\nDisponibles: ${all.join(', ')}`,
      );
      return;
    }

    await this.chatSettingsService.updateSettings(context.telegramChatId, {
      enabledTradeButtons: requestedCodes.map((c) => c.toUpperCase()),
    });

    await this.bot.sendMessage(
      context.chatId,
      `✅ Trade buttons actualizados: ${requestedCodes.map((c) => c.toUpperCase()).join(', ')}`,
      { parse_mode: 'Markdown' },
    );
  }

  private async showConfigKeyboard(context: CommandContext): Promise<void> {
    const enabledCodes = context.settings.enabledTradeButtons ?? [];
    const markup = this.keyboards.buildTradeButtonsConfigKeyboard(enabledCodes);
    await this.bot.sendMessage(
      context.chatId,
      `⚙️ *Trade buttons activos:* ${enabledCodes.length > 0 ? enabledCodes.join(', ') : '(ninguno)'}\n\nUsa los botones para activar/desactivar, o:\n• /tb off — desactivar todos\n• /tb on — restaurar defaults\n• /tb CODE1 CODE2 — setear lista`,
      { parse_mode: 'Markdown', reply_markup: markup },
    );
  }
}
