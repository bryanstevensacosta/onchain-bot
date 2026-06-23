import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatGroupEntity } from '../../domain/chat-group.entity';
import {
  ChatGroupRepository,
  ChatGroupUpsertInput,
} from '../../application/ports/chat-group.repository';

@Injectable()
export class TypeOrmChatGroupRepository implements ChatGroupRepository {
  private readonly logger = new Logger(TypeOrmChatGroupRepository.name);

  public constructor(
    @InjectRepository(ChatGroupEntity)
    private readonly repo: Repository<ChatGroupEntity>,
  ) {}

  public async findByTelegramChatId(
    telegramChatId: string,
  ): Promise<ChatGroupEntity | null> {
    return this.repo.findOne({ where: { telegramChatId } });
  }

  public async findById(id: string): Promise<ChatGroupEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  public async upsert(input: ChatGroupUpsertInput): Promise<ChatGroupEntity> {
    const existing = await this.findByTelegramChatId(input.telegramChatId);
    if (existing) {
      let changed = false;
      if (input.title != null && input.title !== existing.title) {
        existing.title = input.title;
        changed = true;
      }
      if (
        input.telegramChatUsername != null &&
        input.telegramChatUsername !== existing.telegramChatUsername
      ) {
        existing.telegramChatUsername = input.telegramChatUsername;
        changed = true;
      }
      if (changed) {
        return this.repo.save(existing);
      }
      return existing;
    }
    const entity = this.repo.create({
      telegramChatId: input.telegramChatId,
      telegramChatType: input.telegramChatType,
      title: input.title ?? null,
      telegramChatUsername: input.telegramChatUsername ?? null,
    });
    return this.repo.save(entity);
  }

  public async touchLastSeen(id: string): Promise<void> {
    const entity = await this.repo.findOne({ where: { id } });
    if (entity) {
      entity.lastSeenAt = new Date();
      await this.repo.save(entity);
    }
  }
}
