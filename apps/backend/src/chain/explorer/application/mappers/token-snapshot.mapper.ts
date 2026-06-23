import type { TokenSnapshot } from '../../domain/entities/token-snapshot.entity';

export interface TokenSnapshotView {
  readonly id: string;
  readonly chain: string;
  readonly address: string;
  readonly priceUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly priceChange24h: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly name: string | null;
  readonly imageUrls: ReadonlyArray<string>;
  readonly lockedLiquidityPercent: number | null;
  readonly burnedPercent: number | null;
  readonly hasRugcheckData: boolean;
  readonly primaryPair: {
    readonly address: string;
    readonly dexId: string;
    readonly quoteToken: string;
    readonly reserveUsd: number;
  } | null;
  readonly pairCount: number;
  readonly sources: ReadonlyArray<string>;
  readonly completeness: number;
  readonly enrichedAt: string;
}

export class TokenSnapshotMapper {
  public static toView(snapshot: TokenSnapshot): TokenSnapshotView {
    return {
      id: snapshot.id,
      chain: snapshot.chain.value,
      address: snapshot.address,
      priceUsd: snapshot.priceUsd,
      liquidityUsd: snapshot.liquidityUsd,
      volume24hUsd: snapshot.volume24hUsd,
      marketCapUsd: snapshot.marketCapUsd,
      fdvUsd: snapshot.fdvUsd,
      priceChange24h: snapshot.priceChange24h,
      holders: snapshot.holders,
      top10HolderPercent: snapshot.top10HolderPercent,
      name: snapshot.name,
      imageUrls: snapshot.imageUrls,
      lockedLiquidityPercent: snapshot.lockedLiquidityPercent,
      burnedPercent: snapshot.burnedPercent,
      hasRugcheckData:
        snapshot.lockedLiquidityPercent !== null ||
        snapshot.burnedPercent !== null,
      primaryPair: snapshot.primaryPair
        ? {
            address: snapshot.primaryPair.address,
            dexId: snapshot.primaryPair.dexId,
            quoteToken: snapshot.primaryPair.quoteToken,
            reserveUsd: snapshot.primaryPair.reserveUsd,
          }
        : null,
      pairCount: snapshot.pairs.length,
      sources: [...snapshot.sources],
      completeness: snapshot.completenessScore(),
      enrichedAt: snapshot.enrichedAt.toISOString(),
    };
  }
}
