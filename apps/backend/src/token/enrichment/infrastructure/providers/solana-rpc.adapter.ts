import { Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  MarketData,
  MarketDataProviderPort,
} from 'token/enrichment/domain/ports/market-data-provider.port';
import { SolanaRpcService } from 'data-provider/solana-rpc/solana-rpc.service';

@Injectable()
export class SolanaRpcAdapter extends MarketDataProviderPort {
  public readonly name = 'solana-rpc';
  private readonly logger = new Logger(SolanaRpcAdapter.name);

  public constructor(private readonly service: SolanaRpcService) {
    super();
  }

  public async fetch(
    chain: ChainId,
    address: string,
  ): Promise<MarketData | null> {
    if (chain.value !== 'solana') return null;

    const accounts = await this.service.getTokenLargestAccounts(address);
    if (!accounts || accounts.length === 0) return null;

    return this.mapAccounts(accounts);
  }

  private mapAccounts(
    accounts: ReadonlyArray<{
      readonly amount: string;
    }>,
  ): MarketData {
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
      symbol: null,
      imageUrls: [],
      lockedLiquidityPercent: null,
      burnedPercent: null,
    };
  }
}
