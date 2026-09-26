import { SchedulingRotationConfigController } from './scheduling-rotation-config.controller';
import { InMemorySchedulingConfigRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduling-config.repository';

describe('SchedulingRotationConfigController', () => {
  it('returns the fail-closed seed and patches per-target limits', async () => {
    const repo = new InMemorySchedulingConfigRepository();
    const controller = new SchedulingRotationConfigController(repo);
    const seed = await controller.get();
    expect(seed.enabled).toBe(false);
    expect(seed.telegram.dailyCap).toBe(20);
    const updated = await controller.update({
      enabled: true,
      telegram: { dailyCap: 2, publishDelayMs: 5000 },
    });
    expect(updated.enabled).toBe(true);
    expect(updated.telegram).toEqual({ publishDelayMs: 5000, dailyCap: 2 });
    expect(updated.threads.dailyCap).toBe(20);
  });

  it('rejects invalid per-target limits', async () => {
    const repo = new InMemorySchedulingConfigRepository();
    const controller = new SchedulingRotationConfigController(repo);
    await expect(
      controller.update({ threads: { dailyCap: -1 } }),
    ).rejects.toThrow(/dailyCap/);
  });
});
