import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  COINMARKETCAP_CONFIG,
  CoinMarketCapConfig,
} from './coinmarketcap.config';
import { CoinMarketCapService } from './coinmarketcap.service';

@Module({
  providers: [
    {
      provide: COINMARKETCAP_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): CoinMarketCapConfig =>
        cs.get<CoinMarketCapConfig>('app.coinmarketcap') ?? { apiKey: '' },
    },
    CoinMarketCapService,
  ],
  exports: [CoinMarketCapService],
})
export class CoinMarketCapModule {
  public static forRoot(config: CoinMarketCapConfig): DynamicModule {
    return {
      module: CoinMarketCapModule,
      providers: [
        { provide: COINMARKETCAP_CONFIG, useValue: config },
        CoinMarketCapService,
      ],
      exports: [CoinMarketCapService],
    };
  }
}
