import { Module } from '@nestjs/common';
import { ChainProberPort } from 'ca/chain-detection/domain/ports/chain-prober.port';
import { ChainDetectionRepository } from 'ca/chain-detection/application/ports/chain-detection.repository';
import { ChainDetectionEventPublisher } from 'ca/chain-detection/application/ports/chain-detection-event.publisher';
import { DetectChainUseCase } from 'ca/chain-detection/application/handlers/detect-chain.use-case';
import { GetDetectionResultUseCase } from 'ca/chain-detection/application/handlers/get-detection-result.use-case';
import { ListDetectionResultsUseCase } from 'ca/chain-detection/application/handlers/list-detection-results.use-case';
import { EvmChainProberAdapter } from 'ca/chain-detection/infrastructure/probers/evm-chain-prober.adapter';
import { SolanaChainProberAdapter } from 'ca/chain-detection/infrastructure/probers/solana-chain-prober.adapter';
import { InMemoryChainDetectionRepository } from 'ca/chain-detection/infrastructure/repositories/in-memory-chain-detection.repository';
import { InProcessChainDetectionEventPublisher } from 'ca/chain-detection/infrastructure/messaging/in-process-chain-detection-event.publisher';
import { CallNormalizedHandler } from 'ca/chain-detection/infrastructure/event-bus/call-normalized.handler';
import { ChainDetectionController } from 'ca/chain-detection/api/http/chain-detection.controller';
import { CHAIN_PROBERS } from 'ca/chain-detection/chain-detection.tokens';

/**
 * Chain Detection BC module.
 *
 * Consumes: `normalization.call.normalized` events (only for unresolved chains)
 * Emits:    `chain-detection.chain.detected` events
 *
 * Provides:
 * - EVM prober (Alchemy)
 * - Solana prober (Helius)
 * - Multi-chain inference + scoring (PRO per docs/api/misc/chain-detection.md)
 * - HTTP API for ad-hoc detection
 */
@Module({
  controllers: [ChainDetectionController],
  providers: [
    DetectChainUseCase,
    GetDetectionResultUseCase,
    ListDetectionResultsUseCase,
    EvmChainProberAdapter,
    SolanaChainProberAdapter,
    CallNormalizedHandler,
    {
      provide: ChainDetectionRepository,
      useClass: InMemoryChainDetectionRepository,
    },
    {
      provide: ChainDetectionEventPublisher,
      useClass: InProcessChainDetectionEventPublisher,
    },
    {
      provide: CHAIN_PROBERS,
      useFactory: (
        evm: EvmChainProberAdapter,
        sol: SolanaChainProberAdapter,
      ): ReadonlyArray<ChainProberPort> => [evm, sol],
      inject: [EvmChainProberAdapter, SolanaChainProberAdapter],
    },
  ],
  exports: [ChainDetectionRepository, ChainDetectionEventPublisher],
})
export class ChainDetectionModule {}
