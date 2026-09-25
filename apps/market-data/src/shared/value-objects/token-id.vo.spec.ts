import { TokenIdVo } from './token-id.vo';

describe('TokenIdVo', () => {
  it('builds a lowercased chain:address key', () => {
    const id = TokenIdVo.from('SOLANA', 'So11111111111111111111111111111111111111112');
    expect(id.key).toBe(
      'solana:so11111111111111111111111111111111111111112',
    );
  });

  it('parses a key back into chain + address', () => {
    const id = TokenIdVo.parse('ethereum:0xabc');
    expect(id.chain).toBe('ethereum');
    expect(id.address).toBe('0xabc');
  });

  it('rejects empty chain or address', () => {
    expect(() => TokenIdVo.from('', '0xabc')).toThrow();
    expect(() => TokenIdVo.from('solana', '')).toThrow();
    expect(() => TokenIdVo.parse('no-separator')).toThrow();
  });

  it('compares by value', () => {
    expect(TokenIdVo.from('solana', 'AAA').equals(TokenIdVo.from('SOLANA', 'aaa'))).toBe(true);
    expect(TokenIdVo.from('solana', 'AAA').equals(TokenIdVo.from('solana', 'BBB'))).toBe(false);
  });
});
