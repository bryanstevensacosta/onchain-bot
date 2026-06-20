import type { TokenClassification } from 'discovery/classification/domain/entities/token-classification.entity';

export interface RiskSignalView {
  readonly type: string;
  readonly severity: string;
  readonly description: string;
}

export interface TokenClassificationView {
  readonly id: string;
  readonly chain: string;
  readonly address: string;
  readonly classification: string;
  readonly confidence: number;
  readonly signals: ReadonlyArray<RiskSignalView>;
  readonly riskWeight: number;
  readonly highestSeverity: string | null;
  readonly snapshotCompleteness: number;
  readonly classifiedAt: string;
}

export class TokenClassificationMapper {
  public static toView(c: TokenClassification): TokenClassificationView {
    return {
      id: c.id,
      chain: c.chain.value,
      address: c.address,
      classification: c.classification.value,
      confidence: c.confidence,
      signals: c.signals.map((s) => ({
        type: s.type,
        severity: s.severity,
        description: s.description,
      })),
      riskWeight: c.riskWeight(),
      highestSeverity: c.highestSeverity(),
      snapshotCompleteness: c.snapshotCompleteness,
      classifiedAt: c.classifiedAt.toISOString(),
    };
  }
}
