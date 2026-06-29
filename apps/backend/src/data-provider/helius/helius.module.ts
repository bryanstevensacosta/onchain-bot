import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HELIUS_CONFIG, HeliusConfig } from './helius.config';
import { HeliusService } from './helius.service';

@Module({
  providers: [
    {
      provide: HELIUS_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): HeliusConfig =>
        cs.get<HeliusConfig>('app.helius') ?? {
          apiKey: '',
          mainnet: { rpcUrl: '' },
        },
    },
    HeliusService,
  ],
  exports: [HeliusService],
})
export class HeliusModule {
  public static forRoot(config: HeliusConfig): DynamicModule {
    return {
      module: HeliusModule,
      providers: [{ provide: HELIUS_CONFIG, useValue: config }, HeliusService],
      exports: [HeliusService],
    };
  }
}
