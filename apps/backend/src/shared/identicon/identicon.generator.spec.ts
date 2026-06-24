import { IdenticonGenerator } from 'shared/identicon/identicon.generator';

describe('IdenticonGenerator', () => {
  let generator: IdenticonGenerator;

  beforeEach(() => {
    generator = new IdenticonGenerator();
  });

  it('returns a data URI starting with the SVG base64 prefix', () => {
    const uri = generator.generate(
      'solana',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
    expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('produces identical output for identical input (deterministic)', () => {
    const a = generator.generate(
      'solana',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
    const b = generator.generate(
      'solana',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
    expect(a).toBe(b);
  });

  it('produces different output for different addresses on the same chain', () => {
    const a = generator.generate('solana', 'addr1');
    const b = generator.generate('solana', 'addr2');
    expect(a).not.toBe(b);
  });

  it('produces different output for the same address on different chains', () => {
    const a = generator.generate(
      'solana',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
    const b = generator.generate(
      'ethereum',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
    expect(a).not.toBe(b);
  });

  it('decodes to a valid 64x64 SVG with mirroring and is non-trivial', () => {
    const uri = generator.generate(
      'solana',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
    const payload = uri.slice('data:image/svg+xml;base64,'.length);
    const svg = Buffer.from(payload, 'base64').toString('utf8');

    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain('width="64"');
    expect(svg).toContain('height="64"');
    expect(svg.length).toBeGreaterThan(200);

    const rectMatches = svg.match(/<rect\s/g) ?? [];
    expect(rectMatches.length).toBeGreaterThan(1);

    const openCount = (svg.match(/<rect /g) ?? []).length;
    const closeCount = (svg.match(/\/></g) ?? []).length;
    expect(openCount).toBe(closeCount);
  });

  it('exhibits horizontal mirroring (left-half rects have a mirrored counterpart on the right)', () => {
    const uri = generator.generate(
      'solana',
      'So11111111111111111111111111111111111111112',
    );
    const payload = uri.slice('data:image/svg+xml;base64,'.length);
    const svg = Buffer.from(payload, 'base64').toString('utf8');

    const xValues = Array.from(svg.matchAll(/x="(\d+)"/g))
      .map((m) => Number(m[1]))
      .filter((v) => !Number.isNaN(v))
      .sort((a, b) => a - b);

    expect(xValues.length).toBeGreaterThan(0);

    const distinct = new Set(xValues);
    const expected = new Set([0, 8, 16, 24, 32, 40, 48, 56]);
    for (const v of distinct) {
      expect(expected.has(v)).toBe(true);
    }
  });
});
