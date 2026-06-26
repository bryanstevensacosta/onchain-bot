import { KolReputationAggregator } from './kol-reputation-aggregator';
import { KolReputationScorer } from './kol-reputation-scorer';
import { KolReputationCalculator } from './kol-reputation-calculator';

describe('KolReputationAggregator', () => {
  const calls = [
    {
      chain: 'solana',
      address: 'ABC123',
      sources: [
        { kolId: '100', mentionCount: 2 },
        { kolId: '200', mentionCount: 1 },
      ],
      lastSeenAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      chain: 'solana',
      address: 'DEF456',
      sources: [
        { kolId: '100', mentionCount: 3 },
      ],
      lastSeenAt: new Date('2026-01-05T00:00:00Z'),
    },
    {
      chain: 'ethereum',
      address: '0xGHI',
      sources: [
        { kolId: '100' },
      ],
      lastSeenAt: new Date('2026-01-03T00:00:00Z'),
    },
  ];

  it('counts only mentions for the target KOL', () => {
    const stats = KolReputationAggregator.aggregate('100', calls);
    expect(stats.totalMentions).toBe(6);
  });

  it('counts distinct tokens mentioned by the KOL', () => {
    const stats = KolReputationAggregator.aggregate('100', calls);
    expect(stats.distinctTokens).toBe(3);
  });

  it('returns zero stats for KOL with no mentions', () => {
    const stats = KolReputationAggregator.aggregate('999', calls);
    expect(stats.totalMentions).toBe(0);
    expect(stats.distinctTokens).toBe(0);
  });

  it('tracks firstSeenAt and lastSeenAt', () => {
    const stats = KolReputationAggregator.aggregate('100', calls);
    expect(stats.firstSeenAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(stats.lastSeenAt).toEqual(new Date('2026-01-05T00:00:00Z'));
  });

  it('coerces numeric kolId to string for comparison', () => {
    const mixed = [
      { chain: 'solana', address: 'X', sources: [{ kolId: 100, mentionCount: 5 }], lastSeenAt: new Date() },
    ];
    const stats = KolReputationAggregator.aggregate('100', mixed);
    expect(stats.totalMentions).toBe(5);
  });
});

describe('KolReputationScorer', () => {
  it('returns 0.5 LOW for zero mentions', () => {
    const { score, confidence } = KolReputationScorer.score({ totalMentions: 0 });
    expect(score).toBe(0.5);
    expect(confidence).toBe('LOW');
  });

  it('returns log-scaled score around 0.5 for positive mentions', () => {
    const { score } = KolReputationScorer.score({ totalMentions: 1 });
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(0.7);
  });

  it('caps score at 0.95 for high volume', () => {
    const { score } = KolReputationScorer.score({ totalMentions: 10_000 });
    expect(score).toBe(0.95);
  });

  it('confidence reflects volume thresholds', () => {
    expect(KolReputationScorer.score({ totalMentions: 1 }).confidence).toBe('LOW');
    expect(KolReputationScorer.score({ totalMentions: 5 }).confidence).toBe('MEDIUM');
    expect(KolReputationScorer.score({ totalMentions: 20 }).confidence).toBe('HIGH');
    expect(KolReputationScorer.score({ totalMentions: 50 }).confidence).toBe('VERY_HIGH');
  });
});

describe('KolReputationCalculator', () => {
  it('produces a KolReputation with real score from canonical calls', () => {
    const calls = [
      {
        chain: 'solana',
        address: 'ABC',
        sources: [{ kolId: '100', mentionCount: 15 }],
        lastSeenAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        chain: 'solana',
        address: 'DEF',
        sources: [{ kolId: '100', mentionCount: 5 }],
        lastSeenAt: new Date('2026-01-02T00:00:00Z'),
      },
    ];
    const rep = KolReputationCalculator.calculateFromCanonicalCalls('100', calls);
    expect(rep.kolId).toBe('100');
    expect(rep.totalCalls).toBe(20);
    expect(rep.score).toBeGreaterThan(0.5);
    expect(rep.confidence).toBe('HIGH');
    expect(rep.neutralCalls).toBe(20);
    expect(rep.strongCalls).toBe(0);
  });

  it('returns neutral 0.5 LOW reputation for KOL with no calls', () => {
    const rep = KolReputationCalculator.calculateFromCanonicalCalls('999', []);
    expect(rep.score).toBe(0.5);
    expect(rep.confidence).toBe('LOW');
    expect(rep.totalCalls).toBe(0);
  });
});