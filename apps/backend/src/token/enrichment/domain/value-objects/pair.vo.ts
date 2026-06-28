import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface PairProps {
  readonly address: string;
  readonly dexId: string;
  readonly quoteToken: string;
  readonly reserveUsd: number;
}

/**
 * A DEX trading pair.
 *
 * Identifier: `${dexId}:${pairAddress}`
 *
 * `reserveUsd` is the total USD value locked in the pair (sum of both
 * sides). Used to pick the "primary pair" — the one with deepest
 * liquidity for this token.
 */
export class Pair extends ValueObject<PairProps> {
  protected constructor(props: PairProps) {
    super(props);
  }

  public static create(input: {
    address: string;
    dexId: string;
    quoteToken: string;
    reserveUsd: number;
  }): Pair {
    if (!input.address) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Pair address cannot be empty`,
      );
    }
    if (!input.dexId) {
      throw new DomainError(ErrorCode.VALIDATION, `Pair dexId cannot be empty`);
    }
    if (!Number.isFinite(input.reserveUsd) || input.reserveUsd < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid pair reserveUsd: ${input.reserveUsd}`,
      );
    }
    return new Pair({
      address: input.address,
      dexId: input.dexId,
      quoteToken: input.quoteToken,
      reserveUsd: input.reserveUsd,
    });
  }

  public get key(): string {
    return `${this.props.dexId}:${this.props.address}`;
  }

  public get address(): string {
    return this.props.address;
  }
  public get dexId(): string {
    return this.props.dexId;
  }
  public get quoteToken(): string {
    return this.props.quoteToken;
  }
  public get reserveUsd(): number {
    return this.props.reserveUsd;
  }
}
