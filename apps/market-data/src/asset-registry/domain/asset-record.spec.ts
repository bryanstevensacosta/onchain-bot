import { assetKey, normalizeChain, normalizeContract } from './asset-record';

describe('asset-record normalize helpers', () => {
  it('lowercases and trims chain and contract', () => {
    expect(normalizeChain('  Solana ')).toBe('solana');
    expect(normalizeContract('  0xABCdef  ')).toBe('0xabcdef');
  });

  it('builds the canonical chain:contract key', () => {
    expect(assetKey('BSC', '0xABC')).toBe('bsc:0xabc');
  });
});
