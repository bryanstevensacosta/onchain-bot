import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'chain/explorer/domain/ports/market-data-provider.port';

interface AppConfigShape {
  readonly helius: {
    readonly apiKey: string;
    readonly mainnet: { readonly rpcUrl: string };
  };
}

interface HeliusJsonRpcError {
  code: number;
  message: string;
}

interface HeliusGetTokenAccountsResponse {
  result?: {
    total?: number;
    token_accounts?: ReadonlyArray<unknown>;
  };
  error?: HeliusJsonRpcError;
}

/**
 * Helius DAS `getTokenAccounts` market data provider — Solana only.
 *
 * Best for: exact holder count for any SPL token, even freshly minted ones
 * that are not yet indexed on GeckoTerminal / DexScreener / Birdeye.
 *
 * Uses Helius' Solana RPC endpoint (already configured via
 * `HELIUS_RPC_URL_MAINNET`, which embeds the API key) and the Digital Asset
 * Standard `getTokenAccounts` method, which paginates SPL token accounts by
 * mint. We request a single account (`limit: 1`) and read the `total` field
 * from the response — this gives us the exact holder count while costing a
 * single DAS request (10 credits on the Free tier).
 *
 * Only `holders` is populated; all other market fields are `null`. Downstream
 * `first-non-null` merge in `EnrichTokenUseCase` keeps richer providers
 * (DexScreener, GeckoTerminal, Birdeye) ahead of this adapter.
 */
@Injectable()
export class HeliusAdapter extends MarketDataProviderPort {
  public readonly name = 'helius';

  private readonly logger = new Logger(HeliusAdapter.name);
  private readonly rpcUrl: string | null;

  public constructor(configService: ConfigService) {
    super();
    const cfg = configService.get<AppConfigShape>('app');
    const apiKey = cfg?.helius?.apiKey ?? null;
    const baseRpcUrl = cfg?.helius?.mainnet?.rpcUrl ?? null;
    if (!apiKey || !baseRpcUrl) {
      this.logger.warn(
        'HELIUS_API_KEY or HELIUS_RPC_URL_MAINNET missing — Helius provider will return null',
      );
      this.rpcUrl = null;
      return;
    }
    this.rpcUrl = baseRpcUrl;
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    if (chain.value !== 'solana') {
      this.logger.warn(
        `HeliusAdapter invoked with non-solana chain: ${chain.value}`,
      );
      return null;
    }
    if (!this.rpcUrl) return null;
    try {
      const { data } = await axios.post<HeliusGetTokenAccountsResponse>(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          id: 'helius-holders',
          method: 'getTokenAccounts',
          params: {
            mint: address,
            page: 1,
            limit: 1,
          },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
        },
      );
      if (data.error) {
        this.logger.debug(`Helius RPC error: ${data.error.message}`);
        return null;
      }
      const total = data.result?.total;
      return {
        pairs: [],
        priceUsd: null,
        liquidityUsd: null,
        volume24hUsd: null,
        marketCapUsd: null,
        fdvUsd: null,
        priceChange24h: null,
        holders:
          typeof total === 'number' && Number.isFinite(total) ? total : null,
        top10HolderPercent: null,
        name: null,
        imageUrls: [],
        lockedLiquidityPercent: null,
        burnedPercent: null,
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Helius fetch failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
