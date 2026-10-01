import { TrackedMention } from './tracked-mention.entity';

function at(iso: string): Date {
  return new Date(iso);
}

describe('TrackedMention (todo 12, failing-first)', () => {
  it('labels the first mention of kol+contract as First time', () => {
    const tracked = TrackedMention.create({
      kolId: 'k1',
      chain: 'solana',
      address: 'A1',
      mentionId: 'k1:1:0',
      mcAt: 100,
      seenAt: at('2026-09-25T10:00:00.000Z'),
    });
    expect(tracked.id).toBe('k1:solana:A1');
    expect(tracked.timesCalled).toBe(1);
    expect(tracked.firstMcAt).toBe(100);
    expect(tracked.lastCallMcAt).toBe(100);
    expect(tracked.multiple).toBe(1);
    expect(tracked.tracking).toBe('First time');
  });

  it('labels the 2nd mention of the same kol+contract as 2x from last call with deltas', () => {
    const tracked = TrackedMention.create({
      kolId: 'k1',
      chain: 'solana',
      address: 'A1',
      mentionId: 'k1:1:0',
      mcAt: 100,
      seenAt: at('2026-09-25T10:00:00.000Z'),
    });
    const result = tracked.recordCall({
      mentionId: 'k1:2:0',
      mcAt: 200,
      seenAt: at('2026-09-25T11:00:00.000Z'),
    });
    expect(tracked.timesCalled).toBe(2);
    expect(tracked.firstMcAt).toBe(100);
    expect(tracked.lastCallMcAt).toBe(200);
    expect(result.multiple).toBe(2);
    expect(result.mcDelta).toBe(100);
    expect(tracked.multiple).toBe(2);
    expect(tracked.tracking).toBe('2x from last call');
  });

  it('keeps first_mc_at stable across later calls (own column, no canonical mcAtCall)', () => {
    const tracked = TrackedMention.create({
      kolId: 'k1',
      chain: 'solana',
      address: 'A1',
      mentionId: 'k1:1:0',
      mcAt: 100,
      seenAt: at('2026-09-25T10:00:00.000Z'),
    });
    tracked.recordCall({
      mentionId: 'k1:2:0',
      mcAt: 200,
      seenAt: at('2026-09-25T11:00:00.000Z'),
    });
    tracked.recordCall({
      mentionId: 'k1:3:0',
      mcAt: 500,
      seenAt: at('2026-09-25T12:00:00.000Z'),
    });
    expect(tracked.timesCalled).toBe(3);
    expect(tracked.firstMcAt).toBe(100);
    expect(tracked.lastCallMcAt).toBe(500);
    expect(tracked.multiple).toBe(5);
    expect(tracked.tracking).toBe('5x from last call');
  });

  it('shows mc n/a without crashing when first_mc_at is null (enrichment failed)', () => {
    const tracked = TrackedMention.create({
      kolId: 'k1',
      chain: 'solana',
      address: 'A1',
      mentionId: 'k1:1:0',
      mcAt: null,
      seenAt: at('2026-09-25T10:00:00.000Z'),
    });
    expect(tracked.tracking).toBe('First time');
    const result = tracked.recordCall({
      mentionId: 'k1:2:0',
      mcAt: 200,
      seenAt: at('2026-09-25T11:00:00.000Z'),
    });
    expect(result.multiple).toBeNull();
    expect(result.mcDelta).toBeNull();
    expect(tracked.tracking).toBe('mc n/a');
  });

  it('shows mc n/a when the latest mc is missing too', () => {
    const tracked = TrackedMention.create({
      kolId: 'k1',
      chain: 'solana',
      address: 'A1',
      mentionId: 'k1:1:0',
      mcAt: 100,
      seenAt: at('2026-09-25T10:00:00.000Z'),
    });
    tracked.recordCall({
      mentionId: 'k1:2:0',
      mcAt: null,
      seenAt: at('2026-09-25T11:00:00.000Z'),
    });
    expect(tracked.tracking).toBe('mc n/a');
  });
});
