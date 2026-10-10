import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ETHERSCAN_CONFIG, EtherscanConfig } from './etherscan.config';
import { EtherscanService } from './etherscan.service';

@Module({
  providers: [
    {
      provide: ETHERSCAN_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): EtherscanConfig =>
        cs.get<EtherscanConfig>('app.etherscan') ?? { apiKey: '' },
    },
    EtherscanService,
  ],
  exports: [EtherscanService],
})
export class EtherscanModule {
  public static forRoot(config: EtherscanConfig): DynamicModule {
    return {
      module: EtherscanModule,
      providers: [
        { provide: ETHERSCAN_CONFIG, useValue: config },
        EtherscanService,
      ],
      exports: [EtherscanService],
    };
  }
}
