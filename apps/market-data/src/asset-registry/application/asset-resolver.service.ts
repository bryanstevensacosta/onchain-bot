import { Injectable, Optional } from '@nestjs/common';
import {
  AmbiguousAssetError,
  AssetNotFoundError,
  normalizeChain,
  normalizeContract,
  type AssetRecord,
  type UpsertAssetInput,
} from '../domain/asset-record';
import { AssetRegistryPort } from '../domain/asset-registry.port';
import { InMemoryAssetRegistryRepository } from '../infrastructure/in-memory-asset-registry.repository';

/**
 * AssetResolverService (Tramo 3, asset-registry).
 *
 * Resolution priority (never reordered): contract+chain first, then
 * cmc id, then gecko id, then symbol+chain. Symbol matches are
 * explicit about collisions: 0 rows -> AssetNotFoundError, 2+ rows ->
 * AmbiguousAssetError (never a silent pick).
 */
@Injectable()
export class AssetResolverService {
  public constructor(
    @Optional() private readonly store: AssetRegistryPort | null = null,
  ) {}

  private active(): AssetRegistryPort {
    if (this.store !== null && this.store !== undefined) {
      return this.store;
    }
    return new InMemoryAssetRegistryRepository();
  }

  public async upsert(input: UpsertAssetInput): Promise<AssetRecord> {
    return this.active().upsert(input);
  }

  public async resolve(input: { chain: string; contract: string }): Promise<AssetRecord> {
    const found = await this.active().findByContract(input.chain, input.contract);
    if (found === null) {
      throw new AssetNotFoundError(
        'Unknown asset ' + normalizeChain(input.chain) + ':' + normalizeContract(input.contract),
      );
    }
    return found;
  }

  public async resolveByCmcId(cmcId: number): Promise<AssetRecord> {
    const found = await this.active().findByCmcId(cmcId);
    if (found === null) {
      throw new AssetNotFoundError('Unknown cmc id ' + String(cmcId));
    }
    return found;
  }

  public async resolveByGeckoId(geckoId: string): Promise<AssetRecord> {
    const found = await this.active().findByGeckoId(geckoId);
    if (found === null) {
      throw new AssetNotFoundError('Unknown gecko id ' + geckoId);
    }
    return found;
  }

  public async resolveBySymbol(chain: string, symbol: string): Promise<AssetRecord> {
    const rows = await this.active().findBySymbol(chain, symbol);
    if (rows.length === 0) {
      throw new AssetNotFoundError(
        'Unknown symbol "' + symbol + '" on chain "' + normalizeChain(chain) + '"',
      );
    }
    if (rows.length > 1) {
      throw new AmbiguousAssetError(
        symbol,
        normalizeChain(chain),
        rows.map((row) => row.contract),
      );
    }
    return rows[0];
  }
}
