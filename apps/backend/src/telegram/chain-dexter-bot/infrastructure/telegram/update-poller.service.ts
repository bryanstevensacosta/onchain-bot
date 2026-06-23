import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ChainDexterBotConfigService } from '../../bot.config';
import { CommandRouterService } from '../../application/handlers/command-router.service';
import { TelegramBotClient, TelegramUpdate } from './bot-client';

@Injectable()
export class UpdatePollerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(UpdatePollerService.name);
  private running = false;
  private aborted = false;
  private nextOffset: number | null = null;
  private loopPromise: Promise<void> | null = null;

  public constructor(
    private readonly config: ChainDexterBotConfigService,
    private readonly bot: TelegramBotClient,
    private readonly router: CommandRouterService,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    const cfg = this.config.get();
    if (cfg.ingestMode !== 'polling') {
      this.logger.log('Ingest mode is not polling — poller inactive');
      return;
    }
    if (!cfg.botToken) {
      this.logger.warn(
        'Cannot start poller: CHAIN_DEXTER_BOT_TOKEN not configured',
      );
      return;
    }

    try {
      const drop = await this.bot.deleteWebhook(true);
      if (!drop.ok) {
        this.logger.warn(`deleteWebhook returned error: ${drop.error}`);
      }
    } catch (err) {
      this.logger.warn(
        `deleteWebhook failed (non-fatal): ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    this.aborted = false;
    this.running = true;
    this.loopPromise = this.runLoop().catch((err) => {
      this.logger.error(
        `Poller loop crashed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    });
    this.logger.log(
      `Poller started (interval=${cfg.pollingIntervalMs}ms, timeout=${cfg.pollingTimeoutSec}s)`,
    );
  }

  public async onApplicationShutdown(): Promise<void> {
    if (!this.running) return;
    this.logger.log('Poller stopping...');
    this.aborted = true;
    if (this.loopPromise) {
      await this.loopPromise.catch(() => undefined);
    }
    this.running = false;
    this.logger.log('Poller stopped');
  }

  private async runLoop(): Promise<void> {
    const cfg = this.config.get();
    const intervalMs = cfg.pollingIntervalMs;

    while (!this.aborted) {
      let updates: TelegramUpdate[] = [];
      try {
        updates = await this.bot.getUpdates(
          this.nextOffset,
          cfg.pollingTimeoutSec,
        );
      } catch (err) {
        this.logger.warn(
          `getUpdates error: ${err instanceof Error ? err.message : 'unknown'}`,
        );
        await this.sleep(5000);
        continue;
      }

      for (const update of updates) {
        try {
          await this.router.dispatch(update);
        } catch (err) {
          this.logger.error(
            `Poller dispatch error update_id=${update.update_id}: ${
              err instanceof Error ? err.message : 'unknown'
            }`,
          );
        }
        if (this.nextOffset === null || update.update_id >= this.nextOffset) {
          this.nextOffset = update.update_id + 1;
        }
      }

      if (intervalMs >= 1000) {
        await this.sleep(intervalMs);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
