import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SolanaRpcConfig } from './solana-rpc.config';
import { SOLANA_RPC_CONFIG } from './solana-rpc.config';
import { SolanaRpcService } from './solana-rpc.service';

const DEFAULT_CONFIG: SolanaRpcConfig = {
  primaryRpcUrl: undefined,
  fallbackRpcUrl: 'https://api.mainnet.solana.com',
};

@Module({
  providers: [
    {
      provide: SOLANA_RPC_CONFIG,
      inject: [ConfigService],
      useFactory: (cs: ConfigService): SolanaRpcConfig => ({
        primaryRpcUrl:
          cs.get<string>('app.solanaRpc.primaryRpcUrl') ||
          DEFAULT_CONFIG.primaryRpcUrl,
        fallbackRpcUrl:
          cs.get<string>('app.solanaRpc.fallbackRpcUrl') ??
          DEFAULT_CONFIG.fallbackRpcUrl,
        chainstackApiKey:
          cs.get<string>('app.solanaRpc.chainstackApiKey') ?? '',
        chainstackChains:
          cs.get<string>('app.solanaRpc.chainstackChains') ?? '',
        shyftApiKey: cs.get<string>('app.solanaRpc.shyftApiKey') ?? '',
      }),
    },
    SolanaRpcService,
  ],
  exports: [SolanaRpcService],
})
export class SolanaRpcModule {
  public static forRoot(config: SolanaRpcConfig): DynamicModule {
    return {
      module: SolanaRpcModule,
      providers: [
        { provide: SOLANA_RPC_CONFIG, useValue: config },
        SolanaRpcService,
      ],
      exports: [SolanaRpcService],
    };
  }
}
