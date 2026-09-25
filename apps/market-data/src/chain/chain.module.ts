import { Module } from '@nestjs/common';
import { ChainCatalogPort } from './application/ports/chain-catalog.port';
import { CHAIN_PROBERS } from './application/ports/chain-prober.port';
import { StaticChainCatalog } from './static-chain-catalog';
import { DetectChainService } from './application/detect-chain.service';
import { EvmChainProber } from './infrastructure/probers/evm-chain.prober';
import { SolanaChainProber } from './infrastructure/probers/solana-chain.prober';

/**
 * ChainModule (Tramo 3, todo 2, P43).
 *
 * Exposes PORTS only (catalog + probers + detect-chain) — no
 * controllers. The HTTP surface lives in src/gateway/.
 */
@Module({
  providers: [
    StaticChainCatalog,
    EvmChainProber,
    SolanaChainProber,
    DetectChainService,
    { provide: ChainCatalogPort, useExisting: StaticChainCatalog },
    {
      provide: CHAIN_PROBERS,
      useFactory: (evm: EvmChainProber, solana: SolanaChainProber) => [evm, solana],
      inject: [EvmChainProber, SolanaChainProber],
    },
  ],
  exports: [ChainCatalogPort, StaticChainCatalog, DetectChainService, CHAIN_PROBERS],
})
export class ChainModule {}
