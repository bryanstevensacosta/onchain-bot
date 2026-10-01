import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GECKOTERMINAL_CONFIG,
  GeckoTerminalConfig,
} from './geckoterminal.config';
import { GeckoTerminalService } from './geckoterminal.service';

@Module({
  providers: [
    {
      provide: GECKOTERMINAL_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): GeckoTerminalConfig =>
        cs.get<GeckoTerminalConfig>('app.geckoterminal') ?? {},
    },
    GeckoTerminalService,
  ],
  exports: [GeckoTerminalService],
})
export class GeckoTerminalModule {
  public static forRoot(config: GeckoTerminalConfig): DynamicModule {
    return {
      module: GeckoTerminalModule,
      providers: [
        { provide: GECKOTERMINAL_CONFIG, useValue: config },
        GeckoTerminalService,
      ],
      exports: [GeckoTerminalService],
    };
  }
}
