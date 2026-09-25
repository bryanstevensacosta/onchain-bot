import { AddressIdVo } from 'address/address-id.vo';
import { TokenIdVo } from './token-id.vo';

/**
 * TokenId alias spec (Tramo 3, P45).
 *
 * The token model is absorbed into the universal address model: the
 * alias pins kind=token. Failing-first bridge — legacy from()/parse()
 * statics are inherited from AddressIdVo.
 */
describe('TokenIdVo (deprecated alias, kind=token)', () => {
  it('pins kind=token with a lowercased chain:address key', () => {
    const id = TokenIdVo.fromToken(
      'SOLANA',
      'So11111111111111111111111111111111111111112',
    );
    expect(id).toBeInstanceOf(AddressIdVo);
    expect(id.kind).toBe('token');
    expect(id.key).toBe(
      'solana:so11111111111111111111111111111111111111112',
    );
    expect(id.address).toBe(
      'so11111111111111111111111111111111111111112',
    );
  });

  it('parses a key back into chain + address with kind=token', () => {
    const id = TokenIdVo.parseToken('ethereum:0xabc');
    expect(id.chain).toBe('ethereum');
    expect(id.address).toBe('0xabc');
    expect(id.kind).toBe('token');
  });

  it('rejects empty chain or address', () => {
    expect(() => TokenIdVo.fromToken('', '0xabc')).toThrow();
    expect(() => TokenIdVo.fromToken('solana', '')).toThrow();
    expect(() => TokenIdVo.parseToken('no-separator')).toThrow();
  });
});
