import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * BackendChannelProviderService - Fetches active channel/user IDs from backend DB
 * 
 * Replaces the old seed-based subscription system with DB-driven channel lists.
 * Calls backend endpoints to get active KOL IDs and crypto-news source IDs.
 * 
 * Endpoints:
 * - GET /telegram-kol/identity/kols/active/ids → string[] (KOL IDs)
 * - GET /crypto-news/sources/active/ids → string[] (crypto-news source IDs)
 */
@Injectable()
export class BackendChannelProviderService {
  private readonly logger = new Logger(BackendChannelProviderService.name);
  private readonly backendUrl: string;

  constructor(private readonly config: ConfigService) {
    const backendPort = this.config.get<string>('BACKEND_PORT') || '3030';
    this.backendUrl = `http://localhost:${backendPort}`;
  }

  /**
   * Fetch active KOL IDs from backend
   * @returns Array of KOL channel/user IDs that are active in the DB
   */
  public async fetchActiveKolIds(): Promise<ReadonlyArray<string>> {
    try {
      const url = `${this.backendUrl}/telegram-kol/identity/kols/active/ids`;
      this.logger.debug(`Fetching active KOL IDs from ${url}`);

      const response = await fetch(url);
      
      if (!response.ok) {
        this.logger.error(
          `Failed to fetch active KOL IDs: ${response.status} ${response.statusText}`,
        );
        return [];
      }

      const ids = (await response.json()) as string[];
      this.logger.log(`Fetched ${ids.length} active KOL IDs from backend`);
      return ids;
    } catch (error) {
      this.logger.error(
        `Error fetching active KOL IDs from backend: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Fetch active crypto-news source IDs from backend
   * @returns Array of crypto-news channel IDs that are active in the DB
   */
  public async fetchActiveCryptoNewsSourceIds(): Promise<
    ReadonlyArray<string>
  > {
    try {
      const url = `${this.backendUrl}/crypto-news/sources/active/ids`;
      this.logger.debug(`Fetching active crypto-news source IDs from ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        this.logger.error(
          `Failed to fetch active crypto-news source IDs: ${response.status} ${response.statusText}`,
        );
        return [];
      }

      const ids = (await response.json()) as string[];
      this.logger.log(
        `Fetched ${ids.length} active crypto-news source IDs from backend`,
      );
      return ids;
    } catch (error) {
      this.logger.error(
        `Error fetching active crypto-news source IDs from backend: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Fetch all active channel IDs (KOLs + crypto-news sources combined)
   * @returns Combined array of all active channel IDs
   */
  public async fetchAllActiveChannelIds(): Promise<ReadonlyArray<string>> {
    const [kolIds, newsIds] = await Promise.all([
      this.fetchActiveKolIds(),
      this.fetchActiveCryptoNewsSourceIds(),
    ]);

    const allIds = [...kolIds, ...newsIds];
    this.logger.log(
      `Total active channels: ${allIds.length} (${kolIds.length} KOLs + ${newsIds.length} crypto-news)`,
    );

    return allIds;
  }
}
