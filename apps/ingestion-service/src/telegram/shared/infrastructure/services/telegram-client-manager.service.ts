import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Logger as GramjsLogger, LogLevel } from 'telegram/extensions/Logger';

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

const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;

/**
 * TelegramClientManager - Manages singleton TelegramClient lifecycle
 *
 * Simplified from backend version:
 * - No DomainError (uses standard Error)
 * - Reads config from ingestion-service app.config
 * - Same connection logic and timeout handling
 */
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

    const cfg = this.config.get('app');
    if (!cfg?.telegram?.mtprotoApiId || !cfg?.telegram?.mtprotoApiHash) {
      throw new Error('Telegram MTProto not configured');
    }

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

    const cfg = this.config.get('app');
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

    this.ensureClient();

    const cfg = this.config.get('app');
    const delay = cfg?.telegram?.mtprotoStartupDelayMs ?? 0;

    if (delay > 0) {
      this.logger.log(`MTProto connect delayed ${delay}ms (startup)`);
      await sleep(delay);
    }

    const op = (async () => {
      await this.client!.connect();
      return this.client!.isUserAuthorized();
    })();

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('mtproto-connect-timeout')),
        DEFAULT_CONNECT_TIMEOUT_MS,
      );
    });

    try {
      this.authorizedAtLeastOnce = await Promise.race([op, timeout]);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      if (message === 'mtproto-connect-timeout') {
        this.logger.log(
          `MTProto connect timed out after ${DEFAULT_CONNECT_TIMEOUT_MS}ms — listener will idle`,
        );
      } else {
        this.logger.error(message);
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  isAuthorized(): boolean {
    return this.authorizedAtLeastOnce;
  }
}
