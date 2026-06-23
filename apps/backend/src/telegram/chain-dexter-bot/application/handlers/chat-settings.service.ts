import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ChatGroupEntity,
  TelegramChatType,
} from '../../domain/chat-group.entity';
import type { ChatSettingsEntity } from '../../domain/chat-settings.entity';
import {
  CHAT_GROUP_REPOSITORY,
  ChatGroupRepository,
} from '../../application/ports/chat-group.repository';
import {
  CHAT_SETTINGS_REPOSITORY,
  ChatSettingsPatch,
  ChatSettingsRepository,
} from '../../application/ports/chat-settings.repository';
import {
  TradeButtonRegistry,
  TradeButtonCode,
} from '../../infrastructure/telegram/trade-button-registry';

export interface ChatSettingsContext {
  readonly group: ChatGroupEntity;
  readonly settings: ChatSettingsEntity;
}

@Injectable()
export class ChatSettingsService {
  private readonly logger = new Logger(ChatSettingsService.name);

  public constructor(
    @Inject(CHAT_GROUP_REPOSITORY)
    private readonly chatGroupRepository: ChatGroupRepository,
    @Inject(CHAT_SETTINGS_REPOSITORY)
    private readonly chatSettingsRepository: ChatSettingsRepository,
    private readonly tradeButtonRegistry: TradeButtonRegistry,
  ) {}

  public async getOrCreateForChat(
    telegramChatId: string,
    telegramChatType: TelegramChatType,
    title?: string | null,
    telegramChatUsername?: string | null,
  ): Promise<ChatSettingsContext> {
    const group = await this.chatGroupRepository.upsert({
      telegramChatId,
      telegramChatType,
      title: title ?? null,
      telegramChatUsername: telegramChatUsername ?? null,
    });
    const settings = await this.chatSettingsRepository.upsert(group.id, {});
    return { group, settings };
  }

  public async touchLastSeen(telegramChatId: string): Promise<void> {
    const group =
      await this.chatGroupRepository.findByTelegramChatId(telegramChatId);
    if (group) {
      await this.chatGroupRepository.touchLastSeen(group.id);
    }
  }

  public async updateSettings(
    telegramChatId: string,
    patch: ChatSettingsPatch,
  ): Promise<ChatSettingsEntity> {
    const group =
      await this.chatGroupRepository.findByTelegramChatId(telegramChatId);
    if (!group) {
      throw new Error(
        `Chat group not found for telegramChatId=${telegramChatId}`,
      );
    }
    return this.chatSettingsRepository.upsert(group.id, patch);
  }

  public async toggleTradeButton(
    telegramChatId: string,
    code: TradeButtonCode,
  ): Promise<ChatSettingsEntity> {
    if (!this.tradeButtonRegistry.isKnownCode(code)) {
      throw new Error(`Unknown trade button code: ${String(code)}`);
    }
    const group =
      await this.chatGroupRepository.findByTelegramChatId(telegramChatId);
    if (!group) {
      throw new Error(
        `Chat group not found for telegramChatId=${telegramChatId}`,
      );
    }
    const current = await this.chatSettingsRepository.findByChatGroupId(
      group.id,
    );
    const currentCodes = current?.enabledTradeButtons ?? ['DEX', 'PHO', 'TRO'];
    const limit = current?.tradeButtonsLimit ?? 3;

    const set = new Set(currentCodes);
    let next: string[];
    if (set.has(code)) {
      set.delete(code);
      next = Array.from(set);
    } else {
      if (set.size >= limit) {
        this.logger.warn(
          `toggleTradeButton: chat ${telegramChatId} already at limit ${limit}, refusing to add ${code}`,
        );
        if (current) return current;
        throw new Error(`Trade button limit (${limit}) reached`);
      }
      set.add(code);
      next = Array.from(set);
    }

    return this.chatSettingsRepository.upsert(group.id, {
      enabledTradeButtons: next,
    });
  }
}
