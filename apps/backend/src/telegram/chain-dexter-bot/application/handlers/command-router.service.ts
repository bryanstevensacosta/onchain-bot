import { Injectable, Logger } from '@nestjs/common';
import { ContextResolverService } from './context-resolver.service';
import {
  StartCommandHandler,
  HelpCommandHandler,
} from './commands/start-help.handlers';
import { XTokenScanHandler } from './commands/x-token-scan.handler';
import { ZCompactScanHandler } from './commands/z-compact-scan.handler';
import { CTokenChartHandler } from './commands/c-token-chart.handler';
import { CcChartOnlyHandler } from './commands/cc-chart-only.handler';
import { TbTradeButtonsHandler } from './commands/tb-trade-buttons.handler';
import { SettingsViewHandler } from './commands/settings-view.handler';
import {
  TelegramBotClient,
  TelegramUpdate,
} from '../../infrastructure/telegram/bot-client';
import { CommandContext, CommandHandler } from './command-handler';
import { ChatSettingsService } from './chat-settings.service';
import { InlineKeyboardBuilder } from '../../infrastructure/telegram/inline-keyboard.builder';

@Injectable()
export class CommandRouterService {
  private readonly logger = new Logger(CommandRouterService.name);
  private readonly handlers = new Map<string, CommandHandler>();

  public constructor(
    private readonly contextResolver: ContextResolverService,
    private readonly bot: TelegramBotClient,
    private readonly chatSettingsService: ChatSettingsService,
    private readonly keyboards: InlineKeyboardBuilder,
    startHandler: StartCommandHandler,
    helpHandler: HelpCommandHandler,
    xHandler: XTokenScanHandler,
    zHandler: ZCompactScanHandler,
    cHandler: CTokenChartHandler,
    ccHandler: CcChartOnlyHandler,
    tbHandler: TbTradeButtonsHandler,
    settingsHandler: SettingsViewHandler,
  ) {
    this.register(startHandler);
    this.register(helpHandler);
    this.register(xHandler);
    this.register(zHandler);
    this.register(cHandler);
    this.register(ccHandler);
    this.register(tbHandler);
    this.register(settingsHandler);
  }

  public register(handler: CommandHandler): void {
    this.handlers.set(handler.name.toLowerCase(), handler);
  }

  public async dispatch(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) {
      await this.dispatchCallback(update);
      return;
    }

    const message = update.message ?? update.edited_message;
    if (!message || !message.text) return;

    const parsed = this.parse(message.text);
    if (!parsed) return;

    const context = await this.contextResolver.resolve(update);
    if (!context) return;

    const handler = this.handlers.get(parsed.command);
    if (!handler) {
      await this.bot.sendMessage(
        context.chatId,
        `❓ Comando desconocido: /${parsed.command}\n\nUsa /help para ver comandos disponibles.`,
      );
      return;
    }

    try {
      await handler.handle(parsed.args, context);
    } catch (err) {
      this.logger.error(
        `Handler /${parsed.command} failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      await this.bot.sendMessage(
        context.chatId,
        `⚠️ Error procesando /${parsed.command}. Intenta de nuevo.`,
      );
    }
  }

  private async dispatchCallback(update: TelegramUpdate): Promise<void> {
    const cb = update.callback_query;
    if (!cb || !cb.data) return;

    if (cb.data.startsWith('tb:toggle:')) {
      const code = cb.data.slice('tb:toggle:'.length).toUpperCase();
      const chatId = cb.message?.chat.id;
      if (!chatId) {
        await this.bot.answerCallbackQuery(cb.id);
        return;
      }
      try {
        await this.chatSettingsService.toggleTradeButton(
          String(chatId),
          code as Parameters<ChatSettingsService['toggleTradeButton']>[1],
        );
        await this.bot.answerCallbackQuery(cb.id, `Trade buttons actualizados`);
      } catch (err) {
        this.logger.warn(
          `tb:toggle error: ${err instanceof Error ? err.message : 'unknown'}`,
        );
        await this.bot.answerCallbackQuery(cb.id, 'Error actualizando');
      }
      return;
    }

    if (cb.data.startsWith('refresh:')) {
      await this.bot.answerCallbackQuery(
        cb.id,
        'Refresh no implementado en MVP — re-envía el comando',
      );
      return;
    }

    await this.bot.answerCallbackQuery(cb.id);
  }

  private parse(text: string): { command: string; args: string[] } | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) return null;
    const afterSlash = trimmed.slice(1);
    const spaceIdx = afterSlash.search(/\s/);
    const commandToken =
      spaceIdx === -1 ? afterSlash : afterSlash.slice(0, spaceIdx);
    const argsToken =
      spaceIdx === -1 ? '' : afterSlash.slice(spaceIdx + 1).trim();
    const command = commandToken.split('@')[0] ?? '';
    if (!command) return null;
    const args = argsToken.length > 0 ? argsToken.split(/\s+/) : [];
    return { command: command.toLowerCase(), args };
  }
}

export type { CommandContext };
