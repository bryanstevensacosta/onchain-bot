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
 */
interface TelegramRawMessage {
  peerId: string;
  messageId: number;
  text?: string;
  occurredAt: Date;
  media?: Array<{
    type: 'photo' | 'video';
    index: number;
    filePath: string;
    mimeType: string;
    fileSize: number;
  }>;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
    url?: string;
  }>;
  groupedId?: string;
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
      // Per Invariant 3: Deduplication check
      const highestSeen = this.lastSeenManager.get(raw.peerId);
      const isDuplicate = this.deduplicationService.isDuplicate(
        raw.peerId,
        raw.messageId,
        highestSeen,
      );

      if (isDuplicate) {
        this.logger.debug(
          `Skipping duplicate message: ${raw.peerId}:${raw.messageId}`,
        );
        return;
      }

      // Update cursor tracking
      this.lastSeenManager.set(raw.peerId, raw.messageId);

      // Per Invariant 1: Transform to MessagePayload WITHOUT text field
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
   * Per Invariant 1: Excludes text/content field (ToS compliance)
   * Per Invariant 5: Builds path-based media URLs
   *
   * @param raw - Raw message from MTProto listener
   * @param messageType - Message type discriminator
   * @returns SSE-safe payload WITHOUT text field
   */
  private transformToPayload(
    raw: TelegramRawMessage,
    messageType: 'kol' | 'crypto-news',
  ): MessagePayload {
    return {
      peerId: raw.peerId,
      messageId: raw.messageId,
      occurredAt: raw.occurredAt.toISOString(),
      media: (raw.media || []).map((m) =>
        this.buildMediaPayload(raw.peerId, raw.messageId, m),
      ),
      entities: raw.entities,
      groupedId: raw.groupedId,
      messageType,
    };
  }

  /**
   * Build media payload with HTTP URL
   *
   * Per Invariant 5: Path-based URLs for debuggability
   * Format: /api/media/:channelId/:messageId/:index
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
      index: number;
      filePath: string;
      mimeType: string;
      fileSize: number;
    },
  ): MediaPayload {
    return {
      type: media.type,
      index: media.index,
      url: `${this.apiBaseUrl}/api/media/${channelId}/${messageId}/${media.index}`,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
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
