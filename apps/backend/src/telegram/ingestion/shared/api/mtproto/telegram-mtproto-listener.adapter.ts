import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient, Api } from 'telegram';
import { NewMessage } from 'telegram/events';
import type { AppConfig } from 'shared/common/config/app.config';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type {
  TelegramRawMessage,
  ResolvedChannelMetadata,
  TelegramListenerPort,
  JoinChannelResult,
  TelegramMediaAttachment,
} from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';
import { IngestionSafetyConfig } from 'telegram/ingestion/shared/infrastructure/config/ingestion-safety.config';
import { SleepWindowService } from 'telegram/ingestion/shared/infrastructure/services/sleep-window.service';
import { FloodWaitCounterService } from 'telegram/ingestion/shared/infrastructure/services/flood-wait-counter.service';
import { FloodWaitHandlerService } from 'telegram/ingestion/shared/infrastructure/services/flood-wait-handler.service';
import { CryptoNewsMediaDownloader } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-media-downloader.port';
import { TelegramClientManager } from 'telegram/ingestion/shared/infrastructure/services/telegram-client-manager.service';
import { LastSeenManager } from 'telegram/ingestion/shared/infrastructure/services/last-seen-manager.service';
import { MessageQueue } from 'telegram/ingestion/shared/infrastructure/services/message-queue';
import {
  MediaExtractor,
  type RawTelegramMessage,
} from './telegram-mtproto.utils';
import { transformMessage } from './telegram-message-transformer';
import { TelegramPeerResolver } from 'telegram/ingestion/shared/infrastructure/services/telegram-peer-resolver';
import { TelegramMediaDownloadService } from 'telegram/ingestion/shared/infrastructure/services/telegram-media-download.service';

@Injectable()
export class TelegramMtprotoListenerAdapter
  implements TelegramListenerPort, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramMtprotoListenerAdapter.name);
  private subscribedChannelIds: string[] = [];
  private readonly messageQueue = new MessageQueue<TelegramRawMessage>();
  private readonly peerResolver = new TelegramPeerResolver();
  private running = false;
  public lastPollAt: Date | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly safetyConfig: IngestionSafetyConfig,
    private readonly sleepWindow: SleepWindowService,
    private readonly floodWaitCounter: FloodWaitCounterService,
    private readonly floodWaitHandler: FloodWaitHandlerService,
    private readonly clientManager: TelegramClientManager,
    private readonly lastSeenManager: LastSeenManager,
    @Inject(forwardRef(() => CryptoNewsMediaDownloader))
    private readonly mediaDownloader: CryptoNewsMediaDownloader,
    private readonly mediaDownloadService: TelegramMediaDownloadService,
  ) {}

  /**
   * Returns the currently initialised TelegramClient, or null if the
   * client has not been created yet (no MTProto credentials configured
   * or `subscribe()` has not been called).
   *
   * Exposed for the `MtprotoMediaDownloader` factory so it can lazily
   * access the listener-owned client at download time.
   */
  public getClient(): TelegramClient | null {
    return this.clientManager.getClient();
  }

  async onModuleInit(): Promise<void> {
    const cfg = this.config.get<AppConfig>('app');
    if (
      !cfg?.telegram?.mtprotoEnabled ||
      !cfg?.telegram?.mtprotoApiId ||
      !cfg?.telegram?.mtprotoApiHash
    )
      return;
    await this.clientManager.markAuthorizedIfTrue();
  }

  async onModuleDestroy(): Promise<void> {
    await this.clientManager.disconnect();
  }

  async *subscribe(channelIds: string[]): AsyncIterable<TelegramRawMessage> {
    if (this.running)
      throw new DomainError(
        ErrorCode.CONFLICT,
        'Telegram listener already running',
      );
    const client = this.clientManager.ensureClient();
    let authorized = false;
    try {
      authorized = await client.isUserAuthorized();
    } catch {
      /* not connected yet */
    }
    if (!authorized) {
      this.logger.warn('Telegram session not authorized — listener will idle.');
      this.subscribedChannelIds = [...channelIds];
      this.running = true;
      return;
    }
    this.subscribedChannelIds = [...channelIds];
    this.running = true;
    client.addEventHandler((event: unknown) => {
      void this.handleEvent(event);
    }, new NewMessage({}));
    this.logger.log(
      `Subscribed to ${channelIds.length} channel(s) — loading lastSeen offsets from Redis`,
    );

    await this.lastSeenManager.load(channelIds);

    this.logger.log(
      `Loaded ${this.lastSeenManager.size()}/${channelIds.length} lastSeen offsets — starting staggered polling`,
    );
    void this.startPollingLoop();
    while (this.running) {
      if (this.messageQueue.length > 0) {
        yield this.messageQueue.shift()!;
        continue;
      }
      await this.messageQueue.waitForItem();
    }
  }

  /**
   * Staggered polling loop: polls channels one at a time with jitter,
   * respects sleep window, and handles FLOOD_WAIT errors.
   */
  private async startPollingLoop(): Promise<void> {
    const peers = [...this.subscribedChannelIds];
    if (peers.length === 0) return;

    while (this.running) {
      // Check sleep window and flood pause
      if (this.sleepWindow.isAsleep()) {
        const wake = this.sleepWindow.getNextWakeTime();
        this.logger.debug(
          `Sleep window active — pausing polling until ${wake?.toISOString() ?? 'next wake'}`,
        );
        await this.sleep(60_000);
        continue;
      }

      if (this.floodWaitHandler.isPaused) {
        this.logger.warn(
          `Flood wait pause active until ${this.floodWaitHandler.pausedUntilDate?.toISOString()} — skipping polling cycle`,
        );
        await this.sleep(60_000);
        continue;
      }

      // Calculate staggered delays
      const n = peers.length;
      const staggerBase = this.safetyConfig.pollIntervalBaseMs / n;
      const jitterPct = this.safetyConfig.jitterPercent;

      // Poll each channel sequentially with staggered delay
      for (let i = 0; i < n; i++) {
        if (!this.running) break;

        const peerId = peers[i];
        const jitter = (Math.random() - 0.5) * 2 * staggerBase * jitterPct;
        const delay = Math.max(staggerBase * i + jitter, 0);
        await this.sleep(delay);

        if (!this.running) break;

        try {
          await this.floodWaitHandler.withRetry(`poll:${peerId}`, async () => {
            const peer = await this.peerResolver.resolvePeerAsChannel(
              this.clientManager.ensureClient(),
              peerId,
            );
            const lastSeen = this.lastSeenManager.get(peerId);
            const messages = await this.clientManager
              .getClient()!
              .getMessages(peer, {
                minId: lastSeen,
                limit: 50,
              });
            for (const rawMsg of messages as RawTelegramMessage[]) {
              if (rawMsg.id <= lastSeen) continue;
              this.lastSeenManager.set(peerId, rawMsg.id);
              const media = await this.extractMediaAttachments(peerId, rawMsg);
              this.messageQueue.push(transformMessage(peerId, rawMsg, media));
            }
          });
          this.lastPollAt = new Date();

          const lastSeen = this.lastSeenManager.get(peerId);
          if (lastSeen > 0) {
            await this.lastSeenManager.persist(peerId, lastSeen);
          }
        } catch (err) {
          this.logger.error(
            `Poll failed for ${peerId}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  private async handleEvent(event: unknown): Promise<void> {
    try {
      const msg = (
        event as {
          message?: {
            id: number;
            message?: string;
            date: number;
            media?: unknown;
            getChat?: () => Promise<{ id: unknown }>;
          };
        }
      ).message;
      if (!msg) return;
      const chat = await msg.getChat?.();
      const channelId = chat ? String(chat.id) : '';
      if (!channelId || !this.subscribedChannelIds.includes(channelId)) return;
      const media = await this.extractMediaAttachments(channelId, msg);
      const rawMsg = msg as RawTelegramMessage;
      this.messageQueue.push(transformMessage(channelId, rawMsg, media));
    } catch (err) {
      this.logger.error('Error processing Telegram update', err);
    }
  }

  async backfill(
    channelId: string,
    limit: number,
  ): Promise<TelegramRawMessage[]> {
    const client = this.clientManager.ensureClient();
    const peer = await this.peerResolver.resolvePeerAsChannel(
      client,
      channelId,
    );
    const messages: unknown[] = await client.getMessages(peer, { limit });
    const out: TelegramRawMessage[] = [];
    for (const m of messages as {
      id: number;
      message?: string;
      date: number;
      media?: unknown;
    }[]) {
      // `client.getMessages({ limit })` returns each message with
      // `media.photo` populated but only a partial Photo stub — no
      // `id`, no `accessHash`, no `fileReference`. We need a per-id
      // fetch so `client.downloadMedia()` can resolve the file.
      let resolved = m;
      if (m.media && typeof m.media === 'object') {
        try {
          const detailed = await client.getMessages(peer, { ids: [m.id] });
          if (Array.isArray(detailed) && detailed[0]) {
            resolved = detailed[0];
          }
        } catch {
          resolved = m;
        }
      }
      const media = await this.extractMediaAttachments(channelId, resolved);
      const rawMsg = m as RawTelegramMessage;
      out.push(
        transformMessage(
          channelId,
          rawMsg,
          media && media.length > 0 ? [...media] : undefined,
        ),
      );
    }
    return out;
  }

  /**
   * Build a `TelegramMediaAttachment` from `msg.media.photo` (if present)
   * WITHOUT downloading. Used by `backfill()` where the controller does
   * not persist media rows anyway.
   */
  private async extractMediaAttachments(
    peerId: string,
    msg: { id: number; media?: unknown },
  ): Promise<ReadonlyArray<TelegramMediaAttachment> | undefined> {
    const attachment = new MediaExtractor().extract(msg.media);
    if (!attachment) {
      this.logger.warn(
        `extractMediaAttachments(${peerId}:${msg.id}) — no photo or video attachment`,
      );
      return undefined;
    }
    const client = this.clientManager.getClient();
    if (!client) throw new Error('Telegram client not available');
    const dlMedia = msg.media as Api.TypeMessageMedia | undefined;
    if (!dlMedia) {
      this.logger.warn(
        `extractMediaAttachments(${peerId}:${msg.id}) — msg.media is null after extraction`,
      );
      return undefined;
    }
    try {
      return await this.mediaDownloadService.downloadAndSave(
        peerId,
        msg.id,
        attachment,
        dlMedia,
      );
    } catch (err) {
      const refreshed = await this.mediaDownloadService.downloadWithRefresh(
        peerId,
        msg.id,
        attachment,
        msg,
        err,
      );
      if (refreshed) return refreshed;
      this.logger.warn(
        `Media download failed for ${peerId}:${msg.id} — message continues without media: ${(err as Error).message}`,
      );
      return undefined;
    }
  }

  async disconnect(): Promise<void> {
    this.running = false;
    this.messageQueue.flush();
  }

  async resolveChannelMetadata(
    channelId: string,
  ): Promise<ResolvedChannelMetadata> {
    return this.peerResolver.resolveChannelMetadata(
      this.clientManager.ensureClient(),
      channelId,
    );
  }

  async joinChannel(peerId: string): Promise<JoinChannelResult> {
    return this.peerResolver.joinChannel(
      this.clientManager.ensureClient(),
      peerId,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
