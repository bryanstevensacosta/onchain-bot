/**
 * Numeric metrics parsed from a Telegram alpha call — promoted to shared common.
 *
 * Originally owned by `ca/parsing/domain/value-objects/token-metrics.vo.ts`.
 * Promoted because it is shared between `parsing` (producer) and
 * `normalization` (consumer) BCs, and the shape is part of the cross-BC
 * contract that downstream BCs (enrichment, classification, scoring)
 * also reference.
 *
 * All fields are optional because not every message includes every metric.
 * A value of `null` means "not mentioned / not parseable", not "zero".
 *
 * IMPORTANT: This is a **shared common contract**. Changing the payload
 * (renaming fields, changing types) is a breaking change for all importing BCs.
 */
import { ValueObject } from 'shared/kernel/value-object';

interface TokenMetricsProps {
  readonly marketCapUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly fdvUsd: number | null;
  readonly holders: number | null;
}

export class TokenMetrics extends ValueObject<TokenMetricsProps> {
  protected constructor(props: TokenMetricsProps) {
    super(props);
  }

  public static empty(): TokenMetrics {
    return new TokenMetrics({
      marketCapUsd: null,
      liquidityUsd: null,
      fdvUsd: null,
      holders: null,
    });
  }

  public static create(props: TokenMetricsProps): TokenMetrics {
    return new TokenMetrics(props);
  }

  public get marketCapUsd(): number | null {
    return this.props.marketCapUsd;
  }
  public get liquidityUsd(): number | null {
    return this.props.liquidityUsd;
  }
  public get fdvUsd(): number | null {
    return this.props.fdvUsd;
  }
  public get holders(): number | null {
    return this.props.holders;
  }

  public get completeness(): number {
    const fields = [
      this.props.marketCapUsd,
      this.props.liquidityUsd,
      this.props.fdvUsd,
      this.props.holders,
    ];
    const present = fields.filter((f) => f !== null).length;
    return present / fields.length;
  }
}
