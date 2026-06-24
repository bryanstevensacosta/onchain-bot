import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  LiveMarketDataPort,
  MarketDataItem,
} from '../../application/ports/live-market-data.port';

interface DexScreenerPair {
  marketCap: number | null;
  fdv: number | null;
}

interface DexScreenerTokenResponse {
  pairs: DexScreenerPair[] | null;
}

@Injectable()
export class DexScreenerLiveMarketDataAdapter extends LiveMarketDataPort {
  private readonly logger = new Logger(DexScreenerLiveMarketDataAdapter.name);
  private static readonly ENDPOINT =
    'https://api.dexscreener.com/latest/dex/tokens';
  private static readonly BATCH_LIMIT = 30;
  private static readonly TIMEOUT_MS = 5000;

  async fetchCurrentMc(
    _chain: string,
    address: string,
  ): Promise<number | null> {
    try {
      const { data } = await axios.get<DexScreenerTokenResponse>(
        `${DexScreenerLiveMarketDataAdapter.ENDPOINT}/${address}`,
        { timeout: DexScreenerLiveMarketDataAdapter.TIMEOUT_MS },
      );
      return this.extractMc(data.pairs);
    } catch (err) {
      this.logger.debug(
        `Live MC fetch failed for ${address}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async fetchCurrentMcBatch(
    items: ReadonlyArray<MarketDataItem>,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (items.length === 0) return result;

    const groups = new Map<string, string[]>();
    for (const item of items) {
      const list = groups.get(item.chain) ?? [];
      list.push(item.address);
      groups.set(item.chain, list);
    }

    await Promise.all(
      [...groups.entries()].map(async ([chain, addresses]) => {
        for (
          let i = 0;
          i < addresses.length;
          i += DexScreenerLiveMarketDataAdapter.BATCH_LIMIT
        ) {
          const slice = addresses.slice(
            i,
            i + DexScreenerLiveMarketDataAdapter.BATCH_LIMIT,
          );
          const csv = slice.join(',');
          try {
            const { data } = await axios.get<
              | { pairs: DexScreenerPair[] | null }
              | Record<string, DexScreenerTokenResponse>
            >(`${DexScreenerLiveMarketDataAdapter.ENDPOINT}/${csv}`, {
              timeout: DexScreenerLiveMarketDataAdapter.TIMEOUT_MS,
            });
            const map = this.parseBatchResponse(data, slice);
            for (const [addr, mc] of map.entries()) {
              result.set(this.key(chain, addr), mc);
            }
          } catch (err) {
            this.logger.debug(
              `Batch MC fetch failed for ${chain}: ${(err as Error).message}`,
            );
            for (const addr of slice) {
              const mc = await this.fetchCurrentMc(chain, addr);
              if (mc !== null) {
                result.set(this.key(chain, addr), mc);
              }
            }
          }
        }
      }),
    );

    return result;
  }

  private parseBatchResponse(
    data: unknown,
    addresses: ReadonlyArray<string>,
  ): Map<string, number> {
    const out = new Map<string, number>();
    if (!data) return out;
    if (Array.isArray((data as DexScreenerTokenResponse).pairs)) {
      const single = data as DexScreenerTokenResponse;
      const mc = this.extractMc(single.pairs);
      if (mc !== null && addresses[0]) {
        out.set(addresses[0].toLowerCase(), mc);
      }
      return out;
    }
    for (const addr of addresses) {
      const entry = (data as Record<string, DexScreenerTokenResponse>)[
        addr.toLowerCase()
      ];
      if (!entry) continue;
      const mc = this.extractMc(entry.pairs);
      if (mc !== null) {
        out.set(addr.toLowerCase(), mc);
      }
    }
    return out;
  }

  private extractMc(pairs: DexScreenerPair[] | null): number | null {
    if (!pairs || pairs.length === 0) return null;
    const best = pairs.reduce(
      (acc, p) => ((p.marketCap ?? 0) > (acc.marketCap ?? 0) ? p : acc),
      pairs[0],
    );
    const mc = best.marketCap ?? best.fdv ?? null;
    if (mc === null || mc <= 0) return null;
    return mc;
  }

  private key(chain: string, address: string): string {
    return `${chain}:${address.toLowerCase()}`;
  }
}
