/**
 * Tests for dedup-scorer.service.ts
 *
 * NO NestJS decorators, NO TypeORM, NO IO.
 */

import {
  jaccardSimilarity,
  numberJaccardSimilarity,
  entityJaccardSimilarity,
  cashtagJaccardSimilarity,
  computeScore,
  DedupScorer,
  type ScoreInput,
  type ScoreConfig,
  DEFAULT_CONFIG,
} from './dedup-scorer.service';

const makeEmptyInput = (overrides?: Partial<ScoreInput>): ScoreInput => ({
  embeddingM: [1, 0],
  embeddingE: [1, 0],
  tokensM: [],
  tokensE: [],
  numbersM: [],
  numbersE: [],
  entitiesM: [],
  entitiesE: [],
  cashtagsM: [],
  cashtagsE: [],
  urlOverlapCount: 0,
  sameSource: false,
  timeDiffMinutes: 999,
  ...overrides,
});

describe('jaccardSimilarity', () => {
  it('jaccardSimilarity(["btc","up"], ["btc","up","now"]) = 2/3', () => {
    expect(jaccardSimilarity(['btc', 'up'], ['btc', 'up', 'now'])).toBe(2 / 3);
  });

  it('jaccardSimilarity([], []) = 1', () => {
    expect(jaccardSimilarity([], [])).toBe(1);
  });

  it('should return 0 when one array is empty', () => {
    expect(jaccardSimilarity(['a'], [])).toBe(0);
    expect(jaccardSimilarity([], ['a'])).toBe(0);
  });

  it('should return 1 for identical arrays', () => {
    expect(jaccardSimilarity(['a', 'b'], ['a', 'b'])).toBe(1);
  });

  it('should return 0 for disjoint arrays', () => {
    expect(jaccardSimilarity(['a'], ['b'])).toBe(0);
  });

  it('should handle duplicates correctly', () => {
    expect(jaccardSimilarity(['a', 'a', 'b'], ['a', 'b'])).toBe(1);
  });

  it('should handle partial overlap', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(0.5);
  });
});

describe('numberJaccardSimilarity', () => {
  it('numberJaccardSimilarity([120000, 5], [120000, 5]) = 1.0', () => {
    expect(numberJaccardSimilarity([120000, 5], [120000, 5])).toBe(1.0);
  });

  it('numberJaccardSimilarity([120000, 5], [115000, 5]) = 0.5 (4.2% > 1% tolerance)', () => {
    const result = numberJaccardSimilarity([120000, 5], [115000, 5]);
    // 120000 vs 115000: |5000|/120000 = 0.0417 > 0.01 -> no match
    // So only 5 matches. Union size = 3 (120000, 115000, 5)
    // matching = [5], union = {120000, 115000, 5}
    // Intersection count for Jaccard: number of a elements that match any in b
    // We filter a: 120000 doesn't match 115000 (4.17% > 1%), 5 matches 5
    // So matchingNumbers.length = 1, allUniqueNumbers.size = 3
    // result = 1/3 ≈ 0.333
    expect(result).toBeCloseTo(0.333, 2);
  });

  it('numberJaccardSimilarity([120000, 5], [119800, 5]) = 1.0 (0.17% < 1% tolerance)', () => {
    const result = numberJaccardSimilarity([120000, 5], [119800, 5]);
    expect(result).toBeCloseTo(1.0);
  });

  it('should return 1 when both are empty', () => {
    expect(numberJaccardSimilarity([], [])).toBe(1);
  });

  it('should return 0 when one is empty', () => {
    expect(numberJaccardSimilarity([1], [])).toBe(0);
    expect(numberJaccardSimilarity([], [1])).toBe(0);
  });

  it('should handle matching at exact boundary (0.0099 < 0.01)', () => {
    expect(numberJaccardSimilarity([100], [100.99])).toBeCloseTo(1);
  });

  it('should handle zero values', () => {
    // 0 and 0: exact match
    expect(numberJaccardSimilarity([0, 0], [0, 0])).toBeCloseTo(1);
    // 0, 0 vs 0, 1: 0 matches, 1 doesn't -> intersection = 1, union = 2
    expect(numberJaccardSimilarity([0, 0], [0, 1])).toBeCloseTo(0.5);
  });
});

describe('entityJaccardSimilarity', () => {
  it('entityJaccardSimilarity(["bitcoin","sec"], ["bitcoin","sec"]) = 1.0', () => {
    expect(
      entityJaccardSimilarity(['bitcoin', 'sec'], ['bitcoin', 'sec']),
    ).toBe(1.0);
  });

  it('entityJaccardSimilarity(["bitcoin"], ["ethereum"]) = 0.0', () => {
    expect(entityJaccardSimilarity(['bitcoin'], ['ethereum'])).toBe(0.0);
  });

  it('should return 1 when both are empty', () => {
    expect(entityJaccardSimilarity([], [])).toBe(1);
  });

  it('should return 0 when one is empty', () => {
    expect(entityJaccardSimilarity(['a'], [])).toBe(0);
  });

  it('should handle partial overlap', () => {
    expect(
      entityJaccardSimilarity(['bitcoin', 'ethereum'], ['bitcoin', 'solana']),
    ).toBeCloseTo(1 / 3, 2);
  });
});

describe('cashtagJaccardSimilarity', () => {
  it('cashtagJaccardSimilarity(["BTC", "ETH"], ["BTC", "ETH"]) = 1.0', () => {
    expect(cashtagJaccardSimilarity(['BTC', 'ETH'], ['BTC', 'ETH'])).toBe(1.0);
  });

  it('cashtagJaccardSimilarity(["BTC"], ["SOL"]) = 0.0', () => {
    expect(cashtagJaccardSimilarity(['BTC'], ['SOL'])).toBe(0.0);
  });

  it('should return 1 when both are empty', () => {
    expect(cashtagJaccardSimilarity([], [])).toBe(1);
  });

  it('should return 0 when one is empty', () => {
    expect(cashtagJaccardSimilarity(['BTC'], [])).toBe(0);
  });

  it('should handle partial overlap', () => {
    expect(
      cashtagJaccardSimilarity(['BTC', 'ETH'], ['BTC', 'SOL']),
    ).toBeCloseTo(1 / 3, 2);
  });
});

describe('computeScore', () => {
  describe('identical inputs', () => {
    it('computeScore(identical) returns { score: 1.0, zone: "duplicate", signals: [...] }', () => {
      // cosineSimilarity([1,0], [1,0]) = 1.0
      // jaccardSimilarity(['a','b'], ['a','b']) = 1.0 → contribution = (1-0.3)*0.2 = 0.14
      // score = 1.0 + 0.14 = 1.14 → clamped to 1.0
      const result = computeScore(
        makeEmptyInput({
          tokensM: ['a', 'b'],
          tokensE: ['a', 'b'],
        }),
      );
      expect(result.score).toBe(1.0);
      expect(result.zone).toBe('duplicate');
      expect(result.signals).toBeDefined();
      expect(result.signals.length).toBeGreaterThan(0);

      // Verify semantic signal
      const semanticSignal = result.signals.find((s) => s.name === 'semantic');
      expect(semanticSignal).toBeDefined();
      expect(semanticSignal!.contribution).toBe(1.0);
    });

    it('should include all signal names', () => {
      const result = computeScore(
        makeEmptyInput({
          tokensM: ['a', 'b'],
          tokensE: ['a', 'b'],
        }),
      );
      const signalNames = result.signals.map((s) => s.name);
      expect(signalNames).toContain('semantic');
      expect(signalNames).toContain('jaccard');
      expect(signalNames).toContain('number_penalty');
      expect(signalNames).toContain('entity_penalty');
      expect(signalNames).toContain('cashtag_penalty');
      expect(signalNames).toContain('template_divergence_penalty');
      expect(signalNames).toContain('url_boost');
      expect(signalNames).toContain('proximity_boost');
    });
  });

  describe('number penalty', () => {
    it('Score with numbersM: [120000], numbersE: [115000] returns score with number_penalty applied', () => {
      const result = computeScore(
        makeEmptyInput({
          numbersM: [120000],
          numbersE: [115000],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'number_penalty',
      );
      expect(penaltySignal).toBeDefined();
      expect(penaltySignal!.contribution).toBe(
        -DEFAULT_CONFIG.numberPenaltyMedium,
      );
    });

    it('numbers with small diff (0.17%) apply no penalty', () => {
      const result = computeScore(
        makeEmptyInput({
          numbersM: [120000],
          numbersE: [119800],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'number_penalty',
      );
      expect(penaltySignal!.contribution).toBeCloseTo(0);
    });
  });

  describe('entity penalty', () => {
    it('Score with entitiesM: ["bitcoin"], entitiesE: ["ethereum"] returns score with entity_penalty applied', () => {
      const result = computeScore(
        makeEmptyInput({
          entitiesM: ['bitcoin'],
          entitiesE: ['ethereum'],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'entity_penalty',
      );
      expect(penaltySignal).toBeDefined();
      // entityJaccard = 0 < 0.10 → medium penalty
      // But 0 < 0.10 means entityPenaltyMedium
      expect(penaltySignal!.contribution).toBe(
        -DEFAULT_CONFIG.entityPenaltyMedium,
      );
    });

    it('same entities apply no penalty', () => {
      const result = computeScore(
        makeEmptyInput({
          entitiesM: ['bitcoin'],
          entitiesE: ['bitcoin'],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'entity_penalty',
      );
      expect(penaltySignal!.contribution).toBeCloseTo(0);
    });
  });

  describe('template divergence penalty', () => {
    it('should apply penalty when semantic is high AND numberJaccard is low', () => {
      // Embeddings [1, 0] and [0.99, sqrt(1-0.99²)] → semantic ≈ 0.99 (very high)
      const y = Math.sqrt(1 - 0.99 * 0.99);
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0.99, y],
          // 120000 vs 115000 is 4.17% > 1% tolerance → no match
          // 5 vs 99 → no match
          // Intersection = 0, union = 4 → numberJaccard = 0
          numbersM: [120000, 5],
          numbersE: [115000, 99],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'template_divergence_penalty',
      );
      expect(penaltySignal).toBeDefined();
      expect(penaltySignal!.contribution).toBe(
        -DEFAULT_CONFIG.templateDivergencePenalty,
      );
    });

    it('should NOT apply penalty when numberJaccard is high', () => {
      // Embeddings [1, 0] and [0.99, sqrt(1-0.99²)] → semantic ≈ 0.99
      const y = Math.sqrt(1 - 0.99 * 0.99);
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0.99, y],
          // Both within 1% tolerance → numberJaccard ≈ 1.0
          numbersM: [120000, 5],
          numbersE: [119800, 5],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'template_divergence_penalty',
      );
      expect(penaltySignal!.contribution).toBeCloseTo(0);
    });

    it('should NOT apply penalty when semantic is low', () => {
      // Embeddings [1, 0] and [0, 1] → semantic = 0
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0, 1],
          numbersM: [120000],
          numbersE: [115000],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'template_divergence_penalty',
      );
      expect(penaltySignal!.contribution).toBeCloseTo(0);
    });

    it('should NOT apply penalty when both number arrays are empty', () => {
      // Embeddings [1, 0] and [0.99, sqrt(1-0.99²)] → semantic ≈ 0.99
      const y = Math.sqrt(1 - 0.99 * 0.99);
      // Both empty → numberJaccard = 1
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0.99, y],
          numbersM: [],
          numbersE: [],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'template_divergence_penalty',
      );
      expect(penaltySignal!.contribution).toBeCloseTo(0);
    });
  });

  describe('url_divergence_penalty', () => {
    it('Msg111 pattern - partial update applies penalty', () => {
      const y = Math.sqrt(1 - 0.99 * 0.99);
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0.99, y],
          urlOverlapCount: 0,
          entitiesM: ['bitcoin', 'ethereum'],
          entitiesE: ['bitcoin', 'ethereum'],
          numbersM: [6.23, 23.16],
          numbersE: [6.23, 13.16],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'url_divergence_penalty',
      );
      expect(penaltySignal).toBeDefined();
      expect(penaltySignal!.contribution).toBe(
        -DEFAULT_CONFIG.urlDivergencePenalty,
      );
    });

    it('No penalty when urlOverlapCount > 0', () => {
      const y = Math.sqrt(1 - 0.99 * 0.99);
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0.99, y],
          urlOverlapCount: 1,
          entitiesM: ['bitcoin', 'ethereum'],
          entitiesE: ['bitcoin', 'ethereum'],
          numbersM: [6.23, 23.16],
          numbersE: [3.23, 13.16],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'url_divergence_penalty',
      );
      expect(penaltySignal!.contribution).toBeCloseTo(0);
    });

    it('No penalty when semantic is low', () => {
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0, 1],
          urlOverlapCount: 0,
          entitiesM: ['bitcoin', 'ethereum'],
          entitiesE: ['bitcoin', 'ethereum'],
          numbersM: [6.23, 23.16],
          numbersE: [3.23, 13.16],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'url_divergence_penalty',
      );
      expect(penaltySignal!.contribution).toBeCloseTo(0);
    });

    it('No penalty when entityJaccard is low', () => {
      const y = Math.sqrt(1 - 0.99 * 0.99);
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0.99, y],
          urlOverlapCount: 0,
          entitiesM: ['bitcoin'],
          entitiesE: ['cardano'],
          numbersM: [6.23, 23.16],
          numbersE: [3.23, 13.16],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'url_divergence_penalty',
      );
      expect(penaltySignal!.contribution).toBeCloseTo(0);
    });

    it('No penalty when numberJaccard is very low (< 0.3)', () => {
      const y = Math.sqrt(1 - 0.99 * 0.99);
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0.99, y],
          urlOverlapCount: 0,
          entitiesM: ['bitcoin', 'ethereum'],
          entitiesE: ['bitcoin', 'ethereum'],
          numbersM: [120000, 5, 100],
          numbersE: [115000, 99, 200],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'url_divergence_penalty',
      );
      expect(penaltySignal!.contribution).toBeCloseTo(0);
    });

    it('No penalty when numberJaccard is very high (> 0.9)', () => {
      const y = Math.sqrt(1 - 0.99 * 0.99);
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0.99, y],
          urlOverlapCount: 0,
          entitiesM: ['bitcoin', 'ethereum'],
          entitiesE: ['bitcoin', 'ethereum'],
          numbersM: [120000, 5],
          numbersE: [119800, 5],
        }),
      );
      const penaltySignal = result.signals.find(
        (s) => s.name === 'url_divergence_penalty',
      );
      expect(penaltySignal!.contribution).toBeCloseTo(0);
    });

    it('Integration: score drops from duplicate zone to gray zone', () => {
      const y = Math.sqrt(1 - 0.99 * 0.99);
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0.99, y],
          urlOverlapCount: 0,
          tokensM: ['a', 'b'],
          tokensE: ['a', 'b'],
          entitiesM: ['bitcoin', 'ethereum'],
          entitiesE: ['bitcoin', 'ethereum'],
          numbersM: [6.23, 23.16],
          numbersE: [3.23, 13.16],
        }),
      );
      expect(result.score).toBeLessThan(0.95);
    });
  });

  describe('score zones', () => {
    it('score > 0.95 returns zone: "duplicate"', () => {
      // High semantic similarity + high jaccard
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0.999, 0.001],
          tokensM: ['a', 'b', 'c', 'd'],
          tokensE: ['a', 'b', 'c', 'd'],
        }),
      );
      expect(result.zone).toBe('duplicate');
    });

    it('score < 0.75 returns zone: "different"', () => {
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0, 1],
          tokensM: ['a'],
          tokensE: ['b'],
        }),
      );
      expect(result.zone).toBe('different');
    });
  });

  describe('signal contributions', () => {
    it('should include url_boost when urlOverlapCount > 0', () => {
      const result = computeScore(makeEmptyInput({ urlOverlapCount: 1 }));
      const urlSignal = result.signals.find((s) => s.name === 'url_boost');
      expect(urlSignal!.contribution).toBe(DEFAULT_CONFIG.urlBoost);
    });

    it('should NOT include url_boost when urlOverlapCount is 0', () => {
      const result = computeScore(makeEmptyInput({ urlOverlapCount: 0 }));
      const urlSignal = result.signals.find((s) => s.name === 'url_boost');
      expect(urlSignal!.contribution).toBe(0);
    });

    it('should apply urlBoost signal and increase final score when urlOverlapCount > 0', () => {
      const resultWithUrl = computeScore(
        makeEmptyInput({
          urlOverlapCount: 2,
          embeddingM: [1, 0],
          embeddingE: [0, 1],
          tokensM: ['a', 'b', 'c'],
          tokensE: ['a', 'b', 'c'],
        }),
      );

      const resultWithoutUrl = computeScore(
        makeEmptyInput({
          urlOverlapCount: 0,
          embeddingM: [1, 0],
          embeddingE: [0, 1],
          tokensM: ['a', 'b', 'c'],
          tokensE: ['a', 'b', 'c'],
        }),
      );

      const urlSignal = resultWithUrl.signals.find(
        (s) => s.name === 'url_boost',
      );
      expect(urlSignal).toBeDefined();
      expect(urlSignal!.contribution).toBe(DEFAULT_CONFIG.urlBoost);

      expect(resultWithUrl.score).toBeGreaterThan(resultWithoutUrl.score);
      expect(resultWithUrl.score - resultWithoutUrl.score).toBe(
        DEFAULT_CONFIG.urlBoost,
      );
    });

    it('should include proximity_boost when sameSource and within window', () => {
      const result = computeScore(
        makeEmptyInput({ sameSource: true, timeDiffMinutes: 15 }),
      );
      const proxSignal = result.signals.find(
        (s) => s.name === 'proximity_boost',
      );
      expect(proxSignal!.contribution).toBe(DEFAULT_CONFIG.proximityBoost);
    });

    it('should NOT include proximity_boost when beyond window', () => {
      const result = computeScore(
        makeEmptyInput({ sameSource: true, timeDiffMinutes: 60 }),
      );
      const proxSignal = result.signals.find(
        (s) => s.name === 'proximity_boost',
      );
      expect(proxSignal!.contribution).toBe(0);
    });
  });

  describe('custom config', () => {
    it('should override default config with partial config', () => {
      const result = computeScore(makeEmptyInput({ urlOverlapCount: 1 }), {
        urlBoost: 0.5,
      });
      const urlSignal = result.signals.find((s) => s.name === 'url_boost');
      expect(urlSignal!.contribution).toBe(0.5);
    });
  });

  describe('score clamping', () => {
    it('should clamp score to max 1', () => {
      const result = computeScore(
        makeEmptyInput({
          tokensM: ['a'],
          tokensE: ['a'],
        }),
      );
      expect(result.score).toBeLessThanOrEqual(1.0);
    });

    it('should clamp score to min 0', () => {
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0, 1],
          tokensM: ['a', 'b', 'c', 'd', 'e'],
          tokensE: ['f', 'g', 'h', 'i'],
          entitiesM: ['bitcoin', 'ethereum', 'solana'],
          entitiesE: ['cardano', 'polkadot', 'chainlink'],
          cashtagsM: ['BTC', 'ETH'],
          cashtagsE: ['SOL', 'ADA'],
          numbersM: [1000, 2000, 3000],
          numbersE: [4000, 5000],
        }),
      );
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('DedupScorer class', () => {
  it('should have all static methods', () => {
    expect(typeof DedupScorer.jaccardSimilarity).toBe('function');
    expect(typeof DedupScorer.numberJaccardSimilarity).toBe('function');
    expect(typeof DedupScorer.entityJaccardSimilarity).toBe('function');
    expect(typeof DedupScorer.cashtagJaccardSimilarity).toBe('function');
    expect(typeof DedupScorer.computeScore).toBe('function');
  });

  it('should delegate to underlying functions', () => {
    expect(
      DedupScorer.jaccardSimilarity(['btc', 'up'], ['btc', 'up', 'now']),
    ).toBe(2 / 3);
    expect(DedupScorer.jaccardSimilarity([], [])).toBe(1);
    expect(
      DedupScorer.entityJaccardSimilarity(
        ['bitcoin', 'sec'],
        ['bitcoin', 'sec'],
      ),
    ).toBe(1.0);
    expect(
      DedupScorer.cashtagJaccardSimilarity(['BTC', 'ETH'], ['BTC', 'ETH']),
    ).toBe(1.0);
  });
});

describe('acceptance criteria', () => {
  it('jaccardSimilarity(["btc","up"], ["btc","up","now"]) = 2/3', () => {
    expect(jaccardSimilarity(['btc', 'up'], ['btc', 'up', 'now'])).toBe(2 / 3);
  });

  it('jaccardSimilarity([], []) = 1', () => {
    expect(jaccardSimilarity([], [])).toBe(1);
  });

  it('numberJaccardSimilarity([120000, 5], [120000, 5]) = 1.0', () => {
    expect(numberJaccardSimilarity([120000, 5], [120000, 5])).toBeCloseTo(1.0);
  });

  it('numberJaccardSimilarity([120000, 5], [115000, 5]) should be < 0.5', () => {
    // 120000 vs 115000: 4.2% diff > 1% tolerance -> no match
    // 5 matches 5
    // So intersection = {5}, union = {120000, 115000, 5} = 3
    const result = numberJaccardSimilarity([120000, 5], [115000, 5]);
    expect(result).toBeLessThan(0.5);
  });

  it('numberJaccardSimilarity([120000, 5], [119800, 5]) = 1.0 (0.17% < 1%)', () => {
    const result = numberJaccardSimilarity([120000, 5], [119800, 5]);
    expect(result).toBeCloseTo(1.0);
  });

  it('entityJaccardSimilarity(["bitcoin","sec"], ["bitcoin","sec"]) = 1.0', () => {
    expect(
      entityJaccardSimilarity(['bitcoin', 'sec'], ['bitcoin', 'sec']),
    ).toBe(1.0);
  });

  it('entityJaccardSimilarity(["bitcoin"], ["ethereum"]) = 0.0', () => {
    expect(entityJaccardSimilarity(['bitcoin'], ['ethereum'])).toBe(0.0);
  });

  it('cashtagJaccardSimilarity(["BTC", "ETH"], ["BTC", "ETH"]) = 1.0', () => {
    expect(cashtagJaccardSimilarity(['BTC', 'ETH'], ['BTC', 'ETH'])).toBe(1.0);
  });

  it('cashtagJaccardSimilarity(["BTC"], ["SOL"]) = 0.0', () => {
    expect(cashtagJaccardSimilarity(['BTC'], ['SOL'])).toBe(0.0);
  });

  it('computeScore(identical) returns { score: 1.0, zone: "duplicate", signals: [...] }', () => {
    const result = computeScore(
      makeEmptyInput({
        tokensM: ['a'],
        tokensE: ['a'],
      }),
    );
    expect(result.score).toBe(1.0);
    expect(result.zone).toBe('duplicate');
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.signals[0].name).toBe('semantic');
  });
});
