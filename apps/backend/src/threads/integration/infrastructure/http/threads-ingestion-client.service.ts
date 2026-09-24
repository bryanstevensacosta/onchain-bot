import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Single media attachment on an ingestion-telegram crypto-news message,
 * as seen by the threads pipeline (shared media, zero new tables).
 */
export interface ThreadsMessageMedia {
  readonly id: string;
  readonly messageId: string; // UUID reference to parent
  readonly index: number;
  readonly type: 'photo' | 'video' | 'webpage';
  /**
   * Local file path on the ingestion-telegram host.
   * ABSENT from HTTP responses: the server strips `filePath` and exposes
   * a serving `url` instead. Present only on internal shapes — always
   * access defensively via `??` fallback.
   */
  readonly filePath?: string;
  /**
   * HTTP serving URL for the media item (e.g.
   * `/ingestion-api/media/<channelId>/<messageId>/<index>`).
   * This is the ONLY media locator the HTTP API exposes.
   */
  readonly url?: string;
  readonly mimeType: string | null;
  readonly fileSize: number | null;
  readonly createdAt: string; // ISO timestamp
  /**
   * Telegram message id of the album sibling that owns this item.
   * Set ONLY by backend album-merge (FilteredThreadsService); absent on
   * raw ingestion payloads. Downstream file resolution uses this when
   * present, else the entry's messageId.
   */
  readonly ownerMessageId?: number;
}

/**
 * DTO matching ingestion-telegram response shape
 * (apps/ingestion-telegram crypto-news entities).
 */
export interface ThreadsMessageDto {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly title: string | null;
  readonly content: string; // ← RAW content from Telegram (no filters applied)
  readonly publishedAt: string; // ISO timestamp
  readonly ingestedAt: string; // ISO timestamp
  readonly linkPreviewUrl: string | null;
  readonly linkPreviewTitle: string | null;
  readonly linkPreviewDescription: string | null;
  readonly linkPreviewSiteName: string | null;
  readonly messageEntities: string | null; // JSON string
  readonly groupedId: string | null;
  readonly media: ReadonlyArray<ThreadsMessageMedia>;
}

/**
 * ThreadsIngestionClient - HTTP client for ingestion-telegram API.
 *
 * Threads-typed mirror of crypto `CryptoNewsIngestionClient`
 * (`telegram/crypto-news-integration/infrastructure/http/crypto-news-ingestion-client.service.ts`):
 * the SAME ingestion-telegram endpoints serve both pipelines (zero
 * ingestion-telegram changes — threads reuses the crypto-news feed).
 *
 * **Endpoints consumed:**
 * - GET /api/feed/messages?limit=N&channelId=X — recent messages (RAW content)
 * - GET /api/feed/messages/channel/:channelId?limit=N — messages by channel
 *
 * **Error handling:**
 * - Network errors → log + return empty array (graceful degradation)
 * - 404 → return empty array (no crash)
 * - 5xx → log + return empty array (pipeline continues working)
 *
 * Base URL reads the EXISTING `app.ingestion.serviceUrl` key (same as the
 * crypto mirror) — no new env, no dependency on T3's `AppConfig.threads`.
 */
@Injectable()
export class ThreadsIngestionClient {
  private readonly logger = new Logger(ThreadsIngestionClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number = 10000; // 10 seconds

  constructor(private readonly config: ConfigService) {
    const appConfig = this.config.get('app');
    this.baseUrl = appConfig?.ingestion?.serviceUrl || 'http://localhost:3031';
    const rawApiKey = appConfig?.ingestion?.apiKey;
    this.apiKey =
      typeof rawApiKey === 'string' && rawApiKey.trim().length > 0
        ? rawApiKey.trim()
        : '';

    this.logger.log(
      `ThreadsIngestionClient initialized with baseUrl: ${this.baseUrl}`,
    );
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey.length > 0) {
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  /**
   * Defensively extract an array from an ingestion-telegram response body.
   *
   * Accepts either a bare array or a `{timestamp, count, data}` wrapper
   * (the `/messages` endpoint wraps to bust ETags; siblings return bare
   * arrays today). Anything else yields `[]` — callers degrade gracefully
   * instead of throwing `not iterable` downstream.
   */
  private unwrapArray<T>(body: unknown): T[] {
    if (Array.isArray(body)) {
      return body as T[];
    }
    if (body !== null && typeof body === 'object' && 'data' in body) {
      const data: unknown = body.data;
      if (Array.isArray(data)) {
        return data as T[];
      }
    }
    this.logger.warn(
      'Ingestion-telegram returned an unexpected body shape (neither array nor {data} wrapper) — treating as empty',
    );
    return [];
  }

  /**
   * Fetch recent crypto-news messages from ingestion-telegram.
   *
   * Returns RAW content (no filters applied). Consumer must apply filters.
   *
   * @param limit - Max messages to fetch (default 50, max 200)
   * @param channelId - Optional channel filter
   * @returns Array of raw messages (empty on error)
   */
  async fetchRecentMessages(
    limit = 50,
    channelId?: string,
  ): Promise<ReadonlyArray<ThreadsMessageDto>> {
    try {
      const params = new URLSearchParams();
      params.set('limit', String(Math.min(limit, 200)));
      if (channelId) params.set('channelId', channelId);

      const url = `${this.baseUrl}/api/feed/messages?${params.toString()}`;

      this.logger.debug(
        `Fetching messages from ingestion-telegram: ${url} (limit: ${limit}, channelId: ${channelId ?? 'all'})`,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(
          `Ingestion-telegram returned ${response.status} for /api/feed/messages`,
        );
        return [];
      }

      const body: unknown = await response.json();

      // The ingestion-telegram wraps GET /api/feed/messages as
      // {timestamp, count, data} (ETag-busting) while sibling endpoints
      // return bare arrays — unwrap defensively, never assume.
      const messages = this.unwrapArray<ThreadsMessageDto>(body);

      this.logger.log(
        `Fetched ${messages.length} raw messages from ingestion-telegram`,
      );

      return messages;
    } catch (error) {
      this.logger.error(
        `Failed to fetch messages from ingestion-telegram: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return [];
    }
  }

  /**
   * Fetch messages from a specific channel.
   *
   * @param channelId - Telegram channel ID (e.g., "-1001234567890")
   * @param limit - Max messages (default 50, max 200)
   * @returns Array of raw messages (empty on error)
   */
  async fetchMessagesByChannel(
    channelId: string,
    limit = 50,
  ): Promise<ReadonlyArray<ThreadsMessageDto>> {
    try {
      const url = `${this.baseUrl}/api/feed/messages/channel/${encodeURIComponent(channelId)}?limit=${Math.min(limit, 200)}`;

      this.logger.debug(
        `Fetching messages by channel from ingestion-telegram: ${channelId} (limit: ${limit})`,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(
          `Ingestion-telegram returned ${response.status} for channel ${channelId}`,
        );
        return [];
      }

      const body: unknown = await response.json();

      // GET /messages/channel/:channelId returns a bare array today, but
      // unwrap defensively so a future wrapper cannot silently break matching.
      const messages = this.unwrapArray<ThreadsMessageDto>(body);

      this.logger.log(
        `Fetched ${messages.length} messages for channel ${channelId}`,
      );

      return messages;
    } catch (error) {
      this.logger.error(
        `Failed to fetch messages for channel ${channelId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return [];
    }
  }
}
