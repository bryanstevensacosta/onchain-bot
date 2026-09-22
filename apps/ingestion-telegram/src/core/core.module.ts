import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { SharedModule } from './shared.module';
import { RetentionModule } from '../retention/retention.module';
import { StreamModule } from '../stream/stream.module';
import { TelegramListenerPort } from './ports/telegram-listener.port';
import { MessagePersistenceCoordinator } from './application/coordinators/message-persistence.coordinator';
import { SSEBroadcastService } from '../stream/application/services/sse-broadcast.service';
import { BroadcastEvent } from '../stream/domain/broadcast-event.vo';
import { DebugTelegramController } from '../debug/debug-telegram.controller';
import { TelegramFeedSourceRepository } from 'registry/infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';

/**
 * TelegramModule - Root Telegram ingestion module
 *
 * Orchestrates:
 * 1. Channel fetching from the LOCAL feed registry (telegram_feed_sources)
 * 2. MTProto connection initialization
 * 3. Message ingestion pipeline startup
 * 4. Periodic refresh of channel subscriptions
 *
 * Per design.md § 2.1: Extracts MTProto layer from backend and broadcasts via SSE.
 * Per Requirement 4.1: Broadcasts ingested messages to all backends via SSEBroadcastService
 * Per Requirement 4.3: Ingestion continues if broadcast fails (log error, don't throw)
 * Per item 7: channel registry is LOCAL (feedSourceRepo.findAllActiveWithTypes);
 * the old backend-HTTP channel provider is deleted — no HTTP channel fetch anywhere.
 *
 * Lifecycle:
 * - onModuleInit(): Reads active channels from local DB, starts MTProto listener,
 *   ALWAYS schedules the 5-min refresh (cold-start safe: an empty DB starts
 *   zero listeners and picks channels up on the next refresh, no restart).
 * - Listener yields messages to MessagePersistenceCoordinator
 * - Coordinator persists to telegram_feed_messages + broadcasts to StreamService
 * - CoreModule broadcasts to SSEBroadcastService (multi-backend SSE)
 * - Scheduler refreshes channel list every 5 minutes via
 *   listener.updateSubscribedChannels() — subscribe() is called EXACTLY ONCE
 *   (gap 15: re-subscribing throws "already running"; refresh only swaps the
 *   peer snapshot, the polling loop picks it up in the next iteration).
 *
 * Channel ownership (item 7):
 * - KOLs + crypto-news: read from local DB via TelegramFeedSourceRepository
 *   (ingestion-telegram is sole owner of telegram_feed_sources since the
 *   item-6 backfill; backend reads identity via /api/feed/sources?type=kol)
 * - Classification: registry row type (channelId → 'kol' | 'crypto-news').
 *   Unknown channels (no registry row) default to 'kol' — the previous
 *   newsIds-membership default — recorded in adr-kol-raw-text.md.
 */
@Module({
  imports: [
    SharedModule, // MTProto infrastructure (no channel provider since item 7)
    RetentionModule, // Crypto-news sources/messages/media (DB-driven)
    StreamModule, // SSE infrastructure + SSEBroadcastService
  ],
  controllers: [DebugTelegramController],
  exports: [SharedModule, RetentionModule],
})
export class CoreModule implements OnModuleInit {
  private readonly logger = new Logger(CoreModule.name);
  private currentChannelIds: ReadonlyArray<string> = [];
  private kolChannelIds: ReadonlyArray<string> = [];
  private newsChannelIds: ReadonlyArray<string> = [];
  private channelTypeMap = new Map<string, 'kol' | 'crypto-news'>();
  private listening = false;
  private refreshIntervalId?: NodeJS.Timeout;

  constructor(
    private readonly feedSourceRepo: TelegramFeedSourceRepository,
    private readonly listener: TelegramListenerPort,
    private readonly coordinator: MessagePersistenceCoordinator,
    private readonly sseBroadcast: SSEBroadcastService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('🚀 Initializing Telegram ingestion service...');

    try {
      // Step 1: Fetch active channels from the LOCAL feed registry
      this.logger.log('📡 Fetching active channels from local registry...');
      await this.refreshChannels();

      const totalChannels = this.currentChannelIds.length;

      // Step 2: ALWAYS schedule refresh (cold-start safe — an empty DB
      // recovers on the next tick without a process restart).
      this.scheduleChannelRefresh();

      if (totalChannels === 0) {
        this.logger.warn(
          '⚠️ No active channels found. Listener not started — channels will be picked up automatically on refresh.',
        );
        this.logger.warn(
          '💡 Add channels via ingestion-telegram API POST /api/feed/sources',
        );
        return;
      }

      this.logger.log(
        `✅ Channel fetch complete: ${this.kolChannelIds.length} KOLs + ${this.newsChannelIds.length} crypto-news (from local DB) = ${totalChannels} total`,
      );

      // Step 3: Start MTProto listener (exactly once — see gap 15 note above)
      this.logger.log(
        `🎧 Starting MTProto listener for ${totalChannels} channels...`,
      );
      await this.ensureListening();

      this.logger.log('✅ Telegram ingestion service initialized');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Telegram module:', error);
      throw error;
    }
  }

  /**
   * Start the MTProto listener exactly once.
   *
   * Gap 15: adapter.subscribe() throws "already running" on re-entry, so the
   * listener is NEVER restarted — refreshes only swap the peer snapshot via
   * updateSubscribedChannels(). A crashed listener resets the flag so the
   * next refresh can retry the start.
   */
  private async ensureListening(): Promise<void> {
    if (this.listening) {
      return;
    }
    this.listening = true;

    // Start listening in background (non-blocking)
    this.startListening().catch((error) => {
      this.logger.error('❌ MTProto listener crashed:', error);
      this.listening = false;
    });
  }

  /**
   * Fetch active channel IDs from the LOCAL feed registry and update caches.
   *
   * Item 7: replaces the old backend-HTTP channel-provider fetch +
   * newsIds-membership classification with a single local read that carries
   * the type discriminator per row.
   *
   * Cold-start: an empty registry yields [] and still pushes the (empty)
   * snapshot to the listener — no crash, no skipped update.
   */
  private async refreshChannels(): Promise<void> {
    try {
      // Single local read (fail-open [] on DB error — see repository).
      const sources = await this.feedSourceRepo.findAllActiveWithTypes();

      // Unknown/future row types default to 'kol' (= previous
      // newsIds-membership default: not-news → kol). Recorded in ADR.
      const kolIds = sources
        .filter((s) => s.type !== 'crypto-news')
        .map((s) => s.channelId);
      const newsIds = sources
        .filter((s) => s.type === 'crypto-news')
        .map((s) => s.channelId);

      const previousTotal = this.currentChannelIds.length;
      const previousKolCount = this.kolChannelIds.length;
      const previousNewsCount = this.newsChannelIds.length;

      this.kolChannelIds = kolIds;
      this.newsChannelIds = newsIds;
      this.currentChannelIds = [...kolIds, ...newsIds];
      this.channelTypeMap = new Map(
        sources.map((s) => [
          s.channelId,
          (s.type === 'crypto-news' ? 'crypto-news' : 'kol') as
            | 'kol'
            | 'crypto-news',
        ]),
      );

      const newTotal = this.currentChannelIds.length;
      const kolCountChanged = kolIds.length !== previousKolCount;
      const newsCountChanged = newsIds.length !== previousNewsCount;
      const channelsChanged = kolCountChanged || newsCountChanged;

      if (newTotal !== previousTotal) {
        this.logger.log(
          `📊 Channel list updated: ${previousTotal} → ${newTotal} (${kolIds.length} KOLs, ${newsIds.length} crypto-news, from local DB)`,
        );
      }

      // Cold-start transition 0 → N: start the listener now (onModuleInit
      // returned early without listening when the DB was empty).
      if (!this.listening && newTotal > 0) {
        this.logger.log(
          '🔄 Channels appeared after cold start — starting listener...',
        );
        await this.ensureListening();
        return;
      }

      // Steady state: swap the peer snapshot, never re-subscribe (gap 15).
      // Called unconditionally — including the cold-start empty case — so a
      // [] registry still pushes its snapshot instead of being gated.
      if (this.listening || newTotal === 0) {
        if (channelsChanged || newTotal === 0) {
          this.logger.log(
            '🔄 Updating listener channels dynamically (zero downtime)...',
          );
        }
        try {
          this.listener.updateSubscribedChannels([...this.currentChannelIds]);
        } catch (error) {
          this.logger.error('❌ Failed to update listener channels:', error);
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to refresh channel list: ${(error as Error).message}`,
      );
      // Keep existing channel list on error
    }
  }

  /**
   * Schedule periodic refresh of channel list (every 5 minutes)
   */
  private scheduleChannelRefresh(): void {
    const refreshIntervalMs = 5 * 60 * 1000; // 5 minutes
    this.refreshIntervalId = setInterval(() => {
      this.logger.debug('⏰ Scheduled channel refresh triggered');
      this.refreshChannels();
    }, refreshIntervalMs);

    this.logger.log(
      `⏱️ Channel refresh scheduled every ${refreshIntervalMs / 1000}s`,
    );
  }

  private async startListening(): Promise<void> {
    this.logger.log('🔄 MTProto listener running (background task)');

    if (this.currentChannelIds.length === 0) {
      this.logger.warn('No channels to listen to');
      return;
    }

    this.logger.log(
      `📻 Subscribing to ${this.currentChannelIds.length} channels (${this.kolChannelIds.length} KOL, ${this.newsChannelIds.length} crypto-news)...`,
    );

    try {
      // Subscribe to listener's async generator (called EXACTLY ONCE per
      // process — gap 15. Convert readonly array to mutable for port compat.)
      for await (const message of this.listener.subscribe([
        ...this.currentChannelIds,
      ])) {
        // Classify by registry row type; unknown channels default to 'kol'
        // (previous newsIds-membership default — see ADR).
        const messageType = this.channelTypeMap.get(message.peerId) ===
          'crypto-news'
          ? 'crypto-news'
          : 'kol';

        // Fire-and-forget: Process message asynchronously without blocking the generator
        // This prevents slow DB writes or SSE broadcasts from blocking the next message
        this.logger.log(
          `[FIRE-AND-FORGET] Yielded message ${message.peerId}:${message.messageId}, scheduling processing...`,
        );
        Promise.resolve()
          .then(async () => {
            this.logger.log(
              `[FIRE-AND-FORGET] Starting route for ${message.peerId}:${message.messageId}`,
            );
            // Route message to legacy SSE broadcast via coordinator (includes DB persist)
            await this.coordinator.route(message, messageType);
            this.logger.log(
              `[FIRE-AND-FORGET] Completed route for ${message.peerId}:${message.messageId}`,
            );
          })
          .catch((routeError) => {
            this.logger.error(
              `[FIRE-AND-FORGET] Failed to route message ${message.peerId}:${message.messageId}: ${(routeError as Error).message}`,
              (routeError as Error).stack,
            );
          });

        // Per Requirement 4.1: Broadcast to all backends via SSEBroadcastService
        // Per Requirement 4.3: Ingestion continues if broadcast fails
        // Fire-and-forget: Don't block generator on broadcast
        Promise.resolve()
          .then(async () => {
            // Extract media path from message (first media item if available)
            const mediaPath = message.media?.[0]?.filePath;

            // Create BroadcastEvent from raw Telegram message
            const event = BroadcastEvent.fromTelegramMessage(
              message.peerId,
              {
                id: message.messageId,
                message: message.text,
                date: Math.floor(message.occurredAt.getTime() / 1000), // Convert ms to seconds
              },
              mediaPath,
            );

            // Broadcast to all connected backends
            await this.sseBroadcast.broadcast(event);

            this.logger.debug(
              `Broadcasted to multi-backend SSE: ${message.peerId}:${message.messageId}`,
            );
          })
          .catch((broadcastError) => {
            // Per Requirement 4.3: Log error but don't throw - ingestion must continue
            this.logger.error(
              `Failed to broadcast message ${message.peerId}:${message.messageId} to multi-backend SSE: ${(broadcastError as Error).message}`,
              (broadcastError as Error).stack,
            );
          });
      }
    } catch (error) {
      this.logger.error(
        '❌ MTProto listener error:',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
