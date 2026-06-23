import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ChainDexterIngestMode = 'webhook' | 'polling';
export type ChainDexterPriceMode = 'sim' | 'adv';
export type ChainDexterButtonPosition = 'top' | 'bot';

export interface ChainDexterBotConfig {
  readonly botToken: string;
  readonly webhookSecret: string | null;
  readonly ingestMode: ChainDexterIngestMode;
  readonly pollingIntervalMs: number;
  readonly pollingTimeoutSec: number;
  readonly defaultTradeButtons: readonly string[];
  readonly maxMessageLength: number;
  readonly commandRateLimitPerUser: number;
}

interface AppConfigShape {
  readonly chainDexterBot?: Partial<ChainDexterBotConfig>;
}

const DEFAULTS: Omit<ChainDexterBotConfig, 'botToken' | 'webhookSecret'> = {
  ingestMode: 'webhook',
  pollingIntervalMs: 1000,
  pollingTimeoutSec: 30,
  defaultTradeButtons: ['DEX', 'PHO', 'TRO'],
  maxMessageLength: 4096,
  commandRateLimitPerUser: 30,
};

/**
 * Loads chain-dexter-bot config from app.chainDexterBot namespace (registered in app.config.ts)
 * with env-var fallbacks for standalone use.
 */
@Injectable()
export class ChainDexterBotConfigService {
  private readonly logger = new Logger(ChainDexterBotConfigService.name);
  private readonly config: ChainDexterBotConfig;

  public constructor(private readonly configService: ConfigService) {
    const fromApp = this.configService.get<AppConfigShape>('app');
    const merged = fromApp?.chainDexterBot ?? {};

    const botToken =
      merged.botToken ?? process.env.CHAIN_DEXTER_BOT_TOKEN ?? '';
    const webhookSecret =
      merged.webhookSecret ?? process.env.CHAIN_DEXTER_WEBHOOK_SECRET ?? null;
    const ingestMode =
      merged.ingestMode ??
      (process.env.CHAIN_DEXTER_INGEST_MODE as
        | ChainDexterIngestMode
        | undefined) ??
      DEFAULTS.ingestMode;

    const defaultTradeButtonsRaw =
      merged.defaultTradeButtons ??
      process.env.CHAIN_DEXTER_DEFAULT_TRADE_BUTTONS?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ??
      DEFAULTS.defaultTradeButtons;

    this.config = Object.freeze({
      botToken,
      webhookSecret:
        webhookSecret && webhookSecret.length > 0 ? webhookSecret : null,
      ingestMode,
      pollingIntervalMs: Number(
        merged.pollingIntervalMs ??
          process.env.CHAIN_DEXTER_POLLING_INTERVAL_MS ??
          DEFAULTS.pollingIntervalMs,
      ),
      pollingTimeoutSec: Number(
        merged.pollingTimeoutSec ?? DEFAULTS.pollingTimeoutSec,
      ),
      defaultTradeButtons: Object.freeze([...defaultTradeButtonsRaw]),
      maxMessageLength: DEFAULTS.maxMessageLength,
      commandRateLimitPerUser: DEFAULTS.commandRateLimitPerUser,
    });

    this.validate();
  }

  public get(): ChainDexterBotConfig {
    return this.config;
  }

  private validate(): void {
    if (!this.config.botToken) {
      this.logger.warn(
        'CHAIN_DEXTER_BOT_TOKEN not configured — bot will be inactive',
      );
    }
    if (this.config.ingestMode === 'webhook' && !this.config.webhookSecret) {
      this.logger.warn(
        'CHAIN_DEXTER_INGEST_MODE=webhook but CHAIN_DEXTER_WEBHOOK_SECRET is empty — webhook will accept unsigned requests (dev only)',
      );
    }
    if (!['webhook', 'polling'].includes(this.config.ingestMode)) {
      throw new Error(
        `Invalid CHAIN_DEXTER_INGEST_MODE: ${this.config.ingestMode}`,
      );
    }
    if (this.config.pollingIntervalMs < 100) {
      this.logger.warn(
        `CHAIN_DEXTER_POLLING_INTERVAL_MS=${this.config.pollingIntervalMs} is very low (min 100ms)`,
      );
    }
  }
}
