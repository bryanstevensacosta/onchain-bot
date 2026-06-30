import { InMemoryNotifiedAchievementRepository } from './in-memory-notified-achievement.repository';

describe('InMemoryNotifiedAchievementRepository', () => {
  let repo: InMemoryNotifiedAchievementRepository;

  beforeEach(() => {
    repo = new InMemoryNotifiedAchievementRepository();
  });

  it('starts empty', async () => {
    expect(await repo.findByCall('c1')).toEqual([]);
    expect(await repo.findThresholdsForCall('c1')).toEqual([]);
    expect(await repo.existsByCallAndThreshold('c1', 2)).toBe(false);
    expect(await repo.countByCall('c1')).toBe(0);
  });

  it('save inserts a record and assigns id', async () => {
    const saved = await repo.save({
      callId: 'c1',
      threshold: 2,
      notifiedAt: new Date(),
    });
    expect(saved.id).toBeDefined();
    expect(await repo.countByCall('c1')).toBe(1);
  });

  it('existsByCallAndThreshold returns true after save', async () => {
    await repo.save({
      callId: 'c1',
      threshold: 5,
      notifiedAt: new Date(),
    });
    expect(await repo.existsByCallAndThreshold('c1', 5)).toBe(true);
    expect(await repo.existsByCallAndThreshold('c1', 99)).toBe(false);
  });

  it('findThresholdsForCall returns numeric thresholds for a call', async () => {
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

  it('findByCall returns the records for a call', async () => {
    await repo.save({
      callId: 'c1',
      threshold: 2,
      notifiedAt: new Date(),
    });
    await repo.save({
      callId: 'c1',
      threshold: 3,
      notifiedAt: new Date(),
    });
    const records = await repo.findByCall('c1');
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.callId === 'c1')).toBe(true);
  });

  it('save is a no-op for duplicate (callId, threshold)', async () => {
    const at = new Date();
    await repo.save({ callId: 'c1', threshold: 2, notifiedAt: at });
    await repo.save({ callId: 'c1', threshold: 2, notifiedAt: at });
    expect(await repo.countByCall('c1')).toBe(1);
  });

  it('updateTelegramMessageId updates an existing record', async () => {
    await repo.save({
      callId: 'c1',
      threshold: 2,
      notifiedAt: new Date(),
    });
    await repo.updateTelegramMessageId('c1', 2, 12345);
    const records = await repo.findByCall('c1');
    expect(records[0].telegramMessageId).toBe(12345);
  });

  it('updateTelegramMessageId does not throw for missing record', async () => {
    await expect(
      repo.updateTelegramMessageId('nonexistent', 99, 111),
    ).resolves.not.toThrow();
  });
});
