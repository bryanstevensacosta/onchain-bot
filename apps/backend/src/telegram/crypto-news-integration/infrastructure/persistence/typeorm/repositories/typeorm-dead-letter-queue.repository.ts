import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeadLetterQueueRepository } from 'telegram/crypto-news-integration/application/ports/dead-letter-queue.repository';
import { DeadLetterQueueEntry } from 'telegram/crypto-news-integration/domain/entities/dead-letter-queue-entry.entity';
import { DeadLetterQueueEntity } from 'telegram/crypto-news-integration/infrastructure/persistence/typeorm/entities/dead-letter-queue.entity';

@Injectable()
export class TypeOrmDeadLetterQueueRepository extends DeadLetterQueueRepository {
  constructor(
    @InjectRepository(DeadLetterQueueEntity)
    private readonly repo: Repository<DeadLetterQueueEntity>,
  ) {
    super();
  }

  async save(entry: DeadLetterQueueEntry): Promise<void> {
    await this.repo.save({
      id: entry.id,
      channelId: entry.channelId,
      messageId: entry.messageId,
      failureReason: entry.failureReason,
      failedPayload: entry.failedPayload,
      failedAt: entry.failedAt,
      retryCount: entry.retryCount,
      status: entry.status,
    });
  }

  async findById(id: string): Promise<DeadLetterQueueEntry | null> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) return null;
    return DeadLetterQueueEntry.reconstitute({
      id: row.id,
      channelId: row.channelId,
      messageId: row.messageId,
      failureReason: row.failureReason,
      failedPayload: row.failedPayload,
      failedAt: row.failedAt,
      retryCount: row.retryCount ?? 0,
      status: row.status,
    });
  }

  async findAll(limit = 50): Promise<ReadonlyArray<DeadLetterQueueEntry>> {
    const rows = await this.repo.find({
      order: { failedAt: 'DESC' },
      take: limit,
    });
    return rows.map((row) =>
      DeadLetterQueueEntry.reconstitute({
        id: row.id,
        channelId: row.channelId,
        messageId: row.messageId,
        failureReason: row.failureReason,
        failedPayload: row.failedPayload,
        failedAt: row.failedAt,
        retryCount: row.retryCount ?? 0,
        status: row.status,
      }),
    );
  }
}
