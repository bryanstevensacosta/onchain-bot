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
import { StringSession } from 'telegram/sessions';
import { Logger as GramjsLogger, LogLevel } from 'telegram/extensions/Logger';
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

@Injectable()
export class TelegramMtprotoListenerAdapter
  implements TelegramListenerPort, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramMtprotoListenerAdapter.name);
  private client: TelegramClient | null = null;
  private subscribedChannelIds: string[] = [];
  private queue: TelegramRawMessage[] = [];
  private waitingResolvers: Array<() => void> = [];
  private running = false;
  private authorizedAtLeastOnce = false;
  public lastPollAt: Date | null = null;
  private lastSeenMessageId = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly safetyConfig: IngestionSafetyConfig,
    private readonly sleepWindow: SleepWindowService,
    private readonly floodWaitCounter: FloodWaitCounterService,
    private readonly floodWaitHandler: FloodWaitHandlerService,
    @Inject(forwardRef(() => CryptoNewsMediaDownloader))
    private readonly mediaDownloader: CryptoNewsMediaDownloader,
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
    return this.client;
  }

  async onModuleInit(): Promise<void> {
    const cfg = this.config.get<AppConfig>('app');
    if (!cfg?.telegram?.mtprotoApiId || !cfg?.telegram?.mtprotoApiHash) return;
    await this.markAuthorizedIfTrue();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private ensureClient(): TelegramClient {
    if (this.client) return this.client;
    const cfg = this.config.get<AppConfig>('app');
    if (!cfg?.telegram?.mtprotoApiId || !cfg?.telegram?.mtprotoApiHash)
      throw new DomainError(
        ErrorCode.INTERNAL,
        'Telegram MTProto not configured',
      );
    const session = new StringSession(cfg.telegram.mtprotoSession || '');
    const silentLogger = new GramjsLogger();
    silentLogger.setLevel(LogLevel.NONE);
    this.client = new TelegramClient(
      session,
      cfg.telegram.mtprotoApiId,
      cfg.telegram.mtprotoApiHash,
      { connectionRetries: 5, baseLogger: silentLogger },
    );
    return this.client;
  }

  async *subscribe(channelIds: string[]): AsyncIterable<TelegramRawMessage> {
    if (this.running)
      throw new DomainError(
        ErrorCode.CONFLICT,
        'Telegram listener already running',
      );
    const client = this.ensureClient();
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
    this.authorizedAtLeastOnce = true;
    this.subscribedChannelIds = [...channelIds];
    this.running = true;
    client.addEventHandler((event: unknown) => {
      void this.handleEvent(event);
    }, new NewMessage({}));
    this.logger.log(
      `Subscribed to ${channelIds.length} channel(s) — starting staggered polling`,
    );
    void this.startPollingLoop();
    while (this.running) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
        continue;
      }
      await new Promise<void>((resolve) =>
        this.waitingResolvers.push(() => resolve()),
      );
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
            const peer = await this.resolvePeerAsChannel(peerId);
            const messages = await this.client!.getMessages(peer, { limit: 1 });
            const msg = (
              messages as {
                id: number;
                message?: string;
                date: number;
                media?: unknown;
              }[]
            )[0];
            if (msg) {
              const lastSeen = this.lastSeenMessageId.get(peerId) ?? -1;
              if (msg.id > lastSeen) {
                this.lastSeenMessageId.set(peerId, msg.id);
                const media = await this.extractMediaForMessage(peerId, msg);
                const msgAny = msg as any;
                this.queue.push({
                  peerId,
                  messageId: msg.id,
                  text: msg.message ?? '',
                  occurredAt: new Date(msg.date * 1000),
                  entities: (
                    (msgAny.entities ?? []) as Array<{
                      offset: number;
                      length: number;
                      className?: string;
                      url?: string;
                    }>
                  ).map((e) => ({
                    offset: e.offset,
                    length: e.length,
                    type: this.normalizeEntityType(e.className),
                    ...(e.url ? { url: e.url } : {}),
                  })),
                  ...(media ? { media } : {}),
                  groupedId: (msgAny.groupedId as string) ?? null,
                });
                const resolver = this.waitingResolvers.shift();
                if (resolver) resolver();
              }
            }
          });
          this.lastPollAt = new Date();
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
      const media = await this.extractMediaForMessage(channelId, msg);
      const msgAny = msg as any;
      this.queue.push({
        peerId: channelId,
        messageId: msg.id,
        text: msg.message ?? '',
        occurredAt: new Date(msg.date * 1000),
        entities: (
          (msgAny.entities ?? []) as Array<{
            offset: number;
            length: number;
            className?: string;
            url?: string;
          }>
        ).map((e) => ({
          offset: e.offset,
          length: e.length,
          type: this.normalizeEntityType(e.className),
          ...(e.url ? { url: e.url } : {}),
        })),
        ...(media ? { media } : {}),
        groupedId: (msgAny.groupedId as string) ?? null,
      });
      const resolver = this.waitingResolvers.shift();
      if (resolver) resolver();
    } catch (err) {
      this.logger.error('Error processing Telegram update', err);
    }
  }

  async backfill(
    channelId: string,
    limit: number,
  ): Promise<TelegramRawMessage[]> {
    const client = this.ensureClient();
    const peer = await this.resolvePeerAsChannel(channelId);
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
      const media = await this.extractMediaForMessage(channelId, resolved);
      const mAny = m as any;
      out.push({
        peerId: channelId,
        messageId: m.id,
        text: m.message ?? '',
        occurredAt: new Date(m.date * 1000),
        entities: (
          (mAny.entities ?? []) as Array<{
            offset: number;
            length: number;
            className?: string;
            url?: string;
          }>
        ).map((e) => ({
          offset: e.offset,
          length: e.length,
          type: this.normalizeEntityType(e.className),
          ...(e.url ? { url: e.url } : {}),
        })),
        ...(media && media.length > 0 ? { media: [...media] } : {}),
        groupedId: (mAny.groupedId as string) ?? null,
      });
    }
    return out;
  }

  private async resolvePeerAsChannel(channelId: string) {
    const client = this.ensureClient();
    // If starts with @, treat as username - pass directly to getEntity
    if (channelId.startsWith('@')) {
      return await client.getEntity(channelId);
    }
    // If doesn't match pure numeric (with optional leading -), treat as username/other
    if (!/^-?\d+$/.test(channelId)) {
      return await client.getEntity(channelId);
    }
    // Numeric ID - try with -100 prefix first, then without
    const withPrefix = channelId.startsWith('-100')
      ? channelId
      : `-100${channelId.replace(/^-/, '')}`;
    try {
      return await client.getEntity(withPrefix);
    } catch {
      return await client.getEntity(channelId);
    }
  }

  /**
   * Build a `TelegramMediaAttachment` from `msg.media.photo` (if present)
   * WITHOUT downloading. Used by `backfill()` where the controller does
   * not persist media rows anyway.
   */
  private extractRawPhotoAttachment(
    media: unknown,
  ): TelegramMediaAttachment | null {
    if (!media || typeof media !== 'object') {
      const wpResult = this.extractWebpagePreview(media);
      if (wpResult) return wpResult;
      return null;
    }
    const photo = (media as { photo?: unknown }).photo;
    if (!photo || typeof photo !== 'object') {
      const wpResult = this.extractWebpagePreview(media);
      if (wpResult) return wpResult;
      return null;
    }
    return this.extractPhotoFromPhotoObject(photo);
  }

  private extractPhotoFromPhotoObject(
    photo: unknown,
  ): TelegramMediaAttachment | null {
    const p = photo as {
      id?: unknown;
      accessHash?: unknown;
      fileReference?: unknown;
    };
    if (
      typeof p.id !== 'bigint' &&
      typeof p.id !== 'string' &&
      typeof p.id !== 'number' &&
      typeof p.id !== 'object'
    ) {
      return null;
    }
    if (p.fileReference === undefined || p.fileReference === null) return null;
    let fileRefBuffer: Buffer | null = null;
    if (Buffer.isBuffer(p.fileReference)) {
      fileRefBuffer = p.fileReference;
    } else if (typeof p.fileReference === 'string') {
      fileRefBuffer = Buffer.from(p.fileReference, 'binary');
    } else if (Array.isArray(p.fileReference)) {
      fileRefBuffer = Buffer.from(p.fileReference);
    } else {
      return null;
    }
    const coerceToString = (v: unknown): bigint | string =>
      typeof v === 'object' && v !== null
        ? (v as { toString(): string }).toString()
        : (v as bigint | string);
    return {
      type: 'photo',
      fileId: coerceToString(p.id),
      accessHash: coerceToString(p.accessHash),
      fileReference: fileRefBuffer.toString('base64'),
      mimeType: null,
      dcId: (p as { dcId?: unknown }).dcId as number | undefined,
      date: (p as { date?: unknown }).date as number | undefined,
    };
  }

  private extractWebpagePreview(
    media: unknown,
  ): TelegramMediaAttachment | null {
    if (!media || typeof media !== 'object') return null;
    const webpage = (media as { webpage?: Record<string, unknown> }).webpage;
    if (!webpage || typeof webpage !== 'object') return null;
    const wpPhoto = webpage.photo;
    if (!wpPhoto || typeof wpPhoto !== 'object') return null;
    const photoResult = this.extractPhotoFromPhotoObject(wpPhoto);
    if (!photoResult) return null;
    return {
      ...photoResult,
      webpageUrl: (webpage.url as string) ?? null,
      webpageTitle: (webpage.title as string) ?? null,
      webpageDescription: (webpage.description as string) ?? null,
      webpageSiteName: (webpage.siteName as string) ?? null,
    };
  }

  /**
   * Extract and synchronously download the photo attached to a Telegram
   * message. Returns the resulting attachment list (one entry per photo
   * index), or `undefined` if the message has no photo or the download
   * failed — text-only messages continue without media.
   */
  private async extractMediaForMessage(
    peerId: string,
    msg: {
      id: number;
      media?: unknown;
    },
  ): Promise<ReadonlyArray<TelegramMediaAttachment> | undefined> {
    const attachment = this.extractRawPhotoAttachment(msg.media);
    if (!attachment) {
      this.logger.warn(
        `extractMediaForMessage(${peerId}:${msg.id}) — no photo attachment (media type=${typeof msg.media}, hasPhoto=${(msg.media as { photo?: unknown })?.photo !== undefined})`,
      );
      return undefined;
    }
    try {
      // Pass the ORIGINAL msg.media object (which has every gramjs field
      // including `sizes`, `dcId`, `date`) directly to downloadMedia.
      // Reconstructing from the extracted fields loses `sizes`, which
      // gramjs requires to build the InputPhotoFileLocation.
      const client = this.client;
      if (!client) throw new Error('Telegram client not available');
      const buffer: unknown = await this.floodWaitHandler.withRetry(
        `media-download:${peerId}:${msg.id}`,
        () => client.downloadMedia(msg.media as any, {}),
      );
      if (buffer === undefined || buffer instanceof Buffer === false) {
        throw new Error('downloadMedia returned no data');
      }
      const downloaded = await this.mediaDownloader.saveToDisk(
        peerId,
        msg.id,
        0,
        attachment,
        buffer as Buffer,
      );
      const enriched: TelegramMediaAttachment = {
        type: attachment.type,
        fileId: attachment.fileId,
        accessHash: attachment.accessHash,
        fileReference: attachment.fileReference,
        mimeType: downloaded.mimeType,
        filePath: downloaded.filePath,
        fileSize: downloaded.fileSize,
        dcId: attachment.dcId,
        date: attachment.date,
        index: 0, // Telegram photos come as a single PhotoSize array per
        // message (multiple sizes but one logical photo). Multi-photo
        // album support is out of scope and will be addressed in a later
        // extension to iterate per-photo.
      };
      return [enriched];
    } catch (err) {
      this.logger.warn(
        `Media download failed for ${peerId}:${msg.id} — message continues without media: ${
          (err as Error).message
        }`,
      );
      return undefined;
    }
  }

  async disconnect(): Promise<void> {
    this.running = false;
    const resolver = this.waitingResolvers.shift();
    if (resolver) resolver();
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        /* ignore */
      }
      this.client = null;
    }
  }

  async resolveChannelMetadata(
    channelId: string,
  ): Promise<ResolvedChannelMetadata> {
    this.ensureClient();
    const entity = (await this.resolvePeerAsChannel(channelId)) as {
      id?: { toString(): string } | number | string;
      title?: string;
      username?: string;
      firstName?: string;
      lastName?: string;
    };
    const resolvedId = entity?.id !== undefined ? String(entity.id) : channelId;
    return {
      peerId: resolvedId,
      title: entity?.title?.trim() || `Telegram channel ${resolvedId}`,
      handle: entity?.username?.trim() || null,
      kind: entity?.title?.trim()
        ? 'channel'
        : entity?.firstName || entity?.lastName
          ? 'user'
          : 'unknown',
    };
  }

  async joinChannel(peerId: string): Promise<JoinChannelResult> {
    const client = this.ensureClient();
    try {
      const peer = await this.resolvePeerAsChannel(peerId);
      await client.invoke(new Api.channels.JoinChannel({ channel: peer }));
      return { joined: true, wasAlreadyMember: false };
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (msg.includes('USER_ALREADY_PARTICIPANT')) {
        return { joined: true, wasAlreadyMember: true };
      }
      if (msg.includes('CHANNEL_PRIVATE') || msg.includes('CHANNEL_INVALID')) {
        return {
          joined: false,
          wasAlreadyMember: false,
          error: `Channel is private or invalid: ${peerId}`,
        };
      }
      if (msg.includes('CHANNELS_TOO_MUCH')) {
        return {
          joined: false,
          wasAlreadyMember: false,
          error: `Account has joined too many channels`,
        };
      }
      if (msg.includes('FLOOD_WAIT')) {
        return {
          joined: false,
          wasAlreadyMember: false,
          error: `Flood wait: ${msg}`,
        };
      }
      return { joined: false, wasAlreadyMember: false, error: msg };
    }
  }

  private async markAuthorizedIfTrue(): Promise<void> {
    if (this.authorizedAtLeastOnce) return;
    try {
      const c = this.ensureClient();
      await c.connect();
      this.authorizedAtLeastOnce = await c.isUserAuthorized();
    } catch {
      /* ignore */
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeEntityType(className?: string): string {
    const map: Record<string, string> = {
      MessageEntityUrl: 'url',
      MessageEntityTextUrl: 'text_url',
      MessageEntityBold: 'bold',
      MessageEntityItalic: 'italic',
      MessageEntityCode: 'code',
      MessageEntityPre: 'pre',
      MessageEntityStrike: 'strike',
      MessageEntityUnderline: 'underline',
      MessageEntitySpoiler: 'spoiler',
      MessageEntityMention: 'mention',
      MessageEntityHashtag: 'hashtag',
      MessageEntityCashtag: 'cashtag',
    };
    return map[className ?? ''] ?? 'unknown';
  }
}
