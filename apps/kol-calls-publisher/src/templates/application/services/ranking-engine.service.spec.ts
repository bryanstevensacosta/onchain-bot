import { DomainError } from '../../../shared/kernel/domain-error';
import { RankingEngine, type RankableCall } from './ranking-engine.service';

function call(
  overrides: Partial<RankableCall> & { mentionId: string },
): RankableCall {
  return {
    kolId: 'kol-1',
    score: 50,
    views: null,
    reactions: null,
    scoredAt: new Date('2026-09-25T00:00:00Z'),
    ...overrides,
  };
}

describe('RankingEngine 4 strategies (todo 10, failing-first)', () => {
  const engine = new RankingEngine();

  it('rankByScore sorts score desc with 1-based ranks', () => {
    const ranked = engine.rank(
      [
        call({ mentionId: 'a', score: 10 }),
        call({ mentionId: 'b', score: 90 }),
      ],
      'score',
    );
    expect(ranked.map((r) => r.mentionId)).toEqual(['b', 'a']);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].rankScore).toBe(90);
    expect(ranked[0].strategy).toBe('score');
  });

  it('rankByEngagement sorts views + reactions desc (null = 0)', () => {
    const ranked = engine.rank(
      [
        call({ mentionId: 'a', views: 100, reactions: 1 }),
        call({ mentionId: 'b', views: 10, reactions: 50 }),
        call({ mentionId: 'c' }),
      ],
      'engagement',
    );
    expect(ranked.map((r) => r.mentionId)).toEqual(['a', 'b', 'c']);
    expect(ranked[0].rankScore).toBe(101);
  });

  it('rankByRecency decays exponentially (100 at 0h, 50 at 12h)', () => {
    const now = new Date('2026-09-25T12:00:00Z');
    const ranked = engine.rank(
      [
        call({ mentionId: 'old', scoredAt: new Date('2026-09-25T00:00:00Z') }),
        call({
          mentionId: 'fresh',
          scoredAt: new Date('2026-09-25T12:00:00Z'),
        }),
      ],
      'recency',
      { now },
    );
    expect(ranked.map((r) => r.mentionId)).toEqual(['fresh', 'old']);
    expect(ranked[0].rankScore).toBe(100);
    expect(ranked[1].rankScore).toBe(50);
  });

  it('rankWeighted blends score/engagement/recency with configurable weights', () => {
    const now = new Date('2026-09-25T12:00:00Z');
    const calls = [
      call({
        mentionId: 'high-score',
        score: 100,
        views: 0,
        scoredAt: new Date('2026-09-20T12:00:00Z'),
      }),
      call({
        mentionId: 'hot',
        score: 60,
        views: 1000,
        reactions: 100,
        scoredAt: now,
      }),
    ];
    const byScore = engine.rank(calls, 'weighted', {
      now,
      weights: { score: 1, engagement: 0, recency: 0 },
    });
    expect(byScore[0].mentionId).toBe('high-score');
    const byHeat = engine.rank(calls, 'weighted', {
      now,
      weights: { score: 0, engagement: 0.5, recency: 0.5 },
    });
    expect(byHeat[0].mentionId).toBe('hot');
  });

  it('rejects zero weights and truncates to limit', () => {
    expect(() =>
      engine.rank([call({ mentionId: 'a' })], 'weighted', {
        weights: { score: 0, engagement: 0, recency: 0 },
      }),
    ).toThrow(DomainError);
    const ranked = engine.rank(
      [call({ mentionId: 'a', score: 1 }), call({ mentionId: 'b', score: 2 })],
      'score',
      { limit: 1 },
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0].mentionId).toBe('b');
  });

  it('empty input returns empty output (never throws)', () => {
    expect(engine.rank([], 'score')).toEqual([]);
  });
});
