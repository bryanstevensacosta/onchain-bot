import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PublisherThrottleState } from 'telegram/crypto-news-publisher/domain/entities/publisher-throttle-state.entity';
import { PublisherThrottleStateRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-throttle-state.repository';
import { PublisherThrottleStateEntity } from 'telegram/crypto-news-publisher/infrastructure/persistence/typeorm/entities/publisher-throttle-state.entity';

/**
 * Postgres-backed implementation of `PublisherThrottleStateRepository`.
 *
 * Backs a singleton row (`id=1`); `load()` returns an "empty" state
 * when the row is absent (first boot). `save()` upserts.
 */
@Injectable()
export class TypeOrmPublisherThrottleStateRepository extends PublisherThrottleStateRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  public async load(): Promise<PublisherThrottleState> {
    const repo = this.dataSource.getRepository(PublisherThrottleStateEntity);
    const row = await repo.findOne({
      where: { id: PublisherThrottleState.SINGLETON_ID },
    });
    return PublisherThrottleState.fromLastPublishAt(row?.lastPublishAt ?? null);
  }

  public async save(state: PublisherThrottleState): Promise<void> {
    const repo = this.dataSource.getRepository(PublisherThrottleStateEntity);
    await repo.save({
      id: PublisherThrottleState.SINGLETON_ID,
      lastPublishAt: state.lastPublishAt,
      updatedAt: new Date(),
    });
  }

  public async getLastPublishAt(): Promise<Date | null> {
    const state = await this.load();
    return state.lastPublishAt;
  }

  public async setLastPublishAt(at: Date): Promise<void> {
    const state = PublisherThrottleState.fromLastPublishAt(at);
    await this.save(state);
  }
}
