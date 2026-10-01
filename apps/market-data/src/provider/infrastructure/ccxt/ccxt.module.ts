import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CCXT_CONFIG, type CcxtConfig } from './ccxt.config';
import { CcxtService } from './ccxt.service';

function parseExchanges(raw: string | undefined): ReadonlyArray<string> {
  const list = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return list.length > 0 ? list : ['binance'];
}

@Module({
  providers: [
    {
      provide: CCXT_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): CcxtConfig => {
        const exchanges = parseExchanges(
          cs.get<string>('MARKET_DATA_CCXT_EXCHANGES'),
        );
        return { defaultExchange: exchanges[0], exchanges };
      },
    },
    CcxtService,
  ],
  exports: [CcxtService],
})
export class CcxtModule {}
