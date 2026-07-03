import { forwardRef, Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { TelegramMtprotoListenerAdapter } from 'telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter';
import { IngestionSafetyConfig } from 'telegram/ingestion/shared/infrastructure/config/ingestion-safety.config';
import { SleepWindowService } from 'telegram/ingestion/shared/infrastructure/services/sleep-window.service';
import { FloodWaitCounterService } from 'telegram/ingestion/shared/infrastructure/services/flood-wait-counter.service';
import { FloodWaitHandlerService } from 'telegram/ingestion/shared/infrastructure/services/flood-wait-handler.service';
import { IngestionConfigController } from 'telegram/ingestion/shared/api/http/ingestion-config.controller';
import { IngestionHealthController } from 'telegram/ingestion/shared/api/http/ingestion-health.controller';
import { IdentityModule } from 'kol/identity/identity.module';
import { CryptoNewsIngestionModule } from 'telegram/ingestion/crypto-news/crypto-news-ingestion.module';

/**
 * Base shared ingestion module.
 *
 * Provides globally:
 * - TelegramListenerPort (useExisting alias of TelegramMtprotoListenerAdapter)
 * - TelegramMtprotoListenerAdapter
 * - IngestionSafetyConfig
 * - Sleep/Flood services
 *
 * Does NOT import KolIngestionModule / CryptoNewsIngestionModule /
 * IdentityModule — those modules import THIS module to access the
 * listener port. IngestionCoordinator lives in a separate root-level
 * module (telegram-ingestion.module.ts) to avoid circular imports.
 */
import { TELEGRAM_LISTENER_PORT_TOKEN } from './shared-injection-tokens';

@Global()
@Module({
  imports: [
    ConfigModule,
    IdentityModule,
    // `CryptoNewsIngestionModule` provides `CryptoNewsMediaDownloader`,
    // which the listener below injects. Both sides use `forwardRef`
    // to break the circular DI dependency.
    forwardRef(() => CryptoNewsIngestionModule),
  ],
  controllers: [IngestionConfigController, IngestionHealthController],
  providers: [
    IngestionSafetyConfig,
    SleepWindowService,
    FloodWaitCounterService,
    FloodWaitHandlerService,
    TelegramMtprotoListenerAdapter,
    {
      provide: TelegramListenerPort,
      useExisting: TelegramMtprotoListenerAdapter,
    },
    {
      provide: TELEGRAM_LISTENER_PORT_TOKEN,
      useExisting: TelegramMtprotoListenerAdapter,
    },
  ],
  exports: [
    TelegramListenerPort,
    TELEGRAM_LISTENER_PORT_TOKEN,
    TelegramMtprotoListenerAdapter,
    IngestionSafetyConfig,
    // Required by sub-BC adapters (e.g. MtprotoMediaDownloader).
    SleepWindowService,
    FloodWaitCounterService,
    FloodWaitHandlerService,
  ],
})
export class SharedIngestionModule {}
