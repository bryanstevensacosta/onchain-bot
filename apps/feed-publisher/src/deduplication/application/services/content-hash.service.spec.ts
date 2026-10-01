import { ContentHashService } from './content-hash.service';

describe('ContentHashService', () => {
  const hashing = new ContentHashService();

  it('hashes the normalized form (case/space insensitive)', () => {
    expect(hashing.hash('  ETF Inflows ')).toBe(hashing.hash('etf inflows'));
  });

  it('produces distinct hashes for distinct content', () => {
    expect(hashing.hash('bitcoin')).not.toBe(hashing.hash('ethereum'));
  });

  it('returns a 64-char hex digest', () => {
    expect(hashing.hash('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});
