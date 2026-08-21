import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Logger as GramjsLogger, LogLevel } from 'telegram/extensions/Logger';
import type { AppConfig } from 'shared/common/config/app.config';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

const VALID_LOG_LEVELS = new Set<string>([
  LogLevel.NONE,
  LogLevel.ERROR,
  LogLevel.WARN,
  LogLevel.INFO,
  LogLevel.DEBUG,
]);

function resolveGramjsLogLevel(raw: string | undefined): string {
  if (raw && VALID_LOG_LEVELS.has(raw)) return raw;
  return LogLevel.ERROR;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class TelegramClientManager {
  private client: TelegramClient | null = null;
  private authorizedAtLeastOnce = false;
  private readonly logger = new Logger(TelegramClientManager.name);

  constructor(private readonly config: ConfigService) {}

  getClient(): TelegramClient | null {
    return this.client;
  }

  ensureClient(): TelegramClient {
    if (this.client) return this.client;
    const cfg = this.config.get<AppConfig>('app');
    if (!cfg?.telegram?.mtprotoApiId || !cfg?.telegram?.mtprotoApiHash)
      throw new DomainError(
        ErrorCode.INTERNAL,
        'Telegram MTProto not configured',
      );
    const session = new StringSession(cfg.telegram.mtprotoSession || '');
    const level = resolveGramjsLogLevel(cfg.telegram.mtprotoLogLevel);
    const baseLogger = new GramjsLogger(level as never);
    this.client = new TelegramClient(
      session,
      cfg.telegram.mtprotoApiId,
      cfg.telegram.mtprotoApiHash,
      {
        connectionRetries: 5,
        baseLogger,
        useWSS: cfg.telegram.mtprotoUseWss,
      },
    );
    return this.client;
  }

  async connect(): Promise<void> {
    if (!this.client) this.ensureClient();
    const cfg = this.config.get<AppConfig>('app');
    const delay = cfg?.telegram?.mtprotoStartupDelayMs ?? 0;
    if (delay > 0) {
      this.logger.log(`MTProto connect delayed ${delay}ms (startup)`);
      await sleep(delay);
    }
    await this.client!.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        /* ignore */
      }
      this.client = null;
    }
  }

  async markAuthorizedIfTrue(): Promise<void> {
    if (this.authorizedAtLeastOnce) return;
    try {
      await this.connect();
      this.authorizedAtLeastOnce = await this.client!.isUserAuthorized();
    } catch {
      /* ignore */
    }
  }

  isAuthorized(): boolean {
    return this.authorizedAtLeastOnce;
  }
}
