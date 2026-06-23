import type { ChatSettingsEntity } from '../../domain/chat-settings.entity';

export interface CommandContext {
  readonly chatId: number;
  readonly chatType: 'private' | 'group' | 'supergroup' | 'channel';
  readonly telegramChatId: string;
  readonly settings: ChatSettingsEntity;
  readonly user: {
    readonly id: number;
    readonly username?: string;
    readonly firstName?: string;
    readonly isBot: boolean;
  };
  readonly isAdmin: boolean;
  readonly replyTo?: {
    readonly messageId: number;
    readonly text?: string;
    readonly fromUserId?: number;
  };
  readonly raw: unknown;
}

export interface CommandHandler {
  readonly name: string;
  handle(args: string[], context: CommandContext): Promise<void>;
}
