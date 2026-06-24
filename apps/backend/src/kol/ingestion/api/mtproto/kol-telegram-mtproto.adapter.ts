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
  RawKolMessage,
  ResolvedKolMetadata,
  KolListenerPort,
} from 'kol/ingestion/domain/ports/kol-listener.port';

interface TelegramClientOptions {
  connectionRetries?: number;
}

/**
 * MTProto adapter implementing KolListenerPort.
 *
 * Uses `telegram` (gramjs) for real-time and historical ingestion.
 * Handles FloodWait errors per docs/api/telegram.md section 12.
 *
 * Messages are pushed to an internal queue and drained by the
 * AsyncIterable returned by subscribe().
 *
 * Fase 4 of the kol-refactor plan: renamed from `TelegramMtprotoAdapter`.
 * The "telegram" prefix in the class name stays because the adapter
 * implements the Telegram MTProto transport; "Kol" indicates the BC
 * owner (`kol/ingestion/`).
 */
@Injectable()
export class KolTelegramMtprotoAdapter
  implements KolListenerPort, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(KolTelegramMtprotoAdapter.name);
  private client: TelegramClient | null = null;
  private currentKolIds: string[] = [];
  private queue: RawKolMessage[] = [];
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

  public async *subscribe(kolIds: string[]): AsyncIterable<RawKolMessage> {
    if (this.running) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        'Telegram listener already running',
      );
    }

    let client: import('telegram').TelegramClient;
    try {
      client = this.ensureClient();
      const authorized = await client.isUserAuthorized();
      if (!authorized) {
        this.logger.warn(
          'Telegram session is not authorized — listener will idle. ' +
            'Set TELEGRAM_MTPROTO_API_ID/HASH/SESSION env vars to enable.',
        );
        this.currentKolIds = [...kolIds];
        this.queue = [];
        this.waitingResolvers = [];
        this.running = true;
        return;
      }
      this.authorizedAtLeastOnce = true;
    } catch (err) {
      this.logger.warn(
        `Telegram listener unavailable (${(err as Error).message}) — idling. ` +
          'Set TELEGRAM_MTPROTO_API_ID/HASH/SESSION env vars to enable.',
      );
      this.currentKolIds = [...kolIds];
      this.queue = [];
      this.waitingResolvers = [];
      this.running = true;
      return;
    }

    this.currentKolIds = [...kolIds];
    this.queue = [];
    this.waitingResolvers = [];
    this.running = true;

    const eventHandler = new NewMessage({});
    client.addEventHandler((event: unknown) => {
      void this.handleEvent(event);
    }, eventHandler);

    this.logger.log(`Subscribed to ${kolIds.length} KOL(s)`);

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
      const kolId = chat ? String(chat.id) : '';
      if (!kolId || !this.currentKolIds.includes(kolId)) return;

      const raw: RawKolMessage = {
        kolId,
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
    kolId: string,
    limit: number,
  ): Promise<RawKolMessage[]> {
    const client = this.ensureClient();

    const peer = await this.resolvePeerAsKol(kolId);

    const messages: unknown[] = await client.getMessages(peer, { limit });
    return (messages as { id: number; message?: string; date: number }[]).map(
      (m) => ({
        kolId,
        messageId: m.id,
        text: m.message ?? '',
        occurredAt: new Date(m.date * 1000),
      }),
    );
  }

  /**
   * Resolve a peer id to an InputPeer-like entity that gramJS treats as a
   * broadcast channel / supergroup.
   *
   * gramJS interprets bare numeric ids as user ids by default. Telegram
   * channels and supergroups use the `-100<id>` form. When the caller
   * passes the bare KOL id (e.g. `1924457034`), we first try the
   * `-100`-prefixed form; if that fails, fall back to the original input
   * (covers usernames, `t.me/<slug>`, and already-prefixed ids).
   */
  private async resolvePeerAsKol(
    kolId: string,
  ): Promise<Parameters<import('telegram').TelegramClient['getMessages']>[0]> {
    const client = this.ensureClient();
    if (/^-?\d+$/.test(kolId)) {
      const withPrefix = kolId.startsWith('-100')
        ? kolId
        : `-100${kolId.replace(/^-/, '')}`;
      try {
        return await client.getEntity(withPrefix);
      } catch {
        return await client.getEntity(kolId);
      }
    }
    return await client.getEntity(kolId);
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
      this.currentKolIds = [];
    }
  }

  public async resolveKolMetadata(kolId: string): Promise<ResolvedKolMetadata> {
    this.ensureClient();
    const entity = (await this.resolvePeerAsKol(kolId)) as {
      id?: { toString(): string } | number | string;
      title?: string;
      username?: string;
      firstName?: string;
      lastName?: string;
    };
    const resolvedId =
      entity && entity.id !== undefined ? String(entity.id) : kolId;
    const title = entity?.title?.trim() || `Telegram channel ${resolvedId}`;
    const handle = entity?.username ? entity.username.trim() : null;
    const kind: ResolvedKolMetadata['kind'] = entity?.title?.trim()
      ? 'channel'
      : entity?.firstName || entity?.lastName
        ? 'user'
        : 'unknown';
    return { kolId: resolvedId, title, handle, kind };
  }

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
      const client = this.ensureClient();
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
