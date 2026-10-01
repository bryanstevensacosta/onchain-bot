import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BIRDEYE_CONFIG, BirdeyeConfig } from './birdeye.config';
import { BirdeyeService } from './birdeye.service';

@Module({
  providers: [
    {
      provide: BIRDEYE_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): BirdeyeConfig =>
        cs.get<BirdeyeConfig>('app.birdeye') ?? { apiKey: '' },
    },
    BirdeyeService,
  ],
  exports: [BirdeyeService],
})
export class BirdeyeModule {
  public static forRoot(config: BirdeyeConfig): DynamicModule {
    return {
      module: BirdeyeModule,
      providers: [
        { provide: BIRDEYE_CONFIG, useValue: config },
        BirdeyeService,
      ],
      exports: [BirdeyeService],
    };
  }
}
