/**
 * Asset record domain types (Tramo 3, asset-registry).
 *
 * One row per `chain:contract` (contract lowercased — PK-ish). Slow
 * metadata (CoinMarketCap UCID, CoinGecko id, per-provider ids, names,
 * logo, categories) is refreshed on a timer, never on the hot path.
 * Symbol alone NEVER resolves: collisions throw, never silently pick.
 */
export interface AssetRecord {
  readonly id: string;
  readonly chain: string;
  readonly contract: string;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly cmcId: number | null;
  readonly geckoId: string | null;
  readonly providerIds: Record<string, string>;
  readonly logoUrl: string | null;
  readonly categories: ReadonlyArray<string>;
  readonly updatedAt: string;
}

export interface UpsertAssetInput {
  readonly chain: string;
  readonly contract: string;
  readonly symbol?: string | null;
  readonly name?: string | null;
  readonly cmcId?: number | null;
  readonly geckoId?: string | null;
  readonly providerIds?: Record<string, string>;
  readonly logoUrl?: string | null;
  readonly categories?: ReadonlyArray<string>;
}

export function normalizeChain(chain: string): string {
  return (chain ?? '').trim().toLowerCase();
}

export function normalizeContract(contract: string): string {
  return (contract ?? '').trim().toLowerCase();
}

export function assetKey(chain: string, contract: string): string {
  return normalizeChain(chain) + ':' + normalizeContract(contract);
}

export class AssetNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AssetNotFoundError';
  }
}

export class AmbiguousAssetError extends Error {
  public readonly candidates: ReadonlyArray<string>;
  public constructor(symbol: string, chain: string, candidates: ReadonlyArray<string>) {
    super(
      'Ambiguous symbol "' + symbol + '" on chain "' + chain + '": ' +
        candidates.length +
        ' candidates — resolve by contract instead',
    );
    this.name = 'AmbiguousAssetError';
    this.candidates = candidates;
  }
}
