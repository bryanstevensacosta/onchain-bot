import type { LaunchpadOverride } from '../launchpad-override.entity';

/**
 * Outbound port: persistence for the curated mint→launchpad override
 * table (dexter plan todo 37). FK-less by design. The TypeORM adapter
 * lives alongside the in-memory adapter (live binding when
 * `DATABASE_ENABLED=false`; same factory shape as
 * `DisplayMapRepository`).
 *
 * Rows are keyed by NORMALIZED mint (one row per mint, chain-agnostic
 * by design — the same mint string resolves the same curated origin
 * on every chain). `findByMint` expects the normalized form (see
 * `normalizeMint`); lookups with malformed input must normalize first
 * (or use `normalizeMintOrNull`) — they can never match a stored row.
 */
export abstract class LaunchpadOverrideRepository {
  public abstract findAll(): Promise<readonly LaunchpadOverride[]>;
  public abstract findOne(id: string): Promise<LaunchpadOverride | null>;
  public abstract findByMint(mint: string): Promise<LaunchpadOverride | null>;
  public abstract save(row: LaunchpadOverride): Promise<LaunchpadOverride>;
  public abstract delete(id: string): Promise<boolean>;
}
