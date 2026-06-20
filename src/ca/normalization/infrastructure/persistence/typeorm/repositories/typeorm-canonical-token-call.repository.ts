import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Chain } from 'ca/normalization/domain/value-objects/chain.vo';
import { NormalizedAddress } from 'ca/normalization/domain/value-objects/normalized-address.vo';
import { CanonicalTokenCall } from 'ca/normalization/domain/entities/canonical-token-call.entity';
import { CanonicalTokenCallRepository } from 'ca/normalization/application/ports/canonical-token-call.repository';
import { CanonicalTokenCallEntity } from 'ca/normalization/infrastructure/persistence/typeorm/entities/canonical-token-call.entity';
import { CanonicalTokenCallMapper } from 'ca/normalization/infrastructure/persistence/typeorm/mappers/canonical-token-call.mapper';

/**
 * Postgres-backed implementation of `CanonicalTokenCallRepository`.
 *
 * Persistence model:
 * - One row per unique `(chain, address)` (PK = `id` = `chain:address`).
 * - `sources` is JSONB so the channel/message array survives restart
 *   without a separate join table — important because `mentionCount`
 *   and downstream scoring depend on source diversity.
 *
 * Replaces the FIFO-capped in-memory map (5,000 entries) which could
 * evict hot tokens. With Postgres, capacity is effectively unlimited.
 */
@Injectable()
export class TypeOrmCanonicalTokenCallRepository extends CanonicalTokenCallRepository {
  constructor(
    @InjectRepository(CanonicalTokenCallEntity)
    private readonly repo: Repository<CanonicalTokenCallEntity>,
  ) {
    super();
  }

  public async save(call: CanonicalTokenCall): Promise<void> {
    const row = CanonicalTokenCallMapper.toEntity(call);
    await this.repo.save(row);
  }

  public async findByIdentity(
    chain: Chain,
    address: NormalizedAddress,
  ): Promise<CanonicalTokenCall | null> {
    const id = `${chain.value}:${address.value}`;
    const row = await this.repo.findOne({ where: { id } });
    return row ? CanonicalTokenCallMapper.toDomain(row) : null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<CanonicalTokenCall>> {
    const rows = await this.repo.find({
      order: { lastSeenAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => CanonicalTokenCallMapper.toDomain(r));
  }
}
