import { Injectable, Logger } from '@nestjs/common';
import type { ContextResolverService } from '../context/context-resolver.service';
import type {
  CommandContext,
  CommandHandler,
} from '../../domain/ports/command-handler.port';
import type {
  TelegramBotClient,
  TelegramUpdate,
} from '../../../telegram/infrastructure/telegram/bot-client';
import type { ChatSettingsService } from '../../../settings/application/chat-settings.service';
import type { InlineKeyboardBuilder } from '../../../telegram/infrastructure/keyboard/inline-keyboard.builder';
import type { UserRateLimiter } from '../rate-limit/user-rate-limiter';
import type { BareAddressHandler } from '../handlers/bare-address.handler';

export type { CommandContext };

/**
 * Command router (moved from backend chain-dexter-bot
 * `application/handlers/command-router.service.ts` + P13 extensions).
 *
 * Slash commands dispatch to registered handlers (`/start` rewritten
 * info+usage, `/ca` new, `/x /z /c /cc /tb /settings` inherited).
 * Non-slash text (bare addresses, forwards, any text) falls through to
 * the BareAddressHandler (extract → scan-first → explicit empty reply).
 * Every inbound message passes the per-user rate limiter first.
 * Lookup-only: nothing here publishes to channels.
 */
@Injectable()
export class CommandRouterService {
  private readonly logger = new Logger(CommandRouterService.name);
  private readonly handlers = new Map<string, CommandHandler>();

  public constructor(
    private readonly contextResolver: ContextResolverService,
    private readonly bot: TelegramBotClient,
    private readonly chatSettingsService: ChatSettingsService,
    private readonly keyboards: InlineKeyboardBuilder,
    private readonly rateLimiter: Pick<UserRateLimiter, 'isAllowed'>,
    private readonly fallback: BareAddressHandler,
    ...handlers: CommandHandler[]
  ) {
    for (const handler of handlers) {
      this.register(handler);
    }
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

    const context = await this.contextResolver.resolve(update);
    if (!context) return;

    const userId = message.from?.id ?? 0;
    if (!this.rateLimiter.isAllowed(userId)) {
      this.logger.warn(`Rate-limited user ${userId}`);
      await this.bot.sendMessage(
        context.chatId,
        '⏳ Demasiado rápido — espera un minuto e inténtalo de nuevo.',
      );
      return;
    }

    if (!parsed) {
      try {
        await this.fallback.handleText(message.text, context);
      } catch (err) {
        this.logger.error(
          `Fallback failed: ${err instanceof Error ? err.message : 'unknown'}`,
        );
        await this.bot.sendMessage(
          context.chatId,
          '⚠️ Error procesando el mensaje. Intenta de nuevo.',
        );
      }
      return;
    }

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
        await this.bot.answerCallbackQuery(cb.id, 'Trade buttons actualizados');
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
        'Refresh not implemented in MVP — resend the command',
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
