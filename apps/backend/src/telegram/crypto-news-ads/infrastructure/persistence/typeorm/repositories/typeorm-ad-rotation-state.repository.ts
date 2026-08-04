import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdRotationState } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-state.entity';
import { AdRotationStateRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-state.repository';
import { AdRotationStateEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-rotation-state.entity';
import { AdRotationStateMapper } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/mappers/ad-rotation-state.mapper';

/**
 * Postgres-backed implementation of `AdRotationStateRepository`.
 *
 * The table holds exactly one row (id = 1). `load()` returns the
 * default when the row is missing. The three mutation helpers read the
 * singleton, transform via the immutable domain aggregate, and
 * persist — they are the mutation path the use cases rely on.
 */
@Injectable()
export class TypeOrmAdRotationStateRepository extends AdRotationStateRepository {
  constructor(
    @InjectRepository(AdRotationStateEntity)
    private readonly repo: Repository<AdRotationStateEntity>,
  ) {
    super();
  }

  public async load(): Promise<AdRotationState> {
    const row = await this.repo.findOne({ where: { id: 1 } });
    return row ? AdRotationStateMapper.toDomain(row) : AdRotationState.empty();
  }

  public async save(state: AdRotationState): Promise<void> {
    await this.repo.save(AdRotationStateMapper.toEntity(state));
  }

  public async incrementPostsSinceLastAd(): Promise<void> {
    const state = await this.load();
    await this.save(state.incrementPostsSinceLastAd());
  }

  public async resetPostsSinceLastAd(): Promise<void> {
    const state = await this.load();
    await this.save(state.resetPostsSinceLastAd());
  }

  public async markAdPublished(adId: string, at: Date): Promise<void> {
    const state = await this.load();
    await this.save(state.withAdPublished(adId, at));
  }
}
