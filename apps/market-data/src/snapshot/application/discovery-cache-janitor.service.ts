import { Injectable } from '@nestjs/common';
import { DISCOVERY_CACHE_TTL_DAYS } from '../infrastructure/discovery-cache.entity';
import { DiscoveryCacheRepository } from '../infrastructure/discovery-cache.repository';

export interface DiscoveryCacheJanitorOutcome {
  readonly cutoff: Date;
  readonly deleted: number;
}

/**
 * Discovery-cache janitor (dexter plan todo 30b).
 *
 * Prunes every discovery row older than the 30d bound (contrast: the
 * snapshot-history janitor prunes at 90d — discovery rots faster, so
 * its window is shorter; both constants live beside their entities).
 * Explicit invocation (operator runbook / future scheduler) — v1
 * ships no cron dependency in this service, so the schedule stays an
 * operator decision, not hidden behavior. The lazy TTL on read
 * (`DiscoveryCacheRepository.find`) is the primary expiry; this
 * janitor bounds table growth for rows nobody re-reads.
 */
@Injectable()
export class DiscoveryCacheJanitorService {
  public constructor(private readonly cache: DiscoveryCacheRepository) {}

  public async run(
    now: number = Date.now(),
  ): Promise<DiscoveryCacheJanitorOutcome> {
    const cutoff = new Date(
      now - DISCOVERY_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    const deleted = await this.cache.deleteOlderThan(cutoff);
    return { cutoff, deleted };
  }
}
