/**
 * Cached metadata for a Telegram channel peer id.
 *
 * Persisted across restarts so we don't pay the cost (and the failure
 * mode) of re-resolving titles from MTProto every boot. Used by:
 *  - the channel seeder, to skip the MTProto round-trip on warm starts
 *  - the post-connect backfill, to know which channels still need
 *    re-resolution after the session is authorized
 */
export interface CachedChannelMetadata {
  readonly channelId: string;
  readonly title: string;
  readonly username: string | null;
  readonly resolvedAt: string;
  readonly source: 'mtproto' | 'seed' | 'manual';
}

/**
 * Outbound port: persistent cache of resolved channel metadata.
 *
 * Implementations must be safe to call concurrently and tolerate a
 * missing / corrupt backing file (returning empty results rather than
 * throwing). This is intentional — the cache is a best-effort
 * optimization, not a system-of-record.
 */
export abstract class ResolvedChannelMetadataRepository {
  public abstract find(
    channelId: string,
  ): Promise<CachedChannelMetadata | null>;
  public abstract findAll(): Promise<ReadonlyArray<CachedChannelMetadata>>;
  public abstract upsert(entry: CachedChannelMetadata): Promise<void>;
}
