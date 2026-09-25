import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import { PublishScheduledAdUseCase } from '../use-cases/publish-scheduled-ad.use-case';
import { RotationDeciderService } from '../services/rotation-decider.service';
import { SchedulingHealthState } from '../state/scheduling-health.state';
import { SchedulingCronScheduler } from './scheduling-cron.scheduler';
import { InMemoryScheduledAdRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduled-ad.repository';
import { InMemorySchedulingConfigRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduling-config.repository';
import { InMemorySchedulingStateRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduling-state.repository';
import { InMemoryScheduledAdDispatcher } from '../../infrastructure/dispatch/in-memory-scheduled-ad.dispatcher';

function makeHarness() {
  const adRepo = new InMemoryScheduledAdRepository();
  const configRepo = new InMemorySchedulingConfigRepository();
  const stateRepo = new InMemorySchedulingStateRepository();
  const dispatcher = new InMemoryScheduledAdDispatcher();
  const health = new SchedulingHealthState();
  const publish = new PublishScheduledAdUseCase(
    adRepo,
    configRepo,
    stateRepo,
    new RotationDeciderService(),
    dispatcher,
    health,
  );
  const scheduler = new SchedulingCronScheduler(
    publish,
    adRepo,
    configRepo,
    stateRepo,
    health,
    { addCronJob: jest.fn(), getCronJob: jest.fn() } as never,
    { get: () => 'true' } as never,
  );
  return {
    adRepo,
    configRepo,
    stateRepo,
    publish,
    dispatcher,
    health,
    scheduler,
  };
}

describe('SchedulingCronScheduler', () => {
  it('ticks both targets every minute and sweeps expired posts', async () => {
    const { adRepo, configRepo, dispatcher, publish, scheduler } =
      makeHarness();
    const current = await configRepo.load();
    await configRepo.save(
      current.update({
        enabled: true,
        everyNPosts: 1,
        minMinutesBetweenAds: 0,
        telegram: { publishDelayMs: 0, dailyCap: 10 },
        threads: { publishDelayMs: 0, dailyCap: 10 },
      }),
    );
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    await adRepo.save(
      ScheduledAd.create({
        id: 'gone',
        name: 'expired',
        body: 'old',
        expiresAt: new Date('2026-09-20T10:00:00.000Z'),
        expirationAction: 'delete',
      }),
    );
    await publish.recordNewsPost();
    await scheduler.tick();
    expect(dispatcher.publishedTo('telegram')).toHaveLength(1);
    expect(dispatcher.publishedTo('threads')).toHaveLength(1);
    expect(await adRepo.findById('gone')).toBeNull();
  });

  it('skips overlapping ticks', async () => {
    const { adRepo, configRepo, dispatcher, publish, scheduler } =
      makeHarness();
    const current = await configRepo.load();
    await configRepo.save(
      current.update({
        enabled: true,
        everyNPosts: 1,
        minMinutesBetweenAds: 0,
        telegram: { publishDelayMs: 0, dailyCap: 10 },
        threads: { publishDelayMs: 0, dailyCap: 10 },
      }),
    );
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    await publish.recordNewsPost();
    const first = scheduler.tick();
    const second = scheduler.tick();
    await Promise.all([first, second]);
    expect(dispatcher.published()).toHaveLength(2);
  });

  it('stays quiet when the cron master switch is off', async () => {
    const { adRepo, dispatcher, scheduler } = makeHarness();
    (scheduler as unknown as { config: { get: () => string } }).config = {
      get: () => 'false',
    };
    await adRepo.save(
      ScheduledAd.create({ id: 'a1', name: 'one', body: 'hello' }),
    );
    await scheduler.tick();
    expect(dispatcher.published()).toHaveLength(0);
  });
});
