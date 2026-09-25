import { Injectable, Optional } from '@nestjs/common';
import { CcxtExchangeAdapter } from './ccxt-exchange.adapter';
import { InMemoryExchangeAdapter } from './in-memory-exchange.adapter';
import type {
  ExchangeAdapterFactory,
  ExchangeWsPort,
} from 'stream/domain/exchange-ws.port';

/**
 * Exchange adapter factory (Tramo 3, todo 11, P49 — stream infrastructure).
 *
 * Driver switch: `MARKET_DATA_STREAM_DRIVER=ccxt` builds the real
 * ccxt.pro adapter (operator-gated: needs the optional ccxt.pro peer
 * + credentials + network); anything else builds the deterministic
 * in-memory driver (dev/test default, zero new deps).
 */
@Injectable()
export class DefaultExchangeAdapterFactory implements ExchangeAdapterFactory {
  public constructor(@Optional() private readonly driver?: string) {
    this.driver = driver ?? process.env.MARKET_DATA_STREAM_DRIVER ?? 'memory';
  }

  public create(exchange: string): ExchangeWsPort {
    if ((this.driver ?? 'memory').toLowerCase() === 'ccxt') {
      return new CcxtExchangeAdapter(exchange);
    }
    return new InMemoryExchangeAdapter(exchange);
  }
}
