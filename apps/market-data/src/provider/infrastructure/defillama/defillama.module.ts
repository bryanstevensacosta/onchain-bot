import { DynamicModule, Module } from '@nestjs/common';
import type { DefiLlamaConfig } from './defillama.config';
import { DEFILLAMA_CONFIG } from './defillama.config';
import { DefiLlamaService } from './defillama.service';

@Module({
  providers: [
    { provide: DEFILLAMA_CONFIG, useValue: { baseUrl: undefined } },
    DefiLlamaService,
  ],
  exports: [DefiLlamaService],
})
export class DefiLlamaModule {
  public static forRoot(config: DefiLlamaConfig): DynamicModule {
    return {
      module: DefiLlamaModule,
      providers: [
        { provide: DEFILLAMA_CONFIG, useValue: config },
        DefiLlamaService,
      ],
      exports: [DefiLlamaService],
    };
  }
}
