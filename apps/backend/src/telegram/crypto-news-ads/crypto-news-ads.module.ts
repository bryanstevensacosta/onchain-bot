import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { AdMediaRepository } from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { AdMediaLibraryRepository } from 'telegram/crypto-news-ads/application/ports/ad-media-library.repository';
import { AdRotationConfigRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-config.repository';
import { AdRotationStateRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-state.repository';
import { SharedThrottleStateRepository } from 'telegram/shared/application/ports/shared-throttle-state.repository';
import { SharedThrottleSchedulerService } from 'telegram/shared/application/services/shared-throttle-scheduler.service';
import { SlotArbitratorPort } from 'telegram/shared/domain/ports/slot-arbitrator.port';
import { TelegramPublisherPort } from 'telegram/shared';
import { BotApiCryptoNewsPublisherAdapter } from 'telegram/crypto-news-publisher/infrastructure/senders/bot-api-crypto-news-publisher.adapter';
import { TypeOrmAdRepository } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/repositories/typeorm-ad.repository';
import { TypeOrmAdMediaRepository } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/repositories/typeorm-ad-media.repository';
import { TypeOrmAdMediaLibraryRepository } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/repositories/typeorm-ad-media-library.repository';
import { TypeOrmAdRotationConfigRepository } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/repositories/typeorm-ad-rotation-config.repository';
import { TypeOrmAdRotationStateRepository } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/repositories/typeorm-ad-rotation-state.repository';
import { TypeOrmAdsThrottleStateRepository } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/repositories/typeorm-ads-throttle-state.repository';
import { TypeOrmSlotArbitrator } from 'telegram/shared/infrastructure/persistence/typeorm/repositories/typeorm-slot-arbitrator';
import { PublishAdUseCase } from 'telegram/crypto-news-ads/application/handlers/publish-ad.use-case';
import { UploadAdImageUseCase } from 'telegram/crypto-news-ads/application/handlers/upload-ad-image.use-case';
import { ClearAdImageUseCase } from 'telegram/crypto-news-ads/application/handlers/clear-ad-image.use-case';
import { RotationDeciderService } from 'telegram/crypto-news-ads/application/services/rotation-decider.service';
import { AdsCronScheduler } from 'telegram/crypto-news-ads/application/scheduling/ads-cron.scheduler';
import {
  AdsController,
  AdsMediaController,
} from 'telegram/crypto-news-ads/api/http/ads.controller';
import { AdsRotationConfigController } from 'telegram/crypto-news-ads/api/http/ads-rotation-config.controller';
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';
import { LocalAdMediaStorageAdapter } from 'telegram/crypto-news-ads/infrastructure/storage/local-ad-media-storage.adapter';
import { AdEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad.entity';
import { AdMediaEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-media.entity';
import { AdMediaLibraryEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-media-library.entity';
import { AdRotationConfigEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-rotation-config.entity';
import { AdRotationStateEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad-rotation-state.entity';
import { AdsThrottleStateEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ads-throttle-state.entity';

/**
 * Crypto-news ads BC — persistence layer (T3).
 *
 * Owns four tables:
 *  - `crypto_news_ads` (the ad catalog)
 *  - `crypto_news_ad_rotation_config` (master switch + cadence knobs)
 *  - `crypto_news_ad_rotation_state` (rotation cursor)
 *  - `crypto_news_ads_throttle_state` (ads' own random-delay window)
 *
 * It binds:
 *  - the 3 ads ports → their TypeORM impls
 *  - `SharedThrottleStateRepository` → `TypeOrmAdsThrottleStateRepository`
 *    (ads-specific table, same shared contract)
 *  - `SharedThrottleSchedulerService` with the locked ads jitter bounds
 *  - `SlotArbitratorPort` → `TypeOrmSlotArbitrator` (same mutual-exclusive
 *    gate the news publisher binds; news + ads never collide)
 *  - `TelegramPublisherPort` → `BotApiCryptoNewsPublisherAdapter` (the SAME
 *    adapter the news BC uses — ads publish to the same output channel)
 *
 * The T4/T5 use cases, T6 cron, T8 controllers, and T9 frontend build on
 * this persistence surface. `AdRotationStateRepository` is exported for the
 * news BC to consume (news advances `postsSinceLastAd` after each publish).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdEntity,
      AdMediaEntity,
      AdMediaLibraryEntity,
      AdRotationConfigEntity,
      AdRotationStateEntity,
      AdsThrottleStateEntity,
    ]),
  ],
  controllers: [AdsController, AdsMediaController, AdsRotationConfigController],
  providers: [
    TypeOrmAdRepository,
    TypeOrmAdMediaRepository,
    TypeOrmAdMediaLibraryRepository,
    TypeOrmAdRotationConfigRepository,
    TypeOrmAdRotationStateRepository,
    TypeOrmAdsThrottleStateRepository,
    PublishAdUseCase,
    UploadAdImageUseCase,
    ClearAdImageUseCase,
    RotationDeciderService,
    AdsCronScheduler,
    {
      provide: AdRepository,
      useClass: TypeOrmAdRepository,
    },
    {
      provide: AdMediaRepository,
      useClass: TypeOrmAdMediaRepository,
    },
    {
      provide: AdMediaLibraryRepository,
      useClass: TypeOrmAdMediaLibraryRepository,
    },
    {
      provide: AdMediaStoragePort,
      useClass: LocalAdMediaStorageAdapter,
    },
    {
      provide: AdRotationConfigRepository,
      useClass: TypeOrmAdRotationConfigRepository,
    },
    {
      provide: AdRotationStateRepository,
      useClass: TypeOrmAdRotationStateRepository,
    },
    {
      provide: SharedThrottleStateRepository,
      useClass: TypeOrmAdsThrottleStateRepository,
    },
    {
      provide: SharedThrottleSchedulerService,
      useFactory: (repo: SharedThrottleStateRepository) =>
        new SharedThrottleSchedulerService(repo, {
          minDelayMs: 30_000,
          maxDelayMs: 180_000,
        }),
      inject: [SharedThrottleStateRepository],
    },
    {
      provide: SlotArbitratorPort,
      useClass: TypeOrmSlotArbitrator,
    },
    {
      provide: TelegramPublisherPort,
      useClass: BotApiCryptoNewsPublisherAdapter,
    },
  ],
  exports: [
    AdRepository,
    AdMediaRepository,
    AdRotationConfigRepository,
    AdRotationStateRepository,
  ],
})
export class CryptoNewsAdsModule {}
