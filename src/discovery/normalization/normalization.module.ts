import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { CanonicalTokenCallRepository } from 'discovery/normalization/application/ports/canonical-token-call.repository';
import { NormalizationEventPublisher } from 'discovery/normalization/application/ports/normalization-event.publisher';
import { NormalizeCallUseCase } from 'discovery/normalization/application/handlers/normalize-call.use-case';
import { GetCanonicalCallUseCase } from 'discovery/normalization/application/handlers/get-canonical-call.use-case';
import { ListCanonicalCallsUseCase } from 'discovery/normalization/application/handlers/list-canonical-calls.use-case';
import { InMemoryCanonicalTokenCallRepository } from 'discovery/normalization/infrastructure/repositories/in-memory-canonical-token-call.repository';
import { TypeOrmCanonicalTokenCallRepository } from 'discovery/normalization/infrastructure/persistence/typeorm/repositories/typeorm-canonical-token-call.repository';
import { CanonicalTokenCallEntity } from 'discovery/normalization/infrastructure/persistence/typeorm/entities/canonical-token-call.entity';
import { InProcessNormalizationEventPublisher } from 'discovery/normalization/infrastructure/messaging/in-process-normalization-event.publisher';
import { CallParsedHandler } from 'discovery/normalization/infrastructure/event-bus/call-parsed.handler';
import { NormalizationController } from 'discovery/normalization/api/http/normalization.controller';
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
