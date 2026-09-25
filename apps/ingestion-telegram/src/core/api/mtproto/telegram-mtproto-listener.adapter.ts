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
import { TelegramFeedSourceRepository } from 'registry/infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';
import { IngestionSafetyConfig } from '../../infrastructure/config/ingestion-safety.config';
import { SleepWindowService } from '../../infrastructure/services/sleep-window.service';
import { Api } from 'telegram';
import { FeedMessageTransformer } from 'shared/telegram/transformation';
import { TelegramMediaExtractorService } from '../../application/services/telegram-media-extractor.service';

/**
 * Normalize a jitter setting to a [0, 1] fraction.
 *
 * Accepts both fractions (0.3) and percents (30) — the runtime
 * IngestionSafetyConfig defaults to 0.3 while app.config validates 0–100
 * and config/ingestion.config.json carries 30. Values > 1 are treated as
 * percent; the result is clamped to [0, 1].
 */
export function normalizeJitterFraction(jitter: number): number {
  if (!Number.isFinite(jitter)) return 0;
  const fraction = jitter > 1 ? jitter / 100 : jitter;
  return Math.min(Math.max(fraction, 0), 1);
}

/**
 * Compute one polling delay from a base interval plus symmetric jitter.
 *
 * delay = base * (1 + (±jitter)), floored at 1s so a 100% jitter can never
 * produce a zero/negative sleep (hot-loop guard). `random` is injectable
 * for deterministic tests.
 */
export function computePollDelayMs(
  baseMs: number,
  jitter: number,
  random: () => number = Math.random,
): number {
  const base = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : 30_000;
  const fraction = normalizeJitterFraction(jitter);
  const delta = (random() * 2 - 1) * fraction;
  return Math.max(1_000, Math.round(base * (1 + delta)));
}

/**
 * Cap the per-iteration poll list at maxChannels (anti-ban).
 *
 * Returns the channels to poll plus how many were truncated (0 = no cap
 * applied). A non-positive/non-finite max means "no cap".
 */
export function capPolledChannels(
  channelIds: string[],
  maxChannels: number,
): { channels: string[]; truncated: number } {
  if (!Number.isFinite(maxChannels) || maxChannels <= 0) {
    return { channels: channelIds, truncated: 0 };
  }
  const limit = Math.floor(maxChannels);
  if (channelIds.length <= limit) {
    return { channels: channelIds, truncated: 0 };
  }
  return {
    channels: channelIds.slice(0, limit),
    truncated: channelIds.length - limit,
  };
}

/**
 * TelegramMtprotoListenerAdapter - MTProto adapter for ingestion-telegram
 *
 * Simplified from backend version:
 * - No media download logic (ingestion-telegram doesn't handle media)
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
  private loggedFeedChannels = false;
  private feedChannelCache = new Set<string>();
  private cacheRefreshInterval: NodeJS.Timeout | null = null;
  private sleepNotified = false;

  constructor(
    private readonly config: ConfigService,
    private readonly clientManager: TelegramClientManager,
    private readonly lastSeenManager: LastSeenManager,
    private readonly floodWaitHandler: FloodWaitHandlerService,
    private readonly feedSourceRepo: TelegramFeedSourceRepository,
    private readonly messageTransformer: FeedMessageTransformer, // Phase 5: Shared transformation
    private readonly mediaExtractor: TelegramMediaExtractorService, // Phase 5.2: Extracted media download
    private readonly safety: IngestionSafetyConfig,
    private readonly sleepWindow: SleepWindowService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Load active feed channels from DB on startup
    // This runs regardless of MTProto credentials
    await this.refreshFeedChannelCache();

    // Refresh cache every 5 minutes
    this.cacheRefreshInterval = setInterval(
      () => {
        void this.refreshFeedChannelCache();
      },
      5 * 60 * 1000,
    );

    const cfg = this.config.get('app');
    if (!cfg?.telegram?.apiId || !cfg?.telegram?.apiHash) return;
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
   *
   * ANTI-BAN: the inter-iteration delay comes from IngestionSafetyConfig
   * (pollIntervalBaseMs ± jitterPercent) — never a hardcoded constant — and
   * each iteration polls at most maxChannels peers. While the sleep window
   * is active, polling is skipped (realtime events still flow).
   */
  private async startPollingLoop(): Promise<void> {
    this.logger.log('Starting polling loop (dynamic channel refresh)');

    while (this.running) {
      await this.sleep(this.computePollDelay());

      if (!this.running) break;

      if (this.sleepWindow.isAsleep()) {
        if (!this.sleepNotified) {
          const wake = this.sleepWindow.getNextWakeTime();
          this.logger.log(
            `Sleep window active — polling paused${wake ? ` until ${wake.toISOString()}` : ''}`,
          );
          this.sleepNotified = true;
        }
        continue;
      }
      this.sleepNotified = false;

      // DYNAMIC: Get current channel list on each iteration
      // This picks up changes from DB without restarting the listener
      const allPeers = [...this.subscribedChannelIds];

      if (allPeers.length === 0) {
        this.logger.debug('No channels to poll (skipping iteration)');
        continue;
      }

      const { channels: peers, truncated } = capPolledChannels(
        allPeers,
        this.safety.maxChannels,
      );
      if (truncated > 0) {
        this.logger.warn(
          `Polling capped at ${this.safety.maxChannels} channels — ${truncated} channel(s) skipped this iteration`,
        );
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
   * One polling delay from IngestionSafetyConfig (base ± jitter).
   * Extracted for specs; startPollingLoop is an infinite loop.
   */
  computePollDelay(random?: () => number): number {
    return computePollDelayMs(
      this.safety.pollIntervalBaseMs,
      this.safety.jitterPercent,
      random,
    );
  }

  /**
   * Transform raw Telegram message to TelegramRawMessage format
   *
   * Phase 5.2 Refactor: Fully delegated transformation pipeline:
   * - Text extraction → FeedMessageTransformer (4-source cascade)
   * - Media metadata → FeedMessageTransformer
   * - Media download → TelegramMediaExtractorService (feed only)
   * - Entity normalization → FeedMessageTransformer
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

    // Step 2: Download media for feed channels (if applicable)
    let media =
      transformed.media.length > 0
        ? (transformed.media as unknown as TelegramMediaAttachment[])
        : undefined;

    if (
      msg.media &&
      this.isFeedChannel(peerId) &&
      transformed.media.length > 0
    ) {
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
   * Refresh the in-memory cache of active feed channels from DB.
   * Called on startup and every 5 minutes.
   *
   * Replaces the deprecated seed-based approach.
   */
  private async refreshFeedChannelCache(): Promise<void> {
    try {
      const sources = await this.feedSourceRepo.findAllActive('crypto-news');
      this.feedChannelCache = new Set(sources.map((s) => s.channelId));

      this.logger.log(
        `[DB-CACHE] Loaded ${this.feedChannelCache.size} active feed channels from DB: ${Array.from(this.feedChannelCache).join(', ')}`,
      );
    } catch (error) {
      this.logger.error(
        `[DB-CACHE] Failed to refresh feed channel cache: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Check if a channel is a feed channel (uses DB cache).
   *
   * This method queries the database to determine active feed sources.
   * Sources are created/updated via ingestion-telegram API (`POST /api/feed/sources`).
   */
  private isFeedChannel(peerId: string): boolean {
    const isMatch = this.feedChannelCache.has(peerId);

    if (!isMatch && peerId.startsWith('-100')) {
      this.logger.debug(
        `[DB-CACHE] Channel ${peerId} not found in active feed sources`,
      );
    }

    return isMatch;
  }

  async backfill(
    _channelId: string,
    _limit: number,
  ): Promise<TelegramRawMessage[]> {
    throw new Error('Backfill not supported in ingestion-telegram');
  }

  async disconnect(): Promise<void> {
    this.running = false;
    this.messageQueue.flush();
  }

  /**
   * Update the list of subscribed channels without restarting the listener.
   *
   * SCALABLE DESIGN: New channels are automatically picked up by the polling
   * loop in the next iteration. Removed channels stop being polled.
   * No listener restart required = zero message loss.
   *
   * Newly added channels get their persisted cursors loaded so the first
   * poll resumes where a previous run left off instead of reflooding up to
   * 50 historic messages as new (LastSeenManager.load only fills gaps from
   * Redis — it never rewinds in-memory progress).
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
        void this.lastSeenManager.load(added);
      }
      if (removed.length > 0) {
        this.logger.log(`Removed channels: ${removed.join(', ')}`);
      }

      this.subscribedChannelIds = [...channelIds];
      this.logger.log(
        '✅ Channels updated — polling loop will pick up changes in next iteration',
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
