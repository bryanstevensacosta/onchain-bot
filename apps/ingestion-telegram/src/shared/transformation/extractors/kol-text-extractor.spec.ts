import { KolTextExtractor } from './kol-text-extractor';

describe('KolTextExtractor', () => {
  let extractor: KolTextExtractor;

  beforeEach(() => {
    extractor = new KolTextExtractor();
  });

  describe('Q1-B cascade extraction (adr-kol-raw-text.md)', () => {
    it('should extract text from message field (primary)', () => {
      expect(extractor.extract({ message: 'BUY $SOL NOW!' })).toBe(
        'BUY $SOL NOW!',
      );
    });

    it('should extract text from text field (secondary)', () => {
      expect(extractor.extract({ text: 'Check out this token' })).toBe(
        'Check out this token',
      );
    });

    it('should prefer message over text', () => {
      expect(
        extractor.extract({ message: 'Primary text', text: 'Secondary text' }),
      ).toBe('Primary text');
    });

    it('should extract text from media caption (tertiary)', () => {
      expect(extractor.extract({ media: { caption: 'Photo caption' } })).toBe(
        'Photo caption',
      );
    });

    it('should extract text from forwarded message (fallback)', () => {
      expect(
        extractor.extract({ fwdFrom: { message: 'Forwarded message' } }),
      ).toBe('Forwarded message');
    });

    it('should extract from message with all text fields', () => {
      const msg = {
        message: 'Primary text',
        text: 'Secondary text',
        media: { caption: 'Caption text' },
        fwdFrom: { message: 'Forwarded text' },
      };

      expect(extractor.extract(msg)).toBe('Primary text');
    });

    it('should return empty string when no text source exists', () => {
      const messages = [{}, null, undefined];

      messages.forEach((msg) => {
        expect(extractor.extract(msg)).toBe('');
      });
    });

    it('should return empty string for blank-only fields', () => {
      expect(extractor.extract({ message: '   ', text: '' })).toBe('');
    });
  });
});
