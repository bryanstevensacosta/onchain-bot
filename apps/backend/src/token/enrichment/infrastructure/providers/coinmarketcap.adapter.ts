import { Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'token/enrichment/domain/ports/market-data-provider.port';
import { CoinMarketCapService } from 'data-provider/coinmarketcap/coinmarketcap.service';

/**
 * Thin wrapper that delegates to `CoinMarketCapService`.
 *
 * CoinMarketCap is a **symbol-based API** — it identifies assets by ticker
 * (BTC, ETH, SOL), not by contract address. This adapter therefore works
 * best when `address` is a ticker symbol rather than a contract address.
 *
 * **Use case**: fallback price provider for well-known blue chips where
 * DexScreener / GeckoTerminal return no data (e.g. the enrichment pipeline
 * passes the ticker as "address" for tokens listed on CMC but absent from
 * on-chain DEX data).
 *
 * **Limitations**:
 * - Contract-address lookups are not supported by the free CMC API tier
 *   (requires Startup plan for `/v1/dex/token/pairs/latest`).
 * - Requires `COINMARKETCAP_API_KEY` in `.env` (Basic plan: 20k credits/mo).
 */
@Injectable()
export class CoinMarketCapAdapter extends MarketDataProviderPort {
  public readonly name = 'coinmarketcap';
  private readonly logger = new Logger(CoinMarketCapAdapter.name);

  public constructor(private readonly service: CoinMarketCapService) {
    super();
  }

  public async fetch(
    _chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    if (!this.looksLikeTicker(address)) return null;

    const [quotes, info] = await Promise.all([
      this.service.getQuotesLatest(address),
      this.service.getInfo(address),
    ]);

    if (!quotes || !quotes[address]) return null;

    const q = quotes[address].quote['USD'] ?? null;
    if (!q) return null;

    const meta = info?.[address] ?? null;

    return {
      pairs: [],
      priceUsd: q.price,
      liquidityUsd: null,
      volume24hUsd: q.volume_24h,
      marketCapUsd: q.market_cap,
      fdvUsd: q.fully_diluted_market_cap,
      priceChange24h: q.percent_change_24h,
      holders: null,
      top10HolderPercent: null,
      name: meta?.name ?? null,
      symbol: quotes[address].symbol,
      imageUrls: meta?.logo ? [meta.logo] : [],
      lockedLiquidityPercent: null,
      burnedPercent: null,
    };
  }

  private looksLikeTicker(s: string): boolean {
    return /^[A-Z0-9]{2,10}$/.test(s);
  }
}
