import { Module } from '@nestjs/common';
import { TokenClassificationRepository } from 'ca/classification/application/ports/token-classification.repository';
import { ClassificationEventPublisher } from 'ca/classification/application/ports/classification-event.publisher';
import { ClassifyTokenUseCase } from 'ca/classification/application/handlers/classify-token.use-case';
import { GetClassificationUseCase } from 'ca/classification/application/handlers/get-classification.use-case';
import { ListClassificationsUseCase } from 'ca/classification/application/handlers/list-classifications.use-case';
import { InMemoryTokenClassificationRepository } from 'ca/classification/infrastructure/repositories/in-memory-token-classification.repository';
import { InProcessClassificationEventPublisher } from 'ca/classification/infrastructure/messaging/in-process-classification-event.publisher';
import { TokenEnrichedHandler } from 'ca/classification/infrastructure/event-bus/token-enriched.handler';
import { ClassificationController } from 'ca/classification/api/http/classification.controller';

/**
 * Classification BC module.
 *
 * Consumes: `enrichment.token.enriched` events
 * Emits:    `classification.token.classified` events
 *
 * v1 uses heuristic rules based on enrichment snapshot data only.
 * v2 will add on-chain contract analysis (function selectors, bytecode).
 */
@Module({
  controllers: [ClassificationController],
  providers: [
    ClassifyTokenUseCase,
    GetClassificationUseCase,
    ListClassificationsUseCase,
    TokenEnrichedHandler,
    {
      provide: TokenClassificationRepository,
      useClass: InMemoryTokenClassificationRepository,
    },
    {
      provide: ClassificationEventPublisher,
      useClass: InProcessClassificationEventPublisher,
    },
  ],
  exports: [TokenClassificationRepository, ClassificationEventPublisher],
})
export class ClassificationModule {}
