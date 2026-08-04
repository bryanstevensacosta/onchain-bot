import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { AdEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad.entity';
import { AdMapper } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/mappers/ad.mapper';

/**
 * Postgres-backed implementation of `AdRepository`.
 */
@Injectable()
export class TypeOrmAdRepository extends AdRepository {
  constructor(
    @InjectRepository(AdEntity)
    private readonly repo: Repository<AdEntity>,
  ) {
    super();
  }

  public async findAll(): Promise<ReadonlyArray<Ad>> {
    const rows = await this.repo.find({ order: { order: 'ASC' } });
    return rows.map((r) => AdMapper.toDomain(r));
  }

  public async findAllActive(): Promise<ReadonlyArray<Ad>> {
    const rows = await this.repo.find({
      where: { enabled: true },
      order: { order: 'ASC' },
    });
    return rows.map((r) => AdMapper.toDomain(r));
  }

  public async findById(id: string): Promise<Ad | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? AdMapper.toDomain(row) : null;
  }

  public async save(ad: Ad): Promise<Ad> {
    const row = await this.repo.save(AdMapper.toEntity(ad));
    return AdMapper.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  public async incrementFailures(id: string): Promise<void> {
    await this.repo.increment({ id }, 'consecutiveFailures', 1);
  }

  public async disable(id: string): Promise<void> {
    await this.repo.update({ id }, { enabled: false });
  }

  public async markPublished(
    id: string,
    _messageId: string,
    at: Date,
  ): Promise<void> {
    await this.repo.update(
      { id },
      {
        timesPublished: () => 'times_published + 1',
        lastPublishedAt: at,
      },
    );
  }
}
