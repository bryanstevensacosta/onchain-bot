import { Inject, Injectable, Optional } from '@nestjs/common';
import { LOCAL_CASCADE_DELEGATES } from '../../enrichment.tokens';
import {
  MarketData,
  MarketDataPort,
} from '../../domain/ports/market-data.port';

/**
 * Local-cascade leaf (DEFAULT while `USE_DATA_SERVICE_API` is unset/false).
 *
 * Tramo 1 holds NO physical providers (C-DATA-01: nothing is moved out of
 * the backend; market-data is not called yet), so with zero inner delegates
 * this adapter resolves null without touching the network. Inner delegates
 * exist for tests and for Tramo 3 in-process providers: they are tried IN
 * ORDER, first non-null wins; a throwing delegate is skipped (silent-null)
 * and the cascade continues.
 */
@Injectable()
export class LocalCascadeMarketDataAdapter extends MarketDataPort {
  public readonly name = 'local-cascade';

  public constructor(
    @Optional()
    @Inject(LOCAL_CASCADE_DELEGATES)
    private readonly delegates: ReadonlyArray<MarketDataPort> = [],
  ) {
    super();
  }

  public async fetch(
    chain: string,
    address: string,
  ): Promise<MarketData | null> {
    for (const delegate of this.delegates) {
      try {
        const data = await delegate.fetch(chain, address);
        if (data !== null) {
          return data;
        }
      } catch {
        continue;
      }
    }
    return null;
  }
}
