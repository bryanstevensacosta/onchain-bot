/**
 * @deprecated Moved to apps/kol-calls/src/extraction/ (Tramo 1, todo 5 + P18 companion).
 * Extraction per-mention now lives in kol-calls: ExtractFromMessageUseCase (direct call,
 * fix-1, no event bus; multi-tip NO collapse, one row per mention) + snapshot base emit.
 * This file stays wired for dual-run; it will be removed in todo 16 (cutover + cleanup).
 * Do not extend it — add extraction logic in apps/kol-calls/src/extraction/ instead.
 *
 * New location: apps/kol-calls/src/extraction/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractionResult } from 'token/intake/extraction/domain/entities/extraction-result.entity';
import { ExtractionResultRepository } from 'token/intake/extraction/application/ports/extraction-result.repository';
import { ExtractionResultEntity } from 'token/intake/extraction/infrastructure/persistence/typeorm/entities/extraction-result.entity';
import { ExtractionResultMapper } from 'token/intake/extraction/infrastructure/persistence/typeorm/mappers/extraction-result.mapper';

@Injectable()
export class TypeOrmExtractionResultRepository extends ExtractionResultRepository {
  private readonly logger = new Logger(TypeOrmExtractionResultRepository.name);

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
    const result: ExtractionResult[] = [];
    for (const r of rows) {
      try {
        result.push(ExtractionResultMapper.toDomain(r));
      } catch (err) {
        this.logger.warn(
          `Skipping invalid extraction row (id=${r.id}): ${(err as Error).message}`,
        );
      }
    }
    return result;
  }
}
