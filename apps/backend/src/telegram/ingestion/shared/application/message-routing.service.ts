import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import type { TelegramRawMessage } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { KolIngestionOrchestratorUseCase } from 'kol/identity/application/handlers/kol-ingestion-orchestrator.use-case';
import { ProcessCryptoNewsMessageHandler } from 'telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler';

/**
 * Single subscription point for ALL Telegram channels (KOL + crypto-news).
 *
 * On application bootstrap:
 * 1. Collect every active KOL channel
 * 2. Subscribe ONCE to the TelegramListenerPort
 * 3. Route each incoming message by messageType:
 *    - 'crypto-news' → ProcessCryptoNewsMessageHandler (filters + matching + enqueue)
 *    - 'kol' → KolIngestionOrchestratorUseCase (extraction + parsing pipeline)
 *
 * Per Opción A: crypto-news messages are persisted by ingestion-telegram in
 * its own DB — the backend NEVER persists them. The backend receives
 * metadata-only SSE events and processes matched messages via the
 * crypto-news handler.
 *
 * Per fix-1 (Bot Dev ToS §4.3): raw message text is consumed by direct
 * use case calls here; it never crosses an event bus.
 *
 * Note (2026-09-06): Seeders removed. Channels are now registered via:
 * - KOLs: POST /telegram-kol/identity/kols
 * - Crypto-news: POST {INGESTION_TELEGRAM_URL}/api/feed/sources
 */
@Injectable()
export class MessageRoutingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MessageRoutingService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly kolRepo: KolRepository,
    private readonly kolOrchestrator: KolIngestionOrchestratorUseCase,
    private readonly cryptoNewsHandler: ProcessCryptoNewsMessageHandler,
    private readonly listener: TelegramListenerPort,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    this.logger.debug('MessageRoutingService.onApplicationBootstrap() START');

    this.logger.debug('Step 1: Finding active KOLs');
    const activeKols = (await this.kolRepo.findAll()).filter((k) => k.isActive);
    this.logger.debug(`Step 1a: Found ${activeKols.length} active KOLs`);

    this.logger.debug('Step 2: Building channel list');
    const allChannelIds = [...activeKols.map((k) => k.kolId.value)];

    if (allChannelIds.length === 0) {
      this.logger.warn(
        'No active channels to subscribe (KOL); coordinator idle.',
      );
      this.logger.debug(
        'MessageRoutingService.onApplicationBootstrap() completed (no channels)',
      );
      return;
    }

    this.logger.debug(
      `Step 3: Subscribing to ${allChannelIds.length} channel(s) (${activeKols.length} KOL). Crypto-news channels are handled by ingestion-service and routed by messageType.`,
    );
    // Start subscription in background - don't await to avoid blocking bootstrap
    setImmediate(() => {
      this.logger.debug('Step 3a: setImmediate callback executing');
      void this.consumeAll(allChannelIds);
    });
    this.logger.debug('MessageRoutingService.onApplicationBootstrap() END');
  }

  private async consumeAll(channelIds: string[]): Promise<void> {
    try {
      this.logger.debug(
        `Starting to consume messages from ${channelIds.length} channels...`,
      );

      for await (const raw of this.listener.subscribe(channelIds)) {
        this.logger.debug(
          `Received message from ${raw.peerId}:${raw.messageId}`,
        );
        await this.route(raw);
      }

      this.logger.warn('Listener subscription ended (should never happen)');
    } catch (err) {
      this.logger.error(
        `Subscription error: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  private async route(raw: TelegramRawMessage): Promise<void> {
    try {
      this.logger.debug(
        `Starting to route message ${raw.peerId}:${raw.messageId} (messageType: ${raw.messageType})`,
      );

      // Route by messageType from SSE payload
      if (raw.messageType === 'crypto-news') {
        this.logger.debug(
          `Routing to crypto-news handler for ${raw.peerId}:${raw.messageId}`,
        );
        await this.cryptoNewsHandler.handle(raw);
        this.logger.debug(
          `Crypto-news handler completed for ${raw.peerId}:${raw.messageId}`,
        );
      } else {
        // Default to KOL handler (messageType='kol' or undefined for backward compatibility)
        this.logger.debug(
          `Routing to KOL orchestrator for ${raw.peerId}:${raw.messageId}`,
        );
        await this.kolOrchestrator.onMessageReceived(raw);
        this.logger.debug(
          `KOL orchestrator completed for ${raw.peerId}:${raw.messageId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to route message ${raw.peerId}:${raw.messageId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
