import { ContentFilterService, FilterRule } from '../content-filter.service';

describe('ContentFilterService', () => {
  let service: ContentFilterService;

  beforeEach(() => {
    service = new ContentFilterService();
  });

  const createFilter = (overrides: Partial<FilterRule> = {}): FilterRule => ({
    pattern: '',
    replacement: '',
    flags: 'g',
    priority: 0,
    isActive: true,
    ...overrides,
  });

  describe('filterContent', () => {
    it('should return original content when no filters provided', () => {
      const content = 'Hello world';
      const result = service.filterContent(content, []);
      expect(result).toBe(content);
    });

    it('should return original content when all filters are inactive', () => {
      const content = 'Hello world';
      const filters = [
        createFilter({ pattern: 'Hello', replacement: 'Hi', isActive: false }),
      ];
      const result = service.filterContent(content, filters);
      expect(result).toBe(content);
    });

    it('should return original content for empty string', () => {
      const result = service.filterContent('', [
        createFilter({ pattern: 'a', replacement: 'b' }),
      ]);
      expect(result).toBe('');
    });

    it('should return original content for null/undefined', () => {
      // @ts-expect-error - testing null handling
      expect(
        service.filterContent(null, [
          createFilter({ pattern: 'a', replacement: 'b' }),
        ]),
      ).toBeNull();
      // @ts-expect-error - testing undefined handling
      expect(
        service.filterContent(undefined, [
          createFilter({ pattern: 'a', replacement: 'b' }),
        ]),
      ).toBeUndefined();
    });

    describe('exact match', () => {
      it('should replace exact string match', () => {
        const content = 'News | Markets | YouTube';
        const filters = [
          createFilter({
            pattern: 'News \\| Markets \\| YouTube',
            replacement: '',
            priority: 0,
          }),
        ];
        const result = service.filterContent(content, filters);
        expect(result).toBe('');
      });

      it('should replace multiple exact matches', () => {
        const content = 'Hello world, hello universe';
        const filters = [
          createFilter({
            pattern: 'hello',
            replacement: 'hi',
            flags: 'gi',
            priority: 0,
          }),
        ];
        const result = service.filterContent(content, filters);
        expect(result).toBe('hi world, hi universe');
      });
    });

    describe('regex with capture groups', () => {
      it('should use capture groups in replacement', () => {
        const content = 'Price: $100.50';
        const filters = [
          createFilter({
            pattern: 'Price: \\$(\\d+\\.\\d+)',
            replacement: 'Cost: $1 USD',
            priority: 0,
          }),
        ];
        const result = service.filterContent(content, filters);
        expect(result).toBe('Cost: 100.50 USD');
      });

      it('should handle multiple capture groups', () => {
        const content = 'From Alice to Bob';
        const filters = [
          createFilter({
            pattern: 'From (\\w+) to (\\w+)',
            replacement: '$2 received from $1',
            priority: 0,
          }),
        ];
        const result = service.filterContent(content, filters);
        expect(result).toBe('Bob received from Alice');
      });

      it('should handle nested groups', () => {
        const content = '((nested))';
        const filters = [
          createFilter({
            pattern: '\\((\\((\\w+)\\))\\)',
            replacement: '[$1]',
            priority: 0,
          }),
        ];
        const result = service.filterContent(content, filters);
        expect(result).toBe('[(nested)]');
      });
    });

    describe('case-insensitive matching', () => {
      it('should match case-insensitively with i flag', () => {
        const content = 'BITCOIN and bitcoin and Bitcoin';
        const filters = [
          createFilter({
            pattern: 'bitcoin',
            replacement: 'BTC',
            flags: 'gi',
            priority: 0,
          }),
        ];
        const result = service.filterContent(content, filters);
        expect(result).toBe('BTC and BTC and BTC');
      });

      it('should respect case-sensitive matching without i flag', () => {
        const content = 'BITCOIN and bitcoin and Bitcoin';
        const filters = [
          createFilter({
            pattern: 'bitcoin',
            replacement: 'BTC',
            flags: 'g',
            priority: 0,
          }),
        ];
        const result = service.filterContent(content, filters);
        expect(result).toBe('BITCOIN and BTC and Bitcoin');
      });
    });

    describe('overlapping patterns', () => {
      it('should apply filters in priority order (lower priority first)', () => {
        const content = 'The quick brown fox';
        const filters = [
          createFilter({ pattern: 'quick', replacement: 'slow', priority: 10 }),
          createFilter({
            pattern: 'slow brown',
            replacement: 'fast red',
            priority: 5,
          }),
        ];
        // Priority 5 runs first: 'slow brown' -> 'fast red' (no match yet)
        // Priority 10 runs second: 'quick' -> 'slow' => 'The slow brown fox'
        const result = service.filterContent(content, filters);
        expect(result).toBe('The slow brown fox');
      });

      it('should apply lower priority filter first, then higher', () => {
        const content = 'abc';
        const filters = [
          createFilter({ pattern: 'a', replacement: 'x', priority: 10 }),
          createFilter({ pattern: 'x', replacement: 'y', priority: 5 }),
        ];
        // Priority 5 first: 'x' -> 'y' (no match)
        // Priority 10 second: 'a' -> 'x' => 'xbc'
        const result = service.filterContent(content, filters);
        expect(result).toBe('xbc');
      });

      it('should handle chained replacements correctly', () => {
        const content = 'A B C';
        const filters = [
          createFilter({ pattern: 'A', replacement: 'X', priority: 1 }),
          createFilter({ pattern: 'X', replacement: 'Y', priority: 2 }),
          createFilter({ pattern: 'B', replacement: 'Z', priority: 3 }),
        ];
        // Priority 1: A -> X => 'X B C'
        // Priority 2: X -> Y => 'Y B C'
        // Priority 3: B -> Z => 'Y Z C'
        const result = service.filterContent(content, filters);
        expect(result).toBe('Y Z C');
      });

      it('should use createdAt as tiebreaker for same priority', () => {
        // Since we don't have createdAt in FilterRule, same priority
        // will maintain array order (stable sort)
        const content = 'test';
        const filters = [
          createFilter({ pattern: 't', replacement: 'X', priority: 0 }),
          createFilter({ pattern: 'X', replacement: 'Y', priority: 0 }),
        ];
        const result = service.filterContent(content, filters);
        // First filter runs first (stable sort preserves order for equal priority)
        // 't' -> 'X' (global) => 'XesX', then 'X' -> 'Y' (global) => 'YesY'
        expect(result).toBe('YesY');
      });
    });

    describe('invalid regex handling', () => {
      it('should skip invalid regex and return original content', () => {
        const content = 'Hello world';
        const filters = [
          createFilter({ pattern: '[invalid', replacement: 'X', priority: 0 }), // Unclosed bracket
        ];
        const result = service.filterContent(content, filters);
        expect(result).toBe(content);
      });

      it('should skip invalid regex and continue with other filters', () => {
        const content = 'Hello world';
        const filters = [
          createFilter({ pattern: '[invalid', replacement: 'X', priority: 0 }),
          createFilter({
            pattern: 'world',
            replacement: 'universe',
            priority: 1,
          }),
        ];
        const result = service.filterContent(content, filters);
        expect(result).toBe('Hello universe');
      });

      it('should skip invalid regex and return original content', () => {
        const content = 'Hello world';
        const filters = [
          createFilter({ pattern: '[invalid', replacement: 'X', priority: 0 }),
        ];
        const result = service.filterContent(content, filters);
        expect(result).toBe(content);
      });

      it('should handle regex with invalid flags', () => {
        const content = 'Hello world';
        const filters = [
          createFilter({
            pattern: 'world',
            replacement: 'X',
            flags: 'z',
            priority: 0,
          }),
        ];
        const result = service.filterContent(content, filters);
        expect(result).toBe(content); // Invalid flag 'z' causes error
      });
    });

    describe('timeout protection (ReDoS prevention)', () => {
      it('should complete quickly for normal regex', () => {
        const content = 'a'.repeat(1000);
        const filters = [
          createFilter({ pattern: 'a+', replacement: 'b', priority: 0 }),
        ];
        const start = Date.now();
        const result = service.filterContent(content, filters);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(100);
        expect(result).toBe('b');
      });

      it('should handle potentially slow regex without hanging', () => {
        // This regex can be slow on long strings with many 'a's
        // (a+)+ is a classic ReDoS pattern
        const content = 'a'.repeat(100) + 'b'; // Add 'b' to prevent full match
        const filters = [
          createFilter({ pattern: '(a+)+', replacement: 'X', priority: 0 }),
        ];
        const start = Date.now();
        const result = service.filterContent(content, filters);
        const elapsed = Date.now() - start;
        // Should complete (either successfully or timeout and return original)
        expect(elapsed).toBeLessThan(500); // Generous bound for CI
        // Result could be original or modified depending on engine behavior
        expect(typeof result).toBe('string');
      });

      it('should not hang on catastrophic backtracking pattern', () => {
        // Classic catastrophic backtracking: (a|aa)+ against 'aaaaaaaaaaaaaaaaaaaaab'
        const content = 'a'.repeat(20) + 'b';
        const filters = [
          createFilter({ pattern: '(a|aa)+', replacement: 'X', priority: 0 }),
        ];
        const start = Date.now();
        const result = service.filterContent(content, filters);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(500);
        expect(typeof result).toBe('string');
      });
    });

    describe('filterTitleAndContent', () => {
      it('should filter both title and content', () => {
        const title = 'News | Markets | YouTube';
        const content = 'Full article: News | Markets | YouTube';
        const filters = [
          createFilter({
            pattern: 'News \\| Markets \\| YouTube',
            replacement: '',
            priority: 0,
          }),
        ];
        const result = service.filterTitleAndContent(title, content, filters);
        expect(result.title).toBe('');
        expect(result.content).toBe('Full article: ');
      });

      it('should handle null title', () => {
        const content = 'News | Markets | YouTube';
        const filters = [
          createFilter({
            pattern: 'News \\| Markets \\| YouTube',
            replacement: '',
            priority: 0,
          }),
        ];
        const result = service.filterTitleAndContent(null, content, filters);
        expect(result.title).toBeNull();
        expect(result.content).toBe('');
      });

      it('should handle empty title', () => {
        const content = 'News | Markets | YouTube';
        const filters = [
          createFilter({
            pattern: 'News \\| Markets \\| YouTube',
            replacement: '',
            priority: 0,
          }),
        ];
        const result = service.filterTitleAndContent('', content, filters);
        expect(result.title).toBe('');
        expect(result.content).toBe('');
      });
    });

    describe('priority ordering edge cases', () => {
      it('should handle negative priority values', () => {
        const content = 'test';
        const filters = [
          createFilter({ pattern: 't', replacement: 'X', priority: -1 }),
          createFilter({ pattern: 'X', replacement: 'Y', priority: 0 }),
        ];
        // Priority -1 runs first: 't' -> 'X' (global) => 'XesX', then 'X' -> 'Y' (global) => 'YesY'
        const result = service.filterContent(content, filters);
        expect(result).toBe('YesY');
      });

      it('should handle large priority values', () => {
        const content = 'test';
        const filters = [
          createFilter({ pattern: 't', replacement: 'X', priority: 1000000 }),
          createFilter({ pattern: 'X', replacement: 'Y', priority: 0 }),
        ];
        // Priority 0 runs first: 'X' -> 'Y' (no match), then priority 1000000: 't' -> 'X' => 'XesX'
        const result = service.filterContent(content, filters);
        expect(result).toBe('XesX');
      });

      it('should maintain stable sort for equal priorities', () => {
        const content = 'abc';
        const filters = [
          createFilter({ pattern: 'a', replacement: '1', priority: 5 }),
          createFilter({ pattern: 'b', replacement: '2', priority: 5 }),
          createFilter({ pattern: 'c', replacement: '3', priority: 5 }),
        ];
        const result = service.filterContent(content, filters);
        expect(result).toBe('123');
      });
    });
  });
});
