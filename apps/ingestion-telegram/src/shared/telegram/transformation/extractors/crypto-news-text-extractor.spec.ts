import { CryptoNewsTextExtractor } from './crypto-news-text-extractor';

describe('CryptoNewsTextExtractor', () => {
  let extractor: CryptoNewsTextExtractor;

  beforeEach(() => {
    extractor = new CryptoNewsTextExtractor();
  });

  describe('4-source cascade', () => {
    it('should extract from msg.message first', () => {
      const msg = {
        message: 'Primary message',
        text: 'Secondary text',
        media: { caption: 'Caption text' },
        fwdFrom: { message: 'Forwarded text' },
      };

      expect(extractor.extract(msg)).toBe('Primary message');
    });

    it('should fall back to msg.text when message missing', () => {
      const msg = {
        text: 'Secondary text',
        media: { caption: 'Caption text' },
        fwdFrom: { message: 'Forwarded text' },
      };

      expect(extractor.extract(msg)).toBe('Secondary text');
    });

    it('should fall back to media.caption when message and text missing', () => {
      const msg = {
        media: { caption: 'Caption text' },
        fwdFrom: { message: 'Forwarded text' },
      };

      expect(extractor.extract(msg)).toBe('Caption text');
    });

    it('should fall back to fwdFrom.message as last resort', () => {
      const msg = {
        fwdFrom: { message: 'Forwarded text' },
      };

      expect(extractor.extract(msg)).toBe('Forwarded text');
    });

    it('should return empty string when all sources null', () => {
      const msg = {
        message: null,
        text: null,
        media: { caption: null },
        fwdFrom: { message: null },
      };

      expect(extractor.extract(msg)).toBe('');
    });

    it('should return empty string for empty object', () => {
      expect(extractor.extract({})).toBe('');
    });

    it('should return empty string for null/undefined', () => {
      expect(extractor.extract(null)).toBe('');
      expect(extractor.extract(undefined)).toBe('');
    });
  });

  describe('whitespace handling', () => {
    it('should trim whitespace from extracted text', () => {
      const msg = { message: '  Trimmed text  ' };
      expect(extractor.extract(msg)).toBe('Trimmed text');
    });

    it('should skip whitespace-only fields', () => {
      const msg = {
        message: '   ',
        text: 'Valid text',
      };

      expect(extractor.extract(msg)).toBe('Valid text');
    });

    it('should return empty string when all sources are whitespace', () => {
      const msg = {
        message: '  ',
        text: '\n\t',
        media: { caption: '   ' },
        fwdFrom: { message: '\n' },
      };

      expect(extractor.extract(msg)).toBe('');
    });
  });

  describe('cascade order correctness', () => {
    it('should not skip to caption if text exists', () => {
      const msg = {
        text: 'Text content',
        media: { caption: 'Caption content' },
      };

      expect(extractor.extract(msg)).toBe('Text content');
    });

    it('should not skip to forwarded if caption exists', () => {
      const msg = {
        media: { caption: 'Caption content' },
        fwdFrom: { message: 'Forwarded content' },
      };

      expect(extractor.extract(msg)).toBe('Caption content');
    });
  });
});
