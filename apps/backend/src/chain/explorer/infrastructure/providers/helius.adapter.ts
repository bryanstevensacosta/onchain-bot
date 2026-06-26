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

interface HeliusTokenAccount {
  readonly owner?: string;
}

interface HeliusGetTokenAccountsResponse {
  result?: {
    total?: number;
    token_accounts?: ReadonlyArray<HeliusTokenAccount>;
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
 * mint. We request up to 1000 accounts per page and report the maximum of
 * (a) the `total` field Helius reports as the indexed total, and
 * (b) the count of distinct `owner` addresses in the returned page.
 *
 * Taking the max guards against Helius's indexer lagging behind the chain
 * state for freshly minted tokens (where `total` may report 1 even though
 * many wallets already hold the token). For tokens with fewer than 1000
 * holders, the page count equals the true holder count modulo dedup.
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
            limit: 1000,
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
      const result = data.result;
      const total =
        typeof result?.total === 'number' && Number.isFinite(result.total)
          ? result.total
          : 0;
      const owners = new Set<string>();
      for (const acc of result?.token_accounts ?? []) {
        if (typeof acc.owner === 'string' && acc.owner.length > 0) {
          owners.add(acc.owner);
        }
      }
      const distinctOwners = owners.size;
      const holders =
        total > 0 || distinctOwners > 0
          ? Math.max(total, distinctOwners)
          : null;
      return {
        pairs: [],
        priceUsd: null,
        liquidityUsd: null,
        volume24hUsd: null,
        marketCapUsd: null,
        fdvUsd: null,
        priceChange24h: null,
        holders,
        top10HolderPercent: null,
        name: null,
        symbol: null,
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
