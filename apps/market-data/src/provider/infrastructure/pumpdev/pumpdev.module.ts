import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PUMPDEV_CONFIG, PumpDevConfig } from './pumpdev.config';
import { PumpDevService } from './pumpdev.service';

@Module({
  providers: [
    {
      provide: PUMPDEV_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): PumpDevConfig =>
        cs.get<PumpDevConfig>('app.pumpdev') ?? {
          apiKey: '',
          walletPublic: '',
          walletPrivate: '',
        },
    },
    PumpDevService,
  ],
  exports: [PumpDevService],
})
export class PumpDevModule {
  public static forRoot(config: PumpDevConfig): DynamicModule {
    return {
      module: PumpDevModule,
      providers: [
        { provide: PUMPDEV_CONFIG, useValue: config },
        PumpDevService,
      ],
      exports: [PumpDevService],
    };
  }
}
