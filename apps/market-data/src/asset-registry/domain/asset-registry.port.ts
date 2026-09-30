import type { AssetRecord, UpsertAssetInput } from './asset-record';

/**
 * AssetRegistryPort (Tramo 3, asset-registry).
 *
 * Storage seam: TypeORM Postgres when `DATABASE_ENABLED=true`,
 * in-memory otherwise (same contract, zero boot coupling).
 */
export abstract class AssetRegistryPort {
  public abstract upsert(input: UpsertAssetInput): Promise<AssetRecord>;
  public abstract findByContract(chain: string, contract: string): Promise<AssetRecord | null>;
  public abstract findByCmcId(cmcId: number): Promise<AssetRecord | null>;
  public abstract findByGeckoId(geckoId: string): Promise<AssetRecord | null>;
  public abstract findBySymbol(chain: string, symbol: string): Promise<ReadonlyArray<AssetRecord>>;
  public abstract listStale(limit: number): Promise<ReadonlyArray<AssetRecord>>;
}
