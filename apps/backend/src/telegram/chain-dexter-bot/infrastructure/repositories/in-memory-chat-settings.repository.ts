import { Injectable, Logger } from '@nestjs/common';
import { ChatSettingsEntity } from '../../domain/chat-settings.entity';
import {
  ChatSettingsPatch,
  ChatSettingsRepository,
} from '../../application/ports/chat-settings.repository';

const DEFAULTS: Omit<ChatSettingsEntity, 'id' | 'chatGroupId' | 'updatedAt'> = {
  enabledTradeButtons: ['DEX', 'PHO', 'TRO'],
  tradeButtonsPosition: 'bot',
  tradeButtonsLimit: 3,
  emojiMode: true,
  groupMode: true,
  autoResponder: true,
  priceMode: 'adv',
};

@Injectable()
export class InMemoryChatSettingsRepository implements ChatSettingsRepository {
  private readonly logger = new Logger(InMemoryChatSettingsRepository.name);
  private readonly byId = new Map<string, ChatSettingsEntity>();
  private readonly byChatGroupId = new Map<string, string>();

  public async findByChatGroupId(
    chatGroupId: string,
  ): Promise<ChatSettingsEntity | null> {
    const id = this.byChatGroupId.get(chatGroupId);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  public async upsert(
    chatGroupId: string,
    patch: ChatSettingsPatch,
  ): Promise<ChatSettingsEntity> {
    const existing = await this.findByChatGroupId(chatGroupId);
    if (existing) {
      Object.assign(existing, patch);
      existing.updatedAt = new Date();
      return existing;
    }
    const entity = new ChatSettingsEntity();
    entity.id = cryptoRandomUuid();
    entity.chatGroupId = chatGroupId;
    entity.enabledTradeButtons = [...DEFAULTS.enabledTradeButtons];
    entity.tradeButtonsPosition = DEFAULTS.tradeButtonsPosition;
    entity.tradeButtonsLimit = DEFAULTS.tradeButtonsLimit;
    entity.emojiMode = DEFAULTS.emojiMode;
    entity.groupMode = DEFAULTS.groupMode;
    entity.autoResponder = DEFAULTS.autoResponder;
    entity.priceMode = DEFAULTS.priceMode;
    Object.assign(entity, patch);
    entity.updatedAt = new Date();
    this.byId.set(entity.id, entity);
    this.byChatGroupId.set(chatGroupId, entity.id);
    return entity;
  }
}

function cryptoRandomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
