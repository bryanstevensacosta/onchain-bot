import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEXSCREENER_CONFIG, DexScreenerConfig } from './dexscreener.config';
import { DexScreenerService } from './dexscreener.service';

@Module({
  providers: [
    {
      provide: DEXSCREENER_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): DexScreenerConfig =>
        cs.get<DexScreenerConfig>('app.dexscreener') ?? {},
    },
    DexScreenerService,
  ],
  exports: [DexScreenerService],
})
export class DexScreenerModule {
  public static forRoot(config: DexScreenerConfig): DynamicModule {
    return {
      module: DexScreenerModule,
      providers: [
        { provide: DEXSCREENER_CONFIG, useValue: config },
        DexScreenerService,
      ],
      exports: [DexScreenerService],
    };
  }
}
