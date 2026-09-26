import { ValueObject } from '../../../shared/kernel/value-object';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';

export type ScoreTierValue = 'STRONG' | 'DECENT' | 'NEUTRAL' | 'RISKY' | 'AVOID';

interface ScoreTierProps {
  readonly value: ScoreTierValue;
}

export interface ScoringTierThresholds {
  readonly strong: number;
  readonly decent: number;
  readonly neutral: number;
  readonly risky: number;
}

/** Default v1 thresholds (backend mirror): 80/60/40/20. */
export const DEFAULT_TIER_THRESHOLDS: ScoringTierThresholds = {
  strong: 80,
  decent: 60,
  neutral: 40,
  risky: 20,
};

/**
 * Quality tier derived from a 0-100 mention score (Tramo 1, todo 9).
 *
 * Backend mirror (`apps/backend/.../score-tier.vo.ts` read-only):
 * - >= 80 → STRONG · >= 60 → DECENT · >= 40 → NEUTRAL
 * - >= 20 → RISKY · < 20 → AVOID (never published)
 */
export class ScoreTier extends ValueObject<ScoreTierProps> {
  public static readonly STRONG = new ScoreTier({ value: 'STRONG' });
  public static readonly DECENT = new ScoreTier({ value: 'DECENT' });
  public static readonly NEUTRAL = new ScoreTier({ value: 'NEUTRAL' });
  public static readonly RISKY = new ScoreTier({ value: 'RISKY' });
  public static readonly AVOID = new ScoreTier({ value: 'AVOID' });

  protected constructor(props: ScoreTierProps) {
    super(props);
  }

  public static fromScore(score: number, thresholds: ScoringTierThresholds): ScoreTier {
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new DomainError(ErrorCode.VALIDATION, `Score must be 0..100, got ${score}`, {
        score,
      });
    }
    if (score >= thresholds.strong) return ScoreTier.STRONG;
    if (score >= thresholds.decent) return ScoreTier.DECENT;
    if (score >= thresholds.neutral) return ScoreTier.NEUTRAL;
    if (score >= thresholds.risky) return ScoreTier.RISKY;
    return ScoreTier.AVOID;
  }

  public static fromString(value: string): ScoreTier {
    switch (value) {
      case 'STRONG':
        return ScoreTier.STRONG;
      case 'DECENT':
        return ScoreTier.DECENT;
      case 'NEUTRAL':
        return ScoreTier.NEUTRAL;
      case 'RISKY':
        return ScoreTier.RISKY;
      case 'AVOID':
        return ScoreTier.AVOID;
      default:
        throw new DomainError(ErrorCode.VALIDATION, `Unknown ScoreTier value: ${value}`, {
          value,
        });
    }
  }

  public get value(): ScoreTierValue {
    return this.props.value;
  }

  public isPublishable(): boolean {
    return this.props.value !== 'AVOID';
  }
}
