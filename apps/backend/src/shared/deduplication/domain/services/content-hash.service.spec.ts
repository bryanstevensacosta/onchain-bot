import { ContentHashService } from './content-hash.service';

describe('ContentHashService', () => {
  describe('hash', () => {
    it('should produce consistent hash for same content', () => {
      const content = 'Bitcoin hits $120K!';
      const hash1 = ContentHashService.hash(content);
      const hash2 = ContentHashService.hash(content);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', () => {
      const hash1 = ContentHashService.hash('Bitcoin');
      const hash2 = ContentHashService.hash('Ethereum');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for content that normalizes differently', () => {
      const hash1 = ContentHashService.hash('**Bitcoin**');
      const hash2 = ContentHashService.hash('bitcoin');
      expect(hash1).toBe(hash2);
    });

    it('should return a 64-character hex string', () => {
      const hash = ContentHashService.hash('test content');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle empty string', () => {
      const hash = ContentHashService.hash('');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should normalize content before hashing', () => {
      const hash1 = ContentHashService.hash('  HELLO  ');
      const hash2 = ContentHashService.hash('hello');
      expect(hash1).toBe(hash2);
    });
  });
});
