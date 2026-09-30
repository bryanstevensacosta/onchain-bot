import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  normalizeChain,
  normalizeContract,
  type AssetRecord,
  type UpsertAssetInput,
} from '../domain/asset-record';
import { AssetRegistryPort } from '../domain/asset-registry.port';

/**
 * InMemoryAssetRegistryRepository (Tramo 3, asset-registry).
 *
 * Map-backed port implementation: the default when
 * `DATABASE_ENABLED` is off (unit tests, DB-less boots). One row per
 * `chain:contract` (re-upsert merges, never duplicates); gecko ids
 * match case-insensitively.
 */
@Injectable()
export class InMemoryAssetRegistryRepository extends AssetRegistryPort {
  private readonly rows = new Map<string, AssetRecord>();

  private static key(chain: string, contract: string): string {
    return normalizeChain(chain) + ':' + normalizeContract(contract);
  }

  public async upsert(input: UpsertAssetInput): Promise<AssetRecord> {
    const chain = normalizeChain(input.chain);
    const contract = normalizeContract(input.contract);
    const key = chain + ':' + contract;
    const prev = this.rows.get(key);
    const now = new Date().toISOString();
    const next: AssetRecord = {
      id: prev?.id ?? randomUUID(),
      chain,
      contract,
      symbol: input.symbol ?? prev?.symbol ?? null,
      name: input.name ?? prev?.name ?? null,
      cmcId: input.cmcId ?? prev?.cmcId ?? null,
      geckoId:
        (input.geckoId ?? prev?.geckoId ?? null) === null
          ? null
          : String(input.geckoId ?? prev?.geckoId ?? '').toLowerCase(),
      providerIds: { ...(prev?.providerIds ?? {}), ...(input.providerIds ?? {}) },
      logoUrl: input.logoUrl ?? prev?.logoUrl ?? null,
      categories: input.categories ?? prev?.categories ?? [],
      updatedAt: now,
    };
    this.rows.set(key, next);
    return next;
  }

  public async findByContract(chain: string, contract: string): Promise<AssetRecord | null> {
    return this.rows.get(InMemoryAssetRegistryRepository.key(chain, contract)) ?? null;
  }

  public async findByCmcId(cmcId: number): Promise<AssetRecord | null> {
    for (const row of this.rows.values()) {
      if (row.cmcId === cmcId) {
        return row;
      }
    }
    return null;
  }

  public async findByGeckoId(geckoId: string): Promise<AssetRecord | null> {
    const want = (geckoId ?? '').trim().toLowerCase();
    for (const row of this.rows.values()) {
      if (row.geckoId !== null && row.geckoId.toLowerCase() === want) {
        return row;
      }
    }
    return null;
  }

  public async findBySymbol(chain: string, symbol: string): Promise<ReadonlyArray<AssetRecord>> {
    const wantChain = normalizeChain(chain);
    const wantSymbol = (symbol ?? '').trim().toLowerCase();
    const out: Array<AssetRecord> = [];
    for (const row of this.rows.values()) {
      if (row.chain === wantChain && (row.symbol ?? '').toLowerCase() === wantSymbol) {
        out.push(row);
      }
    }
    return out;
  }

  public async listStale(limit: number): Promise<ReadonlyArray<AssetRecord>> {
    return [...this.rows.values()]
      .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0))
      .slice(0, Math.max(0, limit));
  }
}
