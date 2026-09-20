import { Global, GoneException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { TelegramSseListenerAdapter } from 'telegram/ingestion/shared/api/sse/telegram-sse-listener.adapter';
import { TelegramMockAdapter } from 'telegram/ingestion/shared/infrastructure/adapters/telegram-mock.adapter';
import { TelegramPeerResolver } from 'telegram/ingestion/shared/infrastructure/services/telegram-peer-resolver';
import { IngestionConfigController } from 'telegram/ingestion/shared/api/http/ingestion-config.controller';
import { IngestionHealthController } from 'telegram/ingestion/shared/api/http/ingestion-health.controller';
import { IdentityModule } from 'kol/identity/identity.module';
import { BackendRegistrationClient } from 'telegram/ingestion/shared/infrastructure/backend-registration-client.service';
import { KolEntity } from 'kol/identity/infrastructure/persistence/typeorm/entities/kol.entity';
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
 * - Default (both unset/false) → SSE (default desde T4); forzar MTProto lanza 410 Gone
 *
 * Priority: Mock > SSE > MTProto-eliminado (410 Gone — bloque borrado en T5)
 *
 * Provides globally:
 * - TelegramListenerPort (dynamically selects adapter based on env)
 * - BackendRegistrationClient (registers backend with ingestion-telegram in SSE mode)
 * - TelegramSseListenerAdapter (always available)
 * - TelegramMockAdapter (always available for dev/testing)
 *
 * Ingestion Modes:
 * 1. **SSE Mode (recommended):** `USE_SSE_INGESTION=true` - Connects to centralized ingestion service
 * 2. **Mock Mode:** `USE_MOCK_INGESTION=true` - For testing/development without Telegram
 * 3. **MTProto backend (REMOVED T5):** forcing it throws 410 Gone. The backend MTProto
 *    block (adapter, client-manager, flood/sleep/last-seen/media services, safety
 *    config, StubCryptoNewsMediaDownloader) was deleted; use ingestion-telegram
 *    via INGESTION_TELEGRAM_URL.
 *
 * **Specification:** See `.kiro/specs/centralized-ingestion-service/requirements.md`
 * Requirement 7 for migration strategy and rollback procedures.
 *
 * @see TelegramSseListenerAdapter Replacement adapter for SSE mode
 * @see {@link apps/ingestion-telegram} Centralized ingestion service
 */

const logger = new Logger('SharedIngestionModule');

/**
 * Seleccion del adapter de ingesta por flags (T4 deprecados-deuda-tecnica, bloque MTProto borrado en T5).
 *
 * Prioridad: Mock > SSE > MTProto-eliminado.
 * La rama MTProto del backend fue removida (experimento A1 caido en T3:
 * sin sesion ni trafico vivo en ningun ambiente): forzarla lanza 410 Gone
 * con mensaje exacto, SIN abrir sesion (sin riesgo
 * AUTH_KEY_DUPLICATED). La firma conserva el tercer adapter solo por
 * compatibilidad con el spec T4; el factory ya no inyecta adapter MTProto.
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
    TelegramPeerResolver,

    // Backend registration client (for SSE mode)
    BackendRegistrationClient,

    // Always provide both adapters (for mode switching)
    TelegramSseListenerAdapter,
    TelegramMockAdapter,

    // Dynamic adapter selection based on feature flags
    // Priority: Mock > SSE > MTProto-eliminado (410 Gone, T4; bloque borrado T5)
    {
      provide: TelegramListenerPort,
      useFactory: (
        config: ConfigService,
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
          {
            mockAdapter,
            sseAdapter,
            mtprotoAdapter: undefined as unknown as never,
          },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
          appConfig?.ingestion?.serviceUrl,
        );
      },
      inject: [ConfigService, TelegramSseListenerAdapter, TelegramMockAdapter],
    },
  ],
  exports: [
    TelegramListenerPort,
    BackendRegistrationClient,
    TelegramSseListenerAdapter,
    TelegramMockAdapter,
    TelegramPeerResolver,
  ],
})
export class SharedIngestionModule {}
