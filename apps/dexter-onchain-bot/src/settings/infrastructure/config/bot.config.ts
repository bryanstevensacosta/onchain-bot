import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  resolveDexterSendMode,
  type DexterSendMode,
} from '../../../telegram/infrastructure/gateway/send-mode';

export type DexterIngestMode = 'webhook' | 'polling';

export interface DexterBotConfig {
  readonly botToken: string;
  readonly webhookSecret: string | null;
  readonly webhookUrl: string | null;
  readonly ingestMode: DexterIngestMode;
  readonly pollingIntervalMs: number;
  readonly pollingTimeoutSec: number;
  readonly defaultTradeButtons: readonly string[];
  readonly maxMessageLength: number;
  readonly commandRateLimitPerUser: number;
  /** Gateway vault id for the dexter bot (`DEXTER_BOT_VAULT_ID`, '' = unmapped). */
  readonly botVaultId: string;
  /** Lookup send path (`DEXTER_SEND_MODE`, default `dual`). */
  readonly sendMode: DexterSendMode;
  /** telegram-bots-gateway base URL (dev :4070, staging :4071, prod :4072). */
  readonly botsGatewayBaseUrl: string;
  /** Shared secret for the gateway fan-out ingress (`POST /dexter/ingress`). */
  readonly ingressSecret: string | null;
}

const DEFAULTS: Omit<
  DexterBotConfig,
  | 'botToken'
  | 'webhookSecret'
  | 'webhookUrl'
  | 'botVaultId'
  | 'sendMode'
  | 'botsGatewayBaseUrl'
  | 'ingressSecret'
> = {
  ingestMode: 'polling',
  pollingIntervalMs: 1000,
  pollingTimeoutSec: 30,
  defaultTradeButtons: ['DEX', 'PHO', 'TRO'],
  maxMessageLength: 4096,
  commandRateLimitPerUser: 30,
};

/**
 * Dexter bot config (moved from backend chain-dexter-bot `bot.config.ts`).
 *
 * Token migration (P13, C-BOTS-01): `DEXTER_BOT_TOKEN` wins when set;
 * the legacy `CHAIN_DEXTER_BOT_TOKEN` is still honored as a fallback so
 * existing deploys keep working until the operator renames the var.
 * Dev default ingest mode is polling (no public URL needed); the
 * backend default was webhook.
 */
@Injectable()
export class DexterBotConfigService {
  private readonly logger = new Logger(DexterBotConfigService.name);
  private readonly config: DexterBotConfig;

  public constructor(private readonly configService: ConfigService) {
    const botToken =
      process.env.DEXTER_BOT_TOKEN ?? process.env.CHAIN_DEXTER_BOT_TOKEN ?? '';
    const webhookSecret =
      process.env.DEXTER_WEBHOOK_SECRET ??
      process.env.CHAIN_DEXTER_WEBHOOK_SECRET ??
      null;
    const webhookUrl = process.env.DEXTER_WEBHOOK_URL ?? null;
    const ingestMode =
      (process.env.DEXTER_INGEST_MODE as DexterIngestMode | undefined) ??
      DEFAULTS.ingestMode;

    const defaultTradeButtonsRaw =
      process.env.DEXTER_DEFAULT_TRADE_BUTTONS?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [...DEFAULTS.defaultTradeButtons];
    const ingressSecret =
      (process.env.DEXTER_INGRESS_SECRET ?? '').trim() || null;

    this.config = Object.freeze({
      botToken,
      webhookSecret:
        webhookSecret && webhookSecret.length > 0 ? webhookSecret : null,
      webhookUrl: webhookUrl && webhookUrl.length > 0 ? webhookUrl : null,
      ingestMode,
      pollingIntervalMs: Number(
        process.env.DEXTER_POLLING_INTERVAL_MS ??
          process.env.CHAIN_DEXTER_POLLING_INTERVAL_MS ??
          DEFAULTS.pollingIntervalMs,
      ),
      pollingTimeoutSec: Number(
        process.env.DEXTER_POLLING_TIMEOUT_SEC ?? DEFAULTS.pollingTimeoutSec,
      ),
      defaultTradeButtons: Object.freeze([...defaultTradeButtonsRaw]),
      maxMessageLength: DEFAULTS.maxMessageLength,
      commandRateLimitPerUser: Number(
        process.env.DEXTER_RATE_LIMIT_PER_USER ??
          DEFAULTS.commandRateLimitPerUser,
      ),
      botVaultId: (process.env.DEXTER_BOT_VAULT_ID ?? '').trim(),
      sendMode: resolveDexterSendMode(process.env.DEXTER_SEND_MODE),
      botsGatewayBaseUrl:
        (process.env.BOTS_GATEWAY_URL ?? '').trim().replace(/\/+$/, '') ||
        'http://localhost:4070',
      ingressSecret,
    });

    this.validate();
  }

  public get(): DexterBotConfig {
    return this.config;
  }

  private validate(): void {
    if (!this.config.botToken) {
      this.logger.warn(
        'DEXTER_BOT_TOKEN not configured — bot will be inactive',
      );
    }
    if (this.config.ingestMode === 'webhook' && !this.config.webhookSecret) {
      this.logger.warn(
        'DEXTER_INGEST_MODE=webhook but DEXTER_WEBHOOK_SECRET is empty — webhook will accept unsigned requests (dev only)',
      );
    }
    if (!['webhook', 'polling'].includes(this.config.ingestMode)) {
      throw new Error(`Invalid DEXTER_INGEST_MODE: ${this.config.ingestMode}`);
    }
    if (this.config.pollingIntervalMs < 100) {
      this.logger.warn(
        `DEXTER_POLLING_INTERVAL_MS=${this.config.pollingIntervalMs} is very low (min 100ms)`,
      );
    }
    if (
      (this.config.sendMode === 'dual' || this.config.sendMode === 'gateway') &&
      !this.config.botVaultId
    ) {
      this.logger.warn(
        'DEXTER_BOT_VAULT_ID not configured — gateway legs fail closed until POST /api/dexter-bots/migrate-to-gateway runs',
      );
    }
  }
}
