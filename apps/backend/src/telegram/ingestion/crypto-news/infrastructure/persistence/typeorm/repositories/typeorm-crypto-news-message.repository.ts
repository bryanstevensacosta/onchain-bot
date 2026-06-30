import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsMessageEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity';
import { CryptoNewsMessageMapper } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/mappers/crypto-news-message.mapper';

/**
 * Postgres-backed implementation of `CryptoNewsMessageRepository`.
 */
@Injectable()
export class TypeOrmCryptoNewsMessageRepository extends CryptoNewsMessageRepository {
  constructor(
    @InjectRepository(CryptoNewsMessageEntity)
    private readonly repo: Repository<CryptoNewsMessageEntity>,
  ) {
    super();
  }

  public async save(message: CryptoNewsMessage): Promise<void> {
    const row = CryptoNewsMessageMapper.toEntity(message);
    await this.repo.save(row);
  }

  public async findById(id: string): Promise<CryptoNewsMessage | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? CryptoNewsMessageMapper.toDomain(row) : null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<CryptoNewsMessage>> {
    const rows = await this.repo.find({
      order: { ingestedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => CryptoNewsMessageMapper.toDomain(r));
  }

  public async findByChannelId(
    channelId: string,
    limit: number,
  ): Promise<ReadonlyArray<CryptoNewsMessage>> {
    const rows = await this.repo.find({
      where: { channelId },
      order: { ingestedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => CryptoNewsMessageMapper.toDomain(r));
  }
}
