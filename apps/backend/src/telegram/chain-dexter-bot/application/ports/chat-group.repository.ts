import type {
  ChatGroupEntity,
  TelegramChatType,
} from '../../domain/chat-group.entity';

export interface ChatGroupUpsertInput {
  readonly telegramChatId: string;
  readonly telegramChatType: TelegramChatType;
  readonly title?: string | null;
  readonly telegramChatUsername?: string | null;
}

export const CHAT_GROUP_REPOSITORY = Symbol('CHAT_GROUP_REPOSITORY');

export abstract class ChatGroupRepository {
  abstract findByTelegramChatId(
    telegramChatId: string,
  ): Promise<ChatGroupEntity | null>;
  abstract findById(id: string): Promise<ChatGroupEntity | null>;
  abstract upsert(input: ChatGroupUpsertInput): Promise<ChatGroupEntity>;
  abstract touchLastSeen(id: string): Promise<void>;
}
