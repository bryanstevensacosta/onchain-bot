import bs58 from 'bs58';
import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { Chain } from 'ca/normalization/domain/value-objects/chain.vo';

interface NormalizedAddressProps {
  readonly value: string;
  readonly chain: Chain;
}

/**
 * Canonical, chain-validated address representation.
 *
 * - EVM: validated against `^0x[a-fA-F0-9]{40}$` and lowercased.
 * - Solana: validated by Base58 decoding to exactly 32 bytes.
 *
 * Structural equality ensures `0xAbC...` and `0xabc...` are the same
 * EVM address across all messages.
 */
export class NormalizedAddress extends ValueObject<NormalizedAddressProps> {
  private static readonly EVM_PATTERN = /^0x[a-fA-F0-9]{40}$/i;

  protected constructor(props: NormalizedAddressProps) {
    super(props);
  }

  public static fromEvm(raw: string): NormalizedAddress {
    if (!NormalizedAddress.EVM_PATTERN.test(raw)) {
      throw new DomainError(
        ErrorCode.INVALID_ADDRESS,
        `Invalid EVM address: ${raw}`,
        { raw },
      );
    }
    return new NormalizedAddress({
      value: raw.toLowerCase(),
      chain: Chain.EVM,
    });
  }

  public static fromSolana(raw: string): NormalizedAddress {
    try {
      const decoded = bs58.decode(raw);
      if (decoded.length !== 32) {
        throw new Error('not 32 bytes');
      }
    } catch {
      throw new DomainError(
        ErrorCode.INVALID_ADDRESS,
        `Invalid Solana address: ${raw}`,
        { raw },
      );
    }
    return new NormalizedAddress({
      value: raw,
      chain: Chain.SOLANA,
    });
  }

  public static fromChainHint(
    raw: string,
    chainHint: string,
  ): NormalizedAddress | null {
    const chain = Chain.tryFromString(chainHint);
    if (!chain) return null;
    try {
      return chain.value === 'evm'
        ? NormalizedAddress.fromEvm(raw)
        : NormalizedAddress.fromSolana(raw);
    } catch {
      return null;
    }
  }

  public get value(): string {
    return this.props.value;
  }

  public get chain(): Chain {
    return this.props.chain;
  }
}
