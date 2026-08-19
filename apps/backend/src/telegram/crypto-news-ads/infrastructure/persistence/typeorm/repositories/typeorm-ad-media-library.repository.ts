import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AdMediaLibraryRecord,
  AdMediaLibraryRepository,
} from 'telegram/crypto-news-ads/application/ports/ad-media-library.repository';
import { AdMediaLibraryEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-media-library.entity';

/**
 * Postgres-backed implementation of `AdMediaLibraryRepository`.
 *
 * `delete` is a no-op-safe delete: TypeORM `delete(id)` resolves normally even
 * when no row matches (e.g. backfill/test cleanup of an already-absent row).
 */
@Injectable()
export class TypeOrmAdMediaLibraryRepository extends AdMediaLibraryRepository {
  constructor(
    @InjectRepository(AdMediaLibraryEntity)
    private readonly repo: Repository<AdMediaLibraryEntity>,
  ) {
    super();
  }

  public async save(
    record: AdMediaLibraryRecord,
  ): Promise<AdMediaLibraryRecord> {
    const row = await this.repo.save(
      TypeOrmAdMediaLibraryRepository.toEntity(record),
    );
    return TypeOrmAdMediaLibraryRepository.toRecord(row);
  }

  public async findById(id: string): Promise<AdMediaLibraryRecord | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? TypeOrmAdMediaLibraryRepository.toRecord(row) : null;
  }

  public async findByContentHash(
    hash: string,
  ): Promise<AdMediaLibraryRecord | null> {
    const row = await this.repo.findOne({ where: { contentHash: hash } });
    return row ? TypeOrmAdMediaLibraryRepository.toRecord(row) : null;
  }

  public async findAll(): Promise<ReadonlyArray<AdMediaLibraryRecord>> {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
    return rows.map((row) => TypeOrmAdMediaLibraryRepository.toRecord(row));
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  private static toRecord(entity: AdMediaLibraryEntity): AdMediaLibraryRecord {
    return {
      id: entity.id,
      filePath: entity.filePath,
      contentHash: entity.contentHash,
      originalFileName: entity.originalFileName ?? null,
      mimeType: entity.mimeType ?? null,
      fileSize: entity.fileSize ?? null,
      createdAt: entity.createdAt,
    };
  }

  private static toEntity(record: AdMediaLibraryRecord): AdMediaLibraryEntity {
    const entity = new AdMediaLibraryEntity();
    entity.id = record.id;
    entity.filePath = record.filePath;
    entity.contentHash = record.contentHash;
    entity.originalFileName = record.originalFileName ?? null;
    entity.mimeType = record.mimeType ?? null;
    entity.fileSize = record.fileSize ?? null;
    entity.createdAt = record.createdAt;
    return entity;
  }
}
