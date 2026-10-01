import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { AddressKind } from 'address/domain/address-kind';
import type { SnapshotQuote } from '../domain/snapshot-quote.types';
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
