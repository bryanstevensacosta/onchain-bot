import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { DiscoveryCacheRow } from './discovery-cache.repository';

/**
 * 30-day lazy-TTL bound for discovery rows (dexter plan todo 30b).
 *
 * Contrast (pinned, do not conflate): snapshot HISTORY keeps 90 days
 * (`SNAPSHOT_HISTORY_RETENTION_DAYS`) because ATH needs a long window;
 * DISCOVERY keeps 30 days because a pair address rots faster (curve →
 * pool graduations, migrations). The TTL is checked LAZILY on read
 * (`DiscoveryCacheRepository.find` deletes + answers null past the
 * bound) and eagerly by the janitor (`DiscoveryCacheJanitorService`
 * prunes everything older — same constant, one rule, no drift).
 */
export const DISCOVERY_CACHE_TTL_DAYS = 30;

/** Milliseconds form of the 30d bound (single arithmetic home). */
export const DISCOVERY_CACHE_TTL_MS =
  DISCOVERY_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Persistent discovery cache (dexter plan todo 30b).
 *
 * One row per `(chain, mint)`: the DexScreener-discovered pair address
 * + dex id that names the pool. SEPARATE from the numbers cache
 * (prices ride the 30s service cache + 90d history; this table stores
 * NO prices, NO liquidity — only the discovery answer). `dexId` here
 * is venue vocabulary (`launchpad-info.ts` origin vocabulary is a
 * different table — cached `dexId` NEVER flows into `launchpad.id`,
 * pinned by spec).
 *
 * No backfill — the table starts empty on first deploy (cold scans
 * populate it; the tripwire keeps it honest).
 */
@Entity('discovery_cache')
@Unique('uq_discovery_cache_chain_mint', ['chain', 'mint'])
@Index('ix_discovery_cache_chain_mint', ['chain', 'mint'])
export class DiscoveryCacheEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  /** OUR chain id (lowercased, e.g. `solana` — never a DexScreener slug). */
  @Column({ type: 'text' })
  public chain!: string;

  /** Token mint / contract address (lowercased). */
  @Column({ type: 'text' })
  public mint!: string;

  /** Discovered pair address (pool account / curve PDA at pin time). */
  @Column({ type: 'text' })
  public pairAddress!: string;

  /** Venue dex id of the discovered pair (e.g. `pumpfun`, `raydium`). */
  @Column({ type: 'text' })
  public dexId!: string;

  /** Last pin time — the lazy-TTL clock (bumped on every re-pin). */
  @CreateDateColumn({ type: 'timestamptz' })
  public updatedAt!: Date;
}

export function toDiscoveryCacheRow(
  entity: DiscoveryCacheEntity,
): DiscoveryCacheRow {
  return {
    chain: entity.chain,
    mint: entity.mint,
    pairAddress: entity.pairAddress,
    dexId: entity.dexId,
    updatedAt:
      entity.updatedAt instanceof Date
        ? entity.updatedAt.toISOString()
        : String(entity.updatedAt),
  };
}
