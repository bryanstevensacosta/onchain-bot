import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import type { TelegramRawMessage } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { TELEGRAM_LISTENER_PORT_TOKEN } from 'telegram/ingestion/shared/shared-injection-tokens';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { KolIngestionOrchestratorUseCase } from 'kol/identity/application/handlers/kol-ingestion-orchestrator.use-case';

/**
 * Single subscription point for ALL Telegram channels (KOL + crypto-news).
 *
 * On application bootstrap:
 * 1. Collect every active KOL channel
 * 2. Subscribe ONCE to the TelegramListenerPort
 * 3. Route each incoming message to the KOL orchestrator
 *
 * Post db-separation todo 4 (Opción A): crypto-news messages are persisted
 * by ingestion-service in its own DB — the backend NEVER persists them.
 * SSE crypto-news traffic is therefore skipped with a log line (no store
 * call); the KOL orchestrator itself no-ops for unknown kolIds as defense
 * in depth.
 *
 * Per fix-1 (Bot Dev ToS §4.3): raw message text is consumed by direct
 * use case calls here; it never crosses an event bus.
 *
 * Note (2026-09-06): Seeders removed. Channels are now registered via:
 * - KOLs: POST /telegram-kol/identity/kols
 * - Crypto-news: POST {INGESTION_SERVICE_URL}/api/crypto-news/sources
 */
@Injectable()
export class IngestionCoordinator implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestionCoordinator.name);

  constructor(
    private readonly config: ConfigService,
    private readonly kolRepo: KolRepository,
    private readonly kolOrchestrator: KolIngestionOrchestratorUseCase,
    @Inject(TELEGRAM_LISTENER_PORT_TOKEN)
    private readonly listener: TelegramListenerPort,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    this.logger.log(
      '⏳ [HOOK-DEBUG] IngestionCoordinator.onApplicationBootstrap() START',
    );

    this.logger.log('[HOOK-DEBUG] Step 1: Finding active KOLs');
    const activeKols = (await this.kolRepo.findAll()).filter((k) => k.isActive);
    this.logger.log(
      `[HOOK-DEBUG] Step 1a: Found ${activeKols.length} active KOLs`,
    );

    this.logger.warn(
      'Crypto-news SSE persistence skipped: ingestion-service owns ' +
        'crypto-news messages/sources/media in its own DB (Opción A — ' +
        'backend persists nothing, filters apply on-read).',
    );

    this.logger.log('[HOOK-DEBUG] Step 2: Building channel list');
    const allChannelIds = [...activeKols.map((k) => k.kolId.value)];

    if (allChannelIds.length === 0) {
      this.logger.warn(
        'No active channels to subscribe (KOL); coordinator idle.',
      );
      this.logger.log(
        '✅ [HOOK-DEBUG] IngestionCoordinator.onApplicationBootstrap() completed (no channels)',
      );
      return;
    }

    this.logger.log(
      `[HOOK-DEBUG] Step 3: Subscribing to ${allChannelIds.length} channel(s) (${activeKols.length} KOL).`,
    );
    // Start subscription in background - don't await to avoid blocking bootstrap
    setImmediate(() => {
      this.logger.log('[HOOK-DEBUG] Step 3a: setImmediate callback executing');
      void this.consumeAll(allChannelIds);
    });
    this.logger.log(
      '✅ [HOOK-DEBUG] IngestionCoordinator.onApplicationBootstrap() END',
    );
  }

  private async consumeAll(channelIds: string[]): Promise<void> {
    try {
      this.logger.log(
        `[CONSUME-DEBUG] Starting to consume messages from ${channelIds.length} channels...`,
      );

      for await (const raw of this.listener.subscribe(channelIds)) {
        this.logger.log(
          `[CONSUME-DEBUG] Received message from ${raw.peerId}:${raw.messageId}`,
        );
        await this.route(raw);
      }

      this.logger.warn(
        '[CONSUME-DEBUG] Listener subscription ended (should never happen)',
      );
    } catch (err) {
      this.logger.error(
        `[CONSUME-DEBUG] Subscription error: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  private async route(raw: TelegramRawMessage): Promise<void> {
    try {
      this.logger.log(
        `[ROUTE-DEBUG] Starting to route message ${raw.peerId}:${raw.messageId}`,
      );

      // Crypto-news traffic (if any arrives over SSE) is intentionally NOT
      // persisted here — ingestion-service already stored it. Route
      // everything to the KOL orchestrator, which no-ops unknown channels.
      this.logger.log(
        `[ROUTE-DEBUG] Routing to KOL orchestrator for ${raw.peerId}:${raw.messageId} (crypto-news SSE writes skipped — owned by ingestion-service)`,
      );
      await this.kolOrchestrator.onMessageReceived(raw);
      this.logger.log(
        `[ROUTE-DEBUG] ✅ KOL orchestrator completed for ${raw.peerId}:${raw.messageId}`,
      );
    } catch (err) {
      this.logger.error(
        `[ROUTE-DEBUG] ❌ Failed to route message ${raw.peerId}:${raw.messageId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
