import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandContext, CommandHandler } from './command-handler';
import {
  CHAT_GROUP_REPOSITORY,
  ChatGroupRepository,
} from '../ports/chat-group.repository';
import { ChatSettingsService } from './chat-settings.service';
import {
  TelegramMessage,
  TelegramUpdate,
} from '../../infrastructure/telegram/bot-client';

@Injectable()
export class ContextResolverService {
  private readonly logger = new Logger(ContextResolverService.name);

  public constructor(
    @Inject(CHAT_GROUP_REPOSITORY)
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

export async function messageToReplyContext(
  message: TelegramMessage,
): Promise<CommandContext['replyTo']> {
  if (!message.reply_to_message) return undefined;
  return {
    messageId: message.reply_to_message.message_id,
    text: message.reply_to_message.text,
    fromUserId: message.reply_to_message.from?.id,
  };
}

export type { CommandHandler };
