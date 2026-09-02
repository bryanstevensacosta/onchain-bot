import { Global, Module } from '@nestjs/common';
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
import { CryptoNewsMediaDownloader } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-media-downloader.port';
import { MtprotoMediaDownloader } from 'telegram/ingestion/crypto-news/infrastructure/api/mtproto/mtproto-media-downloader';
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
 *
 * @deprecated The local MTProto mode and associated infrastructure is deprecated.
 *
 * **Migration Status:**
 * This module currently supports three ingestion modes for phased migration to the centralized
 * ingestion service. The MTProto mode (default when both flags are false) is deprecated and
 * maintained only for emergency rollback during the transition period.
 *
 * **Ingestion Modes:**
 * 1. **SSE Mode (recommended):** `USE_SSE_INGESTION=true` - Connects to centralized ingestion service
 * 2. **Mock Mode:** `USE_MOCK_INGESTION=true` - For testing/development without Telegram
 * 3. **MTProto Mode (DEPRECATED):** Default - Local MTProto client (emergency rollback only)
 *
 * **Deprecated Components (MTProto mode only):**
 * The following providers are only used in deprecated MTProto mode and will be removed after
 * full migration to SSE mode:
 * - `TelegramMtprotoListenerAdapter` - Direct MTProto client (see adapter deprecation note)
 * - `TelegramClientManager` - MTProto session management (see service deprecation note)
 * - `LastSeenManager` - Cursor tracking (centralized in ingestion-service)
 * - `IngestionSafetyConfig` - Anti-ban configuration (centralized in ingestion-service)
 * - `SleepWindowService` - Sleep window logic (centralized in ingestion-service)
 * - `FloodWaitCounterService` - FLOOD_WAIT metrics (centralized in ingestion-service)
 * - `FloodWaitHandlerService` - FLOOD_WAIT retry logic (centralized in ingestion-service)
 *
 * **Migration Timeline:**
 * - Phase 1 (current): SSE mode available via feature flag, MTProto mode retained for rollback
 * - Phase 2 (after validation): SSE mode becomes default, MTProto mode requires opt-in flag
 * - Phase 3 (after stabilization): MTProto mode removed, module simplified to SSE-only
 *
 * **Rollback Instructions (emergency only):**
 * If SSE mode fails and you need to revert to local MTProto:
 * 1. Set `USE_SSE_INGESTION=false` in environment
 * 2. Ensure `TELEGRAM_MTPROTO_SESSION` is configured
 * 3. Restart backend container
 * 4. MTProto client reconnects within 20s (DEFAULT_CONNECT_TIMEOUT_MS)
 * 5. Report SSE failure to ops team for investigation
 *
 * **Specification:** See `.kiro/specs/centralized-ingestion-service/requirements.md`
 * Requirement 7 for migration strategy and rollback procedures.
 *
 * @see TelegramSseListenerAdapter Replacement adapter for SSE mode
 * @see {@link apps/ingestion-service} Centralized ingestion service
 */
import { TELEGRAM_LISTENER_PORT_TOKEN } from './shared-injection-tokens';

const logger = new Logger('SharedIngestionModule');

@Global()
@Module({
  imports: [ConfigModule, IdentityModule],
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

    // Crypto-news media downloader (moved from CryptoNewsIngestionModule to break forwardRef cycle)
    {
      provide: CryptoNewsMediaDownloader,
      inject: [
        TelegramMtprotoListenerAdapter,
        FloodWaitHandlerService,
        ConfigService,
      ],
      useFactory: (
        listener: TelegramMtprotoListenerAdapter,
        floodWaitHandler: FloodWaitHandlerService,
        config: ConfigService,
      ): CryptoNewsMediaDownloader =>
        new MtprotoMediaDownloader(
          () => listener.getClient(),
          floodWaitHandler,
          config,
        ),
    },

    // Always provide all three adapters (for mode switching)
    TelegramMtprotoListenerAdapter,
    TelegramSseListenerAdapter,
    TelegramMockAdapter,

    // Dynamic adapter selection based on feature flags
    // Priority: Mock > SSE > MTProto
    //
    // @deprecated MTProto mode (default fallback) is deprecated. Use SSE mode instead.
    // MTProto mode is retained only for emergency rollback during migration period.
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

        console.log('[ADAPTER-SELECTION-DEBUG]', {
          useMock,
          useSse,
          appConfigExists: !!appConfig,
          ingestionExists: !!appConfig?.ingestion,
          rawUseMock: appConfig?.ingestion?.useMock,
          rawUseSse: appConfig?.ingestion?.useSse,
        });

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

        // ⚠️ DEPRECATED: MTProto mode - for emergency rollback only
        logger.warn('⚠️  INGESTION MODE: MTProto (local) - DEPRECATED');
        logger.warn('   └─ Direct Telegram API connection');
        logger.warn(
          '   └─ This mode is deprecated and maintained only for emergency rollback',
        );
        logger.warn(
          '   └─ Please migrate to SSE mode: SET USE_SSE_INGESTION=true',
        );
        logger.warn(
          '   └─ See .kiro/specs/centralized-ingestion-service/ for migration guide',
        );
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
    CryptoNewsMediaDownloader,
  ],
})
export class SharedIngestionModule {}
