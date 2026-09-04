import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackendRegistration } from '../../../stream/domain/backend-registration.entity';

/**
 * BackendChannelProviderService - Fetches active channel/user IDs from backend DB
 *
 * Replaces the old seed-based subscription system with DB-driven channel lists.
 * Calls backend endpoints to get active KOL IDs and crypto-news source IDs.
 *
 * Extended with multi-backend registration support:
 * Per Requirement 1.2: Store Backend registrations in memory
 * Per Requirement 1.3: Compute Channel_Union from all registered backends
 *
 * Endpoints:
 * - GET /telegram-kol/identity/kols/active/ids → string[] (KOL IDs)
 * - GET /crypto-news/sources/active/ids → string[] (crypto-news source IDs)
 */
@Injectable()
export class BackendChannelProviderService {
  private readonly logger = new Logger(BackendChannelProviderService.name);
  private readonly backendUrl: string;
  private readonly registrations: Map<string, BackendRegistration> = new Map();

  constructor(private readonly config: ConfigService) {
    // Per GAP 25: Support Docker networking with BACKEND_URL env var
    // Fallback to legacy BACKEND_PORT for backward compatibility
    const backendUrl = this.config.get<string>('BACKEND_URL');
    if (backendUrl) {
      this.backendUrl = backendUrl;
      this.logger.log(`Using BACKEND_URL from config: ${this.backendUrl}`);
    } else {
      const backendPort = this.config.get<string>('BACKEND_PORT') || '3030';
      this.backendUrl = `http://localhost:${backendPort}`;
      this.logger.warn(
        `BACKEND_URL not set, using legacy localhost:${backendPort} (Docker networking may not work)`,
      );
    }
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
   *
   * Per Requirement 1.3: Check registrations first, fallback to HTTP polling
   * Per Requirement 11.4: Union channels from both sources when both active
   *
   * @returns Combined array of all active channel IDs
   */
  /**
   * Fetch all active channel IDs (KOLs + crypto-news sources combined)
   *
   * Per Requirement 9.1: Check feature flag INGESTION_MULTI_BACKEND_ENABLED
   * Per Requirement 9.2: Use channel union when flag is true AND registrations exist
   * Per Requirement 1.3: Fallback to HTTP polling when flag is false OR no registrations
   * Per Requirement 11.4: Union channels from both sources when both active
   *
   * @returns Combined array of all active channel IDs
   */
  public async fetchAllActiveChannelIds(): Promise<ReadonlyArray<string>> {
    // Per Requirement 9.1: Check if multi-backend mode is enabled
    const multiBackendEnabled = this.config.get<boolean>('app.multiBackend.enabled') === true;

    // Per Requirement 9.2: Use channel union if enabled AND registrations exist
    if (multiBackendEnabled && this.registrations.size > 0) {
      const { channelUnion } = this.computeChannelUnionFromRegistrations();
      this.logger.log(
        `[Multi-Backend Mode] Using channel union from ${this.registrations.size} registered backends: ${channelUnion.length} total channels`,
      );
      return channelUnion;
    }

    // Per Requirement 9.2: Log which mode is active
    if (!multiBackendEnabled) {
      this.logger.debug(
        '[Legacy Mode] Multi-backend mode disabled (INGESTION_MULTI_BACKEND_ENABLED=false), using HTTP polling',
      );
    } else if (this.registrations.size === 0) {
      this.logger.warn(
        '[Fallback Mode] Multi-backend mode enabled but no backends registered, falling back to HTTP polling',
      );
    }

    // Fallback to HTTP polling (backward compatibility)
    const [kolIds, newsIds] = await Promise.all([
      this.fetchActiveKolIds(),
      this.fetchActiveCryptoNewsSourceIds(),
    ]);

    const allIds = [...kolIds, ...newsIds];
    this.logger.log(
      `[HTTP Polling] Total active channels: ${allIds.length} (${kolIds.length} KOLs + ${newsIds.length} crypto-news)`,
    );

    return allIds;
  }

  /**
   * Register a backend with its source whitelist
   *
   * Per Requirement 1.2: Store Backend identifier and Source_Whitelist in memory
   * Per Requirement 1.3: Compute Channel_Union after registration
   *
   * @param backendId - Unique backend identifier
   * @param sourceWhitelist - Array of channel IDs this backend wants to receive
   */
  public registerBackend(backendId: string, sourceWhitelist: string[]): void {
    const registration = new BackendRegistration(backendId, sourceWhitelist);
    this.registrations.set(backendId, registration);

    this.logger.log(
      `Backend ${backendId} registered with ${sourceWhitelist.length} channels`,
    );
  }

  /**
   * Compute the channel union from all registered backends
   *
   * Per Requirement 1.3: Compute Channel_Union from all registered Source_Whitelists
   * Per Requirement 6.1: Remove duplicate channel IDs
   *
   * @returns Object containing kolIds, newsIds arrays and deduplicated channelUnion
   */
  public computeChannelUnionFromRegistrations(): {
    kolIds: string[];
    newsIds: string[];
    channelUnion: string[];
  } {
    const unionSet = new Set<string>();

    for (const registration of this.registrations.values()) {
      for (const channelId of registration.getWhitelistArray()) {
        unionSet.add(channelId);
      }
    }

    const channelUnion = Array.from(unionSet);

    // For backward compatibility, we don't distinguish KOL vs crypto-news
    // at registration level. Return empty arrays for kolIds/newsIds.
    // The actual classification happens in IngestionCoordinator based on
    // the crypto_news_sources DB cache.
    return {
      kolIds: [],
      newsIds: [],
      channelUnion,
    };
  }

  /**
   * Get the size of the channel union across all registered backends
   *
   * Per Requirement 1.3: Return Channel_Union size for observability
   *
   * @returns Number of unique channels in the union
   */
  public getChannelUnionSize(): number {
    const { channelUnion } = this.computeChannelUnionFromRegistrations();
    return channelUnion.length;
  }

  /**
   * Get all registered backend IDs
   *
   * @returns Array of backend identifiers
   */
  public getRegisteredBackendIds(): string[] {
    return Array.from(this.registrations.keys());
  }

  /**
   * Record a disconnection event for a backend
   *
   * Per Requirement 2.5: Track disconnection for backfill tracking
   *
   * @param backendId - Backend identifier
   */
  public recordDisconnect(backendId: string): void {
    const registration = this.registrations.get(backendId);
    if (registration) {
      registration.recordDisconnect();
      this.logger.log(`Backend ${backendId} disconnection recorded`);
    }
  }

  /**
   * Compute the difference between two channel unions
   *
   * Per Requirement 3.3: Identify added channels (in newUnion, not in oldUnion)
   * Per Requirement 3.4: Identify removed channels (in oldUnion, not in newUnion)
   *
   * @param oldUnion - Previous channel union set
   * @param newUnion - New channel union set
   * @returns Object with added and removed channel arrays
   */
  private computeChannelDiff(
    oldUnion: Set<string>,
    newUnion: Set<string>,
  ): { added: string[]; removed: string[] } {
    const added: string[] = [];
    const removed: string[] = [];

    // Find added channels: in newUnion but not in oldUnion
    for (const channelId of newUnion) {
      if (!oldUnion.has(channelId)) {
        added.push(channelId);
      }
    }

    // Find removed channels: in oldUnion but not in newUnion
    for (const channelId of oldUnion) {
      if (!newUnion.has(channelId)) {
        removed.push(channelId);
      }
    }

    return { added, removed };
  }
}
