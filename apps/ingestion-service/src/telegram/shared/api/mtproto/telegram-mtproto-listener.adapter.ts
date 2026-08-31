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
  ResolvedChannelMetadata,
  TelegramListenerPort,
  JoinChannelResult,
} from '../../ports/telegram-listener.port';
import { TelegramClientManager } from '../../infrastructure/services/telegram-client-manager.service';
import { LastSeenManager } from '../../infrastructure/services/last-seen-manager.service';
import { MessageQueue } from '../../infrastructure/services/message-queue';
import { TelegramPeerResolver } from '../../infrastructure/services/telegram-peer-resolver';
import { FloodWaitHandlerService } from '../../infrastructure/services/flood-wait-handler.service';

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

  constructor(
    private readonly config: ConfigService,
    private readonly clientManager: TelegramClientManager,
    private readonly lastSeenManager: LastSeenManager,
    private readonly floodWaitHandler: FloodWaitHandlerService,
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

      // Transform and enqueue message
      const transformed = this.transformMessage(channelId, msg);
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
   */
  private async startPollingLoop(): Promise<void> {
    const peers = [...this.subscribedChannelIds];
    if (peers.length === 0) return;

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
              const transformed = this.transformMessage(peerId, rawMsg);
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
   * Transform raw Telegram message to TelegramRawMessage format
   */
  private transformMessage(
    peerId: string,
    msg: {
      id: number;
      message?: string;
      date: number;
      media?: unknown;
      entities?: unknown[];
      groupedId?: unknown;
    },
  ): TelegramRawMessage {
    return {
      peerId,
      messageId: msg.id,
      text: msg.message || '',
      occurredAt: new Date(msg.date * 1000),
      entities: msg.entities as TelegramRawMessage['entities'],
      media: undefined, // Ingestion service doesn't handle media
      groupedId: msg.groupedId
        ? (msg.groupedId as bigint | string)
        : undefined,
    };
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
