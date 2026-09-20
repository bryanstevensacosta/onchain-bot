import { Global, GoneException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { BackendRegistrationClient } from 'telegram/ingestion/shared/infrastructure/backend-registration-client.service';
import { KolEntity } from 'kol/identity/infrastructure/persistence/typeorm/entities/kol.entity';
import { Logger } from '@nestjs/common';
import { CryptoNewsMediaDownloader } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-media-downloader.port';

/**
 * Stub implementation of CryptoNewsMediaDownloader for deprecated MTProto mode.
 *
 * **Phase 5 (media-cohesion-refactor):**
 * Media download responsibility fully migrated to ingestion-telegram. Backend no longer
 * downloads media in any mode (SSE reads via HTTP, MTProto deprecated).
 *
 * This stub exists only to satisfy DI in deprecated MTProto mode. Any attempt to use it
 * throws an error directing users to SSE mode + ingestion-telegram.
 */
class StubCryptoNewsMediaDownloader extends CryptoNewsMediaDownloader {
  async download(): Promise<never> {
    throw new Error(
      'CryptoNewsMediaDownloader.download() is deprecated. ' +
        'Media download migrated to ingestion-telegram (Phase 5). ' +
        'Use SSE mode (USE_SSE_INGESTION=true) and fetch media via ' +
        'INGESTION_TELEGRAM_URL/api/media/:channelId/:messageId/:index',
    );
  }

  async saveToDisk(): Promise<never> {
    throw new Error(
      'CryptoNewsMediaDownloader.saveToDisk() is deprecated. ' +
        'Media download migrated to ingestion-telegram (Phase 5). ' +
        'Use SSE mode (USE_SSE_INGESTION=true) and fetch media via ' +
        'INGESTION_TELEGRAM_URL/api/media/:channelId/:messageId/:index',
    );
  }
}

/**
 * Base shared ingestion module with feature flag support.
 *
 * Per Requirement 7.1: Feature flag for safe rollback
 * Per Requirement 3.1: SSE client adapter integration
 *
 * Environment Variables:
 * - USE_SSE_INGESTION → TelegramSseListenerAdapter (connects to Ingestion Service)
 * - USE_MOCK_INGESTION → TelegramMockAdapter (CLI/testing mode, no Telegram connection)
 * - Default (both unset/false) → SSE (default desde T4); forzar MTProto lanza 410 Gone
 *
 * Priority: Mock > SSE > MTProto (410 Gone — rama eliminada en T4)
 *
 * Provides globally:
 * - TelegramListenerPort (dynamically selects adapter based on env)
 * - BackendRegistrationClient (registers backend with ingestion-telegram in SSE mode)
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
 * - `LastSeenManager` - Cursor tracking (centralized in ingestion-telegram)
 * - `IngestionSafetyConfig` - Anti-ban configuration (centralized in ingestion-telegram)
 * - `SleepWindowService` - Sleep window logic (centralized in ingestion-telegram)
 * - `FloodWaitCounterService` - FLOOD_WAIT metrics (centralized in ingestion-telegram)
 * - `FloodWaitHandlerService` - FLOOD_WAIT retry logic (centralized in ingestion-telegram)
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
 * @see {@link apps/ingestion-telegram} Centralized ingestion service
 */
import { TELEGRAM_LISTENER_PORT_TOKEN } from './shared-injection-tokens';

const logger = new Logger('SharedIngestionModule');

/**
 * Seleccion del adapter de ingesta por flags (T4 deprecados-deuda-tecnica).
 *
 * Prioridad: Mock > SSE > MTProto-eliminado.
 * La rama MTProto del backend fue removida (experimento A1 caido en T3:
 * sin sesion ni trafico vivo en ningun ambiente): forzarla lanza 410 Gone
 * con mensaje exacto, SIN abrir sesion MTProto (sin riesgo
 * AUTH_KEY_DUPLICATED). El borrado fisico de servicios/adapter es T5.
 */
export function selectIngestionAdapter<
  TMock = unknown,
  TSse = unknown,
  TMtproto = unknown,
>(
  flags: { useMock: boolean; useSse: boolean },
  adapters: { mockAdapter: TMock; sseAdapter: TSse; mtprotoAdapter: TMtproto },
  serviceUrl?: string,
): TMock | TSse {
  if (flags.useMock) {
    logger.log('🧪 INGESTION MODE: Mock (CLI/testing, no Telegram connection)');
    logger.log('   └─ Use CLI tools: npm run cli:inject');
    return adapters.mockAdapter;
  }

  if (flags.useSse) {
    logger.log('🔄 INGESTION MODE: SSE (remote Ingestion Service)');
    logger.log(`   └─ Service URL: ${serviceUrl || 'http://localhost:3031'}`);
    logger.log('   └─ Backend registration: ENABLED');
    return adapters.sseAdapter;
  }

  // REMOVIDO (T4): modo MTProto backend eliminado — usar ingestion-telegram
  // via INGESTION_TELEGRAM_URL. No se abre ninguna sesion MTProto aqui.
  throw new GoneException(
    'MTProto backend removido, usar INGESTION_TELEGRAM_URL',
  );
}

@Global()
@Module({
  imports: [
    ConfigModule,
    IdentityModule,
    TypeOrmModule.forFeature([KolEntity]),
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

    // Stub provider for deprecated CryptoNewsMediaDownloader (Phase 5)
    // Media download fully migrated to ingestion-telegram. This stub satisfies DI
    // in deprecated MTProto mode but throws errors on use.
    {
      provide: CryptoNewsMediaDownloader,
      useClass: StubCryptoNewsMediaDownloader,
    },

    // Backend registration client (for SSE mode)
    BackendRegistrationClient,

    // Always provide all three adapters (for mode switching)
    TelegramMtprotoListenerAdapter,
    TelegramSseListenerAdapter,
    TelegramMockAdapter,

    // Dynamic adapter selection based on feature flags
    // Priority: Mock > SSE > MTProto-eliminado (410 Gone, T4)
    {
      provide: TelegramListenerPort,
      useFactory: (
        config: ConfigService,
        mtprotoAdapter: TelegramMtprotoListenerAdapter,
        sseAdapter: TelegramSseListenerAdapter,
        mockAdapter: TelegramMockAdapter,
      ) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const appConfig = config.get('app');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const useMock = (appConfig?.ingestion?.useMock ?? false) as boolean;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const useSse = (appConfig?.ingestion?.useSse ?? true) as boolean;

        console.log('[ADAPTER-SELECTION-DEBUG]', {
          useMock,
          useSse,
          appConfigExists: !!appConfig,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          ingestionExists: !!appConfig?.ingestion,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          rawUseMock: appConfig?.ingestion?.useMock,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          rawUseSse: appConfig?.ingestion?.useSse,
        });

        return selectIngestionAdapter(
          { useMock, useSse },
          { mockAdapter, sseAdapter, mtprotoAdapter },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
          appConfig?.ingestion?.serviceUrl,
        );
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
    BackendRegistrationClient,
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
    // CryptoNewsMediaDownloader removed (Phase 5) — media download migrated to ingestion-telegram
  ],
})
export class SharedIngestionModule {}
