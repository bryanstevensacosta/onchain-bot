import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export type ScoreTierValue =
  | 'STRONG'
  | 'DECENT'
  | 'NEUTRAL'
  | 'RISKY'
  | 'AVOID';

interface ScoreTierProps {
  readonly value: ScoreTierValue;
}

/**
 * Quality tier derived from a 0-100 token score.
 *
 * v1 thresholds (from `default-message-formatter.adapter.ts`):
 * - >= 80  → STRONG  (3 fire emojis, published to all tiers)
 * - >= 60  → DECENT  (2 fire emojis, published to PRIMARY+SECONDARY)
 * - >= 40  → NEUTRAL (1 fire emoji,  published to PRIMARY)
 * - >= 20  → RISKY   (warning emoji,   published to PRIMARY only with flag)
 * - <  20  → AVOID   (block emoji,     NOT published)
 *
 * Used by:
 * - `OutputChannelResolverPort.listForTier(tier)` — maps to PRIMARY/SECONDARY/PREMIUM
 * - `DefaultMessageFormatterAdapter` — picks emoji and visual emphasis
 *
 * Created from a raw score via `ScoreTier.fromScore(score)`. Carrying
 * the VO instead of the raw number eliminates the duplicated
 * threshold logic that previously existed in 3+ places.
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

  public static fromScore(score: number): ScoreTier {
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Score must be 0..100, got ${score}`,
        { score },
      );
    }
    if (score >= 80) return ScoreTier.STRONG;
    if (score >= 60) return ScoreTier.DECENT;
    if (score >= 40) return ScoreTier.NEUTRAL;
    if (score >= 20) return ScoreTier.RISKY;
    return ScoreTier.AVOID;
  }

  public get value(): ScoreTierValue {
    return this.props.value;
  }

  public isPublishable(): boolean {
    return this.props.value !== 'AVOID';
  }
}
