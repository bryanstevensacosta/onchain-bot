import { ValueObject } from 'shared/kernel/value-object';
import { Chain } from 'discovery/normalization/domain/value-objects/chain.vo';
import { NormalizedAddress } from 'discovery/normalization/domain/value-objects/normalized-address.vo';

interface TokenIdentityProps {
  readonly chain: Chain;
  readonly address: NormalizedAddress;
}

/**
 * Composite identity `(chain, address)` used as the dedupe key
 * for CanonicalTokenCall. Two messages mentioning the same identity
 * merge into one canonical entry.
 */
export class TokenIdentity extends ValueObject<TokenIdentityProps> {
  protected constructor(props: TokenIdentityProps) {
    super(props);
  }

  public static create(
    chain: Chain,
    address: NormalizedAddress,
  ): TokenIdentity {
    if (chain.value !== address.chain.value) {
      throw new Error(
        `Chain mismatch: identity.chain=${chain.value} but address.chain=${address.chain.value}`,
      );
    }
    return new TokenIdentity({ chain, address });
  }

  /**
   * String key suitable for use as a Map key.
   * Format: `evm:0xabc...` or `solana:EPjFW...`
   */
  public get key(): string {
    return `${this.props.chain.value}:${this.props.address.value}`;
  }

  public get chain(): Chain {
    return this.props.chain;
  }

  public get address(): NormalizedAddress {
    return this.props.address;
  }
}
