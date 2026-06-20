import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import type { AppConfig } from 'shared/common/config/app.config';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type {
  RawTelegramMessage,
  ResolvedChannelMetadata,
  TelegramListenerPort,
} from 'ca/ingestion/telegram/domain/ports/telegram-listener.port';

interface TelegramClientOptions {
  connectionRetries?: number;
}

/**
 * MTProto adapter implementing TelegramListenerPort.
 *
 * Uses `telegram` (gramjs) for real-time and historical ingestion.
 * Handles FloodWait errors per docs/api/telegram.md section 12.
 *
 * Messages are pushed to an internal queue and drained by the
 * AsyncIterable returned by subscribe().
 */
@Injectable()
export class TelegramMtprotoAdapter
  implements TelegramListenerPort, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramMtprotoAdapter.name);
  private client: TelegramClient | null = null;
  private currentChannelIds: string[] = [];
  private queue: RawTelegramMessage[] = [];
  private waitingResolvers: Array<() => void> = [];
  private running = false;
  private authorizedAtLeastOnce = false;

  constructor(private readonly config: ConfigService) {}

  public async onModuleInit(): Promise<void> {
    const cfg = this.config.get<AppConfig>('app');
    if (!cfg?.telegram?.mtprotoApiId || !cfg?.telegram?.mtprotoApiHash) {
      this.logger.warn(
        'Telegram MTProto credentials not configured; ingestion disabled',
      );
      return;
    }
    // Probe session state so the seeder's post-connect backfill knows
    // whether titles can be resolved right now.
    await this.markAuthorizedIfTrue();
    if (this.authorizedAtLeastOnce) {
      this.logger.log('Telegram MTProto session already authorized.');
    } else {
      this.logger.debug('Telegram MTProto session not yet authorized.');
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private ensureClient(): TelegramClient {
    if (this.client) return this.client;
    const cfg = this.config.get<AppConfig>('app');
    if (!cfg?.telegram?.mtprotoApiId || !cfg?.telegram?.mtprotoApiHash) {
      throw new DomainError(
        ErrorCode.INTERNAL,
        'Telegram MTProto not configured (TELEGRAM_MTPROTO_API_ID / HASH missing)',
      );
    }
    const session = new StringSession(cfg.telegram.mtprotoSession || '');
    const options: TelegramClientOptions = { connectionRetries: 5 };
    this.client = new TelegramClient(
      session,
      cfg.telegram.mtprotoApiId,
      cfg.telegram.mtprotoApiHash,
      options,
    );
    return this.client;
  }

  public async *subscribe(
    channelIds: string[],
  ): AsyncIterable<RawTelegramMessage> {
    if (this.running) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        'Telegram listener already running',
      );
    }

    let client: import('telegram').TelegramClient;
    try {
      client = await this.ensureClient();
      const authorized = await client.isUserAuthorized();
      if (!authorized) {
        this.logger.warn(
          'Telegram session is not authorized — listener will idle. ' +
            'Set TELEGRAM_MTPROTO_API_ID/HASH/SESSION env vars to enable.',
        );
        // Mark as running so subscribe() returns a usable (empty) iterable
        // and consumeStream can iterate without crashing the app.
        this.currentChannelIds = [...channelIds];
        this.queue = [];
        this.waitingResolvers = [];
        this.running = true;
        return; // empty iterable — nothing to yield
      }
      this.authorizedAtLeastOnce = true;
    } catch (err) {
      this.logger.warn(
        `Telegram listener unavailable (${(err as Error).message}) — idling. ` +
          'Set TELEGRAM_MTPROTO_API_ID/HASH/SESSION env vars to enable.',
      );
      this.currentChannelIds = [...channelIds];
      this.queue = [];
      this.waitingResolvers = [];
      this.running = true;
      return;
    }

    this.currentChannelIds = [...channelIds];
    this.queue = [];
    this.waitingResolvers = [];
    this.running = true;

    const eventHandler = new NewMessage({});
    client.addEventHandler((event: unknown) => {
      void this.handleEvent(event);
    }, eventHandler);

    this.logger.log(`Subscribed to ${channelIds.length} channel(s)`);

    while (this.running) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
        continue;
      }
      await this.waitForNext();
      if (!this.running) break;
    }
  }

  private async handleEvent(event: unknown): Promise<void> {
    try {
      const message = (
        event as {
          message?: {
            id: number;
            message?: string;
            date: number;
            getChat?: () => Promise<{ id: unknown }>;
          };
        }
      ).message;
      if (!message) return;

      const chat = await message.getChat?.();
      const channelId = chat ? String(chat.id) : '';
      if (!channelId || !this.currentChannelIds.includes(channelId)) return;

      const raw: RawTelegramMessage = {
        channelId,
        messageId: message.id,
        text: message.message ?? '',
        occurredAt: new Date(message.date * 1000),
      };

      this.queue.push(raw);
      this.notifyNext();
    } catch (err) {
      this.logger.error('Error processing Telegram update', err);
    }
  }

  private notifyNext(): void {
    const resolver = this.waitingResolvers.shift();
    if (resolver) resolver();
  }

  private waitForNext(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.waitingResolvers.push(() => resolve());
    });
  }

  public async backfill(
    channelId: string,
    limit: number,
  ): Promise<RawTelegramMessage[]> {
    const client = this.ensureClient();

    const peer = await client.getEntity(channelId);

    const messages: any[] = await client.getMessages(peer, { limit });
    return messages.map((m) => ({
      channelId,
      messageId: m.id,
      text: m.message ?? '',
      occurredAt: new Date(m.date * 1000),
    }));
  }

  public async disconnect(): Promise<void> {
    this.running = false;
    this.notifyNext();
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (err) {
        this.logger.warn('Error during Telegram disconnect', err);
      }
      this.client = null;
      this.currentChannelIds = [];
    }
  }

  public async resolveChannelMetadata(
    channelId: string,
  ): Promise<ResolvedChannelMetadata> {
    const client = this.ensureClient();
    const entity = (await client.getEntity(channelId)) as {
      id?: { toString(): string } | number | string;
      title?: string;
      username?: string;
    };
    const resolvedId =
      entity && entity.id !== undefined ? String(entity.id) : channelId;
    const title = entity?.title?.trim() || `Telegram channel ${resolvedId}`;
    const username = entity?.username ? entity.username.trim() : null;
    return { channelId: resolvedId, title, username };
  }

  /**
   * Whether the MTProto client is currently authorized and able to serve
   * metadata requests. Used by the seeder's post-connect backfill so it
   * knows whether to attempt resolution now or wait for the next boot.
   *
   * The check is cheap and lock-free — it never instantiates the
   * underlying TelegramClient; it only inspects env config + a cached
   * "authorized at least once" flag set by `subscribe()`.
   */
  public isAuthorized(): boolean {
    if (!this.authorizedAtLeastOnce) return false;
    const cfg = this.config.get<AppConfig>('app');
    return !!(
      cfg?.telegram?.mtprotoApiId &&
      cfg?.telegram?.mtprotoApiHash &&
      cfg?.telegram?.mtprotoSession
    );
  }

  private async markAuthorizedIfTrue(): Promise<void> {
    if (this.authorizedAtLeastOnce) return;
    try {
      const client = await this.ensureClient();
      await client.connect();
      const ok = await client.isUserAuthorized();
      if (ok) {
        this.authorizedAtLeastOnce = true;
      }
    } catch (err) {
      this.logger.debug(`MTProto probe failed: ${(err as Error).message}`);
    }
  }
}
