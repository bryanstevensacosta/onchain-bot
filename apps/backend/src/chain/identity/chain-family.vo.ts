/**
 * Canonical chain family identifier.
 *
 * Promoted to `src/chain/identity/` from
 * `discovery/normalization/domain/value-objects/chain.vo.ts`
 * as part of the chain BC extraction (chain-refactor.md, Anexo E, fase 1).
 *
 * Note: this VO represents the **family** of a chain (EVM or Solana),
 * not the specific network. It is what normalization BC consumes from
 * chain-detection. Use `ChainId` for network-level identification.
 *
 * Only `evm` and `solana` are valid for now. `unknown` from the
 * extraction layer is rejected here — by the time we reach normalization,
 * chain-detection BC (next in pipeline) must have resolved it. If we
 * see `unknown`, this VO throws.
 */
import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface ChainFamilyProps {
  readonly value: 'evm' | 'solana';
}

export class ChainFamily extends ValueObject<ChainFamilyProps> {
  public static readonly EVM = new ChainFamily({ value: 'evm' });
  public static readonly SOLANA = new ChainFamily({ value: 'solana' });

  private static readonly VALID = new Set<ChainFamilyProps['value']>([
    'evm',
    'solana',
  ]);

  protected constructor(props: ChainFamilyProps) {
    super(props);
  }

  public static fromString(raw: string): ChainFamily {
    const value = raw.toLowerCase() as ChainFamilyProps['value'];
    if (!ChainFamily.VALID.has(value)) {
      throw new DomainError(
        ErrorCode.UNSUPPORTED_CHAIN,
        `Invalid chain family: ${raw}`,
        { raw },
      );
    }
    return new ChainFamily({ value });
  }

  /**
   * Returns null for unsupported families (used by event handler to skip
   * non-resolved messages rather than throw).
   */
  public static tryFromString(raw: string): ChainFamily | null {
    const value = raw.toLowerCase() as ChainFamilyProps['value'];
    return ChainFamily.VALID.has(value) ? new ChainFamily({ value }) : null;
  }

  public get value(): ChainFamilyProps['value'] {
    return this.props.value;
  }
}
