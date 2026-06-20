import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChainDetectionResult } from 'discovery/chain-detection/domain/entities/chain-detection-result.entity';
import { ChainDetectionScore } from 'discovery/chain-detection/domain/value-objects/chain-detection-score.vo';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { ChainProberPort } from 'discovery/chain-detection/domain/ports/chain-prober.port';
import { ChainDetectionRepository } from 'discovery/chain-detection/application/ports/chain-detection.repository';
import { ChainDetectionEventPublisher } from 'discovery/chain-detection/application/ports/chain-detection-event.publisher';
import {
  ChainDetectionResultMapper,
  ChainDetectionResultView,
} from 'discovery/chain-detection/application/mappers/chain-detection-result.mapper';
import { CHAIN_PROBERS } from 'discovery/chain-detection/chain-detection.tokens';

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
      const pointsAndReasons = scoreFromProbe(result, prober.chainName);
      scores.push(
        ChainDetectionScore.create({
          chain,
          points: pointsAndReasons.points,
          reasons: pointsAndReasons.reasons,
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

function scoreFromProbe(
  result: PromiseSettledResult<{
    responded: boolean;
    isContract: boolean | null;
    notes: string[];
  }>,
  chainName: string,
): { points: number; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;

  if (result.status === 'rejected') {
    reasons.push(`probe:${chainName}:error`);
    return { points: 0, reasons };
  }

  const value = result.value;

  if (
    chainName === 'ethereum' ||
    chainName === 'bsc' ||
    chainName === 'base' ||
    chainName === 'arbitrum' ||
    chainName === 'polygon'
  ) {
    if (value.responded) {
      points += 20;
      reasons.push(`rpc:responded`);
    }
    if (value.isContract === true) {
      points += 10;
      reasons.push(`has_code:true`);
    }
  } else if (chainName === 'solana') {
    if (value.responded) {
      points += 30;
      reasons.push(`rpc:responded`);
    }
    if (value.isContract === true) {
      points += 30;
      reasons.push(`account:exists`);
    }
  }

  reasons.push(...value.notes.map((n) => `note:${n}`));
  return { points, reasons };
}
