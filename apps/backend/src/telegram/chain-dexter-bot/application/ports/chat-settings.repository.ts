import type { ChatSettingsEntity } from '../../domain/chat-settings.entity';

export type ChatSettingsPatch = Partial<
  Pick<
    ChatSettingsEntity,
    | 'enabledTradeButtons'
    | 'tradeButtonsPosition'
    | 'tradeButtonsLimit'
    | 'emojiMode'
    | 'groupMode'
    | 'autoResponder'
    | 'priceMode'
  >
>;

export const CHAT_SETTINGS_REPOSITORY = Symbol('CHAT_SETTINGS_REPOSITORY');

export abstract class ChatSettingsRepository {
  abstract findByChatGroupId(
    chatGroupId: string,
  ): Promise<ChatSettingsEntity | null>;
  abstract upsert(
    chatGroupId: string,
    patch: ChatSettingsPatch,
  ): Promise<ChatSettingsEntity>;
}
