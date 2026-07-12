import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { PublisherQueueEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/publisher-queue.entity';
import { PublisherQueueMapper } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/mappers/publisher-queue.mapper';

/**
 * Postgres-backed implementation of `PublisherQueueRepository`.
 *
 * The most subtle path is `enqueue()`: it runs the INSERT and the
 * overflow DELETE inside a single `DataSource.transaction()` so the
 * queue never momentarily exceeds the 36-entry cap. Under SQLite
 * (used by the in-memory spec) the same transaction guarantees the
 * DELETE is visible immediately after the INSERT.
 */
@Injectable()
export class TypeOrmPublisherQueueRepository extends PublisherQueueRepository {
  /** Hard-coded cap per the plan: keep the 36 most-recent entries. */
  private static readonly MAX_QUEUE_DEPTH = 36;
  private readonly logger = new Logger(TypeOrmPublisherQueueRepository.name);

  constructor(
    @InjectRepository(PublisherQueueEntity)
    private readonly repo: Repository<PublisherQueueEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super();
  }

  /**
   * Insert a new entry, then in the same transaction drop the oldest
   * rows until the table is at or below `MAX_QUEUE_DEPTH` (36).
   *
   * The DELETE is expressed in pure SQL (via the same `QueryRunner`)
   * so it works identically on Postgres and on the SQLite spec
   * backend — no dialect-specific syntax.
   */
  public async enqueue(entry: PublisherQueueEntry): Promise<void> {
    const row = PublisherQueueMapper.toEntity(entry);
    await this.dataSource.transaction(async (manager) => {
      await manager.save(row);
      await manager
        .createQueryBuilder()
        .delete()
        .from(PublisherQueueEntity)
        .where(
          `id NOT IN (` +
            `SELECT id FROM ${this.repo.metadata.tableName} ` +
            `ORDER BY message_received_at DESC ` +
            `LIMIT :cap` +
            `)`,
          { cap: TypeOrmPublisherQueueRepository.MAX_QUEUE_DEPTH },
        )
        .execute();
    });
  }

  public async findNextPending(): Promise<PublisherQueueEntry | null> {
    const row = await this.repo.findOne({
      where: { status: 'PENDING' },
      order: { messageReceivedAt: 'ASC' },
    });
    return row ? PublisherQueueMapper.toDomain(row) : null;
  }

  public async markPublished(
    id: string,
    telegramMessageId: string,
    generated?: {
      content: string;
      systemPrompt: string | null;
      userPrompt: string;
      temperature: number | null;
      reasoningEffort: string | null;
      model: string;
    },
  ): Promise<PublisherQueueEntry> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new Error(`Queue entry not found: ${id}`);
    }
    const entry = PublisherQueueMapper.toDomain(row);
    entry.markPublished(telegramMessageId, generated);
    await this.repo.save(PublisherQueueMapper.toEntity(entry));
    return entry;
  }

  public async markFailed(
    id: string,
    reason: string,
  ): Promise<PublisherQueueEntry> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new Error(`Queue entry not found: ${id}`);
    }
    const entry = PublisherQueueMapper.toDomain(row);
    entry.markFailed(reason);
    await this.repo.save(PublisherQueueMapper.toEntity(entry));
    return entry;
  }

  public async incrementAttempts(id: string): Promise<PublisherQueueEntry> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new Error(`Queue entry not found: ${id}`);
    }
    const entry = PublisherQueueMapper.toDomain(row);
    entry.incrementAttempts();
    await this.repo.save(PublisherQueueMapper.toEntity(entry));
    return entry;
  }

  public async findAllForDisplay(
    limit: number,
  ): Promise<ReadonlyArray<PublisherQueueEntry>> {
    const rows = await this.repo.find({
      order: { messageReceivedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => PublisherQueueMapper.toDomain(r));
  }

  /**
   * Count PUBLISHED rows whose `publishedAt` falls in the current day
   * window. The window starts at `resetHourUtc` (UTC) and rolls over
   * at the same hour the next day. For resetHourUtc=4 (the plan's
   * default, 04:00 UTC = 00:00 AST):
   *   - At 03:00 UTC on day N, the window is [04:00 UTC day N-1, now).
   *   - At 04:00 UTC on day N, the window resets to [04:00 UTC day N, now).
   */
  public async countPublishedToday(resetHourUtc: number): Promise<number> {
    const now = new Date();
    const windowStart = new Date(now);
    if (now.getUTCHours() < resetHourUtc) {
      windowStart.setUTCDate(windowStart.getUTCDate() - 1);
    }
    windowStart.setUTCHours(resetHourUtc, 0, 0, 0);

    return this.repo
      .createQueryBuilder('q')
      .where('q.status = :status', { status: 'PUBLISHED' })
      .andWhere('q.publishedAt IS NOT NULL')
      .andWhere('q.publishedAt >= :windowStart', { windowStart })
      .getCount();
  }

  public async findById(id: string): Promise<PublisherQueueEntry | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? PublisherQueueMapper.toDomain(row) : null;
  }

  public async findByIdForDisplay(
    id: string,
  ): Promise<PublisherQueueEntry | null> {
    return this.findById(id);
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
