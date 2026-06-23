import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChainDetectionResult } from 'chain/detection/domain/entities/chain-detection-result.entity';
import { ChainDetectionScore } from 'chain/detection/domain/value-objects/chain-detection-score.vo';
import { ChainId } from 'chain/identity/chain-id.vo';
import { ChainProberPort } from 'chain/detection/domain/ports/chain-prober.port';
import { scorerForChain } from 'chain/detection/infrastructure/probers/scorer-for-chain';
import { ChainDetectionRepository } from 'chain/detection/application/ports/chain-detection.repository';
import { ChainDetectionEventPublisher } from 'chain/detection/application/ports/chain-detection-event.publisher';
import {
  ChainDetectionResultMapper,
  ChainDetectionResultView,
} from 'chain/detection/application/mappers/chain-detection-result.mapper';
import { CHAIN_PROBERS } from 'chain/detection/chain-detection.tokens';

export interface DetectChainInput {
  readonly address: string;
}

/**
 * Use case: probe an address against all registered chain probers in
 * parallel, score the results, pick the winner, persist, emit event.
 *
 * Cache: same address within TTL (always true since results are
 * immutable after creation) returns the cached view.
 *
 * Concurrency: probers run in `Promise.allSettled` so one chain's
 * RPC outage doesn't block detection.
 *
 * Scoring: each chain's scoring rules live in `score-<family>-probe.ts`.
 * Adding a new family = new scorer file + 1 line in `scorerForChain`.
 */
@Injectable()
export class DetectChainUseCase {
  private readonly logger = new Logger(DetectChainUseCase.name);

  public constructor(
    @Inject(CHAIN_PROBERS)
    private readonly probers: ReadonlyArray<ChainProberPort>,
    private readonly resultRepo: ChainDetectionRepository,
    private readonly eventPublisher: ChainDetectionEventPublisher,
  ) {
    if (probers.length === 0) {
      throw new Error(
        'DetectChainUseCase requires at least one ChainProberPort',
      );
    }
  }

  public async execute(
    input: DetectChainInput,
  ): Promise<ChainDetectionResultView> {
    const address = input.address.trim();
    if (!address) {
      throw new Error('address cannot be empty');
    }

    const normalized = address.toLowerCase();
    const cached = await this.resultRepo.findByAddress(normalized);
    if (cached) {
      this.logger.debug(`Cache hit for ${normalized}`);
      return ChainDetectionResultMapper.toView(cached);
    }

    const settled = await Promise.allSettled(
      this.probers.map((p) => p.probe(address)),
    );

    const scores: ChainDetectionScore[] = [];
    let isContract: boolean | null = null;
    let isContractSet = false;

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const prober = this.probers[i];
      const chain = ChainId.fromString(prober.chainName);
      const scorer = scorerForChain(chain);
      const { points, reasons } = scorer(result);
      scores.push(
        ChainDetectionScore.create({
          chain,
          points,
          reasons,
        }),
      );
      if (
        result.status === 'fulfilled' &&
        result.value.isContract !== null &&
        !isContractSet
      ) {
        isContract = result.value.isContract;
        isContractSet = true;
      }
    }

    if (scores.every((s) => s.points === 0)) {
      throw new Error(`No chain matched address: ${address}`);
    }

    const result = ChainDetectionResult.create({
      address,
      scores,
      isContract,
    });

    await this.resultRepo.save(result);
    result.emitDetected();
    await this.eventPublisher.publishAll(result.commit());

    return ChainDetectionResultMapper.toView(result);
  }
}
