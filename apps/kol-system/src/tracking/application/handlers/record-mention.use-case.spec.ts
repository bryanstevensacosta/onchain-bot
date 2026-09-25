import { RecordMentionUseCase } from './record-mention.use-case';
import { InMemoryTrackedMentionRepository } from '../../infrastructure/repositories/in-memory-tracked-mention.repository';

function at(iso: string): Date {
  return new Date(iso);
}

describe('RecordMentionUseCase (todo 12, failing-first)', () => {
  it('records the first mention as First time', async () => {
    const repo = new InMemoryTrackedMentionRepository();
    const uc = new RecordMentionUseCase(repo);
    const { tracked, isFirst } = await uc.execute({
      kolId: 'k1',
      chain: 'solana',
      address: 'A1',
      mentionId: 'k1:1:0',
      mcAt: 100,
      seenAt: at('2026-09-25T10:00:00.000Z'),
    });
    expect(isFirst).toBe(true);
    expect(tracked.timesCalled).toBe(1);
    expect(tracked.tracking).toBe('First time');
  });

  it('records the 2nd mention of the same kol+contract as 2x from last call with deltas', async () => {
    const repo = new InMemoryTrackedMentionRepository();
    const uc = new RecordMentionUseCase(repo);
    await uc.execute({
      kolId: 'k1',
      chain: 'solana',
      address: 'A1',
      mentionId: 'k1:1:0',
      mcAt: 100,
      seenAt: at('2026-09-25T10:00:00.000Z'),
    });
    const { tracked, isFirst, multiple, mcDelta } = await uc.execute({
      kolId: 'k1',
      chain: 'solana',
      address: 'A1',
      mentionId: 'k1:2:0',
      mcAt: 200,
      seenAt: at('2026-09-25T11:00:00.000Z'),
    });
    expect(isFirst).toBe(false);
    expect(tracked.timesCalled).toBe(2);
    expect(multiple).toBe(2);
    expect(mcDelta).toBe(100);
    expect(tracked.tracking).toBe('2x from last call');
  });

  it('tracks different contracts of the same kol independently', async () => {
    const repo = new InMemoryTrackedMentionRepository();
    const uc = new RecordMentionUseCase(repo);
    await uc.execute({
      kolId: 'k1',
      chain: 'solana',
      address: 'A1',
      mentionId: 'k1:1:0',
      mcAt: 100,
      seenAt: at('2026-09-25T10:00:00.000Z'),
    });
    const { tracked, isFirst } = await uc.execute({
      kolId: 'k1',
      chain: 'solana',
      address: 'B2',
      mentionId: 'k1:1:1',
      mcAt: 50,
      seenAt: at('2026-09-25T10:05:00.000Z'),
    });
    expect(isFirst).toBe(true);
    expect(tracked.timesCalled).toBe(1);
    expect(tracked.tracking).toBe('First time');
    expect(await repo.count()).toBe(2);
  });

  it('shows mc n/a without crashing when first_mc_at is null', async () => {
    const repo = new InMemoryTrackedMentionRepository();
    const uc = new RecordMentionUseCase(repo);
    await uc.execute({
      kolId: 'k1',
      chain: 'solana',
      address: 'A1',
      mentionId: 'k1:1:0',
      mcAt: null,
      seenAt: at('2026-09-25T10:00:00.000Z'),
    });
    const { tracked } = await uc.execute({
      kolId: 'k1',
      chain: 'solana',
      address: 'A1',
      mentionId: 'k1:2:0',
      mcAt: 200,
      seenAt: at('2026-09-25T11:00:00.000Z'),
    });
    expect(tracked.timesCalled).toBe(2);
    expect(tracked.tracking).toBe('mc n/a');
  });
});
