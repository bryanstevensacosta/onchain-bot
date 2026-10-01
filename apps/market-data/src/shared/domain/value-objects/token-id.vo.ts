import { AddressIdVo } from 'address/domain/address-id.vo';

/**
 * TokenId VO (Tramo 3, todo 1; P45 absorbs it into AddressIdVo).
 *
 * @deprecated Use AddressIdVo.from(chain, value, 'token') — the token
 * model is the kind=token path of the universal address model
 * (Address = chain + value + kind). This alias pins kind=token and
 * will be removed in the final review.
 */
export class TokenIdVo extends AddressIdVo {
  private constructor(chain: string, address: string) {
    super(chain, address, 'token');
  }

  public static fromToken(chain: string, address: string): TokenIdVo {
    const base = AddressIdVo.from(chain, address, 'token');
    return new TokenIdVo(base.chain, base.address);
  }

  public static parseToken(key: string): TokenIdVo {
    const base = AddressIdVo.parse(key, 'token');
    return new TokenIdVo(base.chain, base.address);
  }
}
