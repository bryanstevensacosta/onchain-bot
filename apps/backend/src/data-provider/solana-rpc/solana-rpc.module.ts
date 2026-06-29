import { DynamicModule, Module } from '@nestjs/common';
import type { SolanaRpcConfig } from './solana-rpc.config';
import { SOLANA_RPC_CONFIG } from './solana-rpc.config';
import { SolanaRpcService } from './solana-rpc.service';

const DEFAULT_CONFIG: SolanaRpcConfig = {
  primaryRpcUrl: undefined,
  fallbackRpcUrl: 'https://api.mainnet.solana.com',
};

@Module({
  providers: [
    { provide: SOLANA_RPC_CONFIG, useValue: DEFAULT_CONFIG },
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
