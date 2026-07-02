import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { TokenClassificationRepository } from 'token/classification/application/ports/token-classification.repository';
import { ClassificationEventPublisher } from 'token/classification/application/ports/classification-event.publisher';
import { ClassifyTokenUseCase } from 'token/classification/application/handlers/classify-token.use-case';
import { GetClassificationUseCase } from 'token/classification/application/handlers/get-classification.use-case';
import { ListClassificationsUseCase } from 'token/classification/application/handlers/list-classifications.use-case';
import { InMemoryTokenClassificationRepository } from 'token/classification/infrastructure/repositories/in-memory-token-classification.repository';
import { TokenClassificationEntity } from 'token/classification/infrastructure/persistence/typeorm/entities/token-classification.entity';
import { TypeOrmTokenClassificationRepository } from 'token/classification/infrastructure/persistence/typeorm/repositories/typeorm-token-classification.repository';
import { TokenEnrichedHandler } from 'token/classification/infrastructure/event-bus/token-enriched.handler';
import { ClassificationController } from 'token/classification/api/http/classification.controller';
import { InProcessDomainEventPublisher } from 'shared/common/messaging/in-process-domain-event.publisher';

/**
 * Classification BC module.
 *
 * Consumes: `enrichment.token.enriched` events
 * Emits:    `classification.token.classified` events
 *
 * v1 uses heuristic rules based on enrichment snapshot data only.
 * v2 will add on-chain contract analysis (function selectors, bytecode).
 *
 * N18: TokenClassification persisted via TypeORM (Tier-2).
 */
@Module({
  imports: [TypeOrmModule.forFeature([TokenClassificationEntity])],
  controllers: [ClassificationController],
  providers: [
    ClassifyTokenUseCase,
    GetClassificationUseCase,
    ListClassificationsUseCase,
    TokenEnrichedHandler,
    InMemoryTokenClassificationRepository,
    ...(isDatabaseEnabled() ? [TypeOrmTokenClassificationRepository] : []),
    {
      provide: TokenClassificationRepository,
      inject: [
        InMemoryTokenClassificationRepository,
        ...(isDatabaseEnabled() ? [TypeOrmTokenClassificationRepository] : []),
      ],
      useFactory: (
        inMemory: InMemoryTokenClassificationRepository,
        typeorm?: TypeOrmTokenClassificationRepository,
      ): TokenClassificationRepository => typeorm ?? inMemory,
    },
    {
      provide: ClassificationEventPublisher,
      useClass: InProcessDomainEventPublisher,
    },
  ],
  exports: [TokenClassificationRepository, ClassificationEventPublisher],
})
export class ClassificationModule {}
