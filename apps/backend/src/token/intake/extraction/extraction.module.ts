import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { ExtractorPort } from 'token/intake/extraction/domain/ports/extractor.port';
import { ExtractionEventPublisher } from 'token/intake/extraction/application/ports/extraction-event.publisher';
import { ExtractionResultRepository } from 'token/intake/extraction/application/ports/extraction-result.repository';
import { ExtractFromMessageUseCase } from 'token/intake/extraction/application/handlers/extract-from-message.use-case';
import { GetExtractionResultUseCase } from 'token/intake/extraction/application/handlers/get-extraction-result.use-case';
import { GetRecentResultsUseCase } from 'token/intake/extraction/application/handlers/get-recent-results.use-case';
import { RegexBasedExtractorAdapter } from 'token/intake/extraction/infrastructure/adapters/regex-based-extractor.adapter';
import { InProcessExtractionEventPublisher } from 'token/intake/extraction/infrastructure/messaging/in-process-extraction-event.publisher';
import { InMemoryExtractionResultRepository } from 'token/intake/extraction/infrastructure/repositories/in-memory-extraction-result.repository';
import { ExtractionResultEntity } from 'token/intake/extraction/infrastructure/persistence/typeorm/entities/extraction-result.entity';
import { TypeOrmExtractionResultRepository } from 'token/intake/extraction/infrastructure/persistence/typeorm/repositories/typeorm-extraction-result.repository';
import { ExtractionController } from 'token/intake/extraction/api/http/extraction.controller';

/**
 * Extraction BC module.
 *
 * Wires the hexagonal layers:
 * - `api/` — inbound HTTP adapter
 * - `infrastructure/` — regex adapter, in-process publisher, repo (in-memory or TypeORM)
 * - Application use cases orchestrate domain
 * - Domain has zero NestJS dependencies
 *
 * Per fix-1: KolMessageIngestedHandler was removed. The use case is
 * invoked via direct call from StartKolIngestionUseCase
 * (telegram-kol/ingestion/) so that the raw text never crosses an
 * event bus boundary.
 *
 * Emits: `extraction.candidates.extracted` events (via EventEmitter2) for
 * observability (no payload text).
 *
 * N18: ExtractionResult persisted via TypeORM (Tier-2).
 */
@Module({
  imports: [
    ...(isDatabaseEnabled()
      ? [TypeOrmModule.forFeature([ExtractionResultEntity])]
      : []),
  ],
  controllers: [ExtractionController],
  providers: [
    ExtractFromMessageUseCase,
    GetExtractionResultUseCase,
    GetRecentResultsUseCase,
    { provide: ExtractorPort, useClass: RegexBasedExtractorAdapter },
    {
      provide: ExtractionEventPublisher,
      useClass: InProcessExtractionEventPublisher,
    },
    InMemoryExtractionResultRepository,
    ...(isDatabaseEnabled() ? [TypeOrmExtractionResultRepository] : []),
    {
      provide: ExtractionResultRepository,
      inject: [
        InMemoryExtractionResultRepository,
        ...(isDatabaseEnabled() ? [TypeOrmExtractionResultRepository] : []),
      ],
      useFactory: (
        inMemory: InMemoryExtractionResultRepository,
        typeorm?: TypeOrmExtractionResultRepository,
      ): ExtractionResultRepository => typeorm ?? inMemory,
    },
  ],
  exports: [
    ExtractorPort,
    ExtractionEventPublisher,
    ExtractionResultRepository,
    ExtractFromMessageUseCase,
  ],
})
export class ExtractionModule {}
