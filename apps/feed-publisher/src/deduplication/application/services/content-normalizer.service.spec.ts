import { ContentNormalizerService } from './content-normalizer.service';

describe('ContentNormalizerService', () => {
  const normalizer = new ContentNormalizerService();

  it('lowercases and collapses whitespace', () => {
    expect(normalizer.normalize('  ETF   Inflows  ')).toBe('etf inflows');
  });

  it('strips markdown links to their text', () => {
    expect(
      normalizer.normalize('[Bitcoin](https://example.com/x) surges'),
    ).toBe('bitcoin surges');
  });

  it('strips spoiler markers and emphasis', () => {
    expect(normalizer.normalize('||secret|| **bold**')).toBe('secret bold');
  });

  it('removes pictographic emoji and diacritics', () => {
    expect(normalizer.normalize('🚀 café')).toBe('cafe');
  });

  it('removes urls', () => {
    expect(normalizer.normalize('read https://example.com/a more')).toBe(
      'read more',
    );
  });

  it('collapses repeated punctuation and trims edge punctuation', () => {
    expect(normalizer.normalize('wow!!! really??')).toBe('wow! really');
  });

  it('extracts numbers with K/M/B suffixes', () => {
    const numbers = normalizer.extractNumbers('inflows $2.5B up 12%');
    expect(numbers).toContain(2_500_000_000);
    expect(numbers).toContain(0.12);
  });

  it('extracts entities and cashtags', () => {
    expect(normalizer.extractCashtags('long $SOL and $sol')).toEqual(['SOL']);
    const entities = normalizer.extractEntities('Bitcoin ETF inflows grow');
    expect(entities).toContain('bitcoin');
  });
});
