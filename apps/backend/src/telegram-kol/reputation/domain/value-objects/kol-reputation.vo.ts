import { ValueObject } from 'shared/kernel/value-object';

export type KolConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

interface KolReputationProps {
  readonly kolId: string;
  readonly score: number; // 0..1
  readonly totalCalls: number;
  readonly strongCalls: number;
  readonly goodCalls: number;
  readonly neutralCalls: number;
  readonly poorCalls: number;
  readonly failedCalls: number;
  readonly avgAthMultiple: number | null;
  readonly confidence: KolConfidence;
  readonly lastEvaluatedAt: Date;
}

/**
 * Aggregated reputation statistics for a Telegram KOL.
 *
 * `score` is a 0..1 reputation (default 0.5 if no data yet).
 *
 * `confidence` reflects how much data we have:
 * - LOW:        0-4 calls
 * - MEDIUM:     5-19
 * - HIGH:       20-49
 * - VERY_HIGH:  50+
 *
 * Channels with LOW confidence should be treated as neutral.
 *
 * This is the rich aggregate owned by the reputation BC. The lightweight
 * `KolReputationSummary` (in `token/scoring/`) is the projection scoring
 * consumes; the two should not be confused.
 */
export class KolReputation extends ValueObject<KolReputationProps> {
  protected constructor(props: KolReputationProps) {
    super(props);
  }

  public static fromValues(input: {
    kolId: string;
    score: number;
    totalCalls: number;
    strongCalls: number;
    goodCalls: number;
    neutralCalls: number;
    poorCalls: number;
    failedCalls: number;
    avgAthMultiple: number | null;
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
      totalCalls: 0,
      strongCalls: 0,
      goodCalls: 0,
      neutralCalls: 0,
      poorCalls: 0,
      failedCalls: 0,
      avgAthMultiple: null,
      confidence: 'LOW',
    });
  }

  public get kolId(): string {
    return this.props.kolId;
  }
  public get score(): number {
    return this.props.score;
  }
  public get totalCalls(): number {
    return this.props.totalCalls;
  }
  public get strongCalls(): number {
    return this.props.strongCalls;
  }
  public get goodCalls(): number {
    return this.props.goodCalls;
  }
  public get neutralCalls(): number {
    return this.props.neutralCalls;
  }
  public get poorCalls(): number {
    return this.props.poorCalls;
  }
  public get failedCalls(): number {
    return this.props.failedCalls;
  }
  public get avgAthMultiple(): number | null {
    return this.props.avgAthMultiple;
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

  public successRate(): number {
    if (this.props.totalCalls === 0) return 0;
    return (
      (this.props.strongCalls + this.props.goodCalls) / this.props.totalCalls
    );
  }

  public failureRate(): number {
    if (this.props.totalCalls === 0) return 0;
    return this.props.failedCalls / this.props.totalCalls;
  }
}
