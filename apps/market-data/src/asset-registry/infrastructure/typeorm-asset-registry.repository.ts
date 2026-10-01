import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import {
  normalizeChain,
  normalizeContract,
  type AssetRecord,
  type UpsertAssetInput,
} from '../domain/asset-record';
import { AssetRegistryPort } from '../domain/asset-registry.port';
import { AssetRegistryEntity, toAssetRecord } from './asset-registry.entity';

/**
 * TypeOrmAssetRegistryRepository (Tramo 3, asset-registry).
 *
 * Postgres-backed port implementation (wired when
 * `DATABASE_ENABLED=true`). Same upsert-merge contract as the
 * in-memory twin: one row per `chain:contract`.
 */
@Injectable()
export class TypeOrmAssetRegistryRepository extends AssetRegistryPort {
  public constructor(
    @Optional()
    @InjectRepository(AssetRegistryEntity)
    private readonly store: Repository<AssetRegistryEntity> | undefined,
  ) {
    super();
  }

  private mustStore(): Repository<AssetRegistryEntity> {
    if (this.store === undefined || this.store === null) {
      throw new Error(
        'TypeOrmAssetRegistryRepository: no store wired (DATABASE_ENABLED=true?)',
      );
    }
    return this.store;
  }

  public async upsert(input: UpsertAssetInput): Promise<AssetRecord> {
    const store = this.mustStore();
    const chain = normalizeChain(input.chain);
    const contract = normalizeContract(input.contract);
    const prev = await store.findOne({ where: { chain, contract } });
    const merged = store.create({
      ...(prev ?? {}),
      chain,
      contract,
      symbol: input.symbol ?? prev?.symbol ?? null,
      name: input.name ?? prev?.name ?? null,
      cmcId: input.cmcId ?? prev?.cmcId ?? null,
      geckoId:
        (input.geckoId ?? prev?.geckoId ?? null) === null
          ? null
          : String(input.geckoId ?? prev?.geckoId ?? '').toLowerCase(),
      providerIds: {
        ...(prev?.providerIds ?? {}),
        ...(input.providerIds ?? {}),
      },
      logoUrl: input.logoUrl ?? prev?.logoUrl ?? null,
      categories:
        input.categories !== undefined
          ? [...input.categories]
          : (prev?.categories ?? []),
    });
    return toAssetRecord(await store.save(merged));
  }

  public async findByContract(
    chain: string,
    contract: string,
  ): Promise<AssetRecord | null> {
    const found = await this.mustStore().findOne({
      where: {
        chain: normalizeChain(chain),
        contract: normalizeContract(contract),
      },
    });
    return found === null ? null : toAssetRecord(found);
  }

  public async findByCmcId(cmcId: number): Promise<AssetRecord | null> {
    const found = await this.mustStore().findOne({ where: { cmcId } });
    return found === null ? null : toAssetRecord(found);
  }

  public async findByGeckoId(geckoId: string): Promise<AssetRecord | null> {
    const found = await this.mustStore().findOne({
      where: { geckoId: (geckoId ?? '').trim().toLowerCase() },
    });
    return found === null ? null : toAssetRecord(found);
  }

  public async findBySymbol(
    chain: string,
    symbol: string,
  ): Promise<ReadonlyArray<AssetRecord>> {
    const rows = await this.mustStore().find({
      where: { chain: normalizeChain(chain), symbol: (symbol ?? '').trim() },
    });
    const want = (symbol ?? '').trim().toLowerCase();
    return rows
      .filter((row) => (row.symbol ?? '').toLowerCase() === want)
      .map((row) => toAssetRecord(row));
  }

  public async listStale(limit: number): Promise<ReadonlyArray<AssetRecord>> {
    const rows = await this.mustStore().find({
      order: { updatedAt: 'ASC' },
      take: Math.max(0, limit),
    });
    return rows.map((row) => toAssetRecord(row));
  }
}
