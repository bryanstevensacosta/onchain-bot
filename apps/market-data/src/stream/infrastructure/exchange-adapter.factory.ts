import { Injectable, Optional } from '@nestjs/common';
import { BirdeyeWsAdapter } from '../../provider/infrastructure/birdeye/birdeye-ws.client';
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
 *
 * `birdeye` bypasses the driver switch: it always builds the Birdeye
 * WS client (Birdeye WS realtime — `wss://public-api.birdeye.so/
 * socket/solana`, echo-protocol), the DEX source for onchain mints.
 * Key comes from `BIRDEYE_API_KEY`; `connect()` fails loudly without
 * it (never a silent dark feed). Allowlist via
 * `MARKET_DATA_STREAM_EXCHANGES` (add `birdeye` to enable).
 */
@Injectable()
export class DefaultExchangeAdapterFactory implements ExchangeAdapterFactory {
  public constructor(@Optional() private readonly driver?: string) {
    this.driver = driver ?? process.env.MARKET_DATA_STREAM_DRIVER ?? 'memory';
  }

  public create(exchange: string): ExchangeWsPort {
    if (exchange.toLowerCase() === 'birdeye') {
      return new BirdeyeWsAdapter(process.env.BIRDEYE_API_KEY ?? '');
    }
    if ((this.driver ?? 'memory').toLowerCase() === 'ccxt') {
      return new CcxtExchangeAdapter(exchange);
    }
    return new InMemoryExchangeAdapter(exchange);
  }
}
