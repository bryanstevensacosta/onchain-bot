import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import {
  DISCOVERY_CACHE_TTL_MS,
  DiscoveryCacheEntity,
  toDiscoveryCacheRow,
} from './discovery-cache.entity';

export interface DiscoveryCacheRow {
  readonly chain: string;
  readonly mint: string;
  readonly pairAddress: string;
  readonly dexId: string;
  readonly updatedAt: string;
}

const MAX_MEMORY_ROWS = 500;

const normalize = (value: string): string => (value ?? '').trim().toLowerCase();

/**
 * DiscoveryCacheRepository (dexter plan todo 30b).
 *
 * DB-backed when a TypeORM store is wired (`DATABASE_ENABLED=true` —
 * the entity + repository land together; the record shape here stays
 * the migration contract). Without a store it keeps a bounded
 * in-memory map so unit tests and DB-less boots stay green.
 * `deleteOlderThan` is the janitor primitive on both paths.
 *
 * LAZY TTL (the 30d bound lives HERE, checked on every read): a row
 * older than `DISCOVERY_CACHE_TTL_MS` is deleted and answers `null`
 * — the caller re-discovers and re-pins. No background expiry, no
 * cron, no timers on this path.
 */
@Injectable()
export class DiscoveryCacheRepository {
  private readonly rows = new Map<string, DiscoveryCacheRow>();

  public constructor(
    @Optional()
    @InjectRepository(DiscoveryCacheEntity)
    private readonly store?: Repository<DiscoveryCacheEntity>,
  ) {}

  private keyOf(chain: string, mint: string): string {
    return `${normalize(chain)}:${normalize(mint)}`;
  }

  private isExpired(updatedAt: string, now: number): boolean {
    const updatedMs = Date.parse(updatedAt);
    if (Number.isNaN(updatedMs)) return true;
    return now - updatedMs > DISCOVERY_CACHE_TTL_MS;
  }

  public async find(
    chain: string,
    mint: string,
    now: number = Date.now(),
  ): Promise<DiscoveryCacheRow | null> {
    const wantedChain = normalize(chain);
    const wantedMint = normalize(mint);
    if (wantedChain === '' || wantedMint === '') return null;
    if (this.store === undefined || this.store === null) {
      const row = this.rows.get(this.keyOf(wantedChain, wantedMint)) ?? null;
      if (row === null) return null;
      if (this.isExpired(row.updatedAt, now)) {
        this.rows.delete(this.keyOf(wantedChain, wantedMint));
        return null;
      }
      return row;
    }
    const entity = await this.store.findOne({
      where: { chain: wantedChain, mint: wantedMint },
    });
    if (entity === null) return null;
    const row = toDiscoveryCacheRow(entity);
    if (this.isExpired(row.updatedAt, now)) {
      await this.store.delete({ chain: wantedChain, mint: wantedMint });
      return null;
    }
    return row;
  }

  public async save(
    chain: string,
    mint: string,
    pairAddress: string,
    dexId: string,
    updatedAt: string | null = null,
  ): Promise<DiscoveryCacheRow> {
    const row: DiscoveryCacheRow = {
      chain: normalize(chain),
      mint: normalize(mint),
      pairAddress: (pairAddress ?? '').trim(),
      dexId: (dexId ?? '').trim(),
      updatedAt: updatedAt ?? new Date().toISOString(),
    };
    if (this.store === undefined || this.store === null) {
      this.rows.set(this.keyOf(row.chain, row.mint), row);
      while (this.rows.size > MAX_MEMORY_ROWS) {
        const oldest = this.rows.keys().next();
        if (oldest.done === true) break;
        this.rows.delete(oldest.value);
      }
      return row;
    }
    const existing = await this.store.findOne({
      where: { chain: row.chain, mint: row.mint },
    });
    if (existing === null) {
      const created = await this.store.save(
        this.store.create({
          chain: row.chain,
          mint: row.mint,
          pairAddress: row.pairAddress,
          dexId: row.dexId,
          updatedAt: new Date(row.updatedAt),
        }),
      );
      return toDiscoveryCacheRow(created);
    }
    existing.pairAddress = row.pairAddress;
    existing.dexId = row.dexId;
    existing.updatedAt = new Date(row.updatedAt);
    const persisted = await this.store.save(existing);
    return toDiscoveryCacheRow(persisted);
  }

  public async delete(chain: string, mint: string): Promise<number> {
    const wantedChain = normalize(chain);
    const wantedMint = normalize(mint);
    if (this.store === undefined || this.store === null) {
      return this.rows.delete(this.keyOf(wantedChain, wantedMint)) ? 1 : 0;
    }
    const result = await this.store.delete({
      chain: wantedChain,
      mint: wantedMint,
    });
    return result.affected ?? 0;
  }

  public async deleteOlderThan(cutoff: Date): Promise<number> {
    if (this.store === undefined || this.store === null) {
      let deleted = 0;
      for (const [key, row] of this.rows) {
        if (Date.parse(row.updatedAt) < cutoff.getTime()) {
          this.rows.delete(key);
          deleted += 1;
        }
      }
      return deleted;
    }
    const result = await this.store
      .createQueryBuilder()
      .delete()
      .where('"updatedAt" < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }
}
