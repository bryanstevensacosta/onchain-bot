import { ChainIdVo } from './chain-id.vo';

describe('ChainIdVo', () => {
  it('normalizes to lowercase trimmed form', () => {
    expect(ChainIdVo.from('  Solana ').raw).toBe('solana');
  });

  it('rejects empty input', () => {
    expect(() => ChainIdVo.from('   ')).toThrow();
  });

  it('compares by value', () => {
    expect(ChainIdVo.from('solana').equals(ChainIdVo.from('SOLANA'))).toBe(
      true,
    );
    expect(ChainIdVo.from('solana').equals(ChainIdVo.from('ethereum'))).toBe(
      false,
    );
  });
});
