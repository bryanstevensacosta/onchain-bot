import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'chain/explorer/domain/ports/market-data-provider.port';

interface AppConfigShape {
  readonly helius: { readonly apiKey: string };
}

interface HeliusDasResponse {
  readonly result?: {
    readonly content?: {
      readonly metadata?: {
        readonly name?: string;
        readonly symbol?: string;
      };
      readonly links?: {
        readonly image?: string;
      };
    };
    readonly token_info?: {
      readonly symbol?: string;
      readonly supply?: string | null;
      readonly decimals?: number | null;
      readonly price_info?: {
        readonly price_per_token?: number | string | null;
        readonly currency?: string;
      } | null;
    } | null;
  };
  readonly error?: { readonly code: number; readonly message: string };
}

const DECIMALS_FALLBACK = 0;

/**
 * Helius Digital Asset Standard (DAS) `getAsset` provider — Solana only.
 *
 * Requires `HELIUS_API_KEY`. Calls `getAsset` with
 * `displayOptions.showFungible: true` so the response includes
 * `token_info` (supply, decimals, real-time price_per_token) for SPL
 * tokens — not just NFTs as in the default response.
 *
 * Companion to the existing `HeliusAdapter` (which uses
 * `getTokenAccounts` for holder counts). This adapter fills the gaps
 * that the existing one leaves: name, image, on-chain price (for
 * indexed tokens), and decimals-aware supply normalization.
 *
 * For tokens too fresh to be indexed by Helius, `getAsset` returns
 * "Asset Not Found" — this adapter surfaces that as null.
 */
@Injectable()
export class HeliusDasAdapter extends MarketDataProviderPort {
  public readonly name = 'helius-das';

  private readonly logger = new Logger(HeliusDasAdapter.name);
  private readonly apiKey: string | null;
  private static readonly ENDPOINT = 'https://mainnet.helius-rpc.com';

  public constructor(configService: ConfigService) {
    super();
    const cfg = configService.get<AppConfigShape>('app');
    this.apiKey = cfg?.helius?.apiKey || null;
    if (!this.apiKey) {
      this.logger.warn(
        'HELIUS_API_KEY missing — HeliusDasAdapter will return null',
      );
    }
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    if (chain.value !== 'solana') return null;
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.post<HeliusDasResponse>(
        `${HeliusDasAdapter.ENDPOINT}/?api-key=${this.apiKey}`,
        {
          jsonrpc: '2.0',
          id: 'helius-das',
          method: 'getAsset',
          params: {
            id: address,
            displayOptions: { showFungible: true },
          },
        },
        { timeout: 8000 },
      );
      if (data.error) return null;
      const result = data.result;
      if (!result) return null;
      const ti = result.token_info;
      const meta = result.content?.metadata;
      const imageUrl = result.content?.links?.image;
      const rawSupply = ti?.supply ? parseFloat(ti.supply) : null;
      const decimals = ti?.decimals ?? DECIMALS_FALLBACK;
      const totalSupply =
        rawSupply !== null ? rawSupply / Math.pow(10, decimals) : null;
      const rawPrice = ti?.price_info?.price_per_token;
      const priceUsd =
        typeof rawPrice === 'string'
          ? parseFloat(rawPrice)
          : (rawPrice ?? null);
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
    } catch (err) {
      this.logger.debug(`Helius DAS fetch failed: ${(err as Error).message}`);
      return null;
    }
  }
}
