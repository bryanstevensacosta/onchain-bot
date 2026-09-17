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
import { CryptoNewsSourceRepository } from 'telegram/crypto-news/infrastructure/persistence/typeorm/repositories/crypto-news-source.repository';
import { Api } from 'telegram';
import { CryptoNewsMessageTransformer } from 'shared/telegram/transformation';
import { TelegramMediaExtractorService } from '../../application/services/telegram-media-extractor.service';

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
  private cryptoNewsChannelCache = new Set<string>();
  private cacheRefreshInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly clientManager: TelegramClientManager,
    private readonly lastSeenManager: LastSeenManager,
    private readonly floodWaitHandler: FloodWaitHandlerService,
    private readonly cryptoNewsSourceRepo: CryptoNewsSourceRepository,
    private readonly messageTransformer: CryptoNewsMessageTransformer, // Phase 5: Shared transformation
    private readonly mediaExtractor: TelegramMediaExtractorService, // Phase 5.2: Extracted media download
  ) {}

  async onModuleInit(): Promise<void> {
    // Load active crypto-news channels from DB on startup
    // This runs regardless of MTProto credentials
    await this.refreshCryptoNewsChannelCache();

    // Refresh cache every 5 minutes
    this.cacheRefreshInterval = setInterval(
      () => {
        void this.refreshCryptoNewsChannelCache();
      },
      5 * 60 * 1000,
    );

    const cfg = this.config.get('app');
    if (!cfg?.telegram?.mtprotoApiId || !cfg?.telegram?.mtprotoApiHash) return;
    await this.clientManager.markAuthorizedIfTrue();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cacheRefreshInterval) {
      clearInterval(this.cacheRefreshInterval);
    }
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
    // FIX: Drain queue completely before waiting, messages may arrive while yielding
    while (this.running) {
      // Drain all pending messages before waiting for new ones
      while (this.messageQueue.length > 0) {
        yield this.messageQueue.shift()!;
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
   * Polling loop for catching up on missed messages.
   *
   * SCALABLE DESIGN: Polls dynamically based on current subscribedChannelIds.
   * When channels are added/removed via DB, they automatically start/stop
   * being polled in the next iteration (no listener restart required).
   *
   * This prevents message loss during channel updates and allows true
   * zero-downtime scaling.
   */
  private async startPollingLoop(): Promise<void> {
    this.logger.log('Starting polling loop (dynamic channel refresh)');

    // Simple polling every 30 seconds
    while (this.running) {
      await this.sleep(30_000);

      if (!this.running) break;

      // DYNAMIC: Get current channel list on each iteration
      // This picks up changes from DB without restarting the listener
      const peers = [...this.subscribedChannelIds];

      if (peers.length === 0) {
        this.logger.debug('No channels to poll (skipping iteration)');
        continue;
      }

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
   * 
   * Phase 5.2 Refactor: Fully delegated transformation pipeline:
   * - Text extraction → CryptoNewsMessageTransformer (4-source cascade)
   * - Media metadata → CryptoNewsMessageTransformer
   * - Media download → TelegramMediaExtractorService (crypto-news only)
   * - Entity normalization → CryptoNewsMessageTransformer
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
    // Step 1: Transform text + metadata using shared transformer
    const transformed = this.messageTransformer.transform({
      ...msg,
      peerId,
    });

    if (!transformed) {
      throw new Error(`Failed to transform message ${peerId}:${msg.id}`);
    }

    // Step 2: Download media for crypto-news channels (if applicable)
    let media = transformed.media.length > 0 
      ? (transformed.media as unknown as TelegramMediaAttachment[]) 
      : undefined;

    if (msg.media && this.isCryptoNewsChannel(peerId) && transformed.media.length > 0) {
      try {
        const downloaded = await this.mediaExtractor.extractAndDownload(
          this.clientManager.ensureClient(),
          peerId,
          msg.id,
          msg.media,
        );
        
        if (downloaded && downloaded.length > 0) {
          media = downloaded; // Replace metadata-only with downloaded (has filePath)
        }
      } catch (error) {
        this.logger.error(
          `Failed to download media for ${peerId}:${msg.id}: ${(error as Error).message}`,
        );
        // Continue with metadata-only (no filePath)
      }
    }

    // Step 3: Return unified result
    return {
      peerId: transformed.peerId,
      messageId: transformed.id,
      text: transformed.text,
      occurredAt: transformed.occurredAt,
      entities: transformed.entities,
      media,
      groupedId: transformed.groupedId ?? undefined,
      webpagePreview: transformed.webpagePreview ?? null,
    };
  }

  /**
   * Refresh the in-memory cache of active crypto-news channels from DB.
   * Called on startup and every 5 minutes.
   *
   * Replaces the deprecated seed-based approach.
   */
  private async refreshCryptoNewsChannelCache(): Promise<void> {
    try {
      const sources = await this.cryptoNewsSourceRepo.findAllActive();
      this.cryptoNewsChannelCache = new Set(sources.map((s) => s.channelId));

      this.logger.log(
        `[DB-CACHE] Loaded ${this.cryptoNewsChannelCache.size} active crypto-news channels from DB: ${Array.from(this.cryptoNewsChannelCache).join(', ')}`,
      );
    } catch (error) {
      this.logger.error(
        `[DB-CACHE] Failed to refresh crypto-news channel cache: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Check if a channel is a crypto-news channel (uses DB cache).
   *
   * @deprecated The seed-based approach (CRYPTO_NEWS_SEED + env var) is deprecated.
   * This method now queries the database to determine active crypto-news sources.
   * Sources are created/updated via ingestion-service API (`POST /api/crypto-news/sources`).
   */
  private isCryptoNewsChannel(peerId: string): boolean {
    const isMatch = this.cryptoNewsChannelCache.has(peerId);

    if (!isMatch && peerId.startsWith('-100')) {
      this.logger.debug(
        `[DB-CACHE] Channel ${peerId} not found in active crypto-news sources`,
      );
    }

    return isMatch;
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

  /**
   * Update the list of subscribed channels without restarting the listener.
   *
   * SCALABLE DESIGN: New channels are automatically picked up by the polling
   * loop in the next iteration (every 30s). Removed channels stop being polled.
   * No listener restart required = zero message loss.
   *
   * @param channelIds - New list of channel IDs to subscribe to
   */
  updateSubscribedChannels(channelIds: string[]): void {
    const added = channelIds.filter(
      (id) => !this.subscribedChannelIds.includes(id),
    );
    const removed = this.subscribedChannelIds.filter(
      (id) => !channelIds.includes(id),
    );

    if (added.length > 0 || removed.length > 0) {
      this.logger.log(
        `Channel list updated: ${this.subscribedChannelIds.length} → ${channelIds.length} ` +
          `(+${added.length} added, -${removed.length} removed)`,
      );

      if (added.length > 0) {
        this.logger.log(`New channels: ${added.join(', ')}`);
      }
      if (removed.length > 0) {
        this.logger.log(`Removed channels: ${removed.join(', ')}`);
      }

      this.subscribedChannelIds = [...channelIds];
      this.logger.log(
        '✅ Channels updated — polling loop will pick up changes in next iteration (~30s)',
      );
    }
  }

  async resolveChannelMetadata(
    channelId: string,
  ): Promise<ResolvedChannelMetadata> {
    const client = this.clientManager.ensureClient();
    
    // Ensure client is connected before resolving metadata
    if (!client.connected) {
      await this.clientManager.connect();
    }
    
    return this.peerResolver.resolveChannelMetadata(client, channelId);
  }

  async joinChannel(peerId: string): Promise<JoinChannelResult> {
    const client = this.clientManager.ensureClient();
    
    // Ensure client is connected before joining channel
    if (!client.connected) {
      await this.clientManager.connect();
    }
    
    return this.peerResolver.joinChannel(client, peerId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
