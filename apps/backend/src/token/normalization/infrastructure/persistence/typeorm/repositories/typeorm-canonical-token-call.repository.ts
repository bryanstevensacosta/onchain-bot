import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import { NormalizedAddress } from 'token/identity/normalized-address.vo';
import { CanonicalTokenCall } from 'token/normalization/domain/entities/canonical-token-call.entity';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import { CanonicalTokenCallEntity } from 'token/normalization/infrastructure/persistence/typeorm/entities/canonical-token-call.entity';
import { CanonicalTokenCallMapper } from 'token/normalization/infrastructure/persistence/typeorm/mappers/canonical-token-call.mapper';

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
  private readonly logger = new Logger(TypeOrmCanonicalTokenCallRepository.name);

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
    chain: ChainFamily,
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
    const result: CanonicalTokenCall[] = [];
    for (const r of rows) {
      try {
        result.push(CanonicalTokenCallMapper.toDomain(r));
      } catch (err) {
        this.logger.warn(
          `Skipping invalid canonical token row (id=${r.id}): ${(err as Error).message}`,
        );
      }
    }
    return result;
  }

  public async count(): Promise<number> {
    return this.repo.count();
  }
}
