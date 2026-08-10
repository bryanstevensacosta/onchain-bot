import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AdMediaRecord,
  AdMediaRepository,
} from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { AdMediaEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-media.entity';

/**
 * Postgres-backed implementation of `AdMediaRepository`.
 *
 * `deleteByAdId` is a no-op-safe delete: TypeORM `delete({ adId })` resolves
 * normally even when no row matches (e.g. the ad never had an image).
 */
@Injectable()
export class TypeOrmAdMediaRepository extends AdMediaRepository {
  constructor(
    @InjectRepository(AdMediaEntity)
    private readonly repo: Repository<AdMediaEntity>,
  ) {
    super();
  }

  public async save(media: AdMediaRecord): Promise<AdMediaRecord> {
    const row = await this.repo.save(TypeOrmAdMediaRepository.toEntity(media));
    return TypeOrmAdMediaRepository.toRecord(row);
  }

  public async findById(id: string): Promise<AdMediaRecord | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? TypeOrmAdMediaRepository.toRecord(row) : null;
  }

  public async findByAdId(adId: string): Promise<AdMediaRecord | null> {
    const row = await this.repo.findOne({ where: { adId } });
    return row ? TypeOrmAdMediaRepository.toRecord(row) : null;
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  public async deleteByAdId(adId: string): Promise<void> {
    await this.repo.delete({ adId });
  }

  private static toRecord(entity: AdMediaEntity): AdMediaRecord {
    return {
      id: entity.id,
      adId: entity.adId,
      filePath: entity.filePath,
      mimeType: entity.mimeType ?? null,
      fileSize: entity.fileSize ?? null,
      createdAt: entity.createdAt,
    };
  }

  private static toEntity(record: AdMediaRecord): AdMediaEntity {
    const entity = new AdMediaEntity();
    entity.id = record.id;
    entity.adId = record.adId;
    entity.filePath = record.filePath;
    entity.mimeType = record.mimeType ?? null;
    entity.fileSize = record.fileSize ?? null;
    entity.createdAt = record.createdAt;
    return entity;
  }
}
