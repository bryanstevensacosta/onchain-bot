import {
  applyComputedFdv,
  coherentMarketCapOf,
  computedFdvEpsilonBound,
  computedFdvOf,
} from './snapshot-computed-fdv';

/**
 * Single-seam computed FDV (dexter plan todo 38).
 *
 * Epsilon invariant (pinned): `|fdv − price×supply| ≤ max(1e-9×|…|, 1e-9)`.
 * Four fixtures: Solana-fixed, EVM-vested, null-supply→null, INCOME
 * (price×total≈2689 vs reported 3016 — supply field cited: total).
 */
const invariantHolds = (fdv: number | null, product: number): boolean => {
  if (fdv === null) return false;
  return Math.abs(fdv - product) <= computedFdvEpsilonBound(product);
};

describe('computedFdvOf (single-seam FDV math)', () => {
  it('Solana-fixed fixture: price×total exact within epsilon', () => {
    // Fixed-supply SPL mint (mint-disabled ⇒ total == max).
    const price = 2.5;
    const total = 1_000_000;
    const fdv = computedFdvOf(price, total, total);
    expect(fdv).not.toBeNull();
    expect(invariantHolds(fdv, price * total)).toBe(true);
    expect(fdv).toBeCloseTo(2_500_000, 6);
  });

  it('EVM-vested fixture: total wins over max, epsilon holds', () => {
    // Vested EVM token: total (unlocked) ≠ max (fully-diluted cap).
    const price = 10;
    const total = 1_000_000;
    const max = 10_000_000;
    const fdv = computedFdvOf(price, total, max);
    expect(fdv).toBeCloseTo(10_000_000, 6);
    expect(invariantHolds(fdv, price * total)).toBe(true);
    // Must NOT equal price×max (max is the fallback only).
    expect(fdv).not.toBeCloseTo(price * max, 6);
  });

  it('EVM max-fallback fixture: null total falls back to max', () => {
    const price = 0.5;
    const fdv = computedFdvOf(price, null, 4_000_000);
    expect(fdv).toBeCloseTo(2_000_000, 6);
    expect(invariantHolds(fdv, price * 4_000_000)).toBe(true);
  });

  it('null-supply fixture: no total and no max → null (never 0)', () => {
    expect(computedFdvOf(3.25, null, null)).toBeNull();
  });

  it.each([
    ['NaN price', Number.NaN, 1_000, 1_000],
    ['Infinity price', Number.POSITIVE_INFINITY, 1_000, 1_000],
    ['negative price', -1.5, 1_000, 1_000],
    ['zero price', 0, 1_000, 1_000],
    ['NaN supply', 2, Number.NaN, null],
    ['Infinity supply', 2, Number.POSITIVE_INFINITY, null],
    ['negative supply', 2, -500, null],
    ['zero supply', 2, 0, 0],
    ['null price', null, 1_000, 1_000],
  ])(
    'edge %s → null (fail-open, never invented)',
    (_label, price, total, max) => {
      expect(computedFdvOf(price, total, max)).toBeNull();
    },
  );
});

describe('coherentMarketCapOf (MC coherence)', () => {
  it('recomputes price×circ when circ present', () => {
    expect(coherentMarketCapOf(10, 400_000)).toBeCloseTo(4_000_000, 6);
  });

  it.each([
    ['absent circ', 10, null],
    ['zero circ', 10, 0],
    ['negative circ', 10, -5],
    ['NaN circ', 10, Number.NaN],
    ['null price', null, 400_000],
  ])('edge %s → null (caller keeps merged MC)', (_label, price, circ) => {
    expect(coherentMarketCapOf(price, circ)).toBeNull();
  });
});

describe('applyComputedFdv (seam patch)', () => {
  const base = {
    priceUsd: 10,
    marketCapUsd: 999,
    fdvUsd: 3016,
    totalSupply: 1_000_000,
    circulatingSupply: 400_000,
    maxSupply: 10_000_000,
  };

  it('INCOME-pattern fixture: reported 3016 discarded → price×total≈2689 (supply field: total)', () => {
    // INCOME `7Dyyq…vimkYdX` (solana): own price×supply ≈ 2689 ≈ Rick
    // 2.7K vs provider-reported fdv 3016. Fixture reproduces the cited
    // magnitudes (price 0.000002689 × total 1e9, pump-style supply);
    // live NOT re-probed — fixtures carry the proof per the todo.
    const patched = applyComputedFdv({
      ...base,
      priceUsd: 0.000002689,
      marketCapUsd: 3016,
      fdvUsd: 3016,
      totalSupply: 1_000_000_000,
      circulatingSupply: null,
      maxSupply: 1_000_000_000,
    });
    expect(patched.fdvUsd).toBeCloseTo(2689, 0);
    expect(invariantHolds(patched.fdvUsd, 0.000002689 * 1_000_000_000)).toBe(
      true,
    );
    expect(patched.reportedFdvUsd).toBe(3016);
    expect(patched.fdvProvenance).toBe('computed');
    // No circ → merged MC kept (fixed-supply MC≈FDV assumption).
    expect(patched.marketCapUsd).toBe(3016);
    expect(patched.marketCapRecomputed).toBe(false);
  });

  it('recomputes MC as price×circ when circ present (provider MC discarded)', () => {
    const patched = applyComputedFdv(base);
    expect(patched.fdvUsd).toBeCloseTo(10_000_000, 6);
    expect(patched.marketCapUsd).toBeCloseTo(4_000_000, 6);
    expect(patched.marketCapRecomputed).toBe(true);
    expect(patched.reportedMarketCapUsd).toBe(999);
    // Coherence: MC ≤ FDV by construction here (circ ≤ total).
    expect(patched.marketCapUsd as number).toBeLessThanOrEqual(
      patched.fdvUsd as number,
    );
  });

  it('circulating NEVER feeds FDV: circ-only supplies → null FDV', () => {
    const patched = applyComputedFdv({
      ...base,
      totalSupply: null,
      maxSupply: null,
      circulatingSupply: 400_000,
    });
    expect(patched.fdvUsd).toBeNull();
    expect(patched.fdvProvenance).toBe('computed');
    // MC still recomputes from circ (independent path).
    expect(patched.marketCapUsd).toBeCloseTo(4_000_000, 6);
  });

  it('null-supply keeps merged MC and tags provenance (computed-null is computed)', () => {
    const patched = applyComputedFdv({
      ...base,
      totalSupply: null,
      maxSupply: null,
      circulatingSupply: null,
    });
    expect(patched.fdvUsd).toBeNull();
    expect(patched.marketCapUsd).toBe(999);
    expect(patched.fdvProvenance).toBe('computed');
  });
});
