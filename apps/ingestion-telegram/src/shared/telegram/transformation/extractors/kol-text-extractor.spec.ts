import { KolTextExtractor } from './kol-text-extractor';

describe('KolTextExtractor', () => {
  let extractor: KolTextExtractor;

  beforeEach(() => {
    extractor = new KolTextExtractor();
  });

  describe('ToS Invariant Compliance', () => {
    it('should always return empty string regardless of message content', () => {
      const messages = [
        { message: 'BUY $SOL NOW!' },
        { text: 'Check out this token' },
        { message: 'Test', text: 'Another test' },
        { media: { caption: 'Photo caption' } },
        { fwdFrom: { message: 'Forwarded message' } },
        {},
        null,
        undefined,
      ];

      messages.forEach((msg) => {
        expect(extractor.extract(msg)).toBe('');
      });
    });

    it('should enforce ToS invariant (no text leakage)', () => {
      const sensitiveMessage = {
        message: 'PRIVATE KOL ALPHA CALL: $TOKEN at 0x123...',
        text: 'Backup text',
        media: { caption: 'Chart showing gains' },
      };

      // Per fix-1: Raw text MUST NOT cross event bus
      // Backend extracts text directly via KolIngestionOrchestratorUseCase
      const result = extractor.extract(sensitiveMessage);

      expect(result).toBe('');
      expect(result).not.toContain('PRIVATE');
      expect(result).not.toContain('ALPHA');
      expect(result).not.toContain('$TOKEN');
    });

    it('should return empty for message with all text fields', () => {
      const msg = {
        message: 'Primary text',
        text: 'Secondary text',
        media: { caption: 'Caption text' },
        fwdFrom: { message: 'Forwarded text' },
      };

      expect(extractor.extract(msg)).toBe('');
    });
  });
});
