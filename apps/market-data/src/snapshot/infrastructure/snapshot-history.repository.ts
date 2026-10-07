import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { AddressKind } from 'address/domain/address-kind';
import type { SnapshotQuote } from '../domain/snapshot-quote.types';
import type { SnapshotFdvAth } from '../domain/snapshot-fdv-ath';
import { SnapshotHistoryEntity, toHistoryRow } from './snapshot-history.entity';

export interface SnapshotHistoryRow {
  readonly key: string;
  readonly chain: string;
  readonly address: string;
  readonly kind: AddressKind;
  readonly status: 'pending' | 'ready';
  readonly quote: SnapshotQuote;
  readonly sources: ReadonlyArray<string>;
  readonly providerErrors: Record<string, string>;
  readonly createdAt: string;
}

const MAX_MEMORY_ROWS = 500;

/**
 * SnapshotHistoryRepository (Tramo 3, todo-3 aggregation gap, P44;
 * persistent todo 14, GAP-1).
 *
 * DB-backed when a TypeORM store is wired (`DATABASE_ENABLED=true` —
 * the entity + repository land with GAP-1 persistence; the record
 * shape here stays the migration contract). Without a store it keeps
 * the v1 in-memory ring so unit tests and DB-less boots stay green.
 * `deleteOlderThan` is the janitor primitive on both paths.
 */
@Injectable()
export class SnapshotHistoryRepository {
  private readonly rows: Array<SnapshotHistoryRow> = [];

  public constructor(
    @Optional()
    @InjectRepository(SnapshotHistoryEntity)
    private readonly store?: Repository<SnapshotHistoryEntity>,
  ) {}

  public async save(
    row: Omit<SnapshotHistoryRow, 'createdAt'>,
  ): Promise<SnapshotHistoryRow> {
    const createdAt = new Date().toISOString();
    if (this.store === undefined || this.store === null) {
      const full: SnapshotHistoryRow = { ...row, createdAt };
      this.rows.push(full);
      while (this.rows.length > MAX_MEMORY_ROWS) {
        this.rows.shift();
      }
      return full;
    }
    const persisted = await this.store.save(
      this.store.create({
        ...row,
        sources: [...row.sources],
        createdAt: new Date(createdAt),
      }),
    );
    return toHistoryRow(persisted);
  }

  public async listRecent(
    limit = 50,
  ): Promise<ReadonlyArray<SnapshotHistoryRow>> {
    if (this.store === undefined || this.store === null) {
      return this.rows.slice(-limit);
    }
    const entities = await this.store.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return entities
      .slice()
      .reverse()
      .map((entity) => toHistoryRow(entity));
  }

  public async count(): Promise<number> {
    if (this.store === undefined || this.store === null) {
      return this.rows.length;
    }
    return this.store.count();
  }

  /**
   * FDV ATH over own history (dexter fdv-ath, plan todo 16).
   * READ-ONLY aggregate: max `quote.fdvUsd` + the `createdAt` of the
   * row that set it, scoped to one `(chain, address)` (normalized
   * lowercase-trimmed, same key rule as `AddressIdVo`). Rows with a
   * missing/non-finite FDV are skipped, never crash. Returns `null`
   * when no row carries a usable FDV (cold-start / single-null
   * history). NEVER mutates history or retention.
   *
   * RETENTION LIMIT: the janitor (`SnapshotHistoryJanitorService`)
   * prunes rows older than `SNAPSHOT_HISTORY_RETENTION_DAYS` (90),
   * so this max covers the surviving 90-day window, NOT all time.
   */
  public async findFdvAth(
    chain: string,
    address: string,
  ): Promise<SnapshotFdvAth | null> {
    const wantedChain = (chain ?? '').trim().toLowerCase();
    const wantedAddress = (address ?? '').trim().toLowerCase();
    let rows: ReadonlyArray<SnapshotHistoryRow>;
    if (this.store === undefined || this.store === null) {
      rows = this.rows;
    } else {
      const entities = await this.store.find({
        where: { chain: wantedChain, address: wantedAddress },
        order: { createdAt: 'ASC' },
      });
      rows = entities.map((entity) => toHistoryRow(entity));
    }
    let best: SnapshotFdvAth | null = null;
    for (const row of rows) {
      if (
        row.chain.trim().toLowerCase() !== wantedChain ||
        row.address.trim().toLowerCase() !== wantedAddress
      ) {
        continue;
      }
      const fdv = row.quote?.fdvUsd;
      if (typeof fdv !== 'number' || !Number.isFinite(fdv)) continue;
      const at = row.createdAt;
      if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) continue;
      if (best === null || fdv > best.fdvUsd) {
        best = { fdvUsd: fdv, at };
      }
    }
    return best;
  }

  /**
   * Newest `ready` row for one snapshot key within the staleness
   * bound (dexter plan todo 19b1, SWR floor).
   *
   * KEY STRATEGY: `key` is the EXACT stored history key
   * (`AddressIdVo.key` = `chain:address`, lowercased) — NOT the
   * service cache key (`snapshot:<chain>:<addr>:<kind>`). The
   * equality predicate rides the existing
   * `ix_snapshot_history_key_created (key, createdAt)` BTREE
   * (key-equality prefix + `createdAt DESC LIMIT 1`); no composite
   * `(chain,address)` migration is needed because `(chain,address)`
   * is never queried. `status='ready'` excludes persisted pendings;
   * a newest-ready older than `maxAgeMs` answers `null` (honest
   * pending downstream, never a dead price). Pure age check in TS on
   * both paths (single rule, fake-timer pinnable).
   */
  public async findLatestReady(
    key: string,
    kind: string,
    maxAgeMs: number,
  ): Promise<SnapshotHistoryRow | null> {
    let candidate: SnapshotHistoryRow | null = null;
    if (this.store === undefined || this.store === null) {
      for (let index = this.rows.length - 1; index >= 0; index -= 1) {
        const row = this.rows[index];
        if (row.key === key && row.kind === kind && row.status === 'ready') {
          candidate = row;
          break;
        }
      }
    } else {
      const entities = await this.store.find({
        where: { key, kind, status: 'ready' },
        order: { createdAt: 'DESC' },
        take: 1,
      });
      const rows = entities.map((entity) => toHistoryRow(entity));
      candidate = rows.length > 0 ? rows[0] : null;
    }
    if (candidate === null) return null;
    const createdMs = Date.parse(candidate.createdAt);
    if (Number.isNaN(createdMs)) return null;
    if (Date.now() - createdMs > maxAgeMs) return null;
    return candidate;
  }

  public async deleteOlderThan(cutoff: Date): Promise<number> {
    if (this.store === undefined || this.store === null) {
      const before = this.rows.length;
      const kept = this.rows.filter(
        (row) => Date.parse(row.createdAt) >= cutoff.getTime(),
      );
      this.rows.length = 0;
      this.rows.push(...kept);
      return before - kept.length;
    }
    const result = await this.store
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }
}
