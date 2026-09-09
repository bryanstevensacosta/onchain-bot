import { AbstractTextExtractor } from './abstract-text-extractor';

/**
 * Concrete implementation for testing abstract class
 */
class TestTextExtractor extends AbstractTextExtractor {
  extract(msg: any): string {
    // Test implementation: just delegates to cascadeExtract
    return this.cascadeExtract(msg, ['message', 'text']);
  }

  // Expose protected methods for testing
  public testExtractFromField(obj: any, field: string): string | null {
    return this.extractFromField(obj, field);
  }

  public testCascadeExtract(msg: any, fields: string[]): string {
    return this.cascadeExtract(msg, fields);
  }
}

describe('AbstractTextExtractor', () => {
  let extractor: TestTextExtractor;

  beforeEach(() => {
    extractor = new TestTextExtractor();
  });

  describe('extractFromField()', () => {
    it('should return text when field exists and contains non-empty string', () => {
      const obj = { message: 'Hello world' };
      const result = extractor.testExtractFromField(obj, 'message');
      expect(result).toBe('Hello world');
    });

    it('should return null when field is missing', () => {
      const obj = { other: 'value' };
      const result = extractor.testExtractFromField(obj, 'message');
      expect(result).toBeNull();
    });

    it('should return null when field is empty string', () => {
      const obj = { message: '' };
      const result = extractor.testExtractFromField(obj, 'message');
      expect(result).toBeNull();
    });

    it('should return null when field contains only whitespace', () => {
      const obj = { message: '   \n\t  ' };
      const result = extractor.testExtractFromField(obj, 'message');
      expect(result).toBeNull();
    });

    it('should trim whitespace from extracted text', () => {
      const obj = { message: '  Hello world  \n' };
      const result = extractor.testExtractFromField(obj, 'message');
      expect(result).toBe('Hello world');
    });

    it('should return null when field is not a string', () => {
      const obj = { message: 123 };
      const result = extractor.testExtractFromField(obj, 'message');
      expect(result).toBeNull();
    });

    it('should return null when field is null', () => {
      const obj = { message: null };
      const result = extractor.testExtractFromField(obj, 'message');
      expect(result).toBeNull();
    });

    it('should return null when field is undefined', () => {
      const obj = { message: undefined };
      const result = extractor.testExtractFromField(obj, 'message');
      expect(result).toBeNull();
    });

    it('should return null when obj is null', () => {
      const result = extractor.testExtractFromField(null, 'message');
      expect(result).toBeNull();
    });

    it('should return null when obj is not an object', () => {
      const result = extractor.testExtractFromField('not an object' as any, 'message');
      expect(result).toBeNull();
    });
  });

  describe('cascadeExtract()', () => {
    it('should return first non-null value from fields array', () => {
      const msg = {
        message: null,
        text: 'Found text',
        caption: 'Caption text',
      };
      const result = extractor.testCascadeExtract(msg, ['message', 'text', 'caption']);
      expect(result).toBe('Found text');
    });

    it('should return empty string when all fields are null', () => {
      const msg = {
        message: null,
        text: null,
        caption: null,
      };
      const result = extractor.testCascadeExtract(msg, ['message', 'text', 'caption']);
      expect(result).toBe('');
    });

    it('should respect field order (first match wins)', () => {
      const msg = {
        message: 'First',
        text: 'Second',
        caption: 'Third',
      };
      const result = extractor.testCascadeExtract(msg, ['message', 'text', 'caption']);
      expect(result).toBe('First');
    });

    it('should skip empty strings and continue cascade', () => {
      const msg = {
        message: '',
        text: '   ',
        caption: 'Valid text',
      };
      const result = extractor.testCascadeExtract(msg, ['message', 'text', 'caption']);
      expect(result).toBe('Valid text');
    });

    it('should return empty string for empty fields array', () => {
      const msg = { message: 'Some text' };
      const result = extractor.testCascadeExtract(msg, []);
      expect(result).toBe('');
    });

    it('should handle missing fields gracefully', () => {
      const msg = { message: 'Hello' };
      const result = extractor.testCascadeExtract(msg, ['nonexistent1', 'nonexistent2', 'message']);
      expect(result).toBe('Hello');
    });
  });

  describe('extract() (abstract method implementation)', () => {
    it('should be callable on concrete subclass', () => {
      const msg = { message: 'Test message' };
      const result = extractor.extract(msg);
      expect(result).toBe('Test message');
    });
  });
});
