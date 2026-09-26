import { Injectable, Logger } from '@nestjs/common';
import type { CommandContext } from '../../domain/ports/command-handler.port';
import type { ChatGroupRepository } from '../../../settings/domain/chat-settings';
import { ChatSettingsService } from '../../../settings/application/chat-settings.service';
import type { TelegramUpdate } from '../../../telegram/infrastructure/telegram/bot-client';

/**
 * Context resolver (moved from backend chain-dexter-bot
 * `application/handlers/context-resolver.service.ts` — repository
 * imports re-pointed at the local chat-settings ports).
 */
@Injectable()
export class ContextResolverService {
  private readonly logger = new Logger(ContextResolverService.name);

  public constructor(
    private readonly chatGroupRepository: ChatGroupRepository,
    private readonly chatSettingsService: ChatSettingsService,
  ) {}

  public async resolve(update: TelegramUpdate): Promise<CommandContext | null> {
    const message = update.message ?? update.edited_message;
    if (!message || !message.text) return null;

    const chatId = message.chat.id;
    const telegramChatId = String(chatId);

    const { group, settings } =
      await this.chatSettingsService.getOrCreateForChat(
        telegramChatId,
        message.chat.type,
        message.chat.title ?? null,
        message.chat.username ?? null,
      );
    await this.chatGroupRepository.touchLastSeen(group.id);

    const user = message.from
      ? {
          id: message.from.id,
          username: message.from.username,
          firstName: message.from.first_name,
          isBot: message.from.is_bot,
        }
      : { id: 0, isBot: false };

    const replyTo = message.reply_to_message
      ? {
          messageId: message.reply_to_message.message_id,
          text: message.reply_to_message.text,
          fromUserId: message.reply_to_message.from?.id,
        }
      : undefined;

    return {
      chatId,
      chatType: message.chat.type,
      telegramChatId,
      settings,
      user,
      isAdmin: false,
      replyTo,
      raw: update,
    };
  }
}
