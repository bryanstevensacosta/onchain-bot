import { InMemoryAchievementThresholdRepository } from './in-memory-milestone-threshold.repository';

describe('InMemoryAchievementThresholdRepository', () => {
  let repo: InMemoryAchievementThresholdRepository;

  beforeEach(() => {
    repo = new InMemoryAchievementThresholdRepository();
  });

  it('starts empty', async () => {
    expect(await repo.count()).toBe(0);
    expect(await repo.findAll()).toEqual([]);
    expect(await repo.findEnabled()).toEqual([]);
  });

  it('saves a threshold and assigns an id', async () => {
    const saved = await repo.save({ multiple: 2 });
    expect(saved.id).toBeDefined();
    expect(saved.multiple).toBe(2);
  });

  it('findByMultiple returns the saved record', async () => {
    await repo.save({ multiple: 5 });
    const found = await repo.findByMultiple(5);
    expect(found).not.toBeNull();
    expect(found?.multiple).toBe(5);
  });

  it('findByMultiple returns null when missing', async () => {
    const found = await repo.findByMultiple(99);
    expect(found).toBeNull();
  });

  it('findEnabled returns all (no enabled flag in current impl)', async () => {
    await repo.save({ multiple: 2 });
    await repo.save({ multiple: 3 });
    const all = await repo.findEnabled();
    expect(all).toHaveLength(2);
  });

  it('replaceAll clears and reinserts', async () => {
    await repo.save({ multiple: 2 });
    await repo.save({ multiple: 3 });
    await repo.replaceAll([{ multiple: 5 }, { multiple: 10 }]);
    const all = await repo.findAll();
    expect(all.map((r) => r.multiple).sort((a, b) => a - b)).toEqual([5, 10]);
    expect(await repo.count()).toBe(2);
  });

  it('replaceAll with empty array clears all', async () => {
    await repo.save({ multiple: 2 });
    await repo.replaceAll([]);
    expect(await repo.count()).toBe(0);
  });
});
