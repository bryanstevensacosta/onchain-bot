import { ScheduledAd } from '../domain/scheduled-ad.entity';
import { SchedulingHealthIndicator } from './scheduling-health.indicator';
import { InMemoryScheduledAdRepository } from '../infrastructure/persistence/in-memory/in-memory-scheduled-ad.repository';
import { InMemorySchedulingConfigRepository } from '../infrastructure/persistence/in-memory/in-memory-scheduling-config.repository';

describe('SchedulingHealthIndicator', () => {
  it('reports up when the catalog + config load', async () => {
    const adRepo = new InMemoryScheduledAdRepository();
    const configRepo = new InMemorySchedulingConfigRepository();
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    const indicator = new SchedulingHealthIndicator(adRepo, configRepo);
    expect(await indicator.check()).toEqual({
      component: 'scheduling',
      status: 'up',
    });
  });

  it('reports down when a read throws', async () => {
    const indicator = new SchedulingHealthIndicator(
      {
        findAll: () => Promise.reject(new Error('db down')),
      } as never,
      new InMemorySchedulingConfigRepository(),
    );
    expect(await indicator.check()).toEqual({
      component: 'scheduling',
      status: 'down',
    });
  });
});
