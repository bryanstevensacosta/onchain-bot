/**
 * TDD regression suite for the F2+F3 number-extraction fix in
 * `ContentNormalizerService.extractNumbers` (Issue #3).
 *
 * F2 — trailing `([kKmMbBtT%])?` group captures the first letter of the
 *      following word (e.g. 'B' of 'BTC', 't' of 'today').
 * F3 — unconditional `numStr.replace(',', '.')` treats US thousands separators
 *      as decimal commas (e.g. '2,600' → 2.6, '1,500' → 1.5).
 *
 * The fix lives at content-normalizer.service.ts (extractNumbers, lines
 * 133-172). This spec is co-located and intentionally does NOT touch the
 * pre-existing content-normalizer.service.spec.ts (which exercises the
 * unchanged normalize/extractEntities/extractCashtags surfaces and the
 * pre-fix extractNumbers happy paths). Adding new cases here is the only
 * way to assert the post-fix invariant without disturbing the baseline.
 *
 * Each test below is a paired (input → expected) regression. The first
 * three rows are the named reproducers from the issue; the remaining rows
 * pin the rest of the policy table.
 */
import { ContentNormalizerService } from './content-normalizer.service';

describe('ContentNormalizerService.extractNumbers — F2+F3 fix (Issue #3)', () => {
  describe('F2 — trailing-letter suffix capture (negative lookahead)', () => {
    it('"2,628 BTC" → [2628]  (B of BTC is NOT captured as billion suffix)', () => {
      const result = ContentNormalizerService.extractNumbers('2,628 BTC');
      expect(result).toEqual([2628]);
    });

    it('"$2,600 $BTC" → [2600]  (no suffix — $BTC starts with $)', () => {
      const result = ContentNormalizerService.extractNumbers('$2,600 $BTC');
      expect(result).toEqual([2600]);
    });

    it('"Market cap reached 2,600 today" → [2600]  (t of today is NOT captured as tera suffix)', () => {
      const result = ContentNormalizerService.extractNumbers(
        'Market cap reached 2,600 today',
      );
      expect(result).toEqual([2600]);
    });
  });

  describe('F3 — US thousands separator (comma classification)', () => {
    it('"1,500" → [1500]  (single-group thousands, NOT 1.5)', () => {
      const result = ContentNormalizerService.extractNumbers('1,500');
      expect(result).toEqual([1500]);
    });

    it('"1,234,567" → [1234567]  (multi-group thousands matched as a single token)', () => {
      const result = ContentNormalizerService.extractNumbers('1,234,567');
      expect(result).toEqual([1234567]);
    });
  });

  describe('decimal-comma preserved (1-3 digit + 1-2 digit decimal)', () => {
    it('"2,6" → [2.6]  (single digit after comma → decimal)', () => {
      const result = ContentNormalizerService.extractNumbers('2,6');
      expect(result).toEqual([2.6]);
    });
  });

  describe('numeric body without comma', () => {
    it('"2.6" → [2.6]  (decimal point)', () => {
      const result = ContentNormalizerService.extractNumbers('2.6');
      expect(result).toEqual([2.6]);
    });
  });

  describe('suffix multipliers (K / M / B / T / %) — unchanged', () => {
    it('"2.6K" → [2600]  (K suffix × 1000)', () => {
      const result = ContentNormalizerService.extractNumbers('2.6K');
      expect(result).toEqual([2600]);
    });

    it('"2,6K" → [2600]  (decimal-comma 2.6 × K=1000)', () => {
      const result = ContentNormalizerService.extractNumbers('2,6K');
      expect(result).toEqual([2600]);
    });

    it('"1,5M" → [1500000]  (decimal-comma 1.5 × M=1e6)', () => {
      const result = ContentNormalizerService.extractNumbers('1,5M');
      expect(result).toEqual([1500000]);
    });

    it('"100K" → [100000]  (existing K behavior preserved)', () => {
      const result = ContentNormalizerService.extractNumbers('100K');
      expect(result).toEqual([100000]);
    });
  });

  describe('no-numbers inputs', () => {
    it('"Hello world" → []  (no numbers, no spurious matches)', () => {
      const result = ContentNormalizerService.extractNumbers('Hello world');
      expect(result).toEqual([]);
    });
  });
});
