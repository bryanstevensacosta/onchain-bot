import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from 'shared/common/config/app.config';
import { TelegramListenerPort } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { TELEGRAM_LISTENER_PORT_TOKEN } from 'telegram/ingestion/shared/shared-injection-tokens';
import { KolSeeder } from 'telegram/ingestion/kol/seeders/kol.seeder';
import { CryptoNewsSeeder } from 'telegram/ingestion/crypto-news/infrastructure/seeders/crypto-news.seeder';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { KolIngestionOrchestratorUseCase } from 'kol/identity/application/handlers/kol-ingestion-orchestrator.use-case';
import { StoreNewsMessageUseCase } from 'telegram/ingestion/crypto-news/application/handlers/store-news-message.use-case';

/**
 * Single subscription point for ALL Telegram channels (KOL + crypto-news).
 *
 * Replaces the previous per-seeder auto-start pattern. On application
 * bootstrap:
 * 1. Run KolSeeder.seed() (idempotent registration of KOL channels)
 * 2. Run CryptoNewsSeeder.seed() (idempotent registration of news channels)
 * 3. Collect every active channel from both repos
 * 4. Subscribe ONCE to the TelegramListenerPort
 * 5. Route each incoming message to the right handler based on channel type
 *
 * Routing: a message is routed to the news handler iff its peerId is
 * registered in `CryptoNewsSourceRepository`. Otherwise it is routed to
 * the KOL orchestrator (which itself no-ops for unknown kolIds as
 * defense in depth).
 *
 * Per fix-1 (Bot Dev ToS §4.3): raw message text is consumed by direct
 * use case calls here; it never crosses an event bus.
 */
@Injectable()
export class IngestionCoordinator implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestionCoordinator.name);

  constructor(
    private readonly config: ConfigService,
    private readonly kolSeeder: KolSeeder,
    private readonly cryptoNewsSeeder: CryptoNewsSeeder,
    private readonly kolRepo: KolRepository,
    private readonly cryptoNewsSourceRepo: CryptoNewsSourceRepository,
    private readonly kolOrchestrator: KolIngestionOrchestratorUseCase,
    private readonly storeNewsMessage: StoreNewsMessageUseCase,
    @Inject(TELEGRAM_LISTENER_PORT_TOKEN)
    private readonly listener: TelegramListenerPort,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    const seedConfig =
      this.config.get<AppConfig>('app')?.ingestion?.telegram?.seed;
    const newsSeedConfig =
      this.config.get<AppConfig>('app')?.ingestion?.telegram?.newsSeed;

    if (seedConfig?.enabled) {
      await this.kolSeeder.seed().catch((err: unknown) => {
        this.logger.error(
          `KOL seeding failed: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
      });
    } else {
      this.logger.debug('KOL seed disabled; skipping.');
    }

    if (newsSeedConfig?.enabled) {
      await this.cryptoNewsSeeder.seed().catch((err: unknown) => {
        this.logger.error(
          `Crypto-news seeding failed: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
      });
    } else {
      this.logger.debug('Crypto-news seed disabled; skipping.');
    }

    if (!seedConfig?.autoStartListening) {
      this.logger.debug('Auto-start listening disabled; coordinator idle.');
      return;
    }

    const activeKols = (await this.kolRepo.findAll()).filter((k) => k.isActive);
    const activeNews = await this.cryptoNewsSourceRepo.findActive();
    const allChannelIds = [
      ...activeKols.map((k) => k.kolId.value),
      ...activeNews.map((s) => s.channelId),
    ];

    if (allChannelIds.length === 0) {
      this.logger.warn(
        'No active channels to subscribe (KOL + news); coordinator idle.',
      );
      return;
    }

    this.logger.log(
      `Subscribing to ${allChannelIds.length} channel(s) (${activeKols.length} KOL, ${activeNews.length} news).`,
    );
    void this.consumeAll(allChannelIds);
  }

  private async consumeAll(channelIds: string[]): Promise<void> {
    try {
      for await (const raw of this.listener.subscribe(channelIds)) {
        await this.route(raw);
      }
    } catch (err) {
      this.logger.error(
        `Subscription error: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  private async route(raw: {
    readonly peerId: string;
    readonly messageId: number;
    readonly text: string;
    readonly occurredAt: Date;
  }): Promise<void> {
    try {
      const newsSource = await this.cryptoNewsSourceRepo.findByChannelId(
        raw.peerId,
      );
      if (newsSource) {
        await this.storeNewsMessage.execute({
          channelId: raw.peerId,
          messageId: raw.messageId,
          title: null,
          content: raw.text,
          occurredAt: raw.occurredAt,
        });
        return;
      }
      // Fall through to KOL pipeline
      await this.kolOrchestrator.onMessageReceived(raw);
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
