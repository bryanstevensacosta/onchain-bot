import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ALCHEMY_CONFIG, AlchemyConfig } from './alchemy.config';
import { AlchemyService } from './alchemy.service';
import { MulticallService } from './multicall.service';

@Module({
  providers: [
    {
      provide: ALCHEMY_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): AlchemyConfig =>
        cs.get<AlchemyConfig>('app.alchemy') ?? { apiKey: '' },
    },
    AlchemyService,
    MulticallService,
  ],
  exports: [AlchemyService, MulticallService],
})
export class AlchemyModule {
  public static forRoot(config: AlchemyConfig): DynamicModule {
    return {
      module: AlchemyModule,
      providers: [
        { provide: ALCHEMY_CONFIG, useValue: config },
        AlchemyService,
        MulticallService,
      ],
      exports: [AlchemyService, MulticallService],
    };
  }
}
