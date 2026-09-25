import { ValueObject } from '../kernel/value-object';
import { DomainError, ErrorCode } from '../kernel/domain-error';

interface ChainHintProps {
  readonly value: 'evm' | 'solana' | 'unknown';
}

/**
 * Chain family hint for a contract address candidate (P21 shared identity VO).
 *
 * Extended in kol-system `src/shared/` (not duplicated per module) so
 * extraction, parsing and normalization share one validation home.
 * Mirrors the backend `chain/identity/chain-hint.vo.ts` pattern.
 *
 * - `evm`: matches `^0x[a-fA-F0-9]{40}$`
 * - `solana`: Base58 decodes to exactly 32 bytes
 * - `unknown`: passed through for downstream chain-detection to resolve
 */
export class ChainHint extends ValueObject<ChainHintProps> {
  public static readonly EVM = new ChainHint({ value: 'evm' });
  public static readonly SOLANA = new ChainHint({ value: 'solana' });
  public static readonly UNKNOWN = new ChainHint({ value: 'unknown' });

  private static readonly VALUES = new Set<ChainHintProps['value']>([
    'evm',
    'solana',
    'unknown',
  ]);

  protected constructor(props: ChainHintProps) {
    super(props);
  }

  public static fromString(raw: string): ChainHint {
    const value = raw.toLowerCase() as ChainHintProps['value'];
    if (!ChainHint.VALUES.has(value)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid chain hint: ${raw}`,
        {
          raw,
        },
      );
    }
    return new ChainHint({ value });
  }

  public get value(): ChainHintProps['value'] {
    return this.props.value;
  }
}
