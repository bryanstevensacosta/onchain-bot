import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  ChatGroup,
  ChatGroupRepository,
  ChatSettings,
  ChatSettingsRepository,
} from './chat-settings';
import { DEFAULT_CHAT_SETTINGS } from './chat-settings';

/**
 * In-memory chat-group repository (moved from backend chain-dexter-bot
 * `infrastructure/repositories/in-memory-chat-group.repository.ts`).
 */
@Injectable()
export class InMemoryChatGroupRepository implements ChatGroupRepository {
  private readonly groups = new Map<string, ChatGroup>();

  public async upsert(input: {
    telegramChatId: string;
    telegramChatType: ChatGroup['telegramChatType'];
    title: string | null;
    telegramChatUsername: string | null;
  }): Promise<ChatGroup> {
    const existing = await this.findByTelegramChatId(input.telegramChatId);
    if (existing) {
      existing.lastSeenAt = new Date();
      return existing;
    }
    const group: ChatGroup = {
      id: randomUUID(),
      telegramChatId: input.telegramChatId,
      telegramChatType: input.telegramChatType,
      title: input.title,
      telegramChatUsername: input.telegramChatUsername,
      createdAt: new Date(),
      lastSeenAt: new Date(),
    };
    this.groups.set(group.id, group);
    return group;
  }

  public async findByTelegramChatId(
    telegramChatId: string,
  ): Promise<ChatGroup | null> {
    for (const group of this.groups.values()) {
      if (group.telegramChatId === telegramChatId) return group;
    }
    return null;
  }

  public async touchLastSeen(groupId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (group) group.lastSeenAt = new Date();
  }
}

/**
 * In-memory chat-settings repository (moved from backend chain-dexter-bot
 * `infrastructure/repositories/in-memory-chat-settings.repository.ts`).
 */
@Injectable()
export class InMemoryChatSettingsRepository
  implements ChatSettingsRepository
{
  private readonly settings = new Map<string, ChatSettings>();

  public async upsert(
    chatGroupId: string,
    patch: Partial<ChatSettings>,
  ): Promise<ChatSettings> {
    const existing = this.settings.get(chatGroupId);
    if (existing) {
      Object.assign(existing, patch, { updatedAt: new Date() });
      return existing;
    }
    const created: ChatSettings = {
      chatGroupId,
      enabledTradeButtons: [...DEFAULT_CHAT_SETTINGS.enabledTradeButtons],
      tradeButtonsPosition: DEFAULT_CHAT_SETTINGS.tradeButtonsPosition,
      tradeButtonsLimit: DEFAULT_CHAT_SETTINGS.tradeButtonsLimit,
      emojiMode: DEFAULT_CHAT_SETTINGS.emojiMode,
      groupMode: DEFAULT_CHAT_SETTINGS.groupMode,
      autoResponder: DEFAULT_CHAT_SETTINGS.autoResponder,
      priceMode: DEFAULT_CHAT_SETTINGS.priceMode,
      updatedAt: new Date(),
      ...patch,
    };
    this.settings.set(chatGroupId, created);
    return created;
  }

  public async findByChatGroupId(
    chatGroupId: string,
  ): Promise<ChatSettings | null> {
    return this.settings.get(chatGroupId) ?? null;
  }
}
