import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MOBULA_CONFIG, MobulaConfig } from './mobula.config';
import { MobulaService } from './mobula.service';

@Module({
  providers: [
    {
      provide: MOBULA_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): MobulaConfig =>
        cs.get<MobulaConfig>('app.mobula') ?? { apiKey: '' },
    },
    MobulaService,
  ],
  exports: [MobulaService],
})
export class MobulaModule {
  public static forRoot(config: MobulaConfig): DynamicModule {
    return {
      module: MobulaModule,
      providers: [{ provide: MOBULA_CONFIG, useValue: config }, MobulaService],
      exports: [MobulaService],
    };
  }
}
