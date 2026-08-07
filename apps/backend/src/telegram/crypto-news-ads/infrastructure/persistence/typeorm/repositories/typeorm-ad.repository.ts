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

  public async findAllActive(now: Date): Promise<ReadonlyArray<Ad>> {
    const rows = await this.repo
      .createQueryBuilder('ad')
      .where('ad.enabled = :enabled', { enabled: true })
      .andWhere('ad.expires_at IS NULL OR ad.expires_at > :now', { now })
      .orderBy('ad.order', 'ASC')
      .getMany();
    return rows.map((r) => AdMapper.toDomain(r));
  }

  public async findExpired(now: Date): Promise<ReadonlyArray<Ad>> {
    const rows = await this.repo
      .createQueryBuilder('ad')
      .where('ad.expires_at IS NOT NULL AND ad.expires_at <= :now', { now })
      .orderBy('ad.order', 'ASC')
      .getMany();
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
