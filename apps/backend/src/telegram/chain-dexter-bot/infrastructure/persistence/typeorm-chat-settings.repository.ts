import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatSettingsEntity } from '../../domain/chat-settings.entity';
import {
  ChatSettingsPatch,
  ChatSettingsRepository,
} from '../../application/ports/chat-settings.repository';

const DEFAULTS = {
  enabledTradeButtons: ['DEX', 'PHO', 'TRO'],
  tradeButtonsPosition: 'bot' as const,
  tradeButtonsLimit: 3,
  emojiMode: true,
  groupMode: true,
  autoResponder: true,
  priceMode: 'adv' as const,
};

@Injectable()
export class TypeOrmChatSettingsRepository implements ChatSettingsRepository {
  private readonly logger = new Logger(TypeOrmChatSettingsRepository.name);

  public constructor(
    @InjectRepository(ChatSettingsEntity)
    private readonly repo: Repository<ChatSettingsEntity>,
  ) {}

  public async findByChatGroupId(
    chatGroupId: string,
  ): Promise<ChatSettingsEntity | null> {
    return this.repo.findOne({ where: { chatGroupId } });
  }

  public async upsert(
    chatGroupId: string,
    patch: ChatSettingsPatch,
  ): Promise<ChatSettingsEntity> {
    const existing = await this.findByChatGroupId(chatGroupId);
    if (existing) {
      Object.assign(existing, patch);
      return this.repo.save(existing);
    }
    const entity = this.repo.create({
      chatGroupId,
      enabledTradeButtons: DEFAULTS.enabledTradeButtons,
      tradeButtonsPosition: DEFAULTS.tradeButtonsPosition,
      tradeButtonsLimit: DEFAULTS.tradeButtonsLimit,
      emojiMode: DEFAULTS.emojiMode,
      groupMode: DEFAULTS.groupMode,
      autoResponder: DEFAULTS.autoResponder,
      priceMode: DEFAULTS.priceMode,
      ...patch,
    });
    return this.repo.save(entity);
  }
}
