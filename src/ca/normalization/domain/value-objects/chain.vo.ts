import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface ChainProps {
  readonly value: 'evm' | 'solana';
}

/**
 * Canonical chain identifier. Only `evm` and `solana` are valid for now.
 *
 * Note: `unknown` from the extraction layer is rejected here — by the time
 * we reach normalization, chain-detection BC (next in pipeline) must have
 * resolved it. If we see `unknown`, this BC ignores the message.
 */
export class Chain extends ValueObject<ChainProps> {
  public static readonly EVM = new Chain({ value: 'evm' });
  public static readonly SOLANA = new Chain({ value: 'solana' });

  private static readonly VALID = new Set<ChainProps['value']>([
    'evm',
    'solana',
  ]);

  protected constructor(props: ChainProps) {
    super(props);
  }

  public static fromString(raw: string): Chain {
    const value = raw.toLowerCase() as ChainProps['value'];
    if (!Chain.VALID.has(value)) {
      throw new DomainError(
        ErrorCode.UNSUPPORTED_CHAIN,
        `Invalid chain: ${raw}`,
        { raw },
      );
    }
    return new Chain({ value });
  }

  /**
   * Returns null for unsupported chains (used by event handler to skip
   * non-resolved messages rather than throw).
   */
  public static tryFromString(raw: string): Chain | null {
    const value = raw.toLowerCase() as ChainProps['value'];
    return Chain.VALID.has(value) ? new Chain({ value }) : null;
  }

  public get value(): ChainProps['value'] {
    return this.props.value;
  }
}
