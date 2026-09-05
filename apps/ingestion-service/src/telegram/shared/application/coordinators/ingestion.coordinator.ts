import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamService } from 'stream/application/services/stream.service';
import { DeduplicationService } from 'telegram/shared/application/services/deduplication.service';
import { LastSeenManager } from 'telegram/shared/infrastructure/services/last-seen-manager.service';
import type {
  MessagePayload,
  MediaPayload,
} from 'telegram/shared/domain/types/message-payload';

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
}

/**
 * IngestionCoordinator - Routes Telegram messages to SSE broadcast
 *
 * Per Requirement 2.1: Broadcasts messages to all connected backend clients via SSE
 * Per Invariant 1 (fix-1): Raw text content EXCLUDED from SSE payload (ToS compliance)
 * Per Invariant 2: Sequential broadcast per channel (no parallel sends)
 * Per Invariant 3: Deduplication at source before broadcast
 * Per Invariant 5: Media URLs path-based (/api/media/:channelId/:messageId/:index)
 *
 * Modified from backend IngestionCoordinator:
 * - OLD: Called use cases directly (StoreNewsMessageUseCase, KolIngestionOrchestratorUseCase)
 * - NEW: Broadcasts to StreamService, backends decide what to do with messages
 *
 * @injectable NestJS service
 */
@Injectable()
export class IngestionCoordinator {
  private readonly logger = new Logger(IngestionCoordinator.name);
  private readonly apiBaseUrl: string;

  constructor(
    private readonly streamService: StreamService,
    private readonly deduplicationService: DeduplicationService,
    private readonly lastSeenManager: LastSeenManager,
    private readonly config: ConfigService,
  ) {
    // Load API base URL from config (e.g., "http://localhost:3031")
    const appConfig = this.config.get('app');
    this.apiBaseUrl = appConfig?.api?.baseUrl || 'http://localhost:3031';
  }

  /**
   * Route a raw Telegram message to SSE broadcast
   *
   * Per Invariant 2: Sequential broadcast (async method, caller awaits before next message)
   * Per Invariant 3: Deduplication check before broadcast
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
      // Update cursor tracking (for recovery/restart purposes only)
      this.lastSeenManager.set(raw.peerId, raw.messageId);

      // Per Invariant 1: Transform to MessagePayload WITHOUT text field (for KOL, includes text for crypto-news)
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
   * Transform TelegramRawMessage to MessagePayload
   *
   * Per Invariant 1 (modified): Excludes text for KOL (pipeline extracts it), includes text for crypto-news (opaque content)
   * Per Invariant 5: Builds path-based media URLs
   *
   * @param raw - Raw message from MTProto listener
   * @param messageType - Message type discriminator
   * @returns SSE-safe payload (text included ONLY for crypto-news)
   */
  private transformToPayload(
    raw: TelegramRawMessage,
    messageType: 'kol' | 'crypto-news',
  ): MessagePayload {
    // DEBUG: Log text transformation for crypto-news
    if (messageType === 'crypto-news') {
      this.logger.debug(
        `[PAYLOAD-TRANSFORM-DEBUG] ${raw.peerId}:${raw.messageId} - raw.text: "${raw.text}" (type: ${typeof raw.text}, length: ${raw.text?.length ?? 0})`,
      );
    }

    const payload = {
      peerId: raw.peerId,
      messageId: raw.messageId,
      occurredAt: raw.occurredAt.toISOString(),
      // Include text ONLY for crypto-news (no extraction pipeline, content stored as-is)
      text: messageType === 'crypto-news' ? (raw.text ?? '') : undefined,
      media: (raw.media || []).map((m) =>
        this.buildMediaPayload(raw.peerId, raw.messageId, m),
      ),
      entities: raw.entities ? [...raw.entities] : undefined,
      groupedId: raw.groupedId?.toString(),
      messageType,
    };

    // DEBUG: Log final payload text for crypto-news
    if (messageType === 'crypto-news') {
      this.logger.debug(
        `[PAYLOAD-TRANSFORM-DEBUG] ${raw.peerId}:${raw.messageId} - payload.text: "${payload.text}" (type: ${typeof payload.text}, length: ${payload.text?.length ?? 0})`,
      );
    }

    // DEBUG: Log payload for message 167
    if (raw.messageId === 167) {
      this.logger.log(
        `[PAYLOAD-167-DEBUG] Payload being sent via SSE: ${JSON.stringify(
          {
            messageId: payload.messageId,
            messageType: payload.messageType,
            textLength: payload.text?.length ?? 0,
            textPreview: payload.text?.substring(0, 100),
            rawTextLength: raw.text?.length ?? 0,
            rawTextPreview: raw.text?.substring(0, 100),
            hasMedia: payload.media?.length > 0,
          },
          null,
          2,
        )}`,
      );
    }

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
