import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  CHAIN_CATALOG,
  ChainCatalogPort,
} from 'chain/registry/domain/ports/chain-catalog.port';
import {
  MarketData,
  MarketDataProviderPort,
} from 'token/enrichment/domain/ports/market-data-provider.port';
import { GeckoTerminalService } from 'data-provider/geckoterminal/geckoterminal.service';

/**
 * Thin wrapper that delegates to `GeckoTerminalService.getTokenInfo`.
 *
 * Chain slug is resolved via the chain registry (no hardcoded map).
 * Returns null gracefully when the token is unknown or network unsupported.
 */
@Injectable()
export class GeckoTerminalAdapter extends MarketDataProviderPort {
  public readonly name = 'geckoterminal';
  private readonly logger = new Logger(GeckoTerminalAdapter.name);

  public constructor(
    @Inject(CHAIN_CATALOG) private readonly catalog: ChainCatalogPort,
    private readonly service: GeckoTerminalService,
  ) {
    super();
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    const chainEntity = await this.catalog.findById(chain);
    const slug = chainEntity?.geckoTerminalSlug ?? null;
    if (!slug) return null;

    const info = await this.service.getTokenInfo(slug, address);
    if (!info) return null;

    return {
      pairs: [],
      priceUsd: info.priceUsd,
      liquidityUsd: null,
      volume24hUsd: info.volumeUsdH24,
      marketCapUsd: info.marketCapUsd,
      fdvUsd: info.fdvUsd,
      priceChange24h: info.priceChangePercentH24,
      holders: info.holders,
      top10HolderPercent: info.top10HolderPercent,
      name: info.name,
      symbol: null,
      imageUrls: [],
      lockedLiquidityPercent: null,
      burnedPercent: null,
    };
  }
}
