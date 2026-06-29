import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MORALIS_CONFIG, MoralisConfig } from './moralis.config';
import { MoralisService } from './moralis.service';

@Module({
  providers: [
    {
      provide: MORALIS_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): MoralisConfig =>
        cs.get<MoralisConfig>('app.moralis') ?? { apiKey: '' },
    },
    MoralisService,
  ],
  exports: [MoralisService],
})
export class MoralisModule {
  public static forRoot(config: MoralisConfig): DynamicModule {
    return {
      module: MoralisModule,
      providers: [
        { provide: MORALIS_CONFIG, useValue: config },
        MoralisService,
      ],
      exports: [MoralisService],
    };
  }
}
