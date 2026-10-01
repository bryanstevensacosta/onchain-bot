import { DynamicModule, Module } from '@nestjs/common';
import type { RugCheckConfig } from './rugcheck.config';
import { RUGCHECK_CONFIG } from './rugcheck.config';
import { RugCheckService } from './rugcheck.service';

@Module({
  providers: [
    { provide: RUGCHECK_CONFIG, useValue: { baseUrl: undefined } },
    RugCheckService,
  ],
  exports: [RugCheckService],
})
export class RugCheckModule {
  public static forRoot(config: RugCheckConfig): DynamicModule {
    return {
      module: RugCheckModule,
      providers: [
        { provide: RUGCHECK_CONFIG, useValue: config },
        RugCheckService,
      ],
      exports: [RugCheckService],
    };
  }
}
