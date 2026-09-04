import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Kol } from 'kol/identity/domain/entities/kol.entity';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { KolEntity } from 'kol/identity/infrastructure/persistence/typeorm/entities/kol.entity';
import { KolMapper } from 'kol/identity/infrastructure/persistence/typeorm/mappers/kol.mapper';

/**
 * Postgres-backed implementation of `KolRepository`.
 *
 * Persistence model:
 * - One row per KOL (PK = `kol_id`).
 * - `title` is mutable so the seeder's post-connect backfill can replace
 *   the "Telegram channel <peerId>" fallback once MTProto resolves the
 *   real title.
 * - `lifecycle_status` controls whether the listener is allowed to
 *   subscribe (`ACTIVE` / `DORMANT` / `BLACKLISTED`).
 *
 * `updateTitle` is implemented as a targeted UPDATE rather than a full
 * save round-trip — cheaper on Postgres and avoids re-fetching the row
 * to merge with the in-memory aggregate.
 */
@Injectable()
export class TypeOrmKolRepository extends KolRepository {
  constructor(
    @InjectRepository(KolEntity)
    private readonly repo: Repository<KolEntity>,
  ) {
    super();
  }

  public async save(kol: Kol): Promise<void> {
    const row = KolMapper.toEntity(kol);
    await this.repo.save(row);
  }

  public async findById(id: KolId): Promise<Kol | null> {
    const row = await this.repo.findOne({ where: { kolId: id.value } });
    return row ? KolMapper.toDomain(row) : null;
  }

  public async findAll(): Promise<ReadonlyArray<Kol>> {
    const rows = await this.repo.find();
    return rows.map((r) => KolMapper.toDomain(r));
  }

  public async findActive(): Promise<ReadonlyArray<Kol>> {
    const rows = await this.repo.find({
      where: {
        isActive: true,
        lifecycleStatus: 'ACTIVE',
      },
    });
    return rows.map((r) => KolMapper.toDomain(r));
  }

  public async delete(id: KolId): Promise<void> {
    await this.repo.delete({ kolId: id.value });
  }

  public async updateTitle(id: KolId, newTitle: string): Promise<boolean> {
    const trimmed = newTitle.trim();
    if (trimmed.length === 0) {
      return false;
    }
    const result = await this.repo.update(
      { kolId: id.value },
      { title: trimmed },
    );
    return (result.affected ?? 0) > 0;
  }
}
