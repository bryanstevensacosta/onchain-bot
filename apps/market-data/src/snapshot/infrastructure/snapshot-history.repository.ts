import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { AddressKind } from 'address/domain/address-kind';
import type { SnapshotQuote } from '../domain/snapshot-quote.types';
import type { FdvAthLookup, SnapshotFdvAth } from '../domain/snapshot-fdv-ath';
import { ATH_SEED_SOURCE } from '../domain/snapshot-ath-seed';
import { SnapshotHistoryEntity, toHistoryRow } from './snapshot-history.entity';

export interface SnapshotHistoryRow {
  readonly key: string;
  readonly chain: string;
  readonly address: string;
  readonly kind: AddressKind;
  readonly status: 'pending' | 'ready' | 'invalid';
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
   * One-time per-pool OHLC seed write (dexter plan todo 46, camino al
   * 0% honesto).
   *
   * Unlike `save` (which stamps `now`), the caller pins `createdAt`
   * to the CANDLE time — so idempotency falls out of the existing
   * `unique(key, createdAt)`: the second encounter replays the same
   * candle timestamps and collides (no new guard table, no
   * re-fetch). A `23505` collision answers `null` (already seeded);
   * any other store error rethrows (the service fail-opens above
   * this). Malformed `createdAt` answers `null` without touching
   * the store. In-memory mirrors the constraint (same
   * `(key, createdAt)` skip) so specs pin the semantics without a
   * live DB.
   */
  public async saveSeeded(
    row: Omit<SnapshotHistoryRow, 'createdAt' | 'kind'> & {
      readonly kind: string;
      readonly createdAt: string;
    },
  ): Promise<SnapshotHistoryRow | null> {
    if (
      typeof row.createdAt !== 'string' ||
      Number.isNaN(Date.parse(row.createdAt))
    ) {
      return null;
    }
    const normalized: Omit<SnapshotHistoryRow, 'createdAt'> = {
      ...row,
      kind: row.kind as SnapshotHistoryRow['kind'],
    };
    if (this.store === undefined || this.store === null) {
      const existing = this.rows.find(
        (candidate) =>
          candidate.key === normalized.key &&
          candidate.createdAt === row.createdAt,
      );
      if (existing !== undefined) return existing;
      const full: SnapshotHistoryRow = {
        ...normalized,
        createdAt: row.createdAt,
      };
      this.rows.push(full);
      while (this.rows.length > MAX_MEMORY_ROWS) {
        this.rows.shift();
      }
      return full;
    }
    try {
      const persisted = await this.store.save(
        this.store.create({
          ...normalized,
          sources: [...normalized.sources],
          createdAt: new Date(row.createdAt),
        }),
      );
      return toHistoryRow(persisted);
    } catch (err) {
      const code =
        (err as { readonly code?: unknown })?.code ??
        (err as { readonly driverError?: { readonly code?: unknown } })
          ?.driverError?.code;
      if (code === '23505') return null;
      throw err;
    }
  }

  /**
   * Past-window anchor for the outright-24h leg (dexter plan todo
   * 46): the history row (backfill + live — seeding runs BEFORE this
   * read, so the first encounter already sees its own candles)
   * nearest to `targetMs` within `±toleranceMs`. Nearest wins, exact
   * ties break toward the newer row (same rule as the candle-pure
   * derivation). `ready` rows only (pendings are transient shells,
   * never anchors); outside-tolerance answers `null` (honest gap,
   * never extrapolated). Same no-new-index precedent as
   * `findFdvAth` (`(chain, address)` predicate, nearest picked in
   * TS). NEVER mutates history or retention.
   */
  public async findAnchorAt(
    chain: string,
    address: string,
    targetMs: number,
    toleranceMs: number,
  ): Promise<SnapshotHistoryRow | null> {
    if (
      typeof targetMs !== 'number' ||
      !Number.isFinite(targetMs) ||
      typeof toleranceMs !== 'number' ||
      !Number.isFinite(toleranceMs) ||
      toleranceMs < 0
    ) {
      return null;
    }
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
    let best: SnapshotHistoryRow | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    let bestTs = Number.NEGATIVE_INFINITY;
    for (const row of rows) {
      if (row.status !== 'ready') continue;
      if (
        row.chain.trim().toLowerCase() !== wantedChain ||
        row.address.trim().toLowerCase() !== wantedAddress
      ) {
        continue;
      }
      const ts = Date.parse(row.createdAt);
      if (Number.isNaN(ts)) continue;
      const diff = Math.abs(ts - targetMs);
      if (diff > toleranceMs) continue;
      if (diff < bestDiff || (diff === bestDiff && ts > bestTs)) {
        best = row;
        bestDiff = diff;
        bestTs = ts;
      }
    }
    return best;
  }

  /**
   * FDV ATH over own history (dexter fdv-ath, plan todo 16; seed
   * marker todo 68).
   * READ-ONLY aggregate: max `quote.fdvUsd` + the `createdAt` of the
   * row that set it, scoped to one `(chain, address)` (normalized
   * lowercase-trimmed, same key rule as `AddressIdVo`). Rows with a
   * missing/non-finite FDV are skipped, never crash. Returns
   * `{ ath: null, seeded: false }` when no row carries a usable FDV
   * (cold-start / single-null history). NEVER mutates history or
   * retention.
   *
   * SEED MARKER (dexter plan todo 68): the same loop reports whether
   * any row of THIS token carries `sources: ['geckoterminal-ath-seed']`
   * (the one-shot historical ATH seed tag). This is the anti-masking
   * guard input: the todo-46 hour backfill seeds rows BEFORE the
   * service's ATH read, so "ath === null" can no longer stand in for
   * "never seeded" — the marker can. The read is zero-cost (the same
   * `(chain, address)` scan, one extra `includes`) and happens BEFORE
   * the current snapshot row persists (read-before-save rule intact;
   * the seeded day rows are written earlier in the same request).
   *
   * RETENTION LIMIT: the janitor (`SnapshotHistoryJanitorService`)
   * prunes rows older than `SNAPSHOT_HISTORY_RETENTION_DAYS` (90),
   * so this max covers the surviving 90-day window, NOT all time.
   *
   * ONE-SEMANTICS NOTE (dexter plan todo 38): since the single-seam
   * computed FDV, every NEW row carries `quote.fdvProvenance:
   * 'computed'` (`price×(total ?? max)`, never provider-reported),
   * so the max is defined over ONE semantics going forward. The 90d
   * window is MIXED-transient: pre-todo38 provider-reported rows and
   * post computed rows coexist until the janitor prunes the old ones
   * (~90d). The todo-46 one-time per-pool OHLC seed EXTENDS the
   * append-only history (seeded rows carry candle-time `createdAt`
   * + computed FDV, so they max here like any live row) — the
   * transient is accepted and documented here, not hidden. The
   * todo-68 ATH seed adds ONE more computed row per token (peak day
   * candle, `createdAt` = candle open + 1ms) to the same max.
   *
   * FALLBACK NOTE (dexter plan todo 61): the null-only DexScreener
   * fallback rows (`fdvProvenance: 'dexscreener'`) are maxed here too
   * — NO query change, deliberately (filtering to `'computed'` would
   * forever deny `fdvAth` to tokens only ever fallback-filled). DSC's
   * pair `fdv` ≈ `price × on-chain supply` (SCRIP live 2653 vs
   * 2652.34; WENCAT same-minute ~0.1%), so the mixed semantics is an
   * accepted, measured rounding-class delta — documented, not hidden.
   */
  public async findFdvAth(
    chain: string,
    address: string,
  ): Promise<FdvAthLookup> {
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
    let seeded = false;
    for (const row of rows) {
      if (
        row.chain.trim().toLowerCase() !== wantedChain ||
        row.address.trim().toLowerCase() !== wantedAddress
      ) {
        continue;
      }
      if (row.sources?.includes(ATH_SEED_SOURCE) === true) {
        seeded = true;
      }
      const fdv = row.quote?.fdvUsd;
      if (typeof fdv !== 'number' || !Number.isFinite(fdv)) continue;
      const at = row.createdAt;
      if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) continue;
      if (best === null || fdv > best.fdvUsd) {
        best = { fdvUsd: fdv, at };
      }
    }
    return { ath: best, seeded };
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
