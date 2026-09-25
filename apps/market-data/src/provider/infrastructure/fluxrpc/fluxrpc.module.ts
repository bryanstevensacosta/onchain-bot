import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FLUXRPC_CONFIG, FluxRpcConfig } from './fluxrpc.config';
import { FluxRpcService } from './fluxrpc.service';

@Module({
  providers: [
    {
      provide: FLUXRPC_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): FluxRpcConfig =>
        cs.get<FluxRpcConfig>('app.fluxrpc') ?? { apiKey: '', rpcUrl: '' },
    },
    FluxRpcService,
  ],
  exports: [FluxRpcService],
})
export class FluxRpcModule {
  public static forRoot(config: FluxRpcConfig): DynamicModule {
    return {
      module: FluxRpcModule,
      providers: [
        { provide: FLUXRPC_CONFIG, useValue: config },
        FluxRpcService,
      ],
      exports: [FluxRpcService],
    };
  }
}
