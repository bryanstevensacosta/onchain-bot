import { Injectable, Logger } from '@nestjs/common';
import { BackendRegistration } from '../../domain/backend-registration.entity';

/**
 * BackendRegistryService - In-memory store of backend registrations.
 *
 * Split from the old backend channel provider (deleted, item 7): the HTTP
 * channel-fetch half died (CoreModule now reads telegram_feed_sources
 * locally); the multi-backend registration half lives on here, next to its
 * only consumers (stream controllers).
 *
 * Per Requirement 1.2: Store Backend registrations in memory
 * Per Requirement 1.3: Compute Channel_Union from all registered backends
 */
@Injectable()
export class BackendRegistryService {
  private readonly logger = new Logger(BackendRegistryService.name);
  private readonly registrations: Map<string, BackendRegistration> = new Map();

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
    // The actual classification happens in CoreModule based on the
    // telegram_feed_sources DB rows.
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
