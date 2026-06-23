import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import { NormalizedAddress } from 'token/identity/normalized-address.vo';

interface TokenLocatorProps {
  readonly chain: ChainFamily;
  readonly address: NormalizedAddress;
}

/**
 * Composite identity `(chain, address)` used as the dedupe key
 * for canonical token records. Two messages mentioning the same
 * locator merge into one canonical entry.
 *
 * Promoted to `src/token/identity/` from
 * `discovery/normalization/domain/value-objects/token-identity.vo.ts`
 * and renamed (TokenIdentity → TokenLocator) to free the term
 * "identity" for a future richer entity.
 */
export class TokenLocator extends ValueObject<TokenLocatorProps> {
  protected constructor(props: TokenLocatorProps) {
    super(props);
  }

  public static create(
    chain: ChainFamily,
    address: NormalizedAddress,
  ): TokenLocator {
    if (chain.value !== address.chain.value) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Chain mismatch: locator.chain=${chain.value} but address.chain=${address.chain.value}`,
        { chain: chain.value, addressChain: address.chain.value },
      );
    }
    return new TokenLocator({ chain, address });
  }

  /**
   * String key suitable for use as a Map key.
   * Format: `evm:0xabc...` or `solana:EPjFW...`
   */
  public get key(): string {
    return `${this.props.chain.value}:${this.props.address.value}`;
  }

  public get chain(): ChainFamily {
    return this.props.chain;
  }

  public get address(): NormalizedAddress {
    return this.props.address;
  }
}
