import { forwardRef, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { TelegramMtprotoListenerAdapter } from 'telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter';
import { TelegramSseListenerAdapter } from 'telegram/ingestion/shared/api/sse/telegram-sse-listener.adapter';
import { IngestionSafetyConfig } from 'telegram/ingestion/shared/infrastructure/config/ingestion-safety.config';
import { SleepWindowService } from 'telegram/ingestion/shared/infrastructure/services/sleep-window.service';
import { FloodWaitCounterService } from 'telegram/ingestion/shared/infrastructure/services/flood-wait-counter.service';
import { FloodWaitHandlerService } from 'telegram/ingestion/shared/infrastructure/services/flood-wait-handler.service';
import { TelegramClientManager } from 'telegram/ingestion/shared/infrastructure/services/telegram-client-manager.service';
import { LastSeenManager } from 'telegram/ingestion/shared/infrastructure/services/last-seen-manager.service';
import { TelegramMediaDownloadService } from 'telegram/ingestion/shared/infrastructure/services/telegram-media-download.service';
import { TelegramPeerResolver } from 'telegram/ingestion/shared/infrastructure/services/telegram-peer-resolver';
import { IngestionConfigController } from 'telegram/ingestion/shared/api/http/ingestion-config.controller';
import { IngestionHealthController } from 'telegram/ingestion/shared/api/http/ingestion-health.controller';
import { IdentityModule } from 'kol/identity/identity.module';
import { CryptoNewsIngestionModule } from 'telegram/ingestion/crypto-news/crypto-news-ingestion.module';
import { Logger } from '@nestjs/common';

/**
 * Base shared ingestion module with feature flag support.
 *
 * Per Requirement 7.1: Feature flag for safe rollback
 * Per Requirement 3.1: SSE client adapter integration
 * 
 * Environment Variable: USE_SSE_INGESTION
 * - "true" → TelegramSseListenerAdapter (connects to Ingestion Service)
 * - "false" or unset → TelegramMtprotoListenerAdapter (local MTProto)
 *
 * Provides globally:
 * - TelegramListenerPort (dynamically selects adapter based on env)
 * - TelegramMtprotoListenerAdapter (always available for rollback)
 * - TelegramSseListenerAdapter (always available)
 * - IngestionSafetyConfig
 * - Sleep/Flood services
 *
 * Rollback capability: <5 minutes
 * - Set USE_SSE_INGESTION=false
 * - Restart backend container
 * - MTProto connection re-established automatically
 */
import { TELEGRAM_LISTENER_PORT_TOKEN } from './shared-injection-tokens';

const logger = new Logger('SharedIngestionModule');

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
    TelegramClientManager,
    LastSeenManager,
    TelegramMediaDownloadService,
    TelegramPeerResolver,
    
    // Always provide both adapters (for rollback capability)
    TelegramMtprotoListenerAdapter,
    TelegramSseListenerAdapter,
    
    // Dynamic adapter selection based on feature flag
    {
      provide: TelegramListenerPort,
      useFactory: (
        config: ConfigService,
        mtprotoAdapter: TelegramMtprotoListenerAdapter,
        sseAdapter: TelegramSseListenerAdapter,
      ) => {
        const appConfig = config.get('app');
        const useSseIngestion = appConfig?.ingestion?.useSse ?? false;
        
        if (useSseIngestion) {
          logger.log('🔄 INGESTION MODE: SSE (remote Ingestion Service)');
          logger.log(`   └─ Service URL: ${appConfig?.ingestion?.serviceUrl || 'http://localhost:3031'}`);
          return sseAdapter;
        } else {
          logger.log('📡 INGESTION MODE: MTProto (local)');
          logger.log('   └─ Direct Telegram API connection');
          return mtprotoAdapter;
        }
      },
      inject: [ConfigService, TelegramMtprotoListenerAdapter, TelegramSseListenerAdapter],
    },
    
    // Token alias for backward compatibility
    {
      provide: TELEGRAM_LISTENER_PORT_TOKEN,
      useExisting: TelegramListenerPort,
    },
  ],
  exports: [
    TelegramListenerPort,
    TELEGRAM_LISTENER_PORT_TOKEN,
    TelegramMtprotoListenerAdapter,
    TelegramSseListenerAdapter,
    IngestionSafetyConfig,
    TelegramClientManager,
    LastSeenManager,
    TelegramMediaDownloadService,
    TelegramPeerResolver,
    // Required by sub-BC adapters (e.g. MtprotoMediaDownloader).
    SleepWindowService,
    FloodWaitCounterService,
    FloodWaitHandlerService,
  ],
})
export class SharedIngestionModule {}
