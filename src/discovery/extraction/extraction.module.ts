import { Module } from '@nestjs/common';
import { ExtractorPort } from 'discovery/extraction/domain/ports/extractor.port';
import { ExtractionEventPublisher } from 'discovery/extraction/application/ports/extraction-event.publisher';
import { ExtractionResultRepository } from 'discovery/extraction/application/ports/extraction-result.repository';
import { ExtractFromMessageUseCase } from 'discovery/extraction/application/handlers/extract-from-message.use-case';
import { GetExtractionResultUseCase } from 'discovery/extraction/application/handlers/get-extraction-result.use-case';
import { GetRecentResultsUseCase } from 'discovery/extraction/application/handlers/get-recent-results.use-case';
import { RegexBasedExtractorAdapter } from 'discovery/extraction/infrastructure/adapters/regex-based-extractor.adapter';
import { InProcessExtractionEventPublisher } from 'discovery/extraction/infrastructure/messaging/in-process-extraction-event.publisher';
import { InMemoryExtractionResultRepository } from 'discovery/extraction/infrastructure/repositories/in-memory-extraction-result.repository';
import { MessageIngestedHandler } from 'discovery/extraction/infrastructure/event-bus/message-ingested.handler';
import { ExtractionController } from 'discovery/extraction/api/http/extraction.controller';

/**
 * Extraction BC module.
 *
 * Wires the hexagonal layers:
 * - `api/` — inbound HTTP adapter
 * - `infrastructure/` — regex adapter, in-process publisher, in-memory repo, event bus handler
 * - Application use cases orchestrate domain
 * - Domain has zero NestJS dependencies
 *
 * Consumes: `telegram.message.ingested` events (via EventEmitter2)
 * Emits: `extraction.candidates.extracted` events (via EventEmitter2)
 */
@Module({
  controllers: [ExtractionController],
  providers: [
    ExtractFromMessageUseCase,
    GetExtractionResultUseCase,
    GetRecentResultsUseCase,
    MessageIngestedHandler,
    { provide: ExtractorPort, useClass: RegexBasedExtractorAdapter },
    {
      provide: ExtractionEventPublisher,
      useClass: InProcessExtractionEventPublisher,
    },
    {
      provide: ExtractionResultRepository,
      useClass: InMemoryExtractionResultRepository,
    },
  ],
  exports: [
    ExtractorPort,
    ExtractionEventPublisher,
    ExtractionResultRepository,
  ],
})
export class ExtractionModule {}
