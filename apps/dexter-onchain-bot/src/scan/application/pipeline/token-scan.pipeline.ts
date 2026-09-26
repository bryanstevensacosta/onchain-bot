import { Injectable } from '@nestjs/common';
import { MarketDataClient } from '../../infrastructure/market-data/market-data.client';
import type {
  ChainIdentifier,
  ResolvedToken,
  ScanPipeline,
} from '../../domain/ports/scan-pipeline.port';

/**
 * Token scan pipeline (Tramo 3, todo 9, P13).
 *
 * Moved from backend chain-dexter-bot
 * `application/handlers/token-scan.pipeline.ts` + `token-scan.service.ts`
 * `getTokenInfo`, re-wired onto market-data HTTP (todo 5 bridge,
 * default-true): `resolve` renders the token card from the market-data
 * snapshot instead of composing DetectChain + Enrich use cases directly
 * (those cross-BC imports stay in the backend — this app is lookup-only).
 */

export type { ChainIdentifier, ResolvedToken, ScanPipeline };

function parseChainPrefix(input: string): {
  chain: string | null;
  address: string;
} {
  const idx = input.indexOf(':');
  if (idx > 0) {
    const chain = input.slice(0, idx).trim().toLowerCase();
    const address = input.slice(idx + 1).trim();
    if (chain !== '' && address !== '') return { chain, address };
  }
  return { chain: null, address: input.trim() };
}

@Injectable()
export class TokenScanPipeline implements ScanPipeline {
  public constructor(private readonly marketData: MarketDataClient) {}

  public async resolve(address: string): Promise<ResolvedToken | null> {
    const { chain, address: bare } = parseChainPrefix(address);
    if (bare === '') return null;

    if (chain !== null) {
      const snapshot = await this.marketData.getSnapshot(chain, bare);
      if (!snapshot || (snapshot.symbol === null && snapshot.name === null)) {
        return null;
      }
      return this.toResolvedToken(chain, bare, snapshot);
    }

    const found = await this.marketData.resolveAny(bare);
    if (!found) return null;
    return this.toResolvedToken(found.chain, bare, found.snapshot);
  }

  private toResolvedToken(
    chain: string,
    address: string,
    snapshot: {
      readonly symbol: string | null;
      readonly name: string | null;
      readonly marketCapUsd: number | null;
      readonly fdvUsd: number | null;
      readonly priceUsd: number | null;
      readonly priceChange24h: number | null;
      readonly liquidityUsd: number | null;
      readonly lockedLiquidityPercent: number | null;
      readonly burnedPercent: number | null;
      readonly volume24hUsd: number | null;
      readonly holders: number | null;
      readonly top10HolderPercent: number | null;
    },
  ): ResolvedToken {
    return {
      address,
      chain: chain as ChainIdentifier,
      symbol: snapshot.symbol ?? '???',
      name: snapshot.name ?? 'Unknown',
      marketCapUsd: snapshot.marketCapUsd,
      fdvUsd: snapshot.fdvUsd,
      priceUsd: snapshot.priceUsd,
      priceChange24h: snapshot.priceChange24h,
      liquidityUsd: snapshot.liquidityUsd,
      lockedLiquidityPercent: snapshot.lockedLiquidityPercent,
      burnedPercent: snapshot.burnedPercent,
      volume24hUsd: snapshot.volume24hUsd,
      holders: snapshot.holders,
      top10HolderPercent: snapshot.top10HolderPercent,
      top20HolderPercent: null,
      poolAddress: null,
      source: 'market-data-http',
    };
  }
}
