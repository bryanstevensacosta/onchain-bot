import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainHint } from 'discovery/extraction/domain/value-objects/chain-hint.vo';

interface ContractAddressProps {
  readonly value: string;
  readonly chainHint: ChainHint;
}

/**
 * A contract address candidate extracted from a message.
 *
 * Three creation paths:
 * - `fromEvm(raw)`: validates 0x + 40 hex chars, normalizes to lowercase
 * - `fromSolana(raw)`: validates Base58 decodes to 32 bytes (caller pre-validated)
 * - `fromUnknown(raw)`: passes raw string through; downstream chain-detection BC resolves
 *
 * Lowercase canonicalization enables structural equality across case variants.
 */
export class ContractAddress extends ValueObject<ContractAddressProps> {
  private static readonly EVM_PATTERN = /^0x[a-fA-F0-9]{40}$/;

  protected constructor(props: ContractAddressProps) {
    super(props);
  }

  public static fromEvm(raw: string): ContractAddress {
    if (!ContractAddress.EVM_PATTERN.test(raw)) {
      throw new DomainError(
        ErrorCode.INVALID_ADDRESS,
        `Invalid EVM address: ${raw}`,
        { raw },
      );
    }
    return new ContractAddress({
      value: raw.toLowerCase(),
      chainHint: ChainHint.EVM,
    });
  }

  public static fromSolana(raw: string): ContractAddress {
    return new ContractAddress({
      value: raw,
      chainHint: ChainHint.SOLANA,
    });
  }

  public static fromUnknown(raw: string): ContractAddress {
    if (!raw.trim()) {
      throw new DomainError(
        ErrorCode.INVALID_ADDRESS,
        `Empty address candidate`,
        { raw },
      );
    }
    return new ContractAddress({
      value: raw.trim(),
      chainHint: ChainHint.UNKNOWN,
    });
  }

  public get value(): string {
    return this.props.value;
  }

  public get chainHint(): ChainHint {
    return this.props.chainHint;
  }
}
