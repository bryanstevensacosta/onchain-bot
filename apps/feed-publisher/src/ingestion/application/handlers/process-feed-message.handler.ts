import { Injectable, Logger } from '@nestjs/common';
import type { FeedIngestedMessage } from '../../domain/ports/ingestion-client.port';
import {
  isFeedFrame,
  toFeedMessage,
} from '../../infrastructure/http/dto/raw-feed-message.dto';

/**
 * Accepts one raw SSE frame at a time.
 *
 * Rules: only top-level `message:telegram` frames whose `data` carries
 * the feed marker are accepted; everything else is ignored (no
 * throw). Realtime + catch-up double-delivery collapses to a single row
 * via the seen-key set (`channelId:messageId`).
 */
@Injectable()
export class ProcessFeedMessageHandler {
  private readonly logger = new Logger(ProcessFeedMessageHandler.name);
  private readonly seen = new Set<string>();
  private readonly rows: FeedIngestedMessage[] = [];

  get processed(): readonly FeedIngestedMessage[] {
    return this.rows;
  }

  /**
   * @returns true when the frame was accepted as a new feed row.
   */
  handle(frame: unknown): boolean {
    if (!isFeedFrame(frame)) {
      return false;
    }
    const data = (frame as { data: unknown }).data as Record<string, unknown>;
    const mapped = toFeedMessage({
      channelId: data['peerId'],
      channel_id: data['channelId'],
      messageId: data['messageId'],
      text: data['text'],
      content: data['content'],
      occurredAt: data['occurredAt'],
      messageType: data['messageType'],
    });
    if (!mapped) {
      return false;
    }
    const key = `${mapped.channelId}:${mapped.messageId}`;
    if (this.seen.has(key)) {
      return false;
    }
    this.seen.add(key);
    this.rows.push(mapped);
    this.logger.debug(`Accepted feed message ${key}`);
    return true;
  }

  clear(): void {
    this.seen.clear();
    this.rows.length = 0;
  }
}
