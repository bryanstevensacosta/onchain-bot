import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { CanonicalTokenCallRepository } from 'ca/normalization/application/ports/canonical-token-call.repository';
import { NormalizationEventPublisher } from 'ca/normalization/application/ports/normalization-event.publisher';
import { NormalizeCallUseCase } from 'ca/normalization/application/handlers/normalize-call.use-case';
import { GetCanonicalCallUseCase } from 'ca/normalization/application/handlers/get-canonical-call.use-case';
import { ListCanonicalCallsUseCase } from 'ca/normalization/application/handlers/list-canonical-calls.use-case';
import { InMemoryCanonicalTokenCallRepository } from 'ca/normalization/infrastructure/repositories/in-memory-canonical-token-call.repository';
import { TypeOrmCanonicalTokenCallRepository } from 'ca/normalization/infrastructure/persistence/typeorm/repositories/typeorm-canonical-token-call.repository';
import { CanonicalTokenCallEntity } from 'ca/normalization/infrastructure/persistence/typeorm/entities/canonical-token-call.entity';
import { InProcessNormalizationEventPublisher } from 'ca/normalization/infrastructure/messaging/in-process-normalization-event.publisher';
import { CallParsedHandler } from 'ca/normalization/infrastructure/event-bus/call-parsed.handler';
import { NormalizationController } from 'ca/normalization/api/http/normalization.controller';
import type { AppConfig } from 'shared/common/config/app.config';

@Module({
  imports: [
    ConfigModule,
    ...(isDatabaseEnabled()
      ? [TypeOrmModule.forFeature([CanonicalTokenCallEntity])]
      : []),
  ],
  controllers: [NormalizationController],
  providers: [
    NormalizeCallUseCase,
    GetCanonicalCallUseCase,
    ListCanonicalCallsUseCase,
    CallParsedHandler,
    InMemoryCanonicalTokenCallRepository,
    ...(isDatabaseEnabled() ? [TypeOrmCanonicalTokenCallRepository] : []),
    {
      provide: CanonicalTokenCallRepository,
      inject: [
        ConfigService,
        InMemoryCanonicalTokenCallRepository,
        ...(isDatabaseEnabled() ? [TypeOrmCanonicalTokenCallRepository] : []),
      ],
      useFactory: (
        config: ConfigService,
        inMemory: InMemoryCanonicalTokenCallRepository,
        typeorm?: TypeOrmCanonicalTokenCallRepository,
      ): CanonicalTokenCallRepository => {
        const enabled =
          config.get<AppConfig>('app')?.database?.enabled === true;
        return enabled && typeorm ? typeorm : inMemory;
      },
    },
    {
      provide: NormalizationEventPublisher,
      useClass: InProcessNormalizationEventPublisher,
    },
  ],
  exports: [CanonicalTokenCallRepository, NormalizationEventPublisher],
})
export class NormalizationModule {}
