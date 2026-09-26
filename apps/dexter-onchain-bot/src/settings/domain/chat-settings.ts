/**
 * Chat settings model (Tramo 3, todo 9, P13).
 *
 * Moved from backend `chain-dexter-bot` (domain entities +
 * in-memory repositories). TypeORM persistence is intentionally NOT
 * moved: v1 runs on in-memory settings (same behavior as the backend
 * with `DATABASE_ENABLED=false`); the `onchain_bot_dexter[_staging]`
 * DBs from the compose files are reserved for future persistence.
 */

export type TelegramChatType = 'private' | 'group' | 'supergroup' | 'channel';

export interface ChatGroup {
  readonly id: string;
  readonly telegramChatId: string;
  readonly telegramChatType: TelegramChatType;
  readonly title: string | null;
  readonly telegramChatUsername: string | null;
  readonly createdAt: Date;
  lastSeenAt: Date;
}

export interface ChatSettings {
  readonly chatGroupId: string;
  enabledTradeButtons: string[];
  tradeButtonsPosition: 'top' | 'bot';
  tradeButtonsLimit: number;
  emojiMode: boolean;
  groupMode: boolean;
  autoResponder: boolean;
  priceMode: 'sim' | 'adv';
  updatedAt: Date;
}

export interface ChatSettingsPatch {
  readonly enabledTradeButtons?: string[];
  readonly tradeButtonsPosition?: 'top' | 'bot';
  readonly tradeButtonsLimit?: number;
  readonly emojiMode?: boolean;
  readonly groupMode?: boolean;
  readonly autoResponder?: boolean;
  readonly priceMode?: 'sim' | 'adv';
}

export const DEFAULT_CHAT_SETTINGS: Omit<
  ChatSettings,
  'chatGroupId' | 'updatedAt'
> = {
  enabledTradeButtons: ['DEX', 'PHO', 'TRO'],
  tradeButtonsPosition: 'bot',
  tradeButtonsLimit: 3,
  emojiMode: true,
  groupMode: true,
  autoResponder: true,
  priceMode: 'adv',
};

export interface ChatGroupRepository {
  upsert(input: {
    telegramChatId: string;
    telegramChatType: TelegramChatType;
    title: string | null;
    telegramChatUsername: string | null;
  }): Promise<ChatGroup>;
  findByTelegramChatId(telegramChatId: string): Promise<ChatGroup | null>;
  touchLastSeen(groupId: string): Promise<void>;
}

export interface ChatSettingsRepository {
  upsert(chatGroupId: string, patch: ChatSettingsPatch): Promise<ChatSettings>;
  findByChatGroupId(chatGroupId: string): Promise<ChatSettings | null>;
}
