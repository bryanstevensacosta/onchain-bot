import { ValueObject } from 'shared/kernel/value-object';
import type { KolReputationMetrics } from './kol-reputation-metrics.vo';

export type KolConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

interface KolReputationProps {
  readonly kolId: string;
  readonly score: number; // 0..1
  readonly metrics: KolReputationMetrics;
  readonly confidence: KolConfidence;
  readonly lastEvaluatedAt: Date;
}

/**
 * Aggregated reputation statistics for a Telegram KOL.
 *
 * `score` is a 0..1 reputation (default 0.5 if no data yet).
 *
 * `confidence` reflects how much data we have (based on
 * `metrics.totalMentions`):
 * - LOW:        0-4 mentions
 * - MEDIUM:     5-19
 * - HIGH:       20-49
 * - VERY_HIGH:  50+
 *
 * The detailed outcome counts and per-metric scores live in
 * `metrics` (jsonb). Adding a new outcome category (e.g. X20) is
 * a code change in the calculator, not a schema migration.
 */
export class KolReputation extends ValueObject<KolReputationProps> {
  protected constructor(props: KolReputationProps) {
    super(props);
  }

  public static fromValues(input: {
    kolId: string;
    score: number;
    metrics: KolReputationMetrics;
    confidence: KolConfidence;
    lastEvaluatedAt?: Date;
  }): KolReputation {
    return new KolReputation({
      ...input,
      lastEvaluatedAt: input.lastEvaluatedAt ?? new Date(),
    });
  }

  public static empty(kolId: string): KolReputation {
    return KolReputation.fromValues({
      kolId,
      score: 0.5,
      metrics: {
        totalMentions: 0,
        x2Count: 0,
        x5Count: 0,
        x10Count: 0,
        x50Count: 0,
        rug50Count: 0,
        rug80Count: 0,
        neutralCount: 0,
        mentionScore: 0.5,
        qualityScore: 0.5,
        drawdownScore: 0.5,
      },
      confidence: 'LOW',
    });
  }

  public get kolId(): string {
    return this.props.kolId;
  }
  public get score(): number {
    return this.props.score;
  }
  public get metrics(): KolReputationMetrics {
    return this.props.metrics;
  }
  public get confidence(): KolConfidence {
    return this.props.confidence;
  }
  public get lastEvaluatedAt(): Date {
    return this.props.lastEvaluatedAt;
  }

  public get isTrusted(): boolean {
    return this.props.score >= 0.7 && this.props.confidence !== 'LOW';
  }
  public get isSuspicious(): boolean {
    return this.props.score <= 0.3 && this.props.confidence !== 'LOW';
  }
}
