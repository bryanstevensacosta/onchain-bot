import bs58 from 'bs58';
import { ValueObject } from '../kernel/value-object';
import { DomainError, ErrorCode } from '../kernel/domain-error';
import { ChainHint } from './chain-hint.vo';

interface NormalizedAddressProps {
  readonly value: string;
  readonly chainHint: ChainHint;
}

/**
 * Canonical, chain-validated address representation (P21 shared identity VO).
 *
 * Extended in kol-system `src/shared/` following the backend
 * `token/identity/normalized-address.vo.ts` pattern — one validation home
 * for EVM/Solana instead of a copy per module.
 *
 * - EVM: validated against `^0x[a-fA-F0-9]{40}$`, lowercased (so `0xAbC…`
 *   and `0xabc…` are structurally equal).
 * - Solana: validated by Base58 decoding to exactly 32 bytes (case kept).
 */
export class NormalizedAddress extends ValueObject<NormalizedAddressProps> {
  private static readonly EVM_PATTERN = /^0x[a-fA-F0-9]{40}$/;

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
      chainHint: ChainHint.EVM,
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
      chainHint: ChainHint.SOLANA,
    });
  }

  public get value(): string {
    return this.props.value;
  }

  public get chainHint(): ChainHint {
    return this.props.chainHint;
  }
}
