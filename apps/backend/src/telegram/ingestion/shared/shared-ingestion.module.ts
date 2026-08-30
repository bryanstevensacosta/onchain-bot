import { forwardRef, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { TelegramMtprotoListenerAdapter } from 'telegram/ingestion/shared/api/mtproto/telegram-mtproto-listener.adapter';
import { TelegramSseListenerAdapter } from 'telegram/ingestion/shared/api/sse/telegram-sse-listener.adapter';
import { TelegramMockAdapter } from 'telegram/ingestion/shared/infrastructure/adapters/telegram-mock.adapter';
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
 * Environment Variables:
 * - USE_SSE_INGESTION → TelegramSseListenerAdapter (connects to Ingestion Service)
 * - USE_MOCK_INGESTION → TelegramMockAdapter (CLI/testing mode, no Telegram connection)
 * - Default (both false) → TelegramMtprotoListenerAdapter (local MTProto)
 *
 * Priority: Mock > SSE > MTProto (if both flags true, mock wins)
 *
 * Provides globally:
 * - TelegramListenerPort (dynamically selects adapter based on env)
 * - TelegramMtprotoListenerAdapter (always available for rollback)
 * - TelegramSseListenerAdapter (always available)
 * - TelegramMockAdapter (always available for dev/testing)
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

    // Always provide all three adapters (for mode switching)
    TelegramMtprotoListenerAdapter,
    TelegramSseListenerAdapter,
    TelegramMockAdapter,

    // Dynamic adapter selection based on feature flags
    // Priority: Mock > SSE > MTProto
    {
      provide: TelegramListenerPort,
      useFactory: (
        config: ConfigService,
        mtprotoAdapter: TelegramMtprotoListenerAdapter,
        sseAdapter: TelegramSseListenerAdapter,
        mockAdapter: TelegramMockAdapter,
      ) => {
        const appConfig = config.get('app');
        const useMock = appConfig?.ingestion?.useMock ?? false;
        const useSse = appConfig?.ingestion?.useSse ?? false;

        if (useMock) {
          logger.log(
            '🧪 INGESTION MODE: Mock (CLI/testing, no Telegram connection)',
          );
          logger.log('   └─ Use CLI tools: npm run cli:inject');
          return mockAdapter;
        }

        if (useSse) {
          logger.log('🔄 INGESTION MODE: SSE (remote Ingestion Service)');
          logger.log(
            `   └─ Service URL: ${appConfig?.ingestion?.serviceUrl || 'http://localhost:3031'}`,
          );
          return sseAdapter;
        }

        logger.log('📡 INGESTION MODE: MTProto (local)');
        logger.log('   └─ Direct Telegram API connection');
        return mtprotoAdapter;
      },
      inject: [
        ConfigService,
        TelegramMtprotoListenerAdapter,
        TelegramSseListenerAdapter,
        TelegramMockAdapter,
      ],
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
    TelegramMockAdapter,
    IngestionSafetyConfig,
    TelegramClientManager,
    LastSeenManager,
    TelegramMediaDownloadService,
    TelegramPeerResolver,
    SleepWindowService,
    FloodWaitCounterService,
    FloodWaitHandlerService,
  ],
})
export class SharedIngestionModule {}
