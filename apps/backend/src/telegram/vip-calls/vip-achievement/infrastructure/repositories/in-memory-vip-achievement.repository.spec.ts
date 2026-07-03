import { InMemoryVipAchievementRepository } from './in-memory-vip-achievement.repository';

describe('InMemoryVipAchievementRepository', () => {
  let repo: InMemoryVipAchievementRepository;

  beforeEach(() => {
    repo = new InMemoryVipAchievementRepository();
  });

  it('starts empty for an unknown callId', async () => {
    expect(await repo.findByCall('c1')).toEqual([]);
    expect(await repo.findThresholdsForCall('c1')).toEqual([]);
    expect(await repo.existsByCallAndThreshold('c1', 2)).toBe(false);
    expect(await repo.countByCall('c1')).toBe(0);
  });

  it('save() inserts a new record and assigns an id', async () => {
    const saved = await repo.save({
      callId: 'c1',
      threshold: 2,
      notifiedAt: new Date(),
    });

    // Atomic-dedup contract: save returns the persisted record on success.
    expect(saved).not.toBeNull();
    expect(saved?.id).toBeDefined();
    expect(saved?.callId).toBe('c1');
    expect(saved?.threshold).toBe(2);
    expect(await repo.countByCall('c1')).toBe(1);
  });

  it('save() returns null when (callId, threshold) already exists', async () => {
    const at = new Date();
    const first = await repo.save({
      callId: 'c1',
      threshold: 2,
      notifiedAt: at,
    });
    expect(first).not.toBeNull();

    // The second insert for the same (callId, threshold) MUST be a dedup no-op.
    // The TypeORM adapter enforces this with a unique constraint; the in-memory
    // implementation mirrors it so callers can rely on the same contract.
    const second = await repo.save({
      callId: 'c1',
      threshold: 2,
      notifiedAt: at,
    });
    expect(second).toBeNull();
    expect(await repo.countByCall('c1')).toBe(1);
  });

  it('findByCall returns all records for a given callId', async () => {
    await repo.save({
      callId: 'c1',
      threshold: 2,
      notifiedAt: new Date(),
    });
    await repo.save({
      callId: 'c1',
      threshold: 5,
      notifiedAt: new Date(),
    });
    await repo.save({
      callId: 'c2',
      threshold: 99,
      notifiedAt: new Date(),
    });

    const records = await repo.findByCall('c1');
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.callId === 'c1')).toBe(true);
  });

  it('findByCall returns an empty array when no records exist for the callId', async () => {
    await repo.save({
      callId: 'c1',
      threshold: 2,
      notifiedAt: new Date(),
    });

    const records = await repo.findByCall('does-not-exist');
    expect(records).toEqual([]);
  });

  it('findThresholdsForCall returns the thresholds for a given callId', async () => {
    await repo.save({
      callId: 'c1',
      threshold: 2,
      notifiedAt: new Date(),
    });
    await repo.save({
      callId: 'c1',
      threshold: 5,
      notifiedAt: new Date(),
    });
    await repo.save({
      callId: 'c2',
      threshold: 99,
      notifiedAt: new Date(),
    });

    const thresholds = await repo.findThresholdsForCall('c1');
    expect(thresholds.sort()).toEqual([2, 5]);
  });

  it('existsByCallAndThreshold returns true when a record exists', async () => {
    await repo.save({
      callId: 'c1',
      threshold: 5,
      notifiedAt: new Date(),
    });

    expect(await repo.existsByCallAndThreshold('c1', 5)).toBe(true);
  });

  it('existsByCallAndThreshold returns false when no record exists', async () => {
    await repo.save({
      callId: 'c1',
      threshold: 5,
      notifiedAt: new Date(),
    });

    // Same callId, different threshold → not present.
    expect(await repo.existsByCallAndThreshold('c1', 99)).toBe(false);
    // Different callId entirely → not present.
    expect(await repo.existsByCallAndThreshold('c2', 5)).toBe(false);
    // No records at all → not present.
    expect(await repo.existsByCallAndThreshold('unknown', 1)).toBe(false);
  });

  it('updateTelegramMessageId updates the matching record', async () => {
    await repo.save({
      callId: 'c1',
      threshold: 2,
      notifiedAt: new Date(),
    });
    await repo.updateTelegramMessageId('c1', 2, 12345);

    const records = await repo.findByCall('c1');
    expect(records[0].telegramMessageId).toBe(12345);
  });

  it('updateTelegramMessageId does not throw for a missing record', async () => {
    await expect(
      repo.updateTelegramMessageId('nonexistent', 99, 111),
    ).resolves.not.toThrow();
  });

  it('countByCall returns the number of records for a given callId', async () => {
    expect(await repo.countByCall('c1')).toBe(0);

    await repo.save({
      callId: 'c1',
      threshold: 2,
      notifiedAt: new Date(),
    });
    expect(await repo.countByCall('c1')).toBe(1);

    await repo.save({
      callId: 'c1',
      threshold: 5,
      notifiedAt: new Date(),
    });
    expect(await repo.countByCall('c1')).toBe(2);

    // Different callId does not affect the count.
    await repo.save({
      callId: 'c2',
      threshold: 99,
      notifiedAt: new Date(),
    });
    expect(await repo.countByCall('c1')).toBe(2);
    expect(await repo.countByCall('c2')).toBe(1);
  });
});
