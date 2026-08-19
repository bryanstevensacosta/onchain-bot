import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { DedupRecord } from 'shared/deduplication/domain/entities/dedup-record.entity';
import { Fingerprint } from 'shared/deduplication/domain/value-objects/fingerprint.vo';
import { DeduplicationStore } from 'shared/deduplication/application/ports/deduplication-store.port';
import { DedupRecordEntity } from '../entities/dedup-record.entity';
import { DedupRecordMapper } from '../mappers/dedup-record.mapper';

/**
 * TypeORM-backed implementation of `DeduplicationStore`.
 *
 * Uses SQLite/Postgres depending on the configured datasource.
 * Provides persistence for deduplication fingerprints.
 */
@Injectable()
export class TypeOrmDeduplicationStore extends DeduplicationStore {
  constructor(
    @InjectRepository(DedupRecordEntity)
    private readonly repo: Repository<DedupRecordEntity>,
  ) {
    super();
  }

  public async save(record: DedupRecord): Promise<void> {
    const entity = DedupRecordMapper.toEntity(record);
    await this.repo.save(entity);
  }

  public async findExisting(
    fingerprint: Fingerprint,
    source: string,
  ): Promise<DedupRecord | null> {
    const entity = await this.repo.findOne({
      where: {
        fingerprintType: fingerprint.type,
        fingerprintValue: fingerprint.value,
        source,
      },
    });
    return entity ? DedupRecordMapper.toDomain(entity) : null;
  }

  public async findByUrlHash(
    urlHash: string,
    source: string,
    sinceDate: Date,
  ): Promise<DedupRecord | null> {
    const entity = await this.repo.findOne({
      where: {
        fingerprintType: 'url',
        fingerprintValue: urlHash,
        source,
        createdAt: MoreThanOrEqual(sinceDate),
      },
    });
    return entity ? DedupRecordMapper.toDomain(entity) : null;
  }

  public async findSimilarEmbeddings(
    embedding: number[],
    source: string,
    sinceDate: Date,
    threshold: number,
  ): Promise<Array<{ record: DedupRecord; similarity: number }>> {
    const entities = await this.repo.find({
      where: {
        source,
        createdAt: MoreThanOrEqual(sinceDate),
        embedding: Not(IsNull()),
      },
      order: { createdAt: 'DESC' },
    });

    const results: Array<{ record: DedupRecord; similarity: number }> = [];
    for (const entity of entities) {
      if (!entity.embedding) continue;
      const embA = embedding;
      const embB = entity.embedding;

      // Cosine similarity
      const dot = embA.reduce(
        (sum: number, v: number, i: number) => sum + v * (embB[i] ?? 0),
        0,
      );
      const magA = Math.sqrt(
        embA.reduce((sum: number, v: number) => sum + v * v, 0),
      );
      const magB = Math.sqrt(
        embB.reduce((sum: number, v: number) => sum + v * v, 0),
      );
      const similarity = magA === 0 || magB === 0 ? 0 : dot / (magA * magB);

      if (similarity >= threshold) {
        results.push({
          record: DedupRecordMapper.toDomain(entity),
          similarity,
        });
      }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);
    return results;
  }

  public async markSeen(record: DedupRecord): Promise<void> {
    return this.save(record);
  }

  public async pruneOlderThan(hours: number): Promise<number> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const result = await this.repo.delete({
      createdAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
  }
}
