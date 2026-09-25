import { Injectable, Logger } from '@nestjs/common';
import type { CryptoNewsIngestedMessage } from '../../domain/ports/ingestion-client.port';
import {
  isCryptoNewsFrame,
  toCryptoNewsMessage,
} from '../../infrastructure/http/dto/raw-crypto-news-message.dto';

/**
 * Accepts one raw SSE frame at a time.
 *
 * Rules: only top-level `message:telegram` frames whose `data` carries
 * the crypto-news marker are accepted; everything else is ignored (no
 * throw). Realtime + catch-up double-delivery collapses to a single row
 * via the seen-key set (`channelId:messageId`).
 */
@Injectable()
export class ProcessCryptoNewsMessageHandler {
  private readonly logger = new Logger(ProcessCryptoNewsMessageHandler.name);
  private readonly seen = new Set<string>();
  private readonly rows: CryptoNewsIngestedMessage[] = [];

  get processed(): readonly CryptoNewsIngestedMessage[] {
    return this.rows;
  }

  /**
   * @returns true when the frame was accepted as a new crypto-news row.
   */
  handle(frame: unknown): boolean {
    if (!isCryptoNewsFrame(frame)) {
      return false;
    }
    const data = (frame as { data: unknown }).data as Record<string, unknown>;
    const mapped = toCryptoNewsMessage({
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
    this.logger.debug(`Accepted crypto-news message ${key}`);
    return true;
  }

  clear(): void {
    this.seen.clear();
    this.rows.length = 0;
  }
}
