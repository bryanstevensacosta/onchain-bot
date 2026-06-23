import { Injectable, Logger } from '@nestjs/common';
import { ContextResolverService } from './context-resolver.service';
import {
  StartCommandHandler,
  HelpCommandHandler,
} from './commands/start-help.handlers';
import { TelegramBotClient } from '../../infrastructure/telegram/bot-client';
import { CommandContext, CommandHandler } from './command-handler';

@Injectable()
export class CommandRouterService {
  private readonly logger = new Logger(CommandRouterService.name);
  private readonly handlers = new Map<string, CommandHandler>();
  private readonly botByName = new Map<string, CommandHandler>();

  public constructor(
    private readonly contextResolver: ContextResolverService,
    private readonly bot: TelegramBotClient,
    startHandler: StartCommandHandler,
    helpHandler: HelpCommandHandler,
  ) {
    this.register(startHandler);
    this.register(helpHandler);
  }

  public register(handler: CommandHandler): void {
    this.handlers.set(handler.name.toLowerCase(), handler);
    this.botByName.set(handler.name.toLowerCase(), handler);
  }

  public async dispatch(
    update: import('../../infrastructure/telegram/bot-client').TelegramUpdate,
  ): Promise<void> {
    const message = update.message ?? update.edited_message;
    if (!message || !message.text) {
      if (update.callback_query) {
        await this.dispatchCallback(update);
      }
      return;
    }

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

  private async dispatchCallback(
    update: import('../../infrastructure/telegram/bot-client').TelegramUpdate,
  ): Promise<void> {
    const cb = update.callback_query;
    if (!cb || !cb.data) return;

    if (cb.data.startsWith('tb:toggle:')) {
      const code = cb.data.slice('tb:toggle:'.length);
      this.logger.log(
        `Callback tb:toggle:${code} from chat ${cb.message?.chat.id}`,
      );
      await this.bot.answerCallbackQuery(cb.id, 'Configuración actualizada');
      return;
    }
    if (cb.data.startsWith('refresh:')) {
      await this.bot.answerCallbackQuery(
        cb.id,
        'Refresh no implementado en MVP',
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
