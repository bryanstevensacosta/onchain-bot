import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsMessageEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity';
import { CryptoNewsMessageMediaEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity';
import { CryptoNewsMessageMapper } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/mappers/crypto-news-message.mapper';

/**
 * Postgres-backed implementation of `CryptoNewsMessageRepository`.
 */
@Injectable()
export class TypeOrmCryptoNewsMessageRepository extends CryptoNewsMessageRepository {
  constructor(
    @InjectRepository(CryptoNewsMessageEntity)
    private readonly repo: Repository<CryptoNewsMessageEntity>,
    @InjectRepository(CryptoNewsMessageMediaEntity)
    private readonly mediaRepo: Repository<CryptoNewsMessageMediaEntity>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  public async save(message: CryptoNewsMessage): Promise<void> {
    const row = CryptoNewsMessageMapper.toEntity(message);
    await this.dataSource.transaction(async (manager) => {
      await manager.save(row);
    });
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

  public async findByChannelAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<CryptoNewsMessage | null> {
    const row = await this.repo.findOne({
      where: { channelId, messageId },
    });
    return row ? CryptoNewsMessageMapper.toDomain(row) : null;
  }

  public async findByChannelAndGroupedId(
    channelId: string,
    groupedId: string,
  ): Promise<ReadonlyArray<CryptoNewsMessage>> {
    const rows = await this.repo.find({
      where: { channelId, groupedId },
      order: { messageId: 'ASC' },
    });
    return rows.map((r) => CryptoNewsMessageMapper.toDomain(r));
  }

  public async findMediaById(
    mediaId: string,
  ): Promise<CryptoNewsMessageMediaEntity | null> {
    return this.mediaRepo.findOne({ where: { id: mediaId } });
  }
}
