import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  KolKnownListEntity,
  type KolKnownListKind,
} from 'kol/reputation/infrastructure/persistence/typeorm/entities/kol-known-list.entity';
import { KolKnownListRepository } from 'kol/reputation/application/ports/kol-known-list.repository';

/**
 * Postgres-backed implementation of `KolKnownListRepository`.
 *
 * Used by the DB-backed `KnownKolPort` (DbBackedKnownKolRegistry).
 * Replaces the static `DefaultKnownKolRegistry` so operator
 * adjustments (add/remove KOLs from whitelist/blacklist) no longer
 * require a code change + deploy.
 */
@Injectable()
export class TypeOrmKolKnownListRepository extends KolKnownListRepository {
  constructor(
    @InjectRepository(KolKnownListEntity)
    private readonly repo: Repository<KolKnownListEntity>,
  ) {
    super();
  }

  public async isKnown(
    kolId: string,
    kind: KolKnownListKind,
  ): Promise<boolean> {
    const count = await this.repo.count({ where: { kolId, kind } });
    return count > 0;
  }

  public async list(
    kind: KolKnownListKind,
  ): Promise<
    ReadonlyArray<{ kolId: string; reason: string | null; addedAt: Date }>
  > {
    const rows = await this.repo.find({
      where: { kind },
      order: { addedAt: 'DESC' },
    });
    return rows.map((r) => ({
      kolId: r.kolId,
      reason: r.reason,
      addedAt: r.addedAt,
    }));
  }
}