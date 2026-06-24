/**
 * Cached metadata for a Telegram KOL peer id.
 *
 * Persisted across restarts so we don't pay the cost (and the failure
 * mode) of re-resolving titles from MTProto every boot. Used by:
 *  - the KOL seeder, to skip the MTProto round-trip on warm starts
 *  - the post-connect backfill, to know which KOLs still need
 *    re-resolution after the session is authorized
 */
export interface CachedKolMetadata {
  readonly kolId: string;
  readonly title: string;
  readonly handle: string | null;
  readonly resolvedAt: string;
  readonly source: 'mtproto' | 'seed' | 'manual';
}

/**
 * Outbound port: persistent cache of resolved KOL metadata.
 *
 * Implementations must be safe to call concurrently and tolerate a
 * missing / corrupt backing file (returning empty results rather than
 * throwing). This is intentional — the cache is a best-effort
 * optimization, not a system-of-record.
 */
export abstract class ResolvedKolMetadataRepository {
  public abstract find(kolId: string): Promise<CachedKolMetadata | null>;
  public abstract findAll(): Promise<ReadonlyArray<CachedKolMetadata>>;
  public abstract upsert(entry: CachedKolMetadata): Promise<void>;
}
