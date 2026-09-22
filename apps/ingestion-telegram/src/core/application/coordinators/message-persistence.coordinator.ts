import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamService } from 'stream/application/services/stream.service';
import { DeduplicationService } from 'core/application/services/deduplication.service';
import { LastSeenManager } from 'core/infrastructure/services/last-seen-manager.service';
import { TelegramFeedMessageRepository } from 'feed/infrastructure/persistence/typeorm/repositories/telegram-feed-message.repository';
import { TelegramFeedMessageEntity } from 'feed/infrastructure/persistence/typeorm/entities/telegram-feed-message.entity';
import { TelegramFeedMessageMediaEntity } from 'feed/infrastructure/persistence/typeorm/entities/telegram-feed-message-media.entity';
import type {
  MessagePayload,
  MediaPayload,
} from 'core/domain/types/message-payload';
import { randomUUID } from 'crypto';

/**
 * TelegramRawMessage interface (from backend TelegramListenerPort)
 *
 * This is the shape returned by TelegramMtprotoListenerAdapter.
 * We import the minimal interface here to avoid coupling to backend code.
 *
 * Note: media.index, media.filePath, media.fileSize are optional because
 * they're populated AFTER download completes.
 */
interface TelegramRawMessage {
  peerId: string;
  messageId: number;
  text?: string;
  occurredAt: Date;
  media?: ReadonlyArray<{
    type: 'photo' | 'video';
    index?: number;
    filePath?: string;
    mimeType: string | null;
    fileSize?: number | null;
  }>;
  entities?: ReadonlyArray<{
    type: string;
    offset: number;
    length: number;
    url?: string;
  }>;
  groupedId?: string | bigint;
  webpagePreview?: {
    url: string | null;
    title: string | null;
    description: string | null;
    siteName: string | null;
  } | null;
}

/**
 * MessagePersistenceCoordinator - Routes Telegram messages to SSE broadcast
 *
 * Per Requirement 2.1: Broadcasts messages to all connected backend clients via SSE
 * Per ADR docs/architecture/adr-kol-raw-text.md (Q1-B amendment): raw text IS
 * persisted RAW into telegram_feed_messages for BOTH types AND carried in the
 * SSE payload.text for BOTH types. Backend-internal ToS boundary unchanged:
 * `KolMessageIngestedEvent` still carries NO text (fix-1 holds).
 * Per Invariant 2: Sequential broadcast per channel (no parallel sends)
 * Per Invariant 3: Deduplication at source before broadcast (isDuplicate wired
 * in route() for BOTH types — item 7; item 9 hardens windows/prune)
 * Per Invariant 5: Media URLs path-based (/api/media/:channelId/:messageId/:index)
 * Per policy C2: KOL messages NEVER download media (no media rows persisted)
 *
 * Modified from backend MessageRoutingService:
 * - OLD: Called use cases directly (StoreNewsMessageUseCase, KolIngestionOrchestratorUseCase)
 * - NEW: Broadcasts to StreamService, backends decide what to do with messages
 *
 * @injectable NestJS service
 */
@Injectable()
export class MessagePersistenceCoordinator {
  private readonly logger = new Logger(MessagePersistenceCoordinator.name);
  private readonly apiBaseUrl: string;

  constructor(
    private readonly streamService: StreamService,
    private readonly deduplicationService: DeduplicationService,
    private readonly lastSeenManager: LastSeenManager,
    private readonly cryptoNewsMessageRepo: TelegramFeedMessageRepository,
    private readonly config: ConfigService,
  ) {
    // Load API base URL from config (e.g., "http://localhost:3031")
    const appConfig = this.config.get('app');
    this.apiBaseUrl = appConfig?.api?.baseUrl || 'http://localhost:3031';
  }

  /**
   * Route a raw Telegram message to persistence + SSE broadcast
   *
   * Per Invariant 2: Sequential broadcast (async method, caller awaits before next message)
   * Per Invariant 3: isDuplicate() gate for BOTH types (realtime+polling → 1 row + 1 frame)
   * Per Requirement 9.1: Structured logging for incoming messages
   *
   * @param raw - Raw Telegram message from MTProto listener
   * @param messageType - Discriminator for backend routing ('kol' or 'crypto-news')
   */
  async route(
    raw: TelegramRawMessage,
    messageType: 'kol' | 'crypto-news',
  ): Promise<void> {
    try {
      // Per Invariant 3: Dedup at source for BOTH types.
      // highestSeen comes from LastSeenManager (cursor); the in-memory
      // seen-cache inside isDuplicate() also catches realtime+polling
      // double-delivery when the cursor hasn't advanced yet.
      const highestSeen = this.lastSeenManager.get(raw.peerId);
      if (
        this.deduplicationService.isDuplicate(
          raw.peerId,
          raw.messageId,
          highestSeen,
        )
      ) {
        this.logger.debug(
          `Skip duplicate ${messageType} message: ${raw.peerId}:${raw.messageId} (cursor: ${highestSeen})`,
        );
        return;
      }
      this.lastSeenManager.set(raw.peerId, raw.messageId);

      // Per centralized architecture: Persist BOTH types to ingestion-telegram DB
      // (telegram_feed_messages with type discriminator). This is the SINGLE
      // SOURCE OF TRUTH - backends query via HTTP API, they do NOT replicate.
      // NOTE: Cursor checks removed - polling layer already handles idempotency via minId
      await this.persistFeedMessage(raw, messageType);

      // Per ADR adr-kol-raw-text.md (Q1-B): payload.text carries raw text for
      // BOTH types (KOL text no longer stripped).
      const payload = this.transformToPayload(raw, messageType);

      // Per Requirement 9.1: Structured logging for incoming messages
      this.logger.log({
        event: 'message:received',
        channelId: raw.peerId,
        messageId: raw.messageId,
        hasMedia: (raw.media?.length ?? 0) > 0,
        mediaCount: raw.media?.length ?? 0,
        messageType,
        timestamp: raw.occurredAt.toISOString(),
      });

      // Per Invariant 2: Sequential broadcast via SSE
      // **No-Duplication Guarantee:**
      // Each message from Telegram MTProto is received ONCE by this service and
      // broadcast ONCE to each connected backend. If multiple backends (staging,
      // production) subscribe to the same channel, they each receive the message
      // independently via their own SSE connections. This is correct fan-out
      // architecture, NOT duplication. Each backend filters messages client-side
      // based on its own channel subscription list.
      this.streamService.broadcast({
        type: 'message:telegram',
        data: payload,
      });

      this.logger.debug(
        `Broadcasted message: ${raw.peerId}:${raw.messageId} (type: ${messageType})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to route message ${raw.peerId}:${raw.messageId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // Don't rethrow - we don't want one bad message to crash the listener
    }
  }

  /**
   * Persist feed message to ingestion-telegram database
   *
   * **Per Opción A architecture (centralized RAW storage):**
   * - Ingestion-service stores RAW content from Telegram (NO filters applied)
   * - Each backend (staging/prod) fetches raw messages via HTTP API
   * - Each backend applies ITS OWN content filters on-read (transform on-read pattern)
   * - This allows staging and production to have DIFFERENT filter configurations
   *
   * Per centralized architecture: Ingestion-service OWNS telegram_feed_messages table.
   * This is the SINGLE SOURCE OF TRUTH - backends query via HTTP API, NO replication.
   *
   * Per policy C2: KOL rows persist content RAW with NO media rows and NO
   * download (the media gate lives in the adapter: isCryptoNewsChannel branch).
   *
   * Idempotency: Skip if message already exists (duplicate ingestion check).
   *
   * @param raw - Raw Telegram message from MTProto listener
   * @param messageType - Feed discriminator ('kol' or 'crypto-news')
   */
  private async persistFeedMessage(
    raw: TelegramRawMessage,
    messageType: 'kol' | 'crypto-news',
  ): Promise<void> {
    try {
      // Check for duplicate (idempotency)
      const existing =
        await this.cryptoNewsMessageRepo.findByChannelAndMessageId(
          raw.peerId,
          raw.messageId,
        );

      if (existing) {
        this.logger.debug(
          `Skip duplicate ${messageType} message: ${raw.peerId}:${raw.messageId}`,
        );
        return;
      }

      // Create message entity WITH RAW CONTENT (no filters applied)
      // Per Opción A architecture: Ingestion stores RAW text from Telegram.
      // Backends (staging/prod) apply THEIR OWN content filters on-read.
      const messageEntity = new TelegramFeedMessageEntity();
      messageEntity.id = randomUUID();
      messageEntity.channelId = raw.peerId;
      messageEntity.messageId = raw.messageId;
      messageEntity.type = messageType;
      messageEntity.title = null; // TODO: extract title from text (future feature)
      messageEntity.content = raw.text ?? ''; // ← RAW content, NO filters
      messageEntity.publishedAt = raw.occurredAt;
      messageEntity.ingestedAt = new Date();
      messageEntity.linkPreviewUrl = raw.webpagePreview?.url ?? null;
      messageEntity.linkPreviewTitle = raw.webpagePreview?.title ?? null;
      messageEntity.linkPreviewDescription =
        raw.webpagePreview?.description ?? null;
      messageEntity.linkPreviewSiteName = raw.webpagePreview?.siteName ?? null;
      messageEntity.messageEntities = raw.entities
        ? JSON.stringify(raw.entities)
        : null;
      messageEntity.groupedId = raw.groupedId?.toString() ?? null;

      // Media rows ONLY for crypto-news (policy C2: KOL persists no media).
      // The adapter gate (isCryptoNewsChannel) already skips KOL downloads,
      // so raw.media is expected empty for kol; this branch is defense-in-depth.
      messageEntity.media =
        messageType === 'crypto-news'
          ? (raw.media || []).map((m, idx) => {
              const mediaEntity = new TelegramFeedMessageMediaEntity();
              mediaEntity.id = randomUUID();
              mediaEntity.messageId = messageEntity.id;
              mediaEntity.index = m.index ?? idx;
              mediaEntity.type = m.type;
              mediaEntity.filePath = m.filePath ?? '';
              mediaEntity.mimeType = m.mimeType;
              mediaEntity.fileSize = m.fileSize ?? null;
              mediaEntity.createdAt = new Date();
              return mediaEntity;
            })
          : [];

      // Save to database (media rows saved automatically via cascade)
      await this.cryptoNewsMessageRepo.save(messageEntity);

      this.logger.log(
        `Persisted ${messageType} message: ${raw.peerId}:${raw.messageId} (${messageEntity.media.length} media)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist ${messageType} message ${raw.peerId}:${raw.messageId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // Don't rethrow - broadcast can still proceed even if persistence fails
    }
  }

  /**
   * Transform TelegramRawMessage to MessagePayload
   *
   * Per ADR adr-kol-raw-text.md (Q1-B): text carried for BOTH types.
   * Per Invariant 5: Builds path-based media URLs
   *
   * @param raw - Raw message from MTProto listener
   * @param messageType - Message type discriminator
   * @returns SSE-safe payload (text included for BOTH types)
   */
  private transformToPayload(
    raw: TelegramRawMessage,
    messageType: 'kol' | 'crypto-news',
  ): MessagePayload {
    // REDACTED (Q1-B): log shape only — raw text NEVER hits disk logs.
    this.logger.debug(
      `Payload transform ${raw.peerId}:${raw.messageId} - raw.text length: ${raw.text?.length ?? 0}, type: ${messageType}`,
    );

    const payload: any = {
      peerId: raw.peerId,
      messageId: raw.messageId,
      occurredAt: raw.occurredAt.toISOString(),
      media: (raw.media || []).map((m) =>
        this.buildMediaPayload(raw.peerId, raw.messageId, m),
      ),
      entities: raw.entities ? [...raw.entities] : undefined,
      groupedId: raw.groupedId?.toString(),
      messageType,
      // Q1-B: raw text carried for BOTH types (missing → '').
      text: raw.text ?? '',
    };

    // REDACTED (Q1-B): log shape only.
    this.logger.debug(
      `Payload transform ${raw.peerId}:${raw.messageId} - payload.text length: ${payload.text.length}, type: ${messageType}`,
    );

    return payload;
  }

  /**
   * Build media payload with HTTP URL
   *
   * Per Invariant 5: Path-based URLs for debuggability
   * Format: /api/media/:channelId/:messageId/:index
   *
   * Note: If media has not been downloaded yet (filePath undefined),
   * we still build the URL with index=0 as placeholder.
   *
   * @param channelId - Telegram channel ID
   * @param messageId - Telegram message ID
   * @param media - Media attachment from raw message
   * @returns MediaPayload with HTTP URL
   */
  private buildMediaPayload(
    channelId: string,
    messageId: number,
    media: {
      type: 'photo' | 'video';
      index?: number;
      filePath?: string;
      mimeType: string | null;
      fileSize?: number | null;
    },
  ): MediaPayload {
    const index = media.index ?? 0;
    const mimeType = media.mimeType ?? 'application/octet-stream';
    const fileSize = media.fileSize ?? 0;

    return {
      type: media.type,
      index,
      url: `${this.apiBaseUrl}/api/media/${channelId}/${messageId}/${index}`,
      mimeType,
      fileSize,
    };
  }

  /**
   * Get routing statistics for monitoring
   *
   * @returns Deduplication cache stats
   */
  getStats() {
    return {
      deduplication: this.deduplicationService.getStats(),
      connectedClients: this.streamService.getClientCount(),
    };
  }
}
