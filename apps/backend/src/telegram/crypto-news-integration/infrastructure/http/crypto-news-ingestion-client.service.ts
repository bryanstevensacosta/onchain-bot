import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * DTO matching ingestion-service response shape
 * (apps/ingestion-service crypto-news entities)
 */
export interface CryptoNewsMessageDto {
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
  readonly media: ReadonlyArray<{
    readonly id: string;
    readonly messageId: string; // UUID reference to parent
    readonly index: number;
    readonly type: 'photo' | 'video' | 'webpage';
    /**
     * Local file path on the ingestion-service host.
     * ABSENT from HTTP responses: the server strips `filePath` and exposes
     * a serving `url` instead (see `transformMessageForApi` in the
     * ingestion-service crypto-news controller). Present only on internal
     * shapes — always access defensively via `??` fallback.
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
  }>;
}

export interface CryptoNewsSourceDto {
  readonly channelId: string;
  readonly handle: string | null;
  readonly title: string;
  readonly isActive: boolean;
  readonly lifecycleStatus: 'ACTIVE' | 'INACTIVE';
  readonly addedAt: string;
  readonly updatedAt: string;
}

/**
 * CryptoNewsIngestionClient - HTTP client for ingestion-service API
 *
 * **Per Opción A architecture:**
 * - Ingestion-service is the SINGLE SOURCE OF TRUTH for crypto-news data
 * - Backend fetches RAW messages via HTTP API (no DB replication)
 * - Backend applies ITS OWN content filters on-read (FilteredCryptoNewsService)
 * - This client provides low-level HTTP fetch; filtering is done by consumers
 *
 * **Endpoints consumed:**
 * - GET /api/crypto-news/messages?limit=N&channelId=X — recent messages (RAW content)
 * - GET /api/crypto-news/messages/channel/:channelId?limit=N — messages by channel
 * - GET /api/crypto-news/sources — all active sources
 * - GET /api/crypto-news/sources/active/ids — channel IDs only
 * - GET /api/crypto-news/stats — message/source counts
 *
 * **Error handling:**
 * - Network errors → log + return empty array (graceful degradation)
 * - 404 → return empty array (no crash)
 * - 5xx → log + return empty array (backend continues working)
 *
 * @injectable NestJS service
 */
@Injectable()
export class CryptoNewsIngestionClient {
  private readonly logger = new Logger(CryptoNewsIngestionClient.name);
  private readonly baseUrl: string;
  private readonly timeout: number = 10000; // 10 seconds

  constructor(private readonly config: ConfigService) {
    const appConfig = this.config.get('app');
    this.baseUrl = appConfig?.ingestion?.serviceUrl || 'http://localhost:3031';

    this.logger.log(
      `CryptoNewsIngestionClient initialized with baseUrl: ${this.baseUrl}`,
    );
  }

  /**
   * Defensively extract an array from an ingestion-service response body.
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
      'Ingestion-service returned an unexpected body shape (neither array nor {data} wrapper) — treating as empty',
    );
    return [];
  }

  /**
   * Fetch recent crypto-news messages from ingestion-service
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
  ): Promise<ReadonlyArray<CryptoNewsMessageDto>> {
    try {
      const params = new URLSearchParams();
      params.set('limit', String(Math.min(limit, 200)));
      if (channelId) params.set('channelId', channelId);

      const url = `${this.baseUrl}/api/crypto-news/messages?${params.toString()}`;

      this.logger.debug(
        `Fetching messages from ingestion-service: ${url} (limit: ${limit}, channelId: ${channelId ?? 'all'})`,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(
          `Ingestion-service returned ${response.status} for /api/crypto-news/messages`,
        );
        return [];
      }

      const body: unknown = await response.json();

      // The ingestion-service wraps GET /api/crypto-news/messages as
      // {timestamp, count, data} (ETag-busting, commit 97199b2) while sibling
      // endpoints return bare arrays — unwrap defensively, never assume.
      const messages = this.unwrapArray<CryptoNewsMessageDto>(body);

      this.logger.log(
        `Fetched ${messages.length} raw messages from ingestion-service`,
      );

      return messages;
    } catch (error) {
      this.logger.error(
        `Failed to fetch messages from ingestion-service: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return [];
    }
  }

  /**
   * Fetch messages from a specific channel
   *
   * @param channelId - Telegram channel ID (e.g., "-1001234567890")
   * @param limit - Max messages (default 50, max 200)
   * @returns Array of raw messages (empty on error)
   */
  async fetchMessagesByChannel(
    channelId: string,
    limit = 50,
  ): Promise<ReadonlyArray<CryptoNewsMessageDto>> {
    try {
      const url = `${this.baseUrl}/api/crypto-news/messages/channel/${encodeURIComponent(channelId)}?limit=${Math.min(limit, 200)}`;

      this.logger.debug(
        `Fetching messages by channel from ingestion-service: ${channelId} (limit: ${limit})`,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(
          `Ingestion-service returned ${response.status} for channel ${channelId}`,
        );
        return [];
      }

      const body: unknown = await response.json();

      // GET /messages/channel/:channelId returns a bare array today, but
      // unwrap defensively so a future wrapper cannot silently break matching.
      const messages = this.unwrapArray<CryptoNewsMessageDto>(body);

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

  /**
   * Fetch all active crypto-news sources
   *
   * @returns Array of sources (empty on error)
   */
  async fetchSources(): Promise<ReadonlyArray<CryptoNewsSourceDto>> {
    try {
      const url = `${this.baseUrl}/api/crypto-news/sources`;

      this.logger.debug(`Fetching sources from ingestion-service: ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(
          `Ingestion-service returned ${response.status} for /api/crypto-news/sources`,
        );
        return [];
      }

      const body: unknown = await response.json();

      // GET /sources returns a bare array today — same defensive unwrap.
      const sources = this.unwrapArray<CryptoNewsSourceDto>(body);

      this.logger.log(
        `Fetched ${sources.length} sources from ingestion-service`,
      );

      return sources;
    } catch (error) {
      this.logger.error(
        `Failed to fetch sources from ingestion-service: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return [];
    }
  }

  /**
   * Fetch statistics (total messages, total sources, active sources)
   *
   * @returns Stats object (zeroed on error)
   */
  async fetchStats(): Promise<{
    totalMessages: number;
    totalSources: number;
    activeSources: number;
  }> {
    try {
      const url = `${this.baseUrl}/api/crypto-news/stats`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(
          `Ingestion-service returned ${response.status} for /api/crypto-news/stats`,
        );
        return { totalMessages: 0, totalSources: 0, activeSources: 0 };
      }

      const stats = (await response.json()) as {
        totalMessages: number;
        totalSources: number;
        activeSources: number;
      };

      return stats;
    } catch (error) {
      this.logger.error(
        `Failed to fetch stats from ingestion-service: ${(error as Error).message}`,
      );
      return { totalMessages: 0, totalSources: 0, activeSources: 0 };
    }
  }
}
