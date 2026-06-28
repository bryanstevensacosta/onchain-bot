import { Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'token/enrichment/domain/ports/market-data-provider.port';
import { HeliusService } from 'data-provider/helius/helius.service';

/**
 * Thin wrapper that delegates to `HeliusService.getAsset`.
 *
 * Maintains backward compatibility. Fills the gaps that `HeliusAdapter`
 * (holder counts) leaves: name, image, on-chain price, decimals-aware
 * supply normalization.
 */
@Injectable()
export class HeliusDasAdapter extends MarketDataProviderPort {
  public readonly name = 'helius-das';
  private readonly logger = new Logger(HeliusDasAdapter.name);

  public constructor(private readonly service: HeliusService) {
    super();
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    if (chain.value !== 'solana') return null;
    const asset = await this.service.getAsset(address);
    if (!asset) return null;
    const ti = asset.token_info;
    const meta = asset.content?.metadata;
    const imageUrl = asset.content?.links?.image;
    const rawSupply = ti?.supply ? parseFloat(ti.supply) : null;
    const decimals = ti?.decimals ?? 0;
    const totalSupply =
      rawSupply !== null ? rawSupply / Math.pow(10, decimals) : null;
    const rawPrice = ti?.price_info?.price_per_token;
    const priceUsd =
      typeof rawPrice === 'string' ? parseFloat(rawPrice) : (rawPrice ?? null);
    return {
      pairs: [],
      priceUsd,
      liquidityUsd: null,
      volume24hUsd: null,
      marketCapUsd: null,
      fdvUsd: null,
      priceChange24h: null,
      holders: null,
      top10HolderPercent: null,
      totalSupply,
      insidersPercent: null,
      bundlersPercent: null,
      devPercent: null,
      bondingPercent: null,
      factory: null,
      name: meta?.name ?? ti?.symbol ?? null,
      symbol: ti?.symbol ?? null,
      imageUrls: imageUrl ? [imageUrl] : [],
      lockedLiquidityPercent: null,
      burnedPercent: null,
    };
  }
}
