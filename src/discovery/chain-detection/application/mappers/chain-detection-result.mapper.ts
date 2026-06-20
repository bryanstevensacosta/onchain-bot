import type { ChainDetectionResult } from 'discovery/chain-detection/domain/entities/chain-detection-result.entity';

export interface ChainDetectionResultView {
  readonly address: string;
  readonly resolvedChain: string;
  readonly confidence: number;
  readonly isContract: boolean | null;
  readonly scores: ReadonlyArray<{
    readonly chain: string;
    readonly points: number;
    readonly reasons: ReadonlyArray<string>;
  }>;
  readonly detectedAt: string;
}

export class ChainDetectionResultMapper {
  public static toView(result: ChainDetectionResult): ChainDetectionResultView {
    return {
      address: result.address,
      resolvedChain: result.resolvedChain.value,
      confidence: result.confidence,
      isContract: result.isContract,
      scores: result.scores.map((s) => ({
        chain: s.chain.value,
        points: s.points,
        reasons: [...s.reasons],
      })),
      detectedAt: result.detectedAt.toISOString(),
    };
  }
}
