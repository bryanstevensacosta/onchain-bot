import { Injectable, Logger } from '@nestjs/common';
import type {
  ChatGroup,
  ChatGroupRepository,
  ChatSettings,
  ChatSettingsPatch,
  ChatSettingsRepository,
  TelegramChatType,
} from './chat-settings';
import { InMemoryChatGroupRepository } from './in-memory.repositories';
import { InMemoryChatSettingsRepository } from './in-memory.repositories';
import { TradeButtonRegistry, TradeButtonCode } from './trade-button-registry';

export interface ChatSettingsContext {
  readonly group: ChatGroup;
  readonly settings: ChatSettings;
}

/**
 * Chat settings service (moved from backend chain-dexter-bot
 * `application/handlers/chat-settings.service.ts`).
 *
 * v1 wires the in-memory repositories directly (same behavior as the
 * backend with `DATABASE_ENABLED=false`). No TypeORM, no cross-BC
 * imports — lookup-only chat config.
 */
@Injectable()
export class ChatSettingsService {
  private readonly logger = new Logger(ChatSettingsService.name);

  public constructor(
    private readonly chatGroupRepository: ChatGroupRepository,
    private readonly chatSettingsRepository: ChatSettingsRepository,
    private readonly tradeButtonRegistry: TradeButtonRegistry,
  ) {}

  public static createInMemory(
    tradeButtonRegistry: TradeButtonRegistry,
  ): ChatSettingsService {
    return new ChatSettingsService(
      new InMemoryChatGroupRepository(),
      new InMemoryChatSettingsRepository(),
      tradeButtonRegistry,
    );
  }

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
  ): Promise<ChatSettings> {
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
  ): Promise<ChatSettings> {
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
