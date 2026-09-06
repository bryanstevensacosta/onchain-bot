import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import {
  CryptoNewsSourceRepository,
  FilterRule,
} from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { CryptoNewsSourceEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-source.entity';
import { ChannelContentFilterConfigEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/channel-content-filter-config.entity';
import { CryptoNewsSourceMapper } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/mappers/crypto-news-source.mapper';

/**
 * Postgres-backed implementation of `CryptoNewsSourceRepository`.
 */
@Injectable()
export class TypeOrmCryptoNewsSourceRepository extends CryptoNewsSourceRepository {
  constructor(
    @InjectRepository(CryptoNewsSourceEntity)
    private readonly repo: Repository<CryptoNewsSourceEntity>,
    @InjectRepository(ChannelContentFilterConfigEntity)
    private readonly filterRepo: Repository<ChannelContentFilterConfigEntity>,
  ) {
    super();
  }

  /**
   * @deprecated Backend no longer writes crypto-news sources. Use ingestion-service.
   */
  public async save(source: CryptoNewsSource): Promise<void> {
    throw new Error(
      '[DEPRECATED] TypeOrmCryptoNewsSourceRepository.save() is deprecated. ' +
        'Backend no longer writes crypto-news sources. ' +
        'Use ingestion-service POST /api/crypto-news/sources instead.',
    );

    /* ────────────────────────────────────────────────────────────────────
     * OLD CODE (DISCONNECTED - DO NOT RE-ENABLE)
     * ────────────────────────────────────────────────────────────────────
     
    const row = CryptoNewsSourceMapper.toEntity(source);
    await this.repo.save(row);
    
     * ──────────────────────────────────────────────────────────────────── */
  }

  public async findByChannelId(
    channelId: string,
  ): Promise<CryptoNewsSource | null> {
    const row = await this.repo.findOne({ where: { channelId } });
    return row ? CryptoNewsSourceMapper.toDomain(row) : null;
  }

  public async findAll(): Promise<ReadonlyArray<CryptoNewsSource>> {
    const rows = await this.repo.find();
    return rows.map((r) => CryptoNewsSourceMapper.toDomain(r));
  }

  public async findActive(): Promise<ReadonlyArray<CryptoNewsSource>> {
    const rows = await this.repo.find({ where: { isActive: true } });
    return rows.map((r) => CryptoNewsSourceMapper.toDomain(r));
  }

  /**
   * @deprecated Backend no longer deletes crypto-news sources. Use ingestion-service.
   */
  public async delete(channelId: string): Promise<void> {
    throw new Error(
      '[DEPRECATED] TypeOrmCryptoNewsSourceRepository.delete() is deprecated. ' +
        'Backend no longer deletes crypto-news sources. ' +
        'Use ingestion-service DELETE /api/crypto-news/sources/{channelId} if such endpoint exists.',
    );

    /* ────────────────────────────────────────────────────────────────────
     * OLD CODE (DISCONNECTED - DO NOT RE-ENABLE)
     * ────────────────────────────────────────────────────────────────────
     
    await this.repo.delete({ channelId });
    
     * ──────────────────────────────────────────────────────────────────── */
  }

  public async findFiltersByChannelId(
    channelId: string,
  ): Promise<ReadonlyArray<FilterRule>> {
    const rows = await this.filterRepo.find({
      where: { channelId, isActive: true },
      order: { priority: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => ({
      pattern: row.pattern,
      replacement: row.replacement,
      flags: row.flags,
      priority: row.priority,
      isActive: row.isActive,
      createdAt: row.createdAt,
    }));
  }
}
