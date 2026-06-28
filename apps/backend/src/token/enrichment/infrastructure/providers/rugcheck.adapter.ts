import { Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'token/enrichment/domain/ports/market-data-provider.port';
import { RugCheckService } from 'data-provider/rugcheck/rugcheck.service';

@Injectable()
export class RugCheckAdapter extends MarketDataProviderPort {
  public readonly name = 'rugcheck';
  private readonly logger = new Logger(RugCheckAdapter.name);

  public constructor(private readonly service: RugCheckService) {
    super();
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    if (chain.value !== 'solana') return null;

    const summary = await this.service.getSummary(address);
    if (summary) {
      return this.mapSummary(summary);
    }

    const mock = this.service.getMockData(address);
    return {
      pairs: [],
      priceUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      marketCapUsd: null,
      fdvUsd: null,
      priceChange24h: null,
      holders: null,
      top10HolderPercent: null,
      name: null,
      symbol: null,
      imageUrls: [],
      lockedLiquidityPercent: mock.lockedLiquidityPercent,
      burnedPercent: mock.burnedPercent,
    };
  }

  private mapSummary(summary: {
    readonly lockedLiquidity: ReadonlyArray<{ readonly percent: number }>;
    readonly burnedPercent: number | null;
  }): MarketData {
    const lockedPct =
      summary.lockedLiquidity && summary.lockedLiquidity.length > 0
        ? summary.lockedLiquidity.reduce((sum, l) => sum + (l.percent ?? 0), 0)
        : null;
    return {
      pairs: [],
      priceUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      marketCapUsd: null,
      fdvUsd: null,
      priceChange24h: null,
      holders: null,
      top10HolderPercent: null,
      name: null,
      symbol: null,
      imageUrls: [],
      lockedLiquidityPercent: lockedPct,
      burnedPercent: summary.burnedPercent ?? null,
    };
  }
}
