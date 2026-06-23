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

interface GetTokenLargestAccountsResponse {
  result?: {
    context?: {
      slot: number;
    };
    value?: ReadonlyArray<{
      address: string;
      amount: string;
      decimals: number;
      uiAmount: number | null;
      uiAmountString: string;
    }>;
  };
  error?: HeliusJsonRpcError;
}

@Injectable()
export class SolanaRpcAdapter extends MarketDataProviderPort {
  public readonly name = 'solana-rpc';

  private readonly logger = new Logger(SolanaRpcAdapter.name);
  private readonly rpcUrl: string | null;

  public constructor(configService: ConfigService) {
    super();
    const cfg = configService.get<AppConfigShape>('app');
    const baseRpcUrl = cfg?.helius?.mainnet?.rpcUrl ?? null;
    if (!baseRpcUrl) {
      this.logger.warn(
        'HELIUS_RPC_URL_MAINNET missing — SolanaRpcAdapter will return null',
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
      this.logger.debug(
        `SolanaRpcAdapter invoked with non-solana chain: ${chain.value}`,
      );
      return null;
    }
    if (!this.rpcUrl) return null;
    try {
      const { data } = await axios.post<GetTokenLargestAccountsResponse>(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          id: 'solana-rpc-holders',
          method: 'getTokenLargestAccounts',
          params: [address],
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        },
      );
      if (data.error) {
        this.logger.debug(`SolanaRpcAdapter RPC error: ${data.error.message}`);
        return null;
      }
      const accounts = data.result?.value;
      if (!accounts || accounts.length === 0) {
        return null;
      }

      let totalTop20 = 0n;
      for (const acc of accounts) {
        totalTop20 += BigInt(acc.amount);
      }

      let top10Amount = 0n;
      const top10Count = Math.min(10, accounts.length);
      for (let i = 0; i < top10Count; i++) {
        top10Amount += BigInt(accounts[i].amount);
      }

      const top10HolderPercent =
        totalTop20 > 0n
          ? Number((top10Amount * 10000n) / totalTop20) / 100
          : null;

      const holders = accounts.length > 0 ? accounts.length : null;

      return {
        pairs: [],
        priceUsd: null,
        liquidityUsd: null,
        volume24hUsd: null,
        marketCapUsd: null,
        fdvUsd: null,
        priceChange24h: null,
        holders,
        top10HolderPercent,
        name: null,
        imageUrls: [],
        lockedLiquidityPercent: null,
        burnedPercent: null,
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `SolanaRpcAdapter fetch failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
