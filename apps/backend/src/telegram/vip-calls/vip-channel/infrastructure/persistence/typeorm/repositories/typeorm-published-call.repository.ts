import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChainId } from 'chain/identity/chain-id.vo';
import { PublishedCall, PublishedCallRepository } from 'telegram/shared';
import type {
  FinalizePayload,
  ReservePayload,
  TryReserveResult,
} from 'telegram/shared';
import { PublishedCallEntity } from '../entities/published-call.entity';
import { PublishedCallMapper } from '../mappers/published-call.mapper';

@Injectable()
export class TypeOrmPublishedCallRepository extends PublishedCallRepository {
  private readonly logger = new Logger(TypeOrmPublishedCallRepository.name);

  constructor(
    @InjectRepository(PublishedCallEntity)
    private readonly repo: Repository<PublishedCallEntity>,
  ) {
    super();
  }

  public async save(call: PublishedCall): Promise<void> {
    const row = PublishedCallMapper.toEntity(call);
    await this.repo.save(row);
  }

  public async findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<PublishedCall | null> {
    const normalizedAddress = chain.isSolana ? address : address.toLowerCase();
    const id = `${chain.value}:${normalizedAddress}`;
    const row = await this.repo.findOne({ where: { id } });
    return row ? PublishedCallMapper.toDomain(row) : null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    const rows = await this.repo.find({
      order: { publishedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => PublishedCallMapper.toDomain(r));
  }

  public async findPublished(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    const rows = await this.repo.find({
      where: { status: 'PUBLISHED' },
      order: { publishedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => PublishedCallMapper.toDomain(r));
  }

  public async findFailed(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    const rows = await this.repo.find({
      where: { status: 'FAILED' },
      order: { publishedAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => PublishedCallMapper.toDomain(r));
  }

  public async countPublished(): Promise<number> {
    return this.repo.count({ where: { status: 'PUBLISHED' } });
  }

  /**
   * Atomically attempt to claim a publish slot for `(chain, address)`.
   *
   * - If a row already exists, return `{ reserved: false, existing }` —
   *   the caller must skip the Telegram send and short-circuit.
   * - Otherwise insert a fresh RESERVED row. The unique key `id` =
   *   `${chain}:${normalizedAddress}` gives us row-level uniqueness,
   *   so `orIgnore()` (`ON CONFLICT DO NOTHING`) is the second line of
   *   defense in case two writers race past the existence check.
   */
  public async tryReserve(payload: ReservePayload): Promise<TryReserveResult> {
    const normalizedAddress = payload.chain.isSolana
      ? payload.address
      : payload.address.toLowerCase();
    const id = `${payload.chain.value}:${normalizedAddress}`;

    const existing = await this.findByChainAndAddress(
      payload.chain,
      payload.address,
    );
    if (existing) {
      return { reserved: false, existing, id };
    }

    const insertResult = await this.repo
      .createQueryBuilder()
      .insert()
      .into(PublishedCallEntity)
      .values({
        id,
        chain: payload.chain.value,
        address: normalizedAddress,
        ticker: payload.ticker,
        score: payload.score,
        tier: payload.tier,
        classification: payload.classification,
        message: payload.message,
        status: 'RESERVED',
        publishedChannelIds: Object.freeze([...payload.targetChannels]),
        failedChannelIds: Object.freeze([]),
        publishedAt: new Date(),
        mcAtCall: payload.mcAtCall,
        telegramMessageId: null,
        reservedAt: new Date(),
        correlationId: payload.correlationId,
        failedReason: null,
      })
      .orIgnore()
      .returning('id')
      .execute();

    if (!insertResult.identifiers.length) {
      // Race: a concurrent reserve won. Re-fetch and report existing.
      const winner = await this.findByChainAndAddress(
        payload.chain,
        payload.address,
      );
      return { reserved: false, existing: winner, id };
    }

    return { reserved: true, existing: null, id };
  }

  /**
   * Persist the final state of a RESERVED row. The `WHERE status = RESERVED`
   * guard makes this idempotent — retried finalize calls after a successful
   * finalize are no-ops.
   */
  public async finalize(id: string, payload: FinalizePayload): Promise<void> {
    const update: {
      status: string;
      telegramMessageId: number | null;
      failedReason: string | null;
      publishedAt?: Date;
      publishedChannelIds: string[];
      failedChannelIds: string[];
    } = {
      status: payload.status,
      telegramMessageId: payload.telegramMessageId ?? null,
      failedReason: payload.failedReason ?? null,
      publishedChannelIds: payload.status === 'PUBLISHED' ? ['vip-calls'] : [],
      failedChannelIds: payload.status === 'FAILED' ? ['vip-calls'] : [],
    };

    if (payload.status === 'PUBLISHED') {
      update.publishedAt = new Date();
    }

    await this.repo
      .createQueryBuilder()
      .update(PublishedCallEntity)
      .set(update)
      .where('id = :id AND status = :reserved', {
        id,
        reserved: 'RESERVED',
      })
      .execute();
  }

  /**
   * Best-effort transition RESERVED → FAILED. Idempotent. Used by the
   * use case when `sendMessage` throws before finalize can run.
   */
  public async markFailed(id: string, reason: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(PublishedCallEntity)
      .set({
        status: 'FAILED',
        failedReason: reason,
        failedChannelIds: ['vip-calls'],
      })
      .where('id = :id AND status = :reserved', {
        id,
        reserved: 'RESERVED',
      })
      .execute();
  }

  /**
   * Return RESERVED rows whose `reserved_at` is older than `olderThanMs`,
   * oldest first, capped at `limit`.
   *
   * Used by the reconciler to finalize rows that got stuck between
   * the Telegram `sendMessage` call and the `finalize()` UPDATE.
   */
  public async findStuckReservations(
    olderThanMs: number,
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    const threshold = new Date(Date.now() - olderThanMs);
    const rows = await this.repo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: 'RESERVED' })
      .andWhere('c.reserved_at IS NOT NULL')
      .andWhere('c.reserved_at <= :threshold', { threshold })
      .orderBy('c.reserved_at', 'ASC')
      .take(limit)
      .getMany();
    return rows.map((r) => PublishedCallMapper.toDomain(r));
  }
}
