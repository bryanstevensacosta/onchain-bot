import { AddressIdVo } from './address-id.vo';

describe('AddressIdVo', () => {
  it('builds a lowercased chain:address key with kind', () => {
    const id = AddressIdVo.from(
      'SOLANA',
      'So11111111111111111111111111111111111111112',
      'token',
    );
    expect(id.key).toBe(
      'solana:so11111111111111111111111111111111111111112',
    );
    expect(id.kind).toBe('token');
  });

  it('defaults an omitted kind to unknown', () => {
    const id = AddressIdVo.from('ethereum', '0xabc');
    expect(id.kind).toBe('unknown');
  });

  it('maps an unknown kind string to explicit unknown instead of crashing', () => {
    const id = AddressIdVo.from('ethereum', '0xabc', 'vault');
    expect(id.kind).toBe('unknown');
  });

  it('requires a chain qualifier (mandatory, never silent)', () => {
    expect(() => AddressIdVo.from('', '0xabc', 'token')).toThrow();
    expect(() => AddressIdVo.from('   ', '0xabc', 'token')).toThrow();
  });

  it('rejects an empty address', () => {
    expect(() => AddressIdVo.from('solana', '', 'wallet')).toThrow();
  });

  it('parses a chain:address key back into parts', () => {
    const id = AddressIdVo.parse('ethereum:0xabc', 'wallet');
    expect(id.chain).toBe('ethereum');
    expect(id.address).toBe('0xabc');
    expect(id.kind).toBe('wallet');
  });

  it('rejects a key without a chain qualifier', () => {
    expect(() => AddressIdVo.parse('no-separator', 'token')).toThrow();
    expect(() => AddressIdVo.parse(':0xabc', 'token')).toThrow();
  });

  it('compares by value including kind', () => {
    expect(
      AddressIdVo.from('solana', 'AAA', 'token').equals(
        AddressIdVo.from('SOLANA', 'aaa', 'token'),
      ),
    ).toBe(true);
    expect(
      AddressIdVo.from('solana', 'AAA', 'token').equals(
        AddressIdVo.from('solana', 'AAA', 'wallet'),
      ),
    ).toBe(false);
  });
});
