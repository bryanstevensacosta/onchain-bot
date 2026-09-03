import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NewMessage } from 'telegram/events';
import type {
  TelegramRawMessage,
  TelegramMediaAttachment,
  ResolvedChannelMetadata,
  TelegramListenerPort,
  JoinChannelResult,
} from '../../ports/telegram-listener.port';
import { TelegramClientManager } from '../../infrastructure/services/telegram-client-manager.service';
import { LastSeenManager } from '../../infrastructure/services/last-seen-manager.service';
import { MessageQueue } from '../../infrastructure/services/message-queue';
import { TelegramPeerResolver } from '../../infrastructure/services/telegram-peer-resolver';
import { FloodWaitHandlerService } from '../../infrastructure/services/flood-wait-handler.service';
import { MediaDownloaderService } from 'media/application/services/media-downloader.service';
import { Api } from 'telegram';

/**
 * TelegramMtprotoListenerAdapter - MTProto adapter for ingestion-service
 *
 * Simplified from backend version:
 * - No media download logic (ingestion-service doesn't handle media)
 * - No backfill support (streaming only)
 * - Minimal flood wait handling
 * - No external provider dependencies
 *
 * Responsibilities:
 * - Connect to Telegram via MTProto
 * - Subscribe to channel messages
 * - Transform raw Telegram messages to TelegramRawMessage format
 * - Enqueue messages for coordinator to broadcast via SSE
 */
@Injectable()
export class TelegramMtprotoListenerAdapter
  implements TelegramListenerPort, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramMtprotoListenerAdapter.name);
  private subscribedChannelIds: string[] = [];
  private readonly messageQueue = new MessageQueue<TelegramRawMessage>();
  private readonly peerResolver = new TelegramPeerResolver();
  private running = false;
  private loggedCryptoNewsChannels = false;

  constructor(
    private readonly config: ConfigService,
    private readonly clientManager: TelegramClientManager,
    private readonly lastSeenManager: LastSeenManager,
    private readonly floodWaitHandler: FloodWaitHandlerService,
    private readonly mediaDownloader: MediaDownloaderService,
  ) {}

  async onModuleInit(): Promise<void> {
    const cfg = this.config.get('app');
    if (!cfg?.telegram?.mtprotoApiId || !cfg?.telegram?.mtprotoApiHash) return;
    await this.clientManager.markAuthorizedIfTrue();
  }

  async onModuleDestroy(): Promise<void> {
    await this.clientManager.disconnect();
  }

  async *subscribe(channelIds: string[]): AsyncIterable<TelegramRawMessage> {
    if (this.running) {
      throw new Error('Telegram listener already running');
    }

    const client = this.clientManager.ensureClient();
    let authorized = false;

    this.logger.log('Checking MTProto authorization...');

    try {
      await client.connect();
      authorized = await client.isUserAuthorized();
      this.logger.log(`MTProto authorization check: ${authorized}`);
    } catch (err) {
      this.logger.error(
        `MTProto connection/auth check failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }

    if (!authorized) {
      this.logger.warn('Telegram session not authorized — listener will idle.');
      this.subscribedChannelIds = [...channelIds];
      this.running = true;
      return;
    }

    this.subscribedChannelIds = [...channelIds];
    this.running = true;

    // Register event handler for new messages
    client.addEventHandler((event: unknown) => {
      void this.handleEvent(event);
    }, new NewMessage({}));

    this.logger.log(
      `Subscribed to ${channelIds.length} channel(s) — loading lastSeen offsets`,
    );

    await this.lastSeenManager.load(channelIds);

    this.logger.log(
      `Loaded ${this.lastSeenManager.size()}/${channelIds.length} lastSeen offsets — starting polling`,
    );

    void this.startPollingLoop();

    // Yield messages from queue
    while (this.running) {
      if (this.messageQueue.length > 0) {
        yield this.messageQueue.shift()!;
        continue;
      }
      await this.messageQueue.waitForItem();
    }
  }

  /**
   * Handle incoming Telegram event (real-time)
   */
  private async handleEvent(event: unknown): Promise<void> {
    try {
      const msg = (
        event as {
          message?: {
            id: number;
            message?: string;
            date: number;
            media?: unknown;
            entities?: unknown[];
            groupedId?: unknown;
            getChat?: () => Promise<{ id: unknown }>;
          };
        }
      ).message;

      if (!msg) return;

      const chat = await msg.getChat?.();
      const channelId = chat ? String(chat.id) : '';

      if (!channelId || !this.subscribedChannelIds.includes(channelId)) return;

      // Update last seen
      this.lastSeenManager.set(channelId, msg.id);

      // Transform and enqueue message (now async for media download)
      const transformed = await this.transformMessage(channelId, msg);
      this.messageQueue.push(transformed);

      this.logger.debug(
        `Enqueued message ${channelId}:${msg.id} (${this.messageQueue.length} in queue)`,
      );
    } catch (err) {
      this.logger.error('Error processing Telegram update', err);
    }
  }

  /**
   * Polling loop for catching up on missed messages
   * Polls all subscribed channels/bots - crypto-news sources may be bots without -100 prefix
   */
  private async startPollingLoop(): Promise<void> {
    const peers = [...this.subscribedChannelIds];
    if (peers.length === 0) return;

    this.logger.log(
      `Starting polling loop for ${peers.length} peer(s) (channels and crypto-news bots)`,
    );

    // Simple polling every 30 seconds
    while (this.running) {
      await this.sleep(30_000);

      if (!this.running) break;

      for (const peerId of peers) {
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

            for (const rawMsg of messages as Array<{
              id: number;
              message?: string;
              date: number;
              media?: unknown;
              entities?: unknown[];
              groupedId?: unknown;
            }>) {
              if (rawMsg.id <= lastSeen) continue;

              this.lastSeenManager.set(peerId, rawMsg.id);
              const transformed = await this.transformMessage(peerId, rawMsg);
              this.messageQueue.push(transformed);
            }

            // Persist cursor
            const newLastSeen = this.lastSeenManager.get(peerId);
            if (newLastSeen > 0) {
              await this.lastSeenManager.persist(peerId, newLastSeen);
            }
          });
        } catch (err) {
          this.logger.error(
            `Poll failed for ${peerId}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  /**
   * Filter peer IDs to only include channels (exclude users/bots)
   * Users/bots will receive messages via real-time events only
   * 
   * Channels in Telegram always have IDs prefixed with -100
   * User/bot IDs are positive integers without prefix
   */
  private filterChannels(peerIds: string[]): string[] {
    const channels: string[] = [];

    for (const peerId of peerIds) {
      // Channels always start with -100 (supergroup/channel format)
      // Users/bots are plain positive integers or negative but NOT -100 prefix
      const isChannel = peerId.startsWith('-100');

      if (isChannel) {
        channels.push(peerId);
      } else {
        this.logger.log(
          `Skipping polling for ${peerId} (detected as user/bot by ID format) — will use real-time events only`,
        );
      }
    }

    return channels;
  }

  /**
   * Transform raw Telegram message to TelegramRawMessage format
   * Downloads media only for crypto-news channels
   */
  private async transformMessage(
    peerId: string,
    msg: {
      id: number;
      message?: string;
      date: number;
      media?: unknown;
      entities?: unknown[];
      groupedId?: unknown;
    },
  ): Promise<TelegramRawMessage> {
    // DEBUG: Log raw message properties
    this.logger.log(
      `[MSG-TRANSFORM-DEBUG] ${peerId}:${msg.id} - message field: "${msg.message}" (type: ${typeof msg.message}, length: ${msg.message?.length ?? 0})`,
    );

    // DETAILED DEBUG for message 167
    if (msg.id === 167) {
      this.logger.log(
        `[MSG-167-FULL-DEBUG] Full message object: ${JSON.stringify(
          {
            id: msg.id,
            message: msg.message,
            text: (msg as any).text,
            date: msg.date,
            media: msg.media
              ? { className: (msg.media as any).className }
              : null,
            entities: msg.entities,
            groupedId: msg.groupedId,
          },
          null,
          2,
        )}`,
      );
    }

    let media: TelegramRawMessage['media'] = undefined;

    // Download media only for crypto-news channels (not KOL)
    if (msg.media && this.isCryptoNewsChannel(peerId)) {
      this.logger.log(
        `[MEDIA-DEBUG] ${peerId}:${msg.id} - Attempting to download media...`,
      );
      try {
        media = await this.extractAndDownloadMedia(peerId, msg.id, msg.media);
        this.logger.log(
          `[MEDIA-DEBUG] ${peerId}:${msg.id} - Media downloaded successfully: ${JSON.stringify(media)}`,
        );
      } catch (error) {
        this.logger.error(
          `[MEDIA-DEBUG] Failed to download media for ${peerId}:${msg.id}: ${(error as Error).message}`,
        );
        // Continue without media rather than failing the whole message
      }
    } else {
      this.logger.log(
        `[MEDIA-DEBUG] ${peerId}:${msg.id} - Skipping media download (hasMedia: ${!!msg.media}, isCryptoNews: ${this.isCryptoNewsChannel(peerId)})`,
      );
    }

    const extractedText = this.extractAllText(peerId, msg);

    // DEBUG: Log final text assignment
    if (this.isCryptoNewsChannel(peerId)) {
      this.logger.log(
        `[RAW-MESSAGE-DEBUG] ${peerId}:${msg.id} - Assigning text to RawMessage: "${extractedText}" (length: ${extractedText.length})`,
      );
    }

    return {
      peerId,
      messageId: msg.id,
      text: extractedText,
      occurredAt: new Date(msg.date * 1000),
      entities: msg.entities as TelegramRawMessage['entities'],
      media,
      groupedId: msg.groupedId ? (msg.groupedId as bigint | string) : undefined,
    };
  }

  /**
   * Extract all possible text from a message
   * Checks: message, text property, media caption, forwarded message
   */
  private extractAllText(peerId: string, msg: any): string {
    const isCryptoNews = this.isCryptoNewsChannel(peerId);

    // DEBUG: Log all text fields for crypto-news messages
    if (isCryptoNews) {
      this.logger.log(
        `[TEXT-EXTRACTION-DEBUG] ${peerId}:${msg.id} - Available text fields: ${JSON.stringify(
          {
            message: msg.message,
            text: msg.text,
            mediaCaption: msg.media ? msg.media.caption : null,
            _text: msg._text,
            fwdFrom: msg.fwdFrom ? 'present' : 'absent',
            fwdFromMessage: msg.fwdFrom ? msg.fwdFrom.message : null,
          },
        )}`,
      );
    }

    // Priority order: message field, text property, media caption, forwarded message
    if (msg.message && msg.message.trim()) {
      const extracted = msg.message;
      if (isCryptoNews) {
        this.logger.log(
          `[TEXT-EXTRACTION-DEBUG] ${peerId}:${msg.id} - Extracted from msg.message: "${extracted}" (length: ${extracted.length})`,
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return extracted;
    }

    if (msg.text && typeof msg.text === 'string' && msg.text.trim()) {
      const extracted = msg.text;
      if (isCryptoNews) {
        this.logger.log(
          `[TEXT-EXTRACTION-DEBUG] ${peerId}:${msg.id} - Extracted from msg.text: "${extracted}" (length: ${extracted.length})`,
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return extracted;
    }

    // Check media caption
    if (msg.media) {
      const caption = msg.media.caption;
      if (caption && typeof caption === 'string' && caption.trim()) {
        if (isCryptoNews) {
          this.logger.log(
            `[TEXT-EXTRACTION-DEBUG] ${peerId}:${msg.id} - Extracted from media.caption: "${caption}" (length: ${caption.length})`,
          );
        }
        return caption;
      }
    }

    // Check forwarded message
    if (msg.fwdFrom) {
      const fwdMessage = msg.fwdFrom.message;
      if (fwdMessage && typeof fwdMessage === 'string' && fwdMessage.trim()) {
        if (isCryptoNews) {
          this.logger.log(
            `[TEXT-EXTRACTION-DEBUG] ${peerId}:${msg.id} - Extracted from fwdFrom.message: "${fwdMessage}" (length: ${fwdMessage.length})`,
          );
        }
        return fwdMessage;
      }
    }

    if (isCryptoNews) {
      this.logger.log(
        `[TEXT-EXTRACTION-DEBUG] ${peerId}:${msg.id} - No text found, returning empty string`,
      );
    }

    return '';
  }

  /**
   * Check if a channel is a crypto-news channel
   * Crypto-news channels are seeded separately from KOL channels
   */
  private isCryptoNewsChannel(peerId: string): boolean {
    const cfg = this.config.get('app');
    const cryptoNewsChannels = cfg?.seedNews || [];

    // DEBUG: Log config once per service instance
    if (!this.loggedCryptoNewsChannels) {
      this.logger.log(
        `[CRYPTO-NEWS-DEBUG] cryptoNewsChannels: ${JSON.stringify(cryptoNewsChannels.map((ch: any) => ch.channelId))}`,
      );
      this.loggedCryptoNewsChannels = true;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const isMatch = cryptoNewsChannels.some(
      (ch: { channelId: string }) => ch.channelId === peerId,
    );

    if (!isMatch && peerId.startsWith('-100')) {
      this.logger.warn(
        `[CRYPTO-NEWS-DEBUG] Channel ${peerId} not found in cryptoNewsChannels config`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return isMatch;
  }

  /**
   * Extract and download media attachments from Telegram message
   */
  private async extractAndDownloadMedia(
    peerId: string,
    messageId: number,
    media: unknown,
  ): Promise<TelegramRawMessage['media']> {
    const result: TelegramMediaAttachment[] = [];

    // Handle single photo
    if (media instanceof Api.MessageMediaPhoto && media.photo) {
      const photo = media.photo as Api.Photo;
      const downloaded = await this.mediaDownloader.download(
        this.clientManager.ensureClient(),
        peerId,
        messageId,
        0,
        media,
      );
      result.push({
        type: 'photo',
        index: 0,
        fileId: photo.id.toString(),
        accessHash: photo.accessHash.toString(),
        fileReference: Buffer.from(photo.fileReference).toString('base64'),
        mimeType: downloaded.mimeType,
        dcId: photo.dcId,
        date: photo.date,
        filePath: downloaded.filePath,
        fileSize: downloaded.fileSize,
      });
    }

    // Handle document (video, file, etc.)
    if (media instanceof Api.MessageMediaDocument && media.document) {
      const doc = media.document as Api.Document;
      const isVideo = doc.mimeType?.startsWith('video/') ?? false;

      if (isVideo) {
        const downloaded = await this.mediaDownloader.download(
          this.clientManager.ensureClient(),
          peerId,
          messageId,
          0,
          media,
        );
        result.push({
          type: 'video',
          index: 0,
          fileId: doc.id.toString(),
          accessHash: doc.accessHash.toString(),
          fileReference: Buffer.from(doc.fileReference).toString('base64'),
          mimeType: downloaded.mimeType,
          dcId: doc.dcId,
          date: doc.date,
          filePath: downloaded.filePath,
          fileSize: downloaded.fileSize,
        });
      }
    }

    return result.length > 0 ? result : undefined;
  }

  async backfill(
    _channelId: string,
    _limit: number,
  ): Promise<TelegramRawMessage[]> {
    throw new Error('Backfill not supported in ingestion-service');
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
