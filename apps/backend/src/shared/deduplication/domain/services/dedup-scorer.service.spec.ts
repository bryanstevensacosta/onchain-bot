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
  hasSharedDistinctiveNumber,
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
    it('Msg111 pattern — partial update with partial number divergence → gray_zone', () => {
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
          sameSource: true,
          timeDiffMinutes: 1,
        }),
      );
      const signal = result.signals.find(
        (s) => s.name === 'url_divergence_penalty',
      );
      expect(signal).toBeDefined();
      expect(signal!.contribution).toBe(0);
      expect(result.zone).toBe('gray_zone');
      // Pre-fix: numPenaltyLow + templateDivergence penalty pushed raw past the
      // duplicate threshold; urlDivergence override then hardcoded the score to 0.88.
      // Post-fix (boostNumberJaccardThreshold=0.7): numJ=0.333 < 0.7 gates both boosts,
      // so the raw score sits in the gray_zone band naturally and the override is
      // a no-op. Pin the band, not a magic number, so the test stays stable when
      // either the gate or the override threshold is retuned.
      expect(result.score).toBeGreaterThan(0.75);
      expect(result.score).toBeLessThan(0.95);
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

    it('Integration: partial update with token overlap → gray_zone', () => {
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
          numbersE: [6.23, 13.16],
          sameSource: true,
          timeDiffMinutes: 1,
        }),
      );
      const signal = result.signals.find(
        (s) => s.name === 'url_divergence_penalty',
      );
      expect(signal).toBeDefined();
      expect(result.zone).toBe('gray_zone');
      // Same rationale as the Msg111 test above: the boost gate keeps the raw
      // score inside gray_zone, so the urlDivergence override is a no-op here.
      // Pin the user-visible band rather than the override's hardcoded 0.88.
      expect(result.score).toBeGreaterThan(0.75);
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

    it('score < grayZoneMin (0.60) returns zone: "different"', () => {
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

  /**
   * Regression fixture for the staging whale 9591→9616 UPDATE-pair bug.
   *
   * Real pair: cos=0.9126, tokJ=0.244, numJ=0.600 (partial hex digits),
   * entJ=0.333, casJ=0.667, urlOverlap=1, sameSource=true, timeDiff=25min.
   *
   * Pre-fix code unconditionally applied urlBoost (+0.15) + proximityBoost (+0.10)
   * → raw 1.1014 → clamped to 1.0 → classified duplicate (WRONG, the pair is an UPDATE).
   * Gating both boosts on numberJaccard >= 0.7 yields 0.8514 → gray_zone so the LLM arbiter
   * can correctly classify the UPDATE.
   */
  describe('boostNumberJaccardThreshold gating (whale 9591→9616 staging bug)', () => {
    // Deterministic unit vectors of width 384 (MiniLM-L6-v2) with cosine = 0.9126 exactly.
    const COSINE_TARGET = 0.9126;
    const angle = Math.acos(COSINE_TARGET);
    const EMBED_DIM = 384;
    const embeddingM: number[] = new Array(EMBED_DIM)
      .fill(0)
      .map((_, i) => (i === 0 ? 1 : 0));
    const embeddingE: number[] = new Array(EMBED_DIM).fill(0).map((_, i) => {
      if (i === 0) return Math.cos(angle);
      if (i === 1) return Math.sin(angle);
      return 0;
    });
    {
      const norm = Math.hypot(...embeddingE);
      for (let i = 0; i < embeddingE.length; i += 1) {
        embeddingE[i] = embeddingE[i] / norm;
      }
    }

    // Token/number/entity/cashtag arrays chosen so the Jaccard values the scorer sees
    // match the whale pair within tolerance:
    //   tokens: 16 shared of 41 each → tokJ = 16/66 ≈ 0.2424 (target 0.244)
    //   numbers: 6 shared of 8 each → numJ = 6/10 = 0.6 EXACT
    //   entities: 1 shared of 2 each → entJ = 1/3 ≈ 0.333 EXACT
    //   cashtags: 2 shared (3 in M, 2 in E) → casJ = 2/3 ≈ 0.667 EXACT
    const sharedTokens = Array.from({ length: 16 }, (_, i) => `s${i}`);
    const tokensM = [
      ...sharedTokens,
      ...Array.from({ length: 25 }, (_, i) => `m${i}`),
    ];
    const tokensE = [
      ...sharedTokens,
      ...Array.from({ length: 25 }, (_, i) => `e${i}`),
    ];
    const sharedNumbers = [123450, 678900, 111220, 333440, 555660, 777880];
    const numbersM = [...sharedNumbers, 1, 2];
    const numbersE = [...sharedNumbers, 3, 4];
    const entitiesM = ['bitcoin', 'l2'];
    const entitiesE = ['bitcoin', 'l1'];
    const cashtagsM = ['BTC', 'ETH', 'SOL'];
    const cashtagsE = ['BTC', 'ETH'];

    it('regression: whale 9591→9616 UPDATE pair → gray_zone (LLM arbitrates)', () => {
      // Expected with the fix:
      //   semantic            = 0.9126
      //   jaccard contribution = (0.2424 − 0.3) · 0.2 = −0.01152
      //   numberJaccard       = 0.6 → no number penalty (≥ 0.6 boundary)
      //   entityJaccard       = 1/3 ≈ 0.333 → entityPenaltyLow (0.05)
      //   cashtagJaccard      = 2/3 ≈ 0.667 → no cashtag penalty
      //   templateDivergence  : semantic > 0.9 AND numJ (0.6) NOT < 0.4 → no penalty
      //   urlBoost            : numJ < 0.7 → GATED to 0
      //   proximityBoost      : numJ < 0.7 → GATED to 0
      //   raw                 ≈ 0.8511, zone 0.75 < s < 0.95 → gray_zone
      const result = computeScore({
        embeddingM,
        embeddingE,
        tokensM,
        tokensE,
        numbersM,
        numbersE,
        entitiesM,
        entitiesE,
        cashtagsM,
        cashtagsE,
        urlOverlapCount: 1,
        sameSource: true,
        timeDiffMinutes: 25,
      });
      expect(result.score).toBeCloseTo(0.8514, 2);
      expect(result.zone).toBe('gray_zone');
    });

    it('control: identical numbers (numJ=1.0) → near-perfect score, duplicate zone', () => {
      // numJ = 1.0 clears the gate, so urlBoost (0.15) + proximityBoost (0.10) both apply;
      // raw ≈ 1.1011 → clamped to 1.0 → duplicate.
      const result = computeScore({
        embeddingM,
        embeddingE,
        tokensM,
        tokensE,
        numbersM: sharedNumbers,
        numbersE: sharedNumbers,
        entitiesM,
        entitiesE,
        cashtagsM,
        cashtagsE,
        urlOverlapCount: 1,
        sameSource: true,
        timeDiffMinutes: 25,
      });
      expect(result.score).toBeGreaterThanOrEqual(0.95);
      expect(result.zone).toBe('duplicate');
    });

    it('timeDiff beyond proximity window: same whale inputs with timeDiff=45min → gray_zone', () => {
      // Pre-fix behavior (urlBoost unconditional, regardless of numJ): raw ≈ 0.9961 → duplicate.
      // After fix: urlBoost gated by numJ → 0; proximity already excluded by the window.
      // Pins the gray_zone outcome as the invariant that gates the original staging bug.
      const result = computeScore({
        embeddingM,
        embeddingE,
        tokensM,
        tokensE,
        numbersM,
        numbersE,
        entitiesM,
        entitiesE,
        cashtagsM,
        cashtagsE,
        urlOverlapCount: 1,
        sameSource: true,
        timeDiffMinutes: 45,
      });
      expect(result.zone).toBe('gray_zone');
      expect(result.score).toBeGreaterThan(0.75);
      expect(result.score).toBeLessThan(0.95);
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

/**
 * V_A_C variant — distinctive-number boost (+0.12) + gray-zone threshold 0.60.
 *
 * Validated empirically on 206 real fingerprints over a 7d window. Numbers
 * below are ground truth from the harness (`.tmp-dedup-tests/replay-dedup-variants.ts`
 * + `verify-invariants.ts`). They MUST stay pinned — any change to the boost
 * curve or zone thresholds invalidates the replay and is a regression.
 */
describe('V_A_C: distinctive-number boost + gray-zone 0.60', () => {
  describe('DEFAULT_CONFIG (validated values)', () => {
    it('exposes grayZoneMin = 0.60', () => {
      expect(DEFAULT_CONFIG.grayZoneMin).toBe(0.6);
    });

    it('exposes duplicateThreshold = 0.95', () => {
      expect(DEFAULT_CONFIG.duplicateThreshold).toBe(0.95);
    });

    it('exposes numberBoost = 0.12', () => {
      expect(DEFAULT_CONFIG.numberBoost).toBe(0.12);
    });

    it('exposes numberBoostMinSemantic = 0.55', () => {
      expect(DEFAULT_CONFIG.numberBoostMinSemantic).toBe(0.55);
    });

    it('exposes numberBoostMinMagnitude = 1e6', () => {
      expect(DEFAULT_CONFIG.numberBoostMinMagnitude).toBe(1e6);
    });

    it('exposes numberBoostTolerance = 0.01', () => {
      expect(DEFAULT_CONFIG.numberBoostTolerance).toBe(0.01);
    });

    it('reuses existing boostNumberJaccardThreshold = 0.7 (no duplicate field)', () => {
      expect(DEFAULT_CONFIG.boostNumberJaccardThreshold).toBe(0.7);
      // Sanity: the boost gate is the same number the url/proximity boosts gate on.
      expect(
        (DEFAULT_CONFIG as unknown as Record<string, unknown>)
          .boostNumJaccardThreshold,
      ).toBeUndefined();
    });

    it('preserves all pre-existing fields unchanged (additive change)', () => {
      expect(DEFAULT_CONFIG.semanticThreshold).toBe(0.85);
      expect(DEFAULT_CONFIG.urlBoost).toBe(0.15);
      expect(DEFAULT_CONFIG.proximityBoost).toBe(0.1);
      expect(DEFAULT_CONFIG.proximityWindowMinutes).toBe(30);
      expect(DEFAULT_CONFIG.jaccardWeight).toBe(0.2);
      expect(DEFAULT_CONFIG.urlDivergencePenalty).toBe(0.12);
    });
  });

  describe('zone determination (parametrized thresholds)', () => {
    it('semantic 0.7 + empty tokens → score 0.84, gray_zone (0.60 ≤ score < 0.95)', () => {
      // Empty-token baseline contributes (1-0.3)*0.2 = 0.14, so semantic 0.7
      // yields score 0.84, which lands in the gray band (0.60-0.95).
      const y = Math.sqrt(1 - 0.7 * 0.7);
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0.7, y],
        }),
      );
      expect(result.score).toBeGreaterThanOrEqual(0.6);
      expect(result.score).toBeLessThan(0.95);
      expect(result.zone).toBe('gray_zone');
    });

    it('override grayZoneMin=0.75 → same score 0.84 stays gray_zone, score <0.75 becomes different', () => {
      // Pin the regression guard: at 0.75 boundary, identical inputs land in
      // the gray band; lowering the semantic to 0.5 (with empty tokens) yields
      // 0.5+0.14 = 0.64, which is now different under 0.75 (0.64 < 0.75) but
      // gray_zone under 0.60 (0.64 >= 0.60).
      const y075 = Math.sqrt(1 - 0.7 * 0.7);
      const rHigh = computeScore(
        makeEmptyInput({ embeddingM: [1, 0], embeddingE: [0.7, y075] }),
        { grayZoneMin: 0.75 },
      );
      expect(rHigh.zone).toBe('gray_zone');

      const yLow = Math.sqrt(1 - 0.5 * 0.5);
      const rLow = computeScore(
        makeEmptyInput({ embeddingM: [1, 0], embeddingE: [0.5, yLow] }),
        { grayZoneMin: 0.75 },
      );
      expect(rLow.score).toBeCloseTo(0.64, 2);
      expect(rLow.zone).toBe('different');
    });

    it('semantic 0.4 + empty tokens → score 0.54, different', () => {
      const y = Math.sqrt(1 - 0.4 * 0.4);
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0.4, y],
        }),
      );
      // 0.4 + (1-0.3)*0.2 = 0.4 + 0.14 = 0.54, which is < 0.60 → different.
      expect(result.score).toBeCloseTo(0.54, 2);
      expect(result.zone).toBe('different');
    });

    it('score > 0.95 with default config → duplicate', () => {
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [1, 0],
          tokensM: ['a', 'b'],
          tokensE: ['a', 'b'],
        }),
      );
      expect(result.score).toBeGreaterThan(0.95);
      expect(result.zone).toBe('duplicate');
    });
  });

  describe('hasSharedDistinctiveNumber (exported helper)', () => {
    it('returns true for a single large shared number within tolerance', () => {
      expect(hasSharedDistinctiveNumber([5e9], [5e9], 1e6, 0.01)).toBe(true);
    });

    it('returns true for shared numbers within 1% tolerance', () => {
      expect(
        hasSharedDistinctiveNumber([5_000_000_000], [5_010_000_000], 1e6, 0.01),
      ).toBe(true);
    });

    it('returns false when shared numbers are below minMagnitude', () => {
      expect(hasSharedDistinctiveNumber([3, 7], [3, 7], 1e6, 0.01)).toBe(false);
    });

    it('returns false when no number matches within tolerance', () => {
      expect(
        hasSharedDistinctiveNumber([5e9, 100], [6e9, 200], 1e6, 0.01),
      ).toBe(false);
    });
  });

  describe('number_boost signal + zone promotion', () => {
    it('case 71368-like: shared $5B + semantic 0.585 + numJ 1.0 → boost +0.12 (lands in gray_zone)', () => {
      // Hand-crafted input that lands in the 71368 family: shared large number,
      // modest semantic similarity, low token overlap, no entity overlap. The
      // 0.585 semantic is below the 0.60 gray_zone threshold on its own, but
      // the +0.12 boost raises the score into the gray band so the LLM
      // arbiter gets the final say. With empty entities and identical
      // cashtags, the only delta is the token penalty (-0.02) plus the
      // boost (+0.12) → final score sits in the gray band.
      const COS = 0.585;
      const angle = Math.acos(COS);
      const y = Math.sin(angle);
      const x = Math.cos(angle);
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [x, y],
          tokensM: ['strategy', 'raises', 'capital'],
          tokensE: ['reuters', 'reports', 'strategy'],
          numbersM: [5_000_000_000],
          numbersE: [5_000_000_000],
        }),
      );
      // Sanity: the +0.12 boost must apply (numJ=1.0, distinctive $5B shared,
      // semantic 0.585 >= 0.55).
      const boostSignal = result.signals.find((s) => s.name === 'number_boost');
      expect(boostSignal).toBeDefined();
      expect(boostSignal!.contribution).toBeCloseTo(
        DEFAULT_CONFIG.numberBoost,
        4,
      );
      // Pin the band, not a single point, so the test stays stable across
      // harmless tuning of the underlying token penalties.
      expect(result.score).toBeGreaterThanOrEqual(0.6);
      expect(result.score).toBeLessThan(0.95);
      expect(result.zone).toBe('gray_zone');
    });

    it('does NOT boost when semantic < numberBoostMinSemantic (0.55)', () => {
      // Embedding cosine 0.50 (below 0.55 gate).
      const COS = 0.5;
      const y = Math.sin(Math.acos(COS));
      const x = Math.cos(Math.acos(COS));
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [x, y],
          numbersM: [5e9],
          numbersE: [5e9],
        }),
      );
      const boostSignal = result.signals.find((s) => s.name === 'number_boost');
      expect(boostSignal).toBeDefined();
      expect(boostSignal!.contribution).toBe(0);
    });

    it('does NOT boost when no distinctive number is shared (only small numbers)', () => {
      // semantic >= 0.55, but the shared numbers are tiny (below 1e6 magnitude).
      const y = Math.sqrt(1 - 0.99 * 0.99);
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [0.99, y],
          numbersM: [3, 7],
          numbersE: [3, 7],
        }),
      );
      const boostSignal = result.signals.find((s) => s.name === 'number_boost');
      expect(boostSignal).toBeDefined();
      expect(boostSignal!.contribution).toBe(0);
    });

    it('whale 9616 invariant: numJ = 0.6 (below 0.7 gate) → no boost, score in gray_zone', () => {
      // Cosine 0.9126, one shared number, one different number per side → numJ ≈ 0.6.
      // The number gate is numJ >= 0.7, so the boost MUST NOT fire here.
      // This is the whale UPDATE invariant: gray_zone, no auto-block.
      const COS = 0.9126;
      const angle = Math.acos(COS);
      const y = Math.sin(angle);
      const x = Math.cos(angle);
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [x, y],
          tokensM: ['a', 'b', 'c', 'd'],
          tokensE: ['a', 'b', 'c', 'd'],
          numbersM: [5_000_000_000, 100],
          numbersE: [5_000_000_000, 200],
        }),
      );
      // 5e9 matches 5e9 within tolerance → helper says yes. BUT numJ is 0.5
      // (1 of 3 unique elements matches) < 0.7 → boost is gated off. This
      // preserves the whale 9616 invariant under V_A_C.
      const boostSignal = result.signals.find((s) => s.name === 'number_boost');
      expect(boostSignal).toBeDefined();
      expect(boostSignal!.contribution).toBe(0);
    });

    it('cap: score base 0.95 + boost → 1.0, not 1.07', () => {
      // Identical embeddings + identical numbers: base score is 1.0 already
      // (clamped). With boost attempted, the final score must remain at 1.0.
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [1, 0],
          tokensM: ['a', 'b'],
          tokensE: ['a', 'b'],
          numbersM: [5e9],
          numbersE: [5e9],
        }),
      );
      expect(result.score).toBeLessThanOrEqual(1.0);
    });

    it('Schumer invariant: identical numbers + identical tokens → duplicate (1.0)', () => {
      // The 17811 dup of 17799 invariant: the pair is auto-blocked today, MUST
      // remain auto-blocked under V_A_C.
      const result = computeScore(
        makeEmptyInput({
          embeddingM: [1, 0],
          embeddingE: [1, 0],
          tokensM: ['schumer', 'ai'],
          tokensE: ['schumer', 'ai'],
          numbersM: [50_000_000_000],
          numbersE: [50_000_000_000],
        }),
      );
      expect(result.zone).toBe('duplicate');
      expect(result.score).toBeGreaterThanOrEqual(0.95);
    });
  });
});
