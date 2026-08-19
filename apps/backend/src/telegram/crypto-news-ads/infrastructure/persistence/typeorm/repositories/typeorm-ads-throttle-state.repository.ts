import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SharedThrottleState } from 'telegram/shared/domain/entities/shared-throttle-state.entity';
import { SharedThrottleStateRepository } from 'telegram/shared/application/ports/shared-throttle-state.repository';
import { AdsThrottleStateEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ads-throttle-state.entity';

/**
 * Ads-backed implementation of `SharedThrottleStateRepository`.
 *
 * Backs a singleton row (`id = 1`) against the
 * `crypto_news_ads_throttle_state` table so that the ads publisher
 * enforces its OWN random delay window independently of the news
 * publisher (which uses `crypto_news_publisher_throttle_state`). The
 * domain contract and the reader/writer are identical to the shared
 * throttle — only the table differs.
 */
@Injectable()
export class TypeOrmAdsThrottleStateRepository extends SharedThrottleStateRepository {
  constructor(
    @InjectRepository(AdsThrottleStateEntity)
    private readonly repo: Repository<AdsThrottleStateEntity>,
  ) {
    super();
  }

  public async load(): Promise<SharedThrottleState> {
    const row = await this.repo.findOne({ where: { id: 1 } });
    return SharedThrottleState.fromLastPublishAt(row?.lastPublishAt ?? null);
  }

  public async save(state: SharedThrottleState): Promise<void> {
    await this.repo.save({
      id: SharedThrottleState.SINGLETON_ID,
      lastPublishAt: state.lastPublishAt,
      updatedAt: new Date(),
    });
  }

  public async getLastPublishAt(): Promise<Date | null> {
    return (await this.load()).lastPublishAt;
  }

  public async setLastPublishAt(at: Date): Promise<void> {
    await this.save(SharedThrottleState.fromLastPublishAt(at));
  }
}
