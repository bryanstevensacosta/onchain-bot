import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramScheduledAdDispatcher } from '../telegram/application/dispatch/telegram-scheduled-ad.dispatcher';
import { ScheduledAdRepository } from './domain/ports/scheduled-ad.repository';
import { ScheduledAdMediaRepository } from './domain/ports/scheduled-ad-media.repository';
import { AdMediaLibraryRepository } from './domain/ports/ad-media-library.repository';
import { SchedulingConfigRepository } from './domain/ports/scheduling-config.repository';
import { SchedulingStateRepository } from './domain/ports/scheduling-state.repository';
import { ScheduledAdDispatcherPort } from './domain/ports/scheduled-ad-dispatcher.port';
import { SchedulingMediaStoragePort } from './domain/ports/scheduling-media-storage.port';
import { RotationDeciderService } from './application/services/rotation-decider.service';
import { PublishScheduledAdUseCase } from './application/use-cases/publish-scheduled-ad.use-case';
import { PublishScheduledAdNowUseCase } from './application/use-cases/publish-scheduled-ad-now.use-case';
import { UploadScheduledAdMediaUseCase } from './application/use-cases/upload-scheduled-ad-media.use-case';
import { ClearScheduledAdMediaUseCase } from './application/use-cases/clear-scheduled-ad-media.use-case';
import { ReuseLibraryMediaUseCase } from './application/use-cases/reuse-library-media.use-case';
import { SchedulingCronScheduler } from './application/scheduling/scheduling-cron.scheduler';
import { SchedulingHealthState } from './application/state/scheduling-health.state';
import { InMemoryScheduledAdRepository } from './infrastructure/persistence/in-memory/in-memory-scheduled-ad.repository';
import { InMemoryScheduledAdMediaRepository } from './infrastructure/persistence/in-memory/in-memory-scheduled-ad-media.repository';
import { InMemoryAdMediaLibraryRepository } from './infrastructure/persistence/in-memory/in-memory-ad-media-library.repository';
import { InMemorySchedulingConfigRepository } from './infrastructure/persistence/in-memory/in-memory-scheduling-config.repository';
import { InMemorySchedulingStateRepository } from './infrastructure/persistence/in-memory/in-memory-scheduling-state.repository';
import { LocalSchedulingMediaStorageAdapter } from './infrastructure/storage/local-scheduling-media-storage.adapter';
import { InMemoryScheduledAdDispatcher } from './infrastructure/dispatch/in-memory-scheduled-ad.dispatcher';
import { SchedulingAdsController } from './api/http/scheduling-ads.controller';
import { SchedulingRotationConfigController } from './api/http/scheduling-rotation-config.controller';
import { SchedulingMediaController } from './api/http/scheduling-media.controller';
import { SchedulingHealthIndicator } from './health/scheduling-health.indicator';

/**
 * SchedulingModule (Tramo 2, todo 6).
 *
 * Owns the moved ads catalog (rotation core + media library, P36
 * renamed to scheduling): `ScheduledAd` + per-target `SchedulingConfig`
 * (publish delay + daily cap each, P38) + per-target
 * `SchedulingState` cursors + Telegram Bot API dispatcher (todo 7,
 * text posts; ad media resolution is a follow-up) + 1min cron + 3 controllers (`/api/scheduling/ads`,
 * `/api/scheduling/rotation-config`, `/api/scheduling/media`).
 * Feed posts only in v1 (no per-post threads targeting yet; the
 * threads DELIVERY target already paces independently).
 *
 * TypeORM shapes + mappers ship UNWIRED (GAP-1) with in-memory
 * adapters live (backend `DATABASE_ENABLED=false` pattern).
 */
@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    forwardRef(() => TelegramModule),
  ],
  controllers: [
    SchedulingAdsController,
    SchedulingRotationConfigController,
    SchedulingMediaController,
  ],
  providers: [
    RotationDeciderService,
    PublishScheduledAdUseCase,
    PublishScheduledAdNowUseCase,
    UploadScheduledAdMediaUseCase,
    ClearScheduledAdMediaUseCase,
    ReuseLibraryMediaUseCase,
    SchedulingCronScheduler,
    SchedulingHealthState,
    SchedulingHealthIndicator,
    InMemoryScheduledAdRepository,
    InMemoryScheduledAdMediaRepository,
    InMemoryAdMediaLibraryRepository,
    InMemorySchedulingConfigRepository,
    InMemorySchedulingStateRepository,
    LocalSchedulingMediaStorageAdapter,
    InMemoryScheduledAdDispatcher,
    {
      provide: ScheduledAdRepository,
      useClass: InMemoryScheduledAdRepository,
    },
    {
      provide: ScheduledAdMediaRepository,
      useClass: InMemoryScheduledAdMediaRepository,
    },
    {
      provide: AdMediaLibraryRepository,
      useClass: InMemoryAdMediaLibraryRepository,
    },
    {
      provide: SchedulingConfigRepository,
      useClass: InMemorySchedulingConfigRepository,
    },
    {
      provide: SchedulingStateRepository,
      useClass: InMemorySchedulingStateRepository,
    },
    {
      provide: SchedulingMediaStoragePort,
      useClass: LocalSchedulingMediaStorageAdapter,
    },
    {
      provide: ScheduledAdDispatcherPort,
      useClass: TelegramScheduledAdDispatcher,
    },
  ],
  exports: [
    ScheduledAdRepository,
    ScheduledAdMediaRepository,
    AdMediaLibraryRepository,
    SchedulingConfigRepository,
    SchedulingStateRepository,
    ScheduledAdDispatcherPort,
    PublishScheduledAdUseCase,
    PublishScheduledAdNowUseCase,
    SchedulingHealthState,
    SchedulingHealthIndicator,
  ],
})
export class SchedulingModule {}
