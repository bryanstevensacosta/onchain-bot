import { Injectable, Logger } from '@nestjs/common';
import { ChatGroupEntity } from '../../domain/chat-group.entity';
import {
  ChatGroupRepository,
  ChatGroupUpsertInput,
} from '../../application/ports/chat-group.repository';

const MAX_ENTRIES = 1000;

@Injectable()
export class InMemoryChatGroupRepository implements ChatGroupRepository {
  private readonly logger = new Logger(InMemoryChatGroupRepository.name);
  private readonly byId = new Map<string, ChatGroupEntity>();
  private readonly byChatId = new Map<string, string>();

  public async findByTelegramChatId(
    telegramChatId: string,
  ): Promise<ChatGroupEntity | null> {
    const id = this.byChatId.get(telegramChatId);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  public async findById(id: string): Promise<ChatGroupEntity | null> {
    return this.byId.get(id) ?? null;
  }

  public async upsert(input: ChatGroupUpsertInput): Promise<ChatGroupEntity> {
    const existing = await this.findByTelegramChatId(input.telegramChatId);
    if (existing) {
      if (input.title != null && input.title !== existing.title) {
        existing.title = input.title;
      }
      if (
        input.telegramChatUsername != null &&
        input.telegramChatUsername !== existing.telegramChatUsername
      ) {
        existing.telegramChatUsername = input.telegramChatUsername;
      }
      return existing;
    }
    if (this.byId.size >= MAX_ENTRIES) {
      const oldestKey = this.firstKey(this.byId);
      if (oldestKey !== undefined) {
        const evicted = this.byId.get(oldestKey);
        if (evicted) this.byChatId.delete(evicted.telegramChatId);
        this.byId.delete(oldestKey);
        this.logger.warn(
          `InMemoryChatGroupRepository evicted oldest entry (max ${MAX_ENTRIES})`,
        );
      }
    }
    const entity = new ChatGroupEntity();
    entity.id = cryptoRandomUuid();
    entity.telegramChatId = input.telegramChatId;
    entity.telegramChatType = input.telegramChatType;
    entity.title = input.title ?? null;
    entity.telegramChatUsername = input.telegramChatUsername ?? null;
    entity.createdAt = new Date();
    entity.lastSeenAt = entity.createdAt;
    this.byId.set(entity.id, entity);
    this.byChatId.set(entity.telegramChatId, entity.id);
    return entity;
  }

  public async touchLastSeen(id: string): Promise<void> {
    const entity = this.byId.get(id);
    if (entity) {
      entity.lastSeenAt = new Date();
    }
  }

  private firstKey(map: Map<string, ChatGroupEntity>): string | undefined {
    const iter = map.keys();
    const next = iter.next();
    return next.done ? undefined : next.value;
  }
}

function cryptoRandomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
