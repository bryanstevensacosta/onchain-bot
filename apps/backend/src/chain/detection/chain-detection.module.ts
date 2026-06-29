import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { ChainProberPort } from 'chain/detection/domain/ports/chain-prober.port';
import { ChainDetectionRepository } from 'chain/detection/application/ports/chain-detection.repository';
import { ChainDetectionEventPublisher } from 'chain/detection/application/ports/chain-detection-event.publisher';
import { DetectChainUseCase } from 'chain/detection/application/handlers/detect-chain.use-case';
import { GetDetectionResultUseCase } from 'chain/detection/application/handlers/get-detection-result.use-case';
import { ListDetectionResultsUseCase } from 'chain/detection/application/handlers/list-detection-results.use-case';
import { EvmChainProberAdapter } from 'chain/detection/infrastructure/probers/evm-chain-prober.adapter';
import { SolanaChainProberAdapter } from 'chain/detection/infrastructure/probers/solana-chain-prober.adapter';
import { InMemoryChainDetectionRepository } from 'chain/detection/infrastructure/repositories/in-memory-chain-detection.repository';
import { ChainDetectionResultEntity } from 'chain/detection/infrastructure/persistence/typeorm/entities/chain-detection-result.entity';
import { TypeOrmChainDetectionRepository } from 'chain/detection/infrastructure/persistence/typeorm/repositories/typeorm-chain-detection.repository';
import { InProcessChainDetectionEventPublisher } from 'chain/detection/infrastructure/messaging/in-process-chain-detection-event.publisher';
import { CallNormalizedHandler } from 'chain/detection/infrastructure/event-bus/call-normalized.handler';
import { ChainDetectionController } from 'chain/detection/api/http/chain-detection.controller';
import { CHAIN_PROBERS } from 'chain/detection/chain-detection.tokens';

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
 *
 * N18: ChainDetectionResult persisted via TypeORM (Tier-2).
 */
@Module({
  imports: [TypeOrmModule.forFeature([ChainDetectionResultEntity])],
  controllers: [ChainDetectionController],
  providers: [
    DetectChainUseCase,
    GetDetectionResultUseCase,
    ListDetectionResultsUseCase,
    EvmChainProberAdapter,
    SolanaChainProberAdapter,
    CallNormalizedHandler,
    InMemoryChainDetectionRepository,
    ...(isDatabaseEnabled() ? [TypeOrmChainDetectionRepository] : []),
    {
      provide: ChainDetectionRepository,
      inject: [
        InMemoryChainDetectionRepository,
        ...(isDatabaseEnabled() ? [TypeOrmChainDetectionRepository] : []),
      ],
      useFactory: (
        inMemory: InMemoryChainDetectionRepository,
        typeorm?: TypeOrmChainDetectionRepository,
      ): ChainDetectionRepository => typeorm ?? inMemory,
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
  exports: [
    ChainDetectionRepository,
    ChainDetectionEventPublisher,
    DetectChainUseCase,
  ],
})
export class ChainDetectionModule {}
