import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { COINGECKO_CONFIG, CoinGeckoConfig } from './coingecko.config';
import { CoinGeckoService } from './coingecko.service';

@Module({
  providers: [
    {
      provide: COINGECKO_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): CoinGeckoConfig =>
        cs.get<CoinGeckoConfig>('app.coingecko') ?? { apiKey: '' },
    },
    CoinGeckoService,
  ],
  exports: [CoinGeckoService, COINGECKO_CONFIG],
})
export class CoinGeckoModule {
  public static forRoot(config: CoinGeckoConfig): DynamicModule {
    return {
      module: CoinGeckoModule,
      providers: [
        { provide: COINGECKO_CONFIG, useValue: config },
        CoinGeckoService,
      ],
      exports: [CoinGeckoService, COINGECKO_CONFIG],
    };
  }
}
