/**
 * @deprecated Moved to apps/feed-publisher/src/queue/ + apps/feed-publisher/src/llm/ + apps/feed-publisher/src/keywords/ (Tramo 2, todos 3+4+5 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add queue/llm/keywords logic in apps/feed-publisher/src/{queue,llm,keywords}/ instead.
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SharedThrottleState } from 'telegram/shared/domain/entities/shared-throttle-state.entity';
import { SharedThrottleStateRepository } from 'telegram/shared/application/ports/shared-throttle-state.repository';
import { PublisherThrottleStateEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/publisher-throttle-state.entity';

/**
 * Postgres-backed implementation of `SharedThrottleStateRepository`
 * against the `crypto_news_publisher_throttle_state` table.
 *
 * Backs a singleton row (`id=1`); `load()` returns an "empty" state
 * when the row is absent (first boot). `save()` upserts.
 */
@Injectable()
export class TypeOrmSharedThrottleStateRepository extends SharedThrottleStateRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  public async load(): Promise<SharedThrottleState> {
    const repo = this.dataSource.getRepository(PublisherThrottleStateEntity);
    const row = await repo.findOne({
      where: { id: SharedThrottleState.SINGLETON_ID },
    });
    return SharedThrottleState.fromLastPublishAt(row?.lastPublishAt ?? null);
  }

  public async save(state: SharedThrottleState): Promise<void> {
    const repo = this.dataSource.getRepository(PublisherThrottleStateEntity);
    await repo.save({
      id: SharedThrottleState.SINGLETON_ID,
      lastPublishAt: state.lastPublishAt,
      updatedAt: new Date(),
    });
  }

  public async getLastPublishAt(): Promise<Date | null> {
    const state = await this.load();
    return state.lastPublishAt;
  }

  public async setLastPublishAt(at: Date): Promise<void> {
    const state = SharedThrottleState.fromLastPublishAt(at);
    await this.save(state);
  }
}
