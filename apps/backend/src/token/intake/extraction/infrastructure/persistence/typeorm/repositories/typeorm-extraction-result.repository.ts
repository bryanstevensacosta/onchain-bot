import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractionResult } from 'token/intake/extraction/domain/entities/extraction-result.entity';
import { ExtractionResultRepository } from 'token/intake/extraction/application/ports/extraction-result.repository';
import { ExtractionResultEntity } from 'token/intake/extraction/infrastructure/persistence/typeorm/entities/extraction-result.entity';
import { ExtractionResultMapper } from 'token/intake/extraction/infrastructure/persistence/typeorm/mappers/extraction-result.mapper';

@Injectable()
export class TypeOrmExtractionResultRepository extends ExtractionResultRepository {
  public constructor(
    @InjectRepository(ExtractionResultEntity)
    private readonly repo: Repository<ExtractionResultEntity>,
  ) {
    super();
  }

  public async save(result: ExtractionResult): Promise<void> {
    await this.repo.save(ExtractionResultMapper.toRow(result));
  }

  public async findByChannelAndMessage(
    kolId: string,
    messageId: number,
  ): Promise<ExtractionResult | null> {
    const id = `${kolId}:${messageId}`;
    const row = await this.repo.findOne({
      where: { id, kolId, messageId: String(messageId) },
    });
    return row ? ExtractionResultMapper.toDomain(row) : null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ExtractionResult>> {
    const rows = await this.repo.find({
      order: { occurredAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => ExtractionResultMapper.toDomain(r));
  }
}
